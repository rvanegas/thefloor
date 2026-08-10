import { rm } from 'node:fs/promises';
import { MAX_CHANNEL_PARTICIPANTS } from '../../core/constants';
import { playbackPositionMs } from '../../core/playback';
import { recordedMs } from '../../core/recording';
import {
  canControlPlayback,
  createChannel,
  isParticipant,
  otherParticipants,
  reduce,
} from '../../core/channel';
import type {
  PlaybackTrack,
  ChannelAction,
  ChannelState,
} from '../../core/types';
import type { InviteView, RejoinableView } from '../../core/protocol';
import type { Accounts } from './accounts';
import {
  insertWithUniqueKey,
  newId,
  type Db,
  type RecordingRow,
} from './db';
import type { MediaServer, PlaybackSession } from './media';

export const TICK_INTERVAL_MS = 500;

/**
 * The stem key for shared playback, and the room identity it publishes under.
 *
 * A name rather than a user id, because it is not a user: it never claims the
 * floor, is never silenced, and so never appears in the floor timeline. User
 * ids are minted with a `usr_` prefix, so this cannot collide with one.
 */
export const MEDIA_IDENTITY = 'media';
export const mediaRoomIdentity = (channelId: string) => `media:${channelId}`;

/**
 * The actions a client is allowed to send, as opposed to the ones the server
 * raises about itself.
 *
 * An allowlist rather than a denylist. The websocket hands `message.action`
 * through as it arrives — the type says ClientAction, but nothing at runtime
 * makes that true — so anything the reducer understands is reachable from a
 * client unless it is named here. That matters for the actions carrying no
 * actor and no guard: RECORDING_FAILED and PLAYBACK_FAILED exist for the media
 * plane to admit something broke, and a client able to send them could stop a
 * recording it is forbidden to stop. SET_TRACK is excluded too, since a track
 * names a file only the server can put there.
 */
const CLIENT_ACTIONS = new Set<ChannelAction['type']>([
  'ENTER',
  'STEP_OUT',
  'LEAVE_CHANNEL',
  'INVITE',
  'SET_NAME',
  'CLAIM_FLOOR',
  'RELEASE_FLOOR',
  'SET_SELF_MUTE',
  'START_RECORDING',
  'PAUSE_RECORDING',
  'RESUME_RECORDING',
  'STOP_RECORDING',
  'CLEAR_TRACK',
  'PLAY',
  'PAUSE',
  'SEEK',
  'SET_VOLUME',
]);

/**
 * How long to leave the audio room standing after a channel ends. Clients drop
 * their own connection as soon as they see they are no longer present, so this
 * only has to outlast one push. Deleting it immediately yanked the room out
 * from under still-connected clients, which surfaced as unclean socket closes
 * and ping timeouts — noise that hides real warnings, and a microphone held
 * open until the client noticed.
 */
export const ROOM_CLOSE_GRACE_MS = 5_000;

/**
 * Why an operation was refused, for callers that must map it onto something
 * else — an HTTP status, today.
 *
 * It exists because the routes used to choose 403 versus 400 by comparing the
 * error *message*, which made the wording of a sentence load-bearing: rewording
 * it downgraded a permission failure to a bad request, silently and with
 * nothing failing. A code says what the message only implied.
 */
export type RefusalCode = 'not_found' | 'forbidden' | 'conflict' | 'invalid';

export interface Refused {
  ok: false;
  error: string;
  code: RefusalCode;
}

/**
 * The authority for live channels. Every rule it enforces comes from core/ —
 * this class owns *when* the reducer runs and *who* is allowed to act, not what
 * the rules are.
 *
 * Channels live in memory while active and are written to SQLite when they end.
 * That trade is deliberate: they are short-lived by construction (an empty one
 * self-destructs in a minute), and keeping the tick loop in memory avoids a
 * write every 500ms. A server restart drops live channels, which is a real
 * limitation and the first thing to revisit if restarts become routine.
 */
