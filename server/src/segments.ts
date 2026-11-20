import { claudeReads, isTranscribingLive } from '../../core/channel';
import type { VoiceName } from '../../core/transcript';
import type { ChannelState } from '../../core/types';
import { newId, type Db } from './db';

export interface SegmentRow {
  id: string;
  channel_id: string;
  started_at: number;
  ended_at: number | null;
  recording_id: string | null;
  text: number;
  /** When it was filed in the channel's library; null owed, 0 and -1 never. */
  filed_at: number | null;
  /** The document it was filed as, by its path in the library. */
  filed_file: string | null;
  filed_title: string | null;
  /**
   * When its text was deleted on its own — live, `text` 0 from then, or its
   * recording's transcript since 2026-11-08.
   */
  text_deleted_at: number | null;
  /**
   * When its filed document was deleted, since 2026-11-18 on its own — with
   * the text only where a build up to 437 deleted the text.
   */
  document_deleted_at: number | null;
  /** When one of its voices was last named, or a name cleared; null never. */
  voices_named_at: number | null;
  /** 1 where *Ask Claude* leaves it out, since 2026-11-19; see `hide`. */
  hidden_from_claude: number;
  /** 1 where *Ask Claude* reads it although it is older than two hours, since 2026-11-20; see `hide`. */
  shown_to_claude: number;
  /** When that last changed, either way; null never. */
  hidden_changed_at: number | null;
}

/**
 * **A segment is a stretch of a room kept one way throughout** — as audio, as
 * text, or as both — since 2026-10-10. The record is a sequence of them, one
 * or more per room, and every change of what is kept is a clean break: Audio
 * or Text switched, a Pause, a Resume. Where both are kept they cover exactly
 * the same span, because core ends the audio's run and begins another
 * whenever the text changes under it (`restartOnTextChange`), so a recording
 * is exactly one segment's audio, never part of one and never two.
 *
 * Written on the transitions, by the channel registry, as rooms are: what is
 * kept is the running run's id and whether the live transcript is listening
 * (`isTranscribingLive`), and when that pair changes the open segment closes
 * and, if anything is still kept, the next opens at the same instant. One
 * that would close at the moment it opened was never anything, and goes.
 *
 * Nothing before 2026-10-10 has one; `Rooms.forChannel` derives them for the
 * rooms that came before.
 */
export class Segments {
  constructor(private db: Db) {}

