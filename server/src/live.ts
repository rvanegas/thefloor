/**
 * The live transcript: what is said in a channel, written down as it is said,
 * with no recording.
 *
 * One hidden listener per transcribing channel, subscribed to every
 * microphone in its room, and one streaming session per speaker. The
 * channel's switch is `ChannelState.liveTranscription`; whether a room is
 * being transcribed at all is `isTranscribingLive`, the same question the
 * indicator asks. See planning/task/transcribe-as-the-conversation-happens.md
 * § *Design*.
 *
 * **Sessions are billed by how long they are open**, so a speaker's opens on
 * the first audible frame and closes after `IDLE_MS` without one. A run of
 * silence before the first word is kept as pre-roll, so the syllable that
 * opened the session is not the one lost to opening it.
 *
 * **The floor is applied here, at the source.** Silencing unsubscribes the
 * room's listeners from a speaker and not this one, so a withheld speaker's
 * frames arrive and are replaced with zeros — what the room did not hear is
 * not written. Zeros rather than nothing, so a session's audio stays one
 * continuous timeline.
 *
 * **A line is placed on the wall clock**, there being no recording to place
 * it on. Each send records where in the session's audio it began and when
 * that was; a turn's offsets are mapped back through those anchors.
 */
import { randomUUID } from 'node:crypto';
import { isTranscribingLive, isWithheld } from '../../core/channel';
import type { LiveLine } from '../../core/protocol';
import type { ChannelState } from '../../core/types';
import { MEDIA_IDENTITY, playbackIdentity } from './channels';
import type { Db } from './db';
import type { ListenerSession, MediaServer } from './media';
import { MEDIA_LABEL } from './transcripts';
import {
  STREAM_SAMPLE_RATE,
  type LiveTurn,
  type StreamingSession,
  type StreamingTranscriptionProvider,
} from './streaming';

/** The hidden participant's identity in every room it listens to. */
export const TRANSCRIBER_IDENTITY = 'transcriber';

/** How long a speaker may be silent before their session is closed. */
export const IDLE_MS = 30_000;

/**
 * The loudest sample a frame may hold and still count as silence. About
 * -44 dBFS: above a quiet room's noise floor and below any speech, since what
 * this decides is only whether to pay for an open session, never what is
 * written.
 */
const SILENCE_PEAK = 200;

/** How much audio before the first word is sent with it. */
const PREROLL_MS = 500;

/** How often a session records an anchor while its audio is continuous. */
const ANCHOR_EVERY_MS = 1_000;

/** How far a frame may arrive from where continuous audio puts it. */
const ANCHOR_SLIP_MS = 100;

interface Anchor {
  /** Milliseconds into the session's audio. */
  offsetMs: number;
  /** When that audio was heard, epoch milliseconds. */
  wallMs: number;
}

/** One speaker's session, and what it needs to place its turns. */
interface Stream {
  session: StreamingSession;
  anchors: Anchor[];
  sentMs: number;
  openedAt: number;
}

interface Speaker {
  stream: Stream | null;
  lastVoiceAt: number;
  preroll: Int16Array[];
  prerollMs: number;
}

interface Room {
  room: string;
  listener: Promise<ListenerSession | null>;
  speakers: Map<string, Speaker>;
}

export interface LiveTranscriberOptions {
  db: Db;
  media: MediaServer;
  provider: StreamingTranscriptionProvider;
  now: () => number;
  /** The channel as the registry holds it now. */
  stateOf: (channelId: string) => ChannelState | undefined;
  /** What to call an account, for the name frozen on each line. */
  accountName: (userId: string) => string | null;
  /** A line was written. The registry tells whoever is watching. */
  onLine: (channelId: string, line: LiveLine) => void;
  onError: (error: unknown, context: string) => void;
}

export class LiveTranscriber {
  private rooms = new Map<string, Room>();

  constructor(private options: LiveTranscriberOptions) {}

  /**
   * Opens or closes a channel's listener to match its state. Called on every
   * commit, so it does nothing unless the answer changed.
   */
  sync(state: ChannelState): void {
    const want = isTranscribingLive(state);
    const have = this.rooms.get(state.id);
    if (have && (!want || have.room !== state.mediaRoom)) {
      this.closeRoom(state.id);
    }
    if (want && !this.rooms.get(state.id)) this.openRoom(state);
  }