export class ChannelRegistry {
  private channels = new Map<string, ChannelState>();
  /**
   * One recording run's live capture. `requested` is who an egress has been
   * asked for this run — filled before the call returns, so a second
   * transition or tick cannot ask twice. `retryAt` throttles the retries for
   * a late joiner whose egress could not start yet.
   */
  private capturing = new Map<
    string,
    {
      handles: Array<{ identity: string; handle: string }>;
      requested: Set<string>;
      retryAt: Map<string, number>;
    }
  >();
  /**
   * Object keys written so far, in order, per participant, per channel — each
   * with where in the *recorded* audio its capture began. Zero for anyone
   * there when a run starts; later for someone who joined partway through a
   * run, which is what lets the export place their audio correctly.
   */
  private segments = new Map<
    string,
    Map<string, Array<{ key: string; startMs: number }>>
  >();
  /**
   * Who a recording run belongs to: everyone who took part in it.
   *
   * Stored per run rather than read off the channel at filing time, because
   * membership is no longer fixed for a channel's life. Anyone may leave, and
   * the last one leaving is what ends the channel — so by the time a run is
   * filed the roster can be empty, and a recording written against it would
   * belong to nobody and be openable by nobody.
   *
   * The rule is *took part*, which has two halves that mostly coincide and
   * are kept separate because they can disagree: everyone present at any point
   * during the run, and everyone who actually produced audio. Presence covers
   * a speaker whose capture failed — they were in the conversation even though
   * no stem exists — and the stems cover anyone presence tracking missed. What
   * neither covers, deliberately, is a member who was invited and never came:
   * they were not in the conversation, so the recording is not theirs.
   */
  private recordingAudience = new Map<string, Set<string>>();
  /**
   * Speakers whose silencing has been decided but not yet applied — they had
   * no published track when it was asserted. Retried each tick while the
   * claim lasts, because whoever publishes next is subscribed to by default.
   */
  private pendingSilence = new Map<string, Set<string>>();
  /**
   * When each participant was silenced, as offsets into the *recorded* audio
   * rather than wall clock — so paused time is already excluded and the
   * encoder can gate on these directly. An open window has `toMs` null.
   */
  private floorWindows = new Map<
    string,
    Array<{ identity: string; fromMs: number; toMs: number | null }>
  >();
  /**
   * The live playback participant per channel, once a track has been loaded.
   *
   * Opened on the first load and kept until the channel ends, rather than
   * per track: it publishes silence between tracks, and that silence is what
   * holds the recording stem in step with the speakers'.
   */
  private playback = new Map<string, PlaybackSession>();
  /** Channels whose playback participant is being opened, to avoid two. */
  private openingPlayback = new Set<string>();
  /** The uploaded file per channel, and the directory to remove with it. */
  private trackFiles = new Map<string, { file: string; dir: string }>();
  private listeners = new Set<(channelIds: string[]) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private db: Db,
    private accounts: Accounts,
    private now: () => number = Date.now,
    private media?: MediaServer,
    private onMediaError: (error: unknown, context: string) => void = () => {},
    private roomCloseGraceMs: number = ROOM_CLOSE_GRACE_MS
  ) {}

  // --- Lifecycle ----------------------------------------------------------

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_INTERVAL_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Advances every live channel's timers. Exposed so tests can step it. */
  tick(): void {
    const now = this.now();
    const changed: string[] = [];
    for (const [id, channel] of this.channels) {
      if (channel.status !== 'active') continue;
      const next = reduce(channel, { type: 'TICK' }, now);
      if (next !== channel) {
        this.commit(channel, next);
        changed.push(id);
      }
    }
    if (changed.length > 0) this.emit(changed);

    // The media plane's self-correction. Both of these exist for the same
    // race: someone can enter a channel before their track exists, so a mute
    // or an egress asked for at that moment lands on nothing and must be
    // asked for again once there is something to act on.
    for (const [id, speakers] of this.pendingSilence) {
      const channel = this.channels.get(id);
      if (!channel || channel.status !== 'active' || !channel.floor.holder) {
        this.pendingSilence.delete(id);
        continue;
      }
      if (speakers.size > 0) this.assertSilence(channel, [...speakers]);
    }
    for (const id of this.capturing.keys()) {
      const channel = this.channels.get(id);
      if (channel) this.ensureEgress(channel);
    }
  }

  onChange(listener: (channelIds: string[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(channelIds: string[]): void {
    for (const listener of this.listeners) listener(channelIds);
  }

  // --- Commands -----------------------------------------------------------

  /**
   * Creates a channel and places the initiator in it. Every invitee must be
   * an accepted contact of the initiator — of the initiator only: you cannot
   * open a channel to someone who has not agreed to one, but two people the
   * initiator brings together need not know each other.
   */
  create(
    initiator: string,
    invitees: string[]
  ): { ok: true; channel: ChannelState } | Refused {
    const unique = [...new Set(invitees)];
    if (unique.length === 0) return { ok: false, error: 'Nobody to invite.', code: 'invalid' };
    if (unique.includes(initiator)) return { ok: false, error: 'That’s you.', code: 'invalid' };
    if (unique.length + 1 > MAX_CHANNEL_PARTICIPANTS) {
      return {
        ok: false,
        error: `Channels hold up to ${MAX_CHANNEL_PARTICIPANTS} people.`,
        code: 'conflict',
      };
    }
    for (const invitee of unique) {
      if (!this.accounts.areContacts(initiator, invitee)) {
        return { ok: false, error: 'Not a contact.', code: 'forbidden' };
      }
    }

    // One live channel per *set* of people. Without this, repeated taps stack
    // duplicate channels and the invitees see a pile of banners from one
    // person. Same people plus or minus one is a different channel — that is
    // what invites are for.
    const want = new Set([initiator, ...unique]);
    const existing = [...this.channels.values()].find(
      (s) =>
        s.status === 'active' &&
        s.participants.length === want.size &&
        s.participants.every((id) => want.has(id))
    );
    if (existing) {
      const rejoined = reduce(
        existing,
        { type: 'ENTER', userId: initiator },
        this.now()
      );
      if (rejoined !== existing) this.commit(existing, rejoined);
      this.emit([existing.id]);
      return { ok: true, channel: this.channels.get(existing.id)! };
    }

    const createdAt = this.now();
    const id = insertWithUniqueKey(
      () => newId('chan'),
      (candidate) =>
        this.db
          .prepare(
            `INSERT INTO channels (id, initiator_id, invitee_id, created_at, participants)
             VALUES (?, ?, ?, ?, ?)`
          )
          .run(
            candidate,
            initiator,
            // The legacy two-party columns are anchors for old rows and are
            // never read for new ones; participants is the truth.
            unique[0],
            createdAt,
            JSON.stringify([initiator, ...unique])
          )
    );

    // Held in memory only once the row exists. The other order looks harmless
    // but is not: a failed insert — a locked database, a full disk — would
    // leave a live channel with nothing behind it, and the one-channel-per-set
    // guard above would then adopt that orphan on every retry, so the row could
    // never be written and the conversation would go unrecorded.
    const channel = createChannel({
      id,
      initiator,
      invitees: unique,
      now: createdAt,
    });
    this.channels.set(channel.id, channel);
    this.emit([channel.id]);
    return { ok: true, channel };
  }

  /**
   * Applies an action on behalf of `userId`. The caller must have taken that id
   * from the authenticated connection — this is the one place a client could
   * otherwise act as the other party.
   */
  dispatch(
    channelId: string,
    userId: string,
    action: Omit<ChannelAction, 'userId'> & { type: ChannelAction['type'] }
  ): { ok: true; channel: ChannelState } | Refused {
    const channel = this.channels.get(channelId);
    if (!channel) return { ok: false, error: 'No such channel.', code: 'not_found' };
    if (!isParticipant(channel, userId)) {
      return { ok: false, error: 'Not your channel.', code: 'forbidden' };
    }
    if (!CLIENT_ACTIONS.has(action.type)) {
      return { ok: false, error: 'Not an action.', code: 'invalid' };
    }

    // The wire form of INVITE names a contact; the reducer's names an invitee.
    // The distinction is the check made here: contacts are the server's
    // concern, and the reducer must not be reachable with someone the sender
    // has no channel to. The refusals mirror `create`'s, they being the same
    // policy applied mid-channel.
    if (action.type === 'INVITE') {
      const contactId = (action as { contactId?: unknown }).contactId;
      if (typeof contactId !== 'string' || !contactId) {
        return { ok: false, error: 'Not an action.', code: 'invalid' };
      }
      if (isParticipant(channel, contactId)) {
        return { ok: false, error: 'Already in this channel.', code: 'conflict' };
      }
      if (channel.participants.length >= MAX_CHANNEL_PARTICIPANTS) {
        return {
          ok: false,
          error: `Channels hold up to ${MAX_CHANNEL_PARTICIPANTS} people.`,
          code: 'conflict',
        };
      }
      if (!this.accounts.areContacts(userId, contactId)) {
        return { ok: false, error: 'Not a contact.', code: 'forbidden' };
      }
      return this.apply(channelId, userId, {
        type: 'INVITE',
        inviteeId: contactId,
      } as Omit<ChannelAction, 'userId'> & { type: ChannelAction['type'] });
    }

    // The reducer trims, caps and treats empty as unnamed; all that is checked
    // here is that the payload carries a string at all, the wire giving no
    // guarantee of even that.
    if (action.type === 'SET_NAME') {
      if (typeof (action as { name?: unknown }).name !== 'string') {
        return { ok: false, error: 'Not an action.', code: 'invalid' };
      }
    }

    return this.apply(channelId, userId, action);
  }

  /**
   * Runs an action that has already been authorised. The server's own commands
   * come through here, having established their right to act some other way
   * than by being a client message.
   */
  private apply(
    channelId: string,
    userId: string,
    action: Omit<ChannelAction, 'userId'> & { type: ChannelAction['type'] }
  ): { ok: true; channel: ChannelState } | Refused {
    const channel = this.channels.get(channelId);
    if (!channel) return { ok: false, error: 'No such channel.', code: 'not_found' };

    const next = reduce(
      channel,
      { ...action, userId } as ChannelAction,
      this.now()
    );
    if (next !== channel) {
      this.commit(channel, next);
      this.emit([channelId]);
    }
    return { ok: true, channel: this.channels.get(channelId) ?? next };
  }

  /**
   * Takes an uploaded file as the channel's shared track.
   *
   * Separate from `dispatch` because the client cannot name a track: the file
   * arrives over HTTP, and only the server knows where it landed and how long
   * it is. So the route hands the facts over and this makes it the track.
   *
   * The floor rule applies here as to every other playback action — while
   * someone holds it, only they may change what the pair are listening to.
   */
  async loadTrack(
    channelId: string,
    userId: string,
    upload: { file: string; dir: string; title: string; durationMs: number }
  ): Promise<{ ok: true; channel: ChannelState } | Refused> {
    const channel = this.channels.get(channelId);
    if (!channel || channel.status !== 'active') {
      return { ok: false, error: 'No such channel.', code: 'not_found' };
    }
    if (!isParticipant(channel, userId)) {
      return { ok: false, error: 'Not your channel.', code: 'forbidden' };
    }
    if (!canControlPlayback(channel, userId)) {
      return channel.floor.holder
        ? {
            ok: false,
            error: 'Whoever has the floor decides what plays.',
            code: 'conflict',
          }
        : {
            // A participant who is not *present*. Deliberately `invalid`
            // rather than `forbidden`: they are entitled to the channel, they
            // are simply not in it right now, and it has always answered 400.
            ok: false,
            error: 'You are not in this channel.',
            code: 'invalid',
          };
    }

    const previous = this.trackFiles.get(channelId);
    this.trackFiles.set(channelId, { file: upload.file, dir: upload.dir });
    // Replacing the track replaces the file; the old one has nothing left to
    // play for. Removed after the swap so a failure cannot leave the channel
    // pointing at a file that is already gone.
    if (previous) {
      this.run(
        () => rm(previous.dir, { recursive: true, force: true }),
        `removeTrack ${channelId}`
      );
    }

    const track: PlaybackTrack = {
      id: newId('trk'),
      title: upload.title,
      durationMs: upload.durationMs,
    };
    return this.apply(channelId, userId, { type: 'SET_TRACK', track } as Omit<
      ChannelAction,
      'userId'
    > & { type: ChannelAction['type'] });
  }

  /**
   * Reports a change in whether a user has a connection, which is not a change
   * in whether they are in the channel.
   *
   * Separate from `dispatch` because these carry no actor to authorise: the
   * transport reports them, nobody performs them. Losing a connection starts
   * the grace period; regaining one cancels it. Only the grace period running
   * out removes anyone, and that goes through `LEAVE` like any other departure.
   */
  report(
    channelId: string,
    userId: string,
    state: 'CONNECTED' | 'DISCONNECTED'
  ): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;
    const next = reduce(channel, { type: state, userId }, this.now());
    if (next !== channel) {
      this.commit(channel, next);
      this.emit([channelId]);
    }
  }

  /** Live channels this user is currently in. */
  channelsFor(userId: string): string[] {
    const ids: string[] = [];
    for (const [id, channel] of this.channels) {
      if (channel.status === 'active' && channel.present.includes(userId)) {
        ids.push(id);
      }
    }
    return ids;
  }

  // --- Queries ------------------------------------------------------------

  get(channelId: string): ChannelState | undefined {
    return this.channels.get(channelId);
  }

  /** Visible only to participants; everyone else gets nothing, not an error. */
  viewableBy(channelId: string, userId: string): ChannelState | undefined {
    const channel = this.channels.get(channelId);
    if (!channel || !isParticipant(channel, userId)) return undefined;
    return channel;
  }

  /** A channel this user was invited into and has never entered. */
  invitesFor(userId: string): InviteView[] {
    const invites: InviteView[] = [];
    for (const channel of this.channels.values()) {
      if (channel.status !== 'active') continue;
      if (!isParticipant(channel, userId)) continue;
      if (channel.everPresent.includes(userId)) continue;
      // Named after whoever actually asked, which for a mid-channel invite is
      // not necessarily the initiator.
      const from = this.accounts.public(
        channel.invitedBy[userId] ?? channel.initiator
      );
      if (from) {
        invites.push({ channelId: channel.id, from, createdAt: channel.createdAt });
      }
    }
    return invites.sort((a, b) => a.createdAt - b.createdAt);
  }

  /** A channel this user entered and left, still alive and re-enterable. */
  rejoinableFor(userId: string): RejoinableView[] {
    const rejoinable: RejoinableView[] = [];
    for (const channel of this.channels.values()) {
      if (channel.status !== 'active') continue;
      if (!isParticipant(channel, userId)) continue;
      if (channel.present.includes(userId)) continue;
      if (!channel.everPresent.includes(userId)) continue;

      const others = otherParticipants(channel, userId)
        .map((id) => this.accounts.public(id))
        .filter((account): account is NonNullable<typeof account> => !!account);
      if (others.length === 0) continue;
      rejoinable.push({
        channelId: channel.id,
        name: channel.name,
        others,
        presentCount: channel.present.length,
        createdAt: channel.createdAt,
      });
    }
    return rejoinable.sort((a, b) => a.createdAt - b.createdAt);
  }

  recordingsFor(userId: string): RecordingRow[] {
    // Membership via the participants JSON, which the migration backfills for
    // every pre-existing row, so the legacy two-party columns need no OR here.
    return this.db
      .prepare(
        `SELECT * FROM recordings
         WHERE EXISTS (
           SELECT 1 FROM json_each(recordings.participants)
           WHERE json_each.value = ?
         )
         ORDER BY started_at DESC`
      )
      .all(userId) as unknown as RecordingRow[];
  }

  // --- Persistence --------------------------------------------------------

  private commit(before: ChannelState, after: ChannelState): void {
    this.channels.set(after.id, after);
    this.applyFloorToMedia(before, after);
    this.applyRecordingToMedia(before, after);
    // A run's audience only ever grows. Someone who arrives mid-recording is
    // in that recording and must be able to reach it afterwards; someone who
    // leaves — the channel or merely the room — was still in it, so they are
    // never taken back out.
    const audience = this.recordingAudience.get(after.id);
    if (audience) for (const id of after.present) audience.add(id);
    this.applyPlaybackToMedia(before, after);
    this.trackFloorWindows(before, after);

    // Someone arriving mid-claim must come back silenced, and someone arriving
    // mid-recording must get a stem. Both are re-stated on arrival because the
    // original statements were made against a roster that did not include them.
    const arrived =
      after.participants.length > before.participants.length ||
      after.present.some((id) => !before.present.includes(id));
    if (after.status === 'active' && arrived) {
      if (after.floor.holder !== null) this.assertSilence(after);
      this.ensureEgress(after);
    }
    // Someone leaving mid-run ends their stem, so a rejoin starts a fresh
    // segment rather than silently capturing nothing — their egress dies with
    // the unpublished track either way; this makes the books say so.
    const run = this.capturing.get(after.id);
    if (run) {
      for (const identity of before.present) {
        if (after.present.includes(identity)) continue;
        if (!run.requested.delete(identity)) continue;
        const live = run.handles.findIndex((h) => h.identity === identity);
        if (live >= 0) {
          const [{ handle }] = run.handles.splice(live, 1);
          this.run(
            () => this.media?.stopRecording(handle),
            `stopRecording ${after.id}/${identity}`
          );
        }
      }
    }

    if (before.status === 'active' && after.status === 'ended') {
      this.closePlayback(after.id);
      this.persistEnded(after);
      // A backstop, not the mechanism: participants leave on their own once
      // told the channel ended. This guarantees the room does not outlive it.
      setTimeout(() => {
        this.run(() => this.media?.closeRoom(after.id), `closeRoom ${after.id}`);
      }, this.roomCloseGraceMs).unref?.();
      // Keep it briefly so watchers get a final snapshot explaining why it
      // ended, rather than the channel vanishing from under them.
      setTimeout(() => this.channels.delete(after.id), 30_000).unref?.();
    }
  }

  /**
   * Turns a change of floor-holder into an actual mute. While someone holds
   * the floor, only they are heard by anyone — every other speaker is
   * withheld from every listener, the silenced from each other included; when
   * nobody holds it, everyone is open.
   *
   * Note this reacts to the *committed* state, so it cannot disagree with what
   * the reducer decided or with what the clients were told.
   */
  private applyFloorToMedia(before: ChannelState, after: ChannelState): void {
    if (!this.media) return;
    if (before.floor.holder === after.floor.holder) return;
    this.assertSilence(after);
  }

  /**
   * States every listener–speaker pair's subscription, in full rather than as
   * a delta, so the media plane is told the whole truth on every transition
   * and cannot drift out of step with the reducer. Nothing is ever done to a
   * silenced person's own publishing.
   *
   * A speaker with no published track cannot be acted on yet; they are noted
   * in `pendingSilence` and re-stated each tick until it lands, because
   * whoever publishes next is subscribed to by default.
   */
  private assertSilence(
    state: ChannelState,
    speakers: string[] = state.participants
  ): void {
    if (!this.media || state.status !== 'active') return;
    const holder = state.floor.holder;
    for (const speaker of speakers) {
      this.pendingSilence.get(state.id)?.delete(speaker);
      for (const listener of state.participants) {
        if (listener === speaker) continue;
        const silenced = holder !== null && speaker !== holder;
        const context = `setSilenced ${state.id} ${listener}<-${speaker}=${silenced}`;
        const note = () => {
          const pending = this.pendingSilence.get(state.id) ?? new Set<string>();
          this.pendingSilence.set(state.id, pending);
          pending.add(speaker);
        };
        this.media
          .setSilenced({ room: state.id, speaker, listener, silenced })
          .then(
            // Only an unapplied *silence* needs retrying: an unapplied
            // un-silence means there was nothing subscribed to restore.
            (applied) => {
              if (!applied && silenced) note();
            },
            (error) => {
              this.onMediaError(error, context);
              if (silenced) note();
            }
          );
      }
    }
  }

  /**
   * Turns recording state into actual capture. There is no pause in the egress
   * API and pausing must genuinely stop capture — people pause precisely so
   * something is not recorded — so a pause stops the current segment and a
   * resume starts a new one. A channel therefore yields one object per run,
   * concatenated when exported.
   */
  private applyRecordingToMedia(
    before: ChannelState,
    after: ChannelState
  ): void {
    if (!this.media) return;
    const was = before.recording.status;
    const now = after.recording.status;
    if (was === now) return;

    const shouldCapture = now === 'recording';
    const isCapturing = this.capturing.has(after.id);

    if (shouldCapture && !isCapturing) {
      this.recordingAudience.set(after.id, new Set(after.present));
      this.capturing.set(after.id, {
        handles: [],
        requested: new Set(),
        retryAt: new Map(),
      });

      // The initial cohort is who is *present* — a participant who has never
      // joined has no track, and asking for their egress would kill the whole
      // recording over someone who is not even in the room. Anyone else gets
      // a stem the moment they arrive, via ensureEgress.
      for (const identity of after.present) {
        this.startEgress(after, identity, { fatal: true });
      }

      // Whichever of "recording starts" and "a track is loaded" happens second
      // is what begins the media stem. This is the first of those two orders;
      // openPlayback handles the other.
      this.startMediaCapture(after.id, after);
      return;
    }

    if (!shouldCapture && isCapturing) {
      const run = this.capturing.get(after.id)!;
      this.capturing.delete(after.id);
      for (const { identity, handle } of run.handles) {
        this.run(
          () => this.media?.stopRecording(handle),
          `stopRecording ${after.id}/${identity}`
        );
      }
      this.stopMediaCapture(after.id);
    }
  }

  /**
   * Asks for one participant's egress for the current run and reserves its
   * key. For the initial cohort a failure ends the recording — a missing
   * speaker makes a recording that looks complete and is not. For a late
   * joiner it must not: their track may simply not exist yet, so the key is
   * released and the tick retries once `retryAt` allows.
   */
  private startEgress(
    state: ChannelState,
    identity: string,
    { fatal }: { fatal: boolean }
  ): void {
    const run = this.capturing.get(state.id);
    if (!run || run.requested.has(identity)) return;
    run.requested.add(identity);

    const perParticipant = this.segments.get(state.id) ?? new Map();
    this.segments.set(state.id, perParticipant);
    const previous = perParticipant.get(identity) ?? [];
    const index = String(previous.length + 1).padStart(3, '0');
    const key = `${state.id}/${identity}-${index}.ogg`;
    // Where in the recorded audio this capture begins: zero at a run's start,
    // later for someone who joined partway through one. Reserved before the
    // call returns so a second transition cannot pick the same index, and so
    // a failed fatal start leaves a visible gap rather than reusing a key.
    const startMs = recordedMs(state.recording, this.now());
    perParticipant.set(identity, [...previous, { key, startMs }]);

    this.run(
      async () => {
        const handle = await this.media!.startRecording({
          room: state.id,
          identity,
          key,
        });
        // The recording may have moved on while the call was in flight.
        const current = this.channels.get(state.id);
        if (
          current?.recording.status === 'recording' &&
          this.capturing.get(state.id) === run &&
          run.requested.has(identity)
        ) {
          run.handles.push({ identity, handle });
        } else {
          await this.media!.stopRecording(handle);
        }
      },
      `startRecording ${key}`,
      (error) => {
        if (fatal) {
          this.captureFailed(state.id, identity, key, error);
        } else {
          this.releaseSegment(state.id, identity, key);
          run.requested.delete(identity);
          run.retryAt.set(identity, this.now() + 5_000);
        }
      }
    );
  }

  /** Starts a stem for anyone present in a running recording without one. */
  private ensureEgress(state: ChannelState): void {
    if (!this.media || state.status !== 'active') return;
    const run = this.capturing.get(state.id);
    if (!run || state.recording.status !== 'recording') return;
    for (const identity of state.present) {
      if (run.requested.has(identity)) continue;
      if (this.now() < (run.retryAt.get(identity) ?? 0)) continue;
      this.startEgress(state, identity, { fatal: false });
    }
  }

  /** Takes back a reserved key whose capture never began. */
  private releaseSegment(
    channelId: string,
    identity: string,
    key: string
  ): void {
    const perParticipant = this.segments.get(channelId);
    const entries = perParticipant?.get(identity);
    if (!entries) return;
    const remaining = entries.filter((segment) => segment.key !== key);
    if (remaining.length > 0) perParticipant!.set(identity, remaining);
    else perParticipant!.delete(identity);
  }

  /**
   * Turns playback state into what the media participant is actually doing.
   *
   * Reacts to committed state for the same reason the floor does: it cannot
   * then disagree with what the reducer decided or with what the clients were
   * shown. Note there is nothing here about the floor — a claim does not touch
   * playback, it only decides who was allowed to cause these transitions, and
   * that was settled by the guard before this ran.
   */
  private applyPlaybackToMedia(before: ChannelState, after: ChannelState): void {
    if (!this.media) return;

    const had = before.playback.track?.id ?? null;
    const has = after.playback.track?.id ?? null;
    const channel = this.playback.get(after.id);

    // The first track opens the participant; it stays for the channel's life,
    // publishing silence between tracks so the recording stem keeps its place.
    if (has && !channel) {
      this.openPlayback(after.id);
      return;
    }
    if (!channel) return;

    if (has && has !== had) {
      const file = this.trackFiles.get(after.id)?.file;
      if (file) {
        this.run(() => channel.setFile(file), `setFile ${after.id}`);
      }
    }

    if (before.playback.volume !== after.playback.volume) {
      channel.setVolume(after.playback.volume);
    }

    const was = before.playback.status === 'playing';
    const is = after.playback.status === 'playing';
    // A seek while playing is a play from the new position: same call, because
    // decoding has to restart either way.
    const moved = before.playback.positionMs !== after.playback.positionMs;
    if (is && (!was || moved)) {
      this.run(
        () => channel.play(after.playback.positionMs),
        `play ${after.id}@${after.playback.positionMs}`
      );
    } else if (!is && was) {
      this.run(() => channel.pause(), `pause ${after.id}`);
    }
  }

  /**
   * Joins the room as the media participant, then catches up with whatever the
   * channel says is true by now — the call takes a moment, and someone may have
   * pressed play, moved the volume or started recording while it was in flight.
   */
  private openPlayback(channelId: string): void {
    if (!this.media || this.playback.has(channelId)) return;
    if (this.openingPlayback.has(channelId)) return;
    const entry = this.trackFiles.get(channelId);
    if (!entry) return;

    this.openingPlayback.add(channelId);
    this.run(
      async () => {
        try {
          const channel = await this.media!.openPlayback({
            room: channelId,
            identity: mediaRoomIdentity(channelId),
            displayName: 'Shared audio',
            file: entry.file,
            onFailure: (error) => this.playbackFailed(channelId, error),
          });

          const live = this.channels.get(channelId);
          if (!live || live.status !== 'active') {
            await channel.close();
            return;
          }
          this.playback.set(channelId, channel);

          channel.setVolume(live.playback.volume);
          const current = this.trackFiles.get(channelId)?.file;
          if (current && current !== entry.file) await channel.setFile(current);
          if (live.playback.status === 'playing') {
            await channel.play(playbackPositionMs(live.playback, this.now()));
          }
          if (live.recording.status === 'recording') {
            this.startMediaCapture(channelId, live);
          }
        } finally {
          this.openingPlayback.delete(channelId);
        }
      },
      `openPlayback ${channelId}`,
      (error) => this.playbackFailed(channelId, error)
    );
  }

  /**
   * Begins the media stem for the current recording run.
   *
   * The offset is the distance into *this run*, which is zero whenever capture
   * and the run begin together and non-zero only when a track is loaded partway
   * through one. The pump pads it with silence, which is what lets the export
   * concatenate this stem alongside the speakers' without knowing a track
   * arrived late.
   */
  private startMediaCapture(channelId: string, state: ChannelState): void {
    const channel = this.playback.get(channelId);
    if (!channel) return;

    const perParticipant = this.segments.get(channelId) ?? new Map();
    this.segments.set(channelId, perParticipant);
    const previous = perParticipant.get(MEDIA_IDENTITY) ?? [];
    const index = String(previous.length + 1).padStart(3, '0');
    const key = `${channelId}/${MEDIA_IDENTITY}-${index}.ogg`;
    // The pump pads the offset with silence, so this stem spans its whole run
    // and its startMs is the run's start regardless of when the track arrived.
    perParticipant.set(MEDIA_IDENTITY, [
      ...previous,
      { key, startMs: state.recording.accumulatedMs },
    ]);

    const offsetMs = state.recording.segmentStartedAt
      ? Math.max(0, this.now() - state.recording.segmentStartedAt)
      : 0;

    this.run(
      () => channel.startCapture(key, offsetMs),
      `startCapture ${key}`,
      // Deliberately not a recording failure. A missing speaker makes a
      // recording that looks complete and is not, which is why that ends the
      // whole thing; a missing track leaves the conversation itself intact, so
      // it is reported as a playback failure and the key is released.
      () => this.releaseSegment(channelId, MEDIA_IDENTITY, key)
    );
  }

  private stopMediaCapture(channelId: string): void {
    const channel = this.playback.get(channelId);
    if (!channel) return;
    this.run(() => channel.stopCapture(), `stopCapture ${channelId}`);
  }

  /** Ends the media participant and removes the file it was playing. */
  private closePlayback(channelId: string): void {
    const channel = this.playback.get(channelId);
    this.playback.delete(channelId);
    if (channel) {
      this.run(() => channel.close(), `closePlayback ${channelId}`);
    }

    const entry = this.trackFiles.get(channelId);
    this.trackFiles.delete(channelId);
    if (entry) {
      // Somebody's audio file, uploaded for one conversation. It has no reason
      // to outlive the channel, and every reason not to.
      this.run(
        () => rm(entry.dir, { recursive: true, force: true }),
        `removeTrack ${channelId}`
      );
    }
  }

  private playbackFailed(channelId: string, error: unknown): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;
    const next = reduce(
      channel,
      {
        type: 'PLAYBACK_FAILED',
        reason:
          error instanceof Error ? error.message : 'Playback could not continue.',
      },
      this.now()
    );
    if (next !== channel) {
      this.commit(channel, next);
      this.emit([channelId]);
    }
  }

  /**
   * Keeps the floor timeline that the encoder gates on. Offsets are taken from
   * `recordedMs`, so they are positions in the recorded audio rather than in
   * wall clock — paused time is already excluded, which is what lets the
   * encoder apply them to concatenated segments without further arithmetic.
   *
   * Runs on both floor and recording transitions, because a claim can begin
   * before a recording does and can outlast it.
   */
  private trackFloorWindows(before: ChannelState, after: ChannelState): void {
    const wasRecording = before.recording.status === 'recording';
    const isRecording = after.recording.status === 'recording';
    if (!wasRecording && !isRecording) return;

    const at = recordedMs(after.recording, this.now());
    const windows = this.floorWindows.get(after.id) ?? [];
    this.floorWindows.set(after.id, windows);

    // Who is silenced now: everyone but the holder, while someone holds the
    // floor and the recording is running. One open window per silenced person
    // — a mid-claim joiner gets theirs opened the moment they are added,
    // because this runs on every committed transition, roster growth included.
    const silenced = new Set(
      isRecording && after.floor.holder
        ? otherParticipants(after, after.floor.holder)
        : []
    );

    for (const window of windows) {
      if (window.toMs === null && !silenced.has(window.identity)) {
        window.toMs = at;
      }
    }
    for (const identity of silenced) {
      if (!windows.some((w) => w.toMs === null && w.identity === identity)) {
        windows.push({ identity, fromMs: at, toMs: null });
      }
    }
  }

  /**
   * Media calls are deliberately not awaited: the channel state is already
   * committed and the clients have been told, so a slow or failing media server
   * must not stall the rules. Failures are surfaced to the caller's logger
   * rather than swallowed — a mute that did not land means someone is audible
   * who should not be, which is worth seeing.
   */
  private run(
    operation: () => Promise<unknown> | undefined,
    context: string,
    onFailure?: (error: unknown) => void
  ): void {
    const fail = (error: unknown) => {
      this.onMediaError(error, context);
      onFailure?.(error);
    };
    try {
      operation()?.catch(fail);
    } catch (error) {
      fail(error);
    }
  }

  /**
   * Capture could not be started, so the recording ends and says so.
   *
   * Until this existed the failure reached the server log and nowhere else:
   * the channel went on showing "Recording" and counting up while nothing was
   * captured. That hid a completely broken capture path for hours, and it is
   * the one place the interface makes a promise about the world rather than
   * about itself — somebody may be speaking because of that red dot.
   *
   * The reserved key is released too. Claiming a stem that was never written
   * leaves a recording whose export cannot find its own audio.
   */
  private captureFailed(
    channelId: string,
    identity: string,
    key: string,
    error: unknown
  ): void {
    this.releaseSegment(channelId, identity, key);

    const channel = this.channels.get(channelId);
    if (!channel) return;
    const next = reduce(
      channel,
      {
        type: 'RECORDING_FAILED',
        reason:
          error instanceof Error ? error.message : 'Recording could not start.',
      },
      this.now()
    );
    if (next !== channel) {
      this.commit(channel, next);
      this.emit([channelId]);
    }
  }

  /** A join credential for this participant, scoped to this channel's room. */
  async mediaToken(
    channelId: string,
    userId: string
  ): Promise<{ ok: true; token: string } | Refused> {
    if (!this.media) return { ok: false, error: 'Audio is not configured.', code: 'invalid' };
    const channel = this.channels.get(channelId);
    if (!channel || channel.status !== 'active') {
      return { ok: false, error: 'No such channel.', code: 'not_found' };
    }
    if (!isParticipant(channel, userId)) {
      return { ok: false, error: 'Not your channel.', code: 'forbidden' };
    }
    const account = this.accounts.public(userId);
    if (!account) return { ok: false, error: 'No such account.', code: 'not_found' };

    const token = await this.media.issueToken({
      room: channelId,
      identity: userId,
      displayName: account.displayName,
    });
    return { ok: true, token };
  }

  private persistEnded(channel: ChannelState): void {
    this.db
      .prepare(
        // participants and name are re-stated because both can change after
        // the insert — invites grow the one, renames the other, and leaving
        // shrinks the first. The ended_reason column is left alone: there is
        // now one way a channel ends, so there is nothing to record.
        'UPDATE channels SET ended_at = ?, participants = ?, name = ? WHERE id = ?'
      )
      .run(
        channel.endedAt,
        JSON.stringify(channel.participants),
        channel.name,
        channel.id
      );

    const duration = recordedMs(channel.recording, channel.endedAt ?? this.now());
    if (channel.recording.status !== 'stopped' || duration <= 0) return;

    const present = this.recordingAudience.get(channel.id) ?? new Set<string>();
    this.recordingAudience.delete(channel.id);

    const perParticipant = this.segments.get(channel.id) ?? new Map();
    this.segments.delete(channel.id);
    const stems = Object.fromEntries(perParticipant) as Record<
      string,
      Array<{ key: string; startMs: number }>
    >;
    const flat = Object.values(stems)
      .flat()
      .map((segment) => segment.key);

    // Who the recording belongs to: everyone who took part. Presence and
    // stems are unioned rather than one trusted over the other — presence
    // covers a speaker whose capture failed, stems cover anyone presence
    // missed, and the media participant is not a person, so it is dropped.
    const audience = [
      ...new Set([
        ...present,
        ...Object.keys(stems).filter((id) => id !== MEDIA_IDENTITY),
      ]),
    ];

    // A claim still open when the recording ended runs to the end of it.
    const windows = this.floorWindows.get(channel.id) ?? [];
    this.floorWindows.delete(channel.id);
    for (const window of windows) {
      if (window.toMs === null) window.toMs = duration;
    }

    // Deliberately not INSERT OR IGNORE. That looked like protection against
    // writing one recording twice, but never was: the id is freshly random on
    // every call and nothing is unique on channel_id, so a second run would
    // insert a second row regardless. All it actually did was swallow the one
    // error worth catching — the key collision this retry exists to handle.
    insertWithUniqueKey(
      () => newId('rec'),
      (candidate) =>
        this.db
          .prepare(
            `INSERT INTO recordings
           (id, channel_id, initiator_id, invitee_id, participants, started_at,
            duration_ms, s3_key, segment_keys, stems, floor_timeline)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            candidate,
            channel.id,
            channel.initiator,
            // Legacy anchor columns, NOT NULL and never read back; the
            // participants JSON is what membership queries use.
            audience[1] ?? audience[0] ?? channel.initiator,
            JSON.stringify(audience),
            channel.recording.startedAt ?? channel.createdAt,
            duration,
            flat[0] ?? '',
            JSON.stringify(flat),
            JSON.stringify(stems),
            JSON.stringify(windows)
          )
    );
  }
}