  /** Follows one committed transition of a channel. */
  follow(before: ChannelState, after: ChannelState, now: number): void {
    const was = kept(before);
    const is = kept(after);
    if (was.run === is.run && was.text === is.text) return;
    // The reducer's own instant where a run began or ended, so that a
    // segment and its recording agree to the millisecond.
    const at =
      is.run !== null && is.run !== was.run
        ? (after.recording.startedAt ?? now)
        : was.run !== null && after.lastRecording?.runId === was.run
          ? after.lastRecording.endedAt
          : now;
    this.close(after.id, at);
    if (is.run === null && !is.text) return;
    this.db
      .prepare(
        `INSERT INTO segments (id, channel_id, started_at, recording_id, text)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(newId('seg'), after.id, at, is.run, is.text ? 1 : 0);
  }

  /**
   * Closes whatever the previous process left open, at the boot — which
   * ended every run and every room, and so everything they kept.
   */
  restore(now: number): void {
    this.db.prepare('UPDATE segments SET ended_at = ? WHERE ended_at IS NULL').run(now);
  }

  /** A channel's segments that began inside a span, oldest first. */
  within(channelId: string, from: number, until: number): SegmentRow[] {
    return this.db
      .prepare(
        `SELECT * FROM segments
         WHERE channel_id = ? AND started_at >= ? AND started_at <= ?
         ORDER BY started_at`
      )
      .all(channelId, from, until) as unknown as SegmentRow[];
  }

  /** The segment a recording's audio is, if it was made since segments were. */
  ofRecording(recordingId: string): SegmentRow | undefined {
    return this.db
      .prepare('SELECT * FROM segments WHERE recording_id = ?')
      .get(recordingId) as SegmentRow | undefined;
  }

  /**
   * The names given to a segment's separated voices, since 2026-11-13 —
   * which every reading of its lines puts in place of `Name (B)`.
   */
  voicesOf(segmentId: string): VoiceName[] {
    return this.db
      .prepare(
        `SELECT identity, speaker, name FROM segment_voices
          WHERE segment_id = ? ORDER BY identity, speaker`
      )
      .all(segmentId) as unknown as VoiceName[];
  }

  /** The names given to the voices of the segment a recording is the audio of. */
  voicesOfRecording(recordingId: string): VoiceName[] {
    const segment = this.ofRecording(recordingId);
    return segment ? this.voicesOf(segment.id) : [];
  }

  /**
   * Names some of a segment's voices, an empty name clearing one back to
   * its letter, all at once; the caller has found the segment and the
   * namer entitled. Stamps `voices_named_at`, which the snapshot carries,
   * and owes the segment's filing again where it was filed, so the
   * channel's library reads the names too (`ChannelLibraries`).
   */
  nameVoices(segmentId: string, voices: readonly VoiceName[], now: number): void {
    const put = this.db.prepare(
      `INSERT INTO segment_voices (segment_id, identity, speaker, name) VALUES (?, ?, ?, ?)
       ON CONFLICT (segment_id, identity, speaker) DO UPDATE SET name = excluded.name`
    );
    const clear = this.db.prepare(
      'DELETE FROM segment_voices WHERE segment_id = ? AND identity = ? AND speaker = ?'
    );
    for (const voice of voices) {
      if (voice.name === '') clear.run(segmentId, voice.identity, voice.speaker);
      else put.run(segmentId, voice.identity, voice.speaker, voice.name);
    }
    this.db
      .prepare(
        `UPDATE segments SET voices_named_at = ?,
                filed_at = CASE WHEN filed_at > 0 THEN NULL ELSE filed_at END
          WHERE id = ?`
      )
      .run(now, segmentId);
  }

  /**
   * Hides a segment from *Ask Claude*, or shows it to Claude, for everybody
   * until somebody changes it — *Hide from Claude*, since 2026-11-19, and
   * *Show to Claude* on one older than the last two hours, since 2026-11-20;
   * the caller has found the segment and the person entitled. **A mark only
   * against the default** (`claudeReads`): hiding one Claude would not read
   * anyway, or showing one it would, clears both. Stamps `hidden_changed_at`,
   * which the snapshot carries. Its document in the channel's library stays:
   * this is about what a press is sent, and Claude reads the library only
   * when it asks to.
   */
  hide(segmentId: string, hidden: boolean, now: number): void {
    const row = this.db.prepare('SELECT ended_at FROM segments WHERE id = ?').get(segmentId) as
      | { ended_at: number | null }
      | undefined;
    if (!row) return;
    const byDefault = claudeReads({ endedAt: row.ended_at }, now);
    this.db
      .prepare(
        'UPDATE segments SET hidden_from_claude = ?, shown_to_claude = ?, hidden_changed_at = ? WHERE id = ?'
      )
      .run(hidden && byDefault ? 1 : 0, !hidden && !byDefault ? 1 : 0, now, segmentId);
  }

  private close(channelId: string, now: number): void {
    // Nothing kept for no time at all: two changes in one instant.
    this.db
      .prepare('DELETE FROM segments WHERE channel_id = ? AND ended_at IS NULL AND started_at >= ?')
      .run(channelId, now);
    this.db
      .prepare('UPDATE segments SET ended_at = ? WHERE channel_id = ? AND ended_at IS NULL')
      .run(now, channelId);
  }
}

/** What a channel is keeping: the running run, and whether the text is. */
function kept(state: ChannelState): { run: string | null; text: boolean } {
  return {
    run: state.recording.status === 'recording' ? state.recording.runId : null,
    text: isTranscribingLive(state),
  };
}