  /** Closes every session that has been silent for `IDLE_MS`. */
  sweep(): void {
    const now = this.options.now();
    for (const room of this.rooms.values()) {
      for (const speaker of room.speakers.values()) {
        if (speaker.stream && now - speaker.lastVoiceAt >= IDLE_MS) {
          this.closeStream(speaker);
        }
      }
    }
  }

  /** Stops everything, for a server going down. */
  async closeAll(): Promise<void> {
    await Promise.all([...this.rooms.keys()].map((id) => this.closeRoom(id)));
  }

  /** Every line in a channel before `before`, newest first, at most `limit`. */
  linesBefore(channelId: string, before: number, limit: number): LiveLine[] {
    const rows = this.options.db
      .prepare(
        `SELECT id, identity, display_name, start_at, end_at, text, confidence
         FROM live_lines WHERE channel_id = ? AND start_at < ?
         ORDER BY start_at DESC LIMIT ?`
      )
      .all(channelId, before, limit) as unknown as LineRow[];
    return rows.map(lineFrom);
  }

  /** Whether a channel has any live transcript at all. */
  hasLines(channelId: string): boolean {
    return !!this.options.db
      .prepare('SELECT 1 FROM live_lines WHERE channel_id = ? LIMIT 1')
      .get(channelId);
  }

  /** Audio from the room, one speaker's frame at a time. Exposed for tests. */
  hear(channelId: string, identity: string, samples: Int16Array): void {
    const room = this.rooms.get(channelId);
    const state = this.options.stateOf(channelId);
    if (!room || !state || !isTranscribingLive(state)) return;
    if (identity === TRANSCRIBER_IDENTITY) return;

    const speakerId = identity === playbackIdentity(channelId) ? MEDIA_IDENTITY : identity;
    const gated =
      speakerId !== MEDIA_IDENTITY &&
      (isWithheld(state, speakerId) || state.selfMuted?.[speakerId] === true);
    const frame = gated ? new Int16Array(samples.length) : samples;
    const voiced = !gated && peakOf(samples) > SILENCE_PEAK;
    const now = this.options.now();
    const frameMs = (samples.length / STREAM_SAMPLE_RATE) * 1000;

    let speaker = room.speakers.get(speakerId);
    if (!speaker) {
      speaker = { stream: null, lastVoiceAt: 0, preroll: [], prerollMs: 0 };
      room.speakers.set(speakerId, speaker);
    }

    if (!speaker.stream) {
      if (!voiced) {
        speaker.preroll.push(frame);
        speaker.prerollMs += frameMs;
        while (speaker.prerollMs - frameMs >= PREROLL_MS && speaker.preroll.length > 1) {
          const dropped = speaker.preroll.shift()!;
          speaker.prerollMs -= (dropped.length / STREAM_SAMPLE_RATE) * 1000;
        }
        return;
      }
      speaker.stream = this.openStream(channelId, speakerId, speaker);
      // The pre-roll was heard before this frame, back to back with it.
      let at = now - frameMs - speaker.prerollMs;
      for (const earlier of speaker.preroll) {
        this.send(speaker.stream, earlier, at);
        at += (earlier.length / STREAM_SAMPLE_RATE) * 1000;
      }
      speaker.preroll = [];
      speaker.prerollMs = 0;
    }

    if (voiced) speaker.lastVoiceAt = now;
    this.send(speaker.stream, frame, now - frameMs);
  }

  private send(stream: Stream, frame: Int16Array, wallStart: number): void {
    const last = stream.anchors[stream.anchors.length - 1];
    // Where continuous audio would have put this frame. A frame that arrives
    // elsewhere — a gap in what the room delivered — needs an anchor of its
    // own, or every turn after it would be placed early by the gap.
    const expected = last ? last.wallMs + (stream.sentMs - last.offsetMs) : 0;
    if (
      !last ||
      Math.abs(wallStart - expected) > ANCHOR_SLIP_MS ||
      stream.sentMs - last.offsetMs >= ANCHOR_EVERY_MS
    ) {
      stream.anchors.push({ offsetMs: stream.sentMs, wallMs: wallStart });
    }
    stream.session.send(frame);
    stream.sentMs += (frame.length / STREAM_SAMPLE_RATE) * 1000;
  }

  private openStream(channelId: string, identity: string, speaker: Speaker): Stream {
    const openedAt = this.options.now();
    // Built before the session so its handlers can reach the anchors: a turn
    // that lands after this speaker's next session opened still belongs to
    // this one's timeline.
    const stream = { anchors: [], sentMs: 0, openedAt } as unknown as Stream;
    stream.session = this.options.provider.open({
      onTurn: (turn) => this.write(channelId, identity, stream, turn),
      onClose: ({ error, billedSeconds }) => {
        if (speaker.stream === stream) speaker.stream = null;
        this.options.db
          .prepare(
            `INSERT INTO live_sessions
               (channel_id, identity, opened_at, closed_at, billed_seconds, error)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(
            channelId,
            identity,
            openedAt,
            this.options.now(),
            billedSeconds,
            error ? error.message : null
          );
        if (error) this.options.onError(error, `live transcript ${channelId}/${identity}`);
      },
    });
    return stream;
  }

  private write(channelId: string, identity: string, stream: Stream, turn: LiveTurn): void {
    const state = this.options.stateOf(channelId);
    const line: LiveLine = {
      id: randomUUID(),
      identity,
      displayName: this.nameOf(state, identity),
      startAt: Math.round(wallOf(stream.anchors, turn.startMs)),
      endAt: Math.round(wallOf(stream.anchors, turn.endMs)),
      text: turn.text,
      confidence: turn.confidence,
    };
    this.options.db
      .prepare(
        `INSERT INTO live_lines
           (id, channel_id, identity, display_name, start_at, end_at, text, confidence)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        line.id,
        channelId,
        line.identity,
        line.displayName,
        line.startAt,
        line.endAt,
        line.text,
        line.confidence
      );
    this.options.onLine(channelId, line);
  }

  private nameOf(state: ChannelState | undefined, identity: string): string {
    if (identity === MEDIA_IDENTITY) return MEDIA_LABEL;
    const guest = state?.guests?.[identity];
    if (guest) return guest.name;
    return this.options.accountName(identity) ?? 'Someone';
  }

  private openRoom(state: ChannelState): void {
    const room: Room = {
      room: state.mediaRoom,
      speakers: new Map(),
      listener: this.options.media
        .openListener({
          room: state.mediaRoom,
          identity: TRANSCRIBER_IDENTITY,
          onAudio: (identity, samples) => this.hear(state.id, identity, samples),
          onFailure: (error) => {
            this.options.onError(error, `live listener ${state.id}`);
            // Forgotten, so the next commit that still wants it opens another.
            if (this.rooms.get(state.id) === room) this.closeRoom(state.id);
          },
        })
        .catch((error: unknown) => {
          this.options.onError(error, `live listener ${state.id}`);
          if (this.rooms.get(state.id) === room) this.rooms.delete(state.id);
          return null;
        }),
    };
    this.rooms.set(state.id, room);
  }

  private async closeRoom(channelId: string): Promise<void> {
    const room = this.rooms.get(channelId);
    if (!room) return;
    this.rooms.delete(channelId);
    for (const speaker of room.speakers.values()) this.closeStream(speaker);
    const listener = await room.listener;
    await listener?.close().catch((error: unknown) => {
      this.options.onError(error, `live listener close ${channelId}`);
    });
  }

  private closeStream(speaker: Speaker): void {
    const stream = speaker.stream;
    if (!stream) return;
    speaker.stream = null;
    void stream.session.close().catch(() => {});
  }
}

interface LineRow {
  id: string;
  identity: string;
  display_name: string;
  start_at: number;
  end_at: number;
  text: string;
  confidence: number | null;
}

function lineFrom(row: LineRow): LiveLine {
  return {
    id: row.id,
    identity: row.identity,
    displayName: row.display_name,
    startAt: row.start_at,
    endAt: row.end_at,
    text: row.text,
    confidence: row.confidence,
  };
}

function peakOf(samples: Int16Array): number {
  let peak = 0;
  for (const s of samples) {
    const a = s < 0 ? -s : s;
    if (a > peak) peak = a;
  }
  return peak;
}

/** Where an offset into a session's audio falls on the wall clock. */
export function wallOf(anchors: readonly Anchor[], offsetMs: number): number {
  let best = anchors[0];
  for (const anchor of anchors) {
    if (anchor.offsetMs <= offsetMs) best = anchor;
    else break;
  }
  if (!best) return offsetMs;
  return best.wallMs + (offsetMs - best.offsetMs);
}
