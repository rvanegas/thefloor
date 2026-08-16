import { readdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DELETED_RETENTION_MS,
  MAX_CHANNEL_PARTICIPANTS,
  MAX_RECORDING_NAME_LENGTH,
} from '../../core/constants';
import { playbackPositionMs } from '../../core/playback';
import { recordedMs } from '../../core/recording';
import {
  canControlPlayback,
  canDeleteChannel,
  createChannel,
  isInvited,
  isNamed,
  isParticipant,
  otherParticipants,
  reduce,
} from '../../core/channel';
import { initialFloorState } from '../../core/floor';
import { describeChannel, nameRecording } from '../../core/naming';
import { initialPlaybackState } from '../../core/playback';
import { initialRecordingState } from '../../core/recording';
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
import { encodeRecording } from './export';
import type { MediaServer, PlaybackSession } from './media';
import { getWhenReady, type RecordingStore } from './storage';
import { createPushNotifier, type PushNotifier } from './push';

/**
 * A conversation that has changed channels, and who it took with it. `userIds`
 * is everyone the move actually moved — whoever was standing in `from`, plus
 * the person whose arrival caused it.
 */
export interface Move {
  from: string;
  to: string;
  userIds: string[];
}

export const TICK_INTERVAL_MS = 500;

/** How often deleted rows past their week are looked for. */
export const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * How long a channel stays quiet after announcing itself.
 *
 * A channel becoming active is worth a notification; the same channel emptying
 * and refilling five times because somebody's train went into a tunnel is not.
 * The window is what separates the two, and it has to outlast a reconnect —
 * `DISCONNECT_GRACE_MS` is a minute, so anything shorter would let one flap
 * through.
 */
export const ANNOUNCE_INTERVAL_MS = 5 * 60 * 1000;

/**
 * The stem key for shared playback, and the identity it publishes under.
 *
 * A name rather than a user id, because it is not a user: it never claims the
 * floor, is never silenced, and so never appears in the floor timeline. User
 * ids are minted with a `usr_` prefix, so this cannot collide with one.
 *
 * Keyed by channel rather than by room, and it was called `mediaRoomIdentity`
 * until a channel gained a `mediaRoom` of its own, at which point the name read
 * as the room's identity rather than the publisher's. Uniqueness holds either
 * way: two channels never share a room, and a conversation leaving one closes
 * its playback on the way out rather than leaving this connected behind it.
 */
export const MEDIA_IDENTITY = 'media';
export const playbackIdentity = (channelId: string) => `media:${channelId}`;

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
  'DELETE_CHANNEL',
  'INVITE',
  'SET_NAME',
  'SET_DESCRIPTION',
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
 * How often a live run's row is brought up to date. What it bounds is loss of
 * *bookkeeping* on a crash — the run is finalized at boot with whatever the
 * last checkpoint knew, so its recovered duration is understated by at most
 * this much.
 */
export const RUN_CHECKPOINT_MS = 5_000;

/**
 * Everything a statement about one listener–speaker pair was made against, as
 * one comparable string: two of these being equal is what lets the floor's
 * reconciliation leave a pair alone.
 *
 * The room is in it because a channel can move to another one, and the tracks
 * because a client that reconnects republishes — in both cases the statement
 * is about something that no longer exists, which is indistinguishable from
 * never having been made.
 */
function silenceSignature(
  room: string,
  silenced: boolean,
  tracks: string[]
): string {
  return `${room}:${silenced}:${[...tracks].sort().join(',')}`;
}

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
 * Channels live in memory and are written to SQLite as they change, so they
 * survive a restart. What is written is a durable projection rather than the
 * whole state — see `durableOf` for what is deliberately left out, all of it
 * describing the process rather than the channel.
 *
 * The write is compared before it is made, which is what keeps this cheap: a
 * claim, a seek, a connection flap or a tick produces an identical projection
 * and no write at all, so the rate is bounded by how often people do things
 * that ought to outlive the server.
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
   * What the media plane was last known to have been told, per channel: for
   * each `listener<-speaker` pair, whether the speaker was withheld and the
   * room and tracks it was stated against. Absent means nothing is known to
   * have landed, which is what a failed call and a never-made one have in
   * common.
   *
   * The tracks are the point. A mute is a statement about a track id, so it
   * stops being true the moment the speaker republishes — which a phone does
   * every time its connection flaps, coming back with a new track that is
   * subscribed to by default. Remembering only "the call succeeded" cannot
   * notice that; remembering *what* succeeded can. See `reconcileSilence`.
   */
  private silenceStated = new Map<string, Map<string, string>>();
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
  private moveListeners = new Set<(move: Move) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  /**
   * The durable projection last written per channel, as its JSON. What makes
   * writing on every commit affordable: a transition that changes only
   * volatile state — a claim, a seek, a connection flap, a tick — produces the
   * same projection and is not written. The write rate is bounded by how often
   * people do things that ought to survive a restart.
   */
  private persisted = new Map<string, string>();
  /** When each live run's row was last checkpointed. Keyed by run id. */
  private checkpointedAt = new Map<string, number>();
  /**
   * Mixes in flight, keyed by recording id. A recording is invisible for
   * exactly as long as it is in here.
   */
  private mixing = new Map<string, Promise<void>>();

  /**
   * When each channel last announced itself, so a flapping connection cannot
   * ring everybody repeatedly. See `announceActive`.
   *
   * In memory deliberately: a restart resetting it costs at most one extra
   * notification, which is not worth a column.
   */
  private lastAnnouncedAt = new Map<string, number>();

  constructor(
    private db: Db,
    private accounts: Accounts,
    private now: () => number = Date.now,
    private media?: MediaServer,
    private onMediaError: (error: unknown, context: string) => void = () => {},
    private roomCloseGraceMs: number = ROOM_CLOSE_GRACE_MS,
    private push: PushNotifier = createPushNotifier(),
    /** Read and delete on the recordings bucket; absent in tests that do not need it. */
    private store?: RecordingStore,
    /**
     * How long a mix waits for a stem that is not in the bucket yet. See
     * `getWhenReady` for why it waits at all; zero means one attempt, which is
     * what a test wants when the objects are never going to appear.
     */
    private mixWaitMs?: number
  ) {}

  // --- Lifecycle ----------------------------------------------------------

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_INTERVAL_MS);
    this.timer.unref?.();
    // Hourly rather than on the 500ms tick: what it looks for changes once a
    // week, and it reads two tables and talks to S3. A boot sweep runs from
    // restore(), so a server that is never up for an hour still sweeps.
    this.sweepTimer = setInterval(
      () => this.sweepDeleted(this.now()),
      SWEEP_INTERVAL_MS
    );
    this.sweepTimer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
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
    // asked for again once there is something to act on. The floor's half goes
    // further, and re-checks a mute that *did* land, because a track it was
    // stated against can be replaced under it — see `reconcileSilence`.
    for (const [id, channel] of this.channels) {
      if (channel.status !== 'active' || channel.floor.holder === null) continue;
      this.run(() => this.reconcileSilence(channel), `reconcileSilence ${id}`);
    }
    for (const id of this.capturing.keys()) {
      const channel = this.channels.get(id);
      if (channel) {
        this.ensureEgress(channel);
        this.checkpointRun(channel, now);
      }
    }
  }

  onChange(listener: (channelIds: string[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * The live unnamed channel holding exactly these people, if there is one.
   *
   * *Exactly*: a superset is a different conversation and a subset is the one
   * you are leaving. This is the lookup the whole design rests on — it decides
   * whether starting a channel opens a new one, and whether a move lands
   * somewhere that already exists or somewhere created on the spot.
   *
   * Named channels are invisible to it, which is what lets a set of people
   * keep a permanent named channel and still have an ordinary unnamed one.
   */
  private unnamedChannelFor(people: string[]): ChannelState | undefined {
    const want = new Set(people);
    return [...this.channels.values()].find(
      (channel) =>
        channel.status === 'active' &&
        !isNamed(channel) &&
        channel.participants.length === want.size &&
        channel.participants.every((id) => want.has(id))
    );
  }

  private emit(channelIds: string[]): void {
    for (const listener of this.listeners) listener(channelIds);
  }

  /**
   * Told when a conversation moves, which no snapshot can express: the people
   * are simply absent from one channel and present in another, and a client
   * watching the first has no way to guess where they went.
   */
  onMove(listener: (move: Move) => void): () => void {
    this.moveListeners.add(listener);
    return () => this.moveListeners.delete(listener);
  }

  private emitMove(move: Move): void {
    for (const listener of this.moveListeners) listener(move);
  }

  // --- Commands -----------------------------------------------------------

  /**
   * Creates a channel and places the initiator in it. Every invitee must be
   * an accepted contact of the initiator — of the initiator only: you cannot
   * open a channel to someone who has not agreed to one, but two people the
   * initiator brings together need not know each other.
   *
   * `invitees` may be empty, and that is now the ordinary way in: a channel of
   * one, entered immediately, with the invitations made from inside it. The
   * one-unnamed-channel-per-set rule below then makes the empty case
   * idempotent — everybody has exactly one channel that is only themselves,
   * and tapping the button again walks back into it rather than accumulating
   * a row per tap.
   */
  create(
    initiator: string,
    invitees: string[]
  ): { ok: true; channel: ChannelState } | Refused {
    const unique = [...new Set(invitees)];
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

    // One live *unnamed* channel per set of people. Without this, repeated taps
    // stack duplicates and the invitees see a pile of banners from one person
    // — and worse, nothing on Home could tell those channels apart, an unnamed
    // channel being displayed as the list of who is in it.
    //
    // Named channels are exempt, and that is the whole point of naming one. A
    // name is what distinguishes two channels holding the same people, so once
    // there is one there may be as many as they like.
    const existing = this.unnamedChannelFor([initiator, ...unique]);
    if (existing) {
      this.stepOutOfOthers(initiator, existing.id);
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
            // never read for new ones; participants is the truth. NOT NULL,
            // though, so a channel with no invitee names the initiator twice —
            // the same thing `openRun` does for a recording made alone.
            unique[0] ?? initiator,
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
    // Written immediately so a live row always carries its projection — that
    // invariant is what lets the migration tell a ghost from a channel.
    this.persistChannel(channel);
    this.emit([channel.id]);
    // A second delivery of the invite the socket has just carried, for anyone
    // whose app is not running to receive it. Not a replacement: the in-app
    // banner is still the primary path, and the notifier drops anyone who is
    // already looking.
    //
    // Titled with whoever asked rather than with the channel: a channel is
    // never named at creation, so every perspective-dependent fallback would
    // reduce to the roster anyway, and the one thing the recipient wants to
    // know is who is asking.
    //
    // Skipped outright when there is nobody to tell, rather than left to the
    // notifier's own empty case: that path logs why it sent nothing, and a
    // channel of one would file a "push skipped" line every time somebody
    // tapped Start a channel.
    if (unique.length > 0) {
      this.push.notify(unique, {
        title: this.displayName(initiator),
        body: 'Started a channel with you.',
        channelId: channel.id,
      });
    }
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
      // One thing a non-participant may do: answer an invitation. It is the
      // only action whose whole purpose is to change whether you belong, and
      // an unnamed channel's invitation is deliberately not membership — see
      // `acceptInvitation` for where answering it actually lands you.
      if (action.type === 'ENTER' && isInvited(channel, userId)) {
        return this.acceptInvitation(channel, userId);
      }
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
      const invited = this.apply(channelId, userId, {
        type: 'INVITE',
        inviteeId: contactId,
      } as Omit<ChannelAction, 'userId'> & { type: ChannelAction['type'] });
      // The same second delivery `create` sends, for the same reason: the
      // in-app banner is the primary path and reaches nobody whose app is
      // closed. It matters more here than it used to — an unnamed channel's
      // invitation is now the only way anyone else joins a conversation in
      // progress, and it is answered rather than merely noticed.
      if (invited.ok) {
        this.push.notify([contactId], {
          title: this.displayName(userId),
          body: isNamed(channel)
            ? `Invited you to ${channel.name}.`
            : 'Invited you to a channel.',
          channelId,
        });
      }
      return invited;
    }

    // Both departures are refused out loud rather than left to the reducer's
    // silence, which is what every other guard here relies on. Two reasons.
    //
    // The destructive one needs an answer: a client that deleted nothing and
    // was told nothing walks the user back to Home as though the channel were
    // gone. And build 20 and earlier send LEAVE_CHANNEL as the last member,
    // that having been the way a channel ended — they get a sentence naming
    // what to do instead, where a no-op would look like a dead button.
    if (action.type === 'DELETE_CHANNEL' && !canDeleteChannel(channel, userId)) {
      return {
        ok: false,
        error: 'Only a channel’s last member can delete it.',
        code: 'forbidden',
      };
    }
    if (
      action.type === 'LEAVE_CHANNEL' &&
      isParticipant(channel, userId) &&
      channel.participants.length === 1
    ) {
      return {
        ok: false,
        error:
          'You are the last member, so leaving would destroy this channel and its recordings. Delete it instead.',
        code: 'forbidden',
      };
    }

    // The reducer trims, caps and treats empty as unnamed; all that is checked
    // here is that the payload carries a string at all, the wire giving no
    // guarantee of even that.
    if (action.type === 'SET_NAME') {
      const name = (action as { name?: unknown }).name;
      if (typeof name !== 'string') {
        return { ok: false, error: 'Not an action.', code: 'invalid' };
      }
      // Clearing a name is not the harmless undo it looks like: it hands this
      // channel back to the one-per-set rule, and if these people already have
      // an unnamed channel there would then be two, indistinguishable on Home
      // and both described by the same list of names. Refused out loud —
      // reducer silence here would read as a dead button.
      //
      // Only a *clear* is checked. Renaming is always free, a name being what
      // tells two channels of the same people apart.
      if (name.trim() === '' && isNamed(channel)) {
        const existing = this.unnamedChannelFor(channel.participants);
        if (existing && existing.id !== channelId) {
          return {
            ok: false,
            error:
              'You already have a channel with these people and no name. Rename this one instead of clearing it.',
            code: 'conflict',
          };
        }
      }
    }

    // The reducer trims, caps and treats blank as absent; this only checks the
    // payload carries a string at all. Note it is *not* validated as Markdown:
    // there is no such thing as invalid Markdown, and anything the renderer
    // does not recognise it shows as the characters somebody typed.
    if (action.type === 'SET_DESCRIPTION') {
      if (typeof (action as { description?: unknown }).description !== 'string') {
        return { ok: false, error: 'Not an action.', code: 'invalid' };
      }
    }

    // Entering somewhere is leaving wherever you were. Done before the ENTER
    // so there is no instant in which you are present in two places, which is
    // the state watchers would otherwise be told about.
    if (action.type === 'ENTER') {
      this.stepOutOfOthers(userId, channelId);
    }

    // A run's id is minted here, never accepted from the client — it becomes
    // the recordings row's primary key and the prefix of every object the run
    // writes, so a client naming it could overwrite another run's audio. Same
    // reasoning as SET_TRACK, which a client cannot send at all.
    if (action.type === 'START_RECORDING') {
      return this.apply(channelId, userId, {
        type: 'START_RECORDING',
        runId: newId('rec'),
      } as Omit<ChannelAction, 'userId'> & { type: ChannelAction['type'] });
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

  /**
   * Whether two people are in any live channel together.
   *
   * Membership rather than presence: being in a channel with somebody is a
   * relationship that survives either of you stepping out of the room, and it
   * is what entitles you to look at their profile.
   */
  shareAChannel(a: string, b: string): boolean {
    for (const channel of this.channels.values()) {
      if (channel.status !== 'active') continue;
      if (isParticipant(channel, a) && isParticipant(channel, b)) return true;
    }
    return false;
  }

  /**
   * Steps `userId` out of every channel but `keep`.
   *
   * **Presence is exclusive.** A person has one microphone and one pair of
   * ears, so being present in two channels is not a state that can be
   * honoured — and until this existed it was reachable: entering a second
   * channel left you marked present in the first, where the others went on
   * seeing you as Present while your audio was somewhere else entirely. Worse
   * than having left, because a channel you are present in is filtered out of
   * your own home screen, so there was no way back to it.
   *
   * It lives here rather than in the reducer because the reducer sees one
   * channel at a time and this is a fact about a person across all of them.
   */
  /**
   * Answers an unnamed channel's invitation, which is not a way into that
   * channel but the moment a conversation moves.
   *
   * An unnamed channel is its people. So `source` does not gain `userId` —
   * everybody in it walks, together, into the unnamed channel for the wider
   * set. That channel may already exist, in which case this is a change of
   * channel and nothing is created; otherwise it is made here.
   *
   * What travels is presence, not membership. `source` keeps its roster, its
   * description and every recording made in it, and stays on the Home of
   * everyone who belongs to it — a conversation moving on is not a reason to
   * destroy what was said before.
   *
   * The audio does travel, and that is the whole reason `mediaRoom` exists:
   * the destination takes over the room these people are already talking in,
   * so a move costs nobody a reconnection. `source` is handed a fresh room in
   * the same breath, because two channels naming one room would put whoever
   * walked back into the empty one inside the conversation that left it.
   */
  private acceptInvitation(
    source: ChannelState,
    userId: string
  ): { ok: true; channel: ChannelState } | Refused {
    const inviter = source.invited[userId];

    // Named since the invitation was made, and a named channel is a place
    // rather than a set of people: it takes newcomers in, so this resolves as
    // the ordinary join it would have been had the name come first.
    if (isNamed(source)) {
      // Whoever asked, unless they have since left — the reducer will not take
      // an invitation from somebody who is no longer in the channel, and an
      // invitation that quietly did nothing is worse than one credited to the
      // person whose channel it is.
      const asker =
        inviter && isParticipant(source, inviter) ? inviter : source.initiator;
      this.apply(source.id, asker, {
        type: 'INVITE',
        inviteeId: userId,
      } as Omit<ChannelAction, 'userId'> & { type: ChannelAction['type'] });
      this.applyServer(source.id, { type: 'INVITE_TAKEN', inviteeId: userId });
      this.stepOutOfOthers(userId, source.id);
      return this.apply(source.id, userId, { type: 'ENTER' });
    }

    const people = [...source.participants, userId];
    if (people.length > MAX_CHANNEL_PARTICIPANTS) {
      return {
        ok: false,
        error: `Channels hold up to ${MAX_CHANNEL_PARTICIPANTS} people.`,
        code: 'conflict',
      };
    }

    // Whoever is standing in the source right now. Read before anything moves,
    // because stepping the first of them out changes it.
    const movers = [...source.present];
    const now = this.now();

    // Nothing to hand over when nobody was there: an invitation answered an
    // hour later moves no audio, and the source keeps the room it never left.
    const handOver = movers.length > 0;

    // Whatever was playing belongs to the channel it was loaded into, along
    // with its file and its position. Closed rather than carried, so no stale
    // publisher is left in a room that now belongs to somebody else.
    if (handOver) this.closePlayback(source.id);

    // Out of the source first, through the ordinary path: a departing
    // floor-holder releases the floor, and a source left empty stops its
    // recording — which stays with the source, being a recording of what was
    // said there.
    for (const mover of movers) {
      this.apply(source.id, mover, { type: 'STEP_OUT' });
    }

    const room = source.mediaRoom;
    if (handOver) {
      this.applyServer(source.id, { type: 'TAKE_MEDIA_ROOM', room: newId('room') });
    }

    let target = this.unnamedChannelFor(people);
    if (target) {
      if (handOver) {
        this.applyServer(target.id, { type: 'TAKE_MEDIA_ROOM', room });
      }
    } else {
      target = this.createMoved(source, userId, inviter, handOver ? room : undefined, now);
    }

    // The invitation is spent whether it created a channel or found one.
    this.applyServer(source.id, { type: 'INVITE_TAKEN', inviteeId: userId });

    for (const mover of movers) {
      this.apply(target.id, mover, { type: 'ENTER' });
    }
    this.stepOutOfOthers(userId, target.id);
    const arrived = this.apply(target.id, userId, { type: 'ENTER' });
    // Before the snapshots, so a client is told where everybody went before it
    // is shown a channel they are no longer in.
    this.emitMove({ from: source.id, to: target.id, userIds: [...movers, userId] });
    this.emit([source.id, target.id]);
    return arrived;
  }

  /**
   * The unnamed channel for a widened set, created because there was not one.
   *
   * It is the source continued rather than a fresh start, so it keeps the
   * source's initiator and its record of who invited whom; only the newcomer
   * is new. Nobody who was not standing in the source is marked as having been
   * here, which is what keeps it off their Home as anything but an invitation.
   */
  private createMoved(
    source: ChannelState,
    invitee: string,
    inviter: string | undefined,
    mediaRoom: string | undefined,
    now: number
  ): ChannelState {
    const participants = [...source.participants, invitee];
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
            source.initiator,
            // The legacy two-party columns are anchors for old rows and are
            // never read for new ones; participants is the truth.
            participants[1] ?? invitee,
            now,
            JSON.stringify(participants)
          )
    );

    const created = createChannel({
      id,
      initiator: source.initiator,
      invitees: participants.filter((p) => p !== source.initiator),
      now,
      mediaRoom,
      // Empty, and filled by the same ENTER loop that fills a destination
      // which already existed. One path for both, so arriving cannot mean two
      // different things depending on whether the channel had to be made.
      present: [],
    });
    const channel: ChannelState = {
      ...created,
      // Carried over rather than recomputed: how each of these people came to
      // be in this conversation did not change by the conversation moving, and
      // an invitation names whoever actually asked.
      invitedBy: {
        ...source.invitedBy,
        [invitee]: inviter ?? source.initiator,
      },
    };
    this.channels.set(channel.id, channel);
    this.persistChannel(channel);
    return channel;
  }

  /**
   * An action with no actor to authorise — the server reporting something it
   * has done, rather than anyone performing it.
   */
  private applyServer(
    channelId: string,
    action: Extract<ChannelAction, { type: 'TAKE_MEDIA_ROOM' | 'INVITE_TAKEN' }>
  ): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;
    const next = reduce(channel, action, this.now());
    if (next === channel) return;
    this.commit(channel, next);
    this.emit([channelId]);
  }

  /**
   * Takes somebody out of every live channel, as though they had walked out of
   * each one themselves, and reports who else was in them.
   *
   * This is what deleting an account does to conversations, and the whole of
   * it. A channel is not owned by anybody: leaving is the only thing a departing
   * member can do to one that other people are still in, so that is what
   * happens, and their channels go on without them. Where they were the last
   * member there is nobody left to leave it to, and the existing rule applies —
   * the channel is deleted, taking its recordings with it on the usual mark and
   * sweep.
   *
   * Both go through `apply` rather than the reducer directly, so a departing
   * floor-holder releases the floor, a recording in progress is stopped, and the
   * room is closed — one route, the same one a tap takes, rather than a second
   * that has to agree with it.
   *
   * The returned ids are whoever needs their Home redrawn. It is collected
   * before the departure rather than after, because afterwards there is nothing
   * left to read it from.
   */
  removeMember(userId: string): string[] {
    const others = new Set<string>();
    // A snapshot: `apply` writes to `this.channels` as it commits, and one of
    // these actions ends a channel.
    for (const channel of [...this.channels.values()]) {
      if (channel.status !== 'active') continue;

      // An invitation is not membership, and an unanswered one to somebody who
      // no longer exists would sit on the channel for ever. Spent rather than
      // declined: `INVITE_TAKEN` is already the server saying this invitation
      // will not be answered here.
      if (isInvited(channel, userId)) {
        this.applyServer(channel.id, { type: 'INVITE_TAKEN', inviteeId: userId });
      }

      if (!isParticipant(channel, userId)) continue;
      for (const id of otherParticipants(channel, userId)) others.add(id);
      this.apply(channel.id, userId, {
        type: channel.participants.length === 1 ? 'DELETE_CHANNEL' : 'LEAVE_CHANNEL',
      } as Omit<ChannelAction, 'userId'> & { type: ChannelAction['type'] });
    }
    // Defensive rather than expected: `otherParticipants` already excludes the
    // viewer, and notifying somebody who has just been erased would be a lookup
    // of a row that is about to go.
    others.delete(userId);
    return [...others];
  }

  private stepOutOfOthers(userId: string, keep: string): void {
    for (const id of this.channelsFor(userId)) {
      if (id !== keep) this.apply(id, userId, { type: 'STEP_OUT' });
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

  /**
   * A channel this user has been asked into and has never entered.
   *
   * Two shapes, presented identically because they are the same question. In a
   * named channel an invitation is membership without presence. In an unnamed
   * one it cannot be — answering it moves everybody somewhere else, possibly
   * somewhere that does not exist yet — so it is an entry in `invited`, and
   * the channel named here is the one to answer *at*, not the one you end up
   * in. `acceptInvitation` settles that.
   */
  invitesFor(userId: string): InviteView[] {
    const invites: InviteView[] = [];
    for (const channel of this.channels.values()) {
      if (channel.status !== 'active') continue;
      const asked = isInvited(channel, userId);
      if (!asked) {
        if (!isParticipant(channel, userId)) continue;
        if (channel.everPresent.includes(userId)) continue;
      }
      // Named after whoever actually asked, which for a mid-channel invite is
      // not necessarily the initiator.
      const from = this.accounts.public(
        channel.invited[userId] ?? channel.invitedBy[userId] ?? channel.initiator
      );
      // Never from yourself. A channel that a move created holds people who
      // have not been in it yet, and its initiator is whoever began the
      // conversation it continues — so without this, the person who started it
      // is invited by themselves to the room they are standing in.
      if (from && from.id !== userId) {
        invites.push({ channelId: channel.id, from, createdAt: channel.createdAt });
      }
    }
    return invites.sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Every live channel this user belongs to and has been in.
   *
   * **Membership is the only test.** This used to skip the channel you were
   * present in, on the reasoning that you were already looking at it — and
   * that reasoning fails in every case where the client and the server
   * disagree about where you are. Reinstalling the app was enough: the old
   * process's socket closed, the new one connected inside the disconnect
   * grace and cancelled it, and the server went on holding you present in a
   * channel the new process had never heard of. Skipped here and absent from
   * `invitesFor` — which passes over anyone who has ever been present — it
   * appeared nowhere at all, with no way back to it.
   *
   * So presence no longer decides visibility. It is a *display* concern, and
   * the client is the only end that can settle it: the app knows whether it
   * is actually in a channel, where this list only knows what the server last
   * believed. A channel you are in appears here like any other; the app
   * renders it as the live banner instead of a row when it can tell that it
   * is live, and as a row when it cannot.
   */
  rejoinableFor(userId: string): RejoinableView[] {
    const rejoinable: RejoinableView[] = [];
    for (const channel of this.channels.values()) {
      if (channel.status !== 'active') continue;
      if (!isParticipant(channel, userId)) continue;
      if (!channel.everPresent.includes(userId)) continue;

      const others = otherParticipants(channel, userId)
        .map((id) => this.accounts.public(id))
        .filter((account): account is NonNullable<typeof account> => !!account);
      // Deliberately not skipped when nobody else is left. A channel everyone
      // else has walked out of is still yours — it has your name for it, your
      // description, and your recordings hanging off it — and dropping it from
      // this list was the only place it appeared, so it became live, permanent
      // and unreachable at once.
      rejoinable.push({
        channelId: channel.id,
        name: channel.name,
        others,
        presentCount: channel.present.length,
        createdAt: channel.createdAt,
        lastActiveAt: channel.lastActiveAt,
      });
    }
    // Most recently used first. Home groups named channels above unnamed ones
    // and preserves this order inside each group.
    return rejoinable.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  }

  /**
   * Every recording of every channel this user belongs to.
   *
   * **Membership of the channel, not of the run.** A recording belongs to the
   * place it was made rather than to the people who happened to be in the room
   * that day, which is what lets it be shown on the channel's own screen and
   * deleted with it. The rule cuts both ways and both are intended: joining a
   * channel gives you everything ever recorded in it, and leaving takes away
   * recordings of conversations you were in.
   */
  recordingsFor(userId: string): RecordingRow[] {
    return this.db
      .prepare(
        // Membership is read from the channel row rather than from the live
        // registry: persistChannel rewrites `participants` on every change, so
        // it is as current, and it answers for a channel this process has not
        // revived as readily as for one it has.
        //
        // Finished runs only — an in-flight row exists for crash recovery and
        // is not yet a recording anyone can play.
        //
        // There used to be a second branch here for recordings whose channel
        // ended back when ending one kept them: membership of a channel with no
        // members cannot answer for those, so they kept the rule they were made
        // under, whoever was in the run. Four existed, they were deleted on
        // 2026-08-12, and nothing can enter that state now that ending a channel
        // means deleting it. The branch went with them.
        //
        // Mixed ones only — see `mix_state`. A recording whose mix is still
        // being made is not shown at all, so that every card on the screen is
        // one that plays and exports the moment it is tapped. The window is
        // seconds, and it is the whole point of mixing when the run ends
        // rather than when somebody asks.
        `SELECT r.* FROM recordings r
         JOIN channels c ON c.id = r.channel_id
         WHERE r.ended_at IS NOT NULL
           AND r.deleted_at IS NULL
           AND c.deleted_at IS NULL
           AND (r.mix_state IS NULL OR r.mix_state != 'pending')
           AND EXISTS (
             SELECT 1 FROM json_each(c.participants) WHERE json_each.value = ?
           )
         ORDER BY r.started_at DESC`
      )
      .all(userId) as unknown as RecordingRow[];
  }

  /** The same rule, for one channel: its recordings, or nothing if not yours. */
  recordingsInChannel(channelId: string, userId: string): RecordingRow[] {
    const channel = this.channels.get(channelId);
    if (!channel || !isParticipant(channel, userId)) return [];
    return this.db
      .prepare(
        // The same mix rule as `recordingsFor`, and it has to be: this is the
        // channel screen's list and that is Home's, and a recording appearing
        // on one and not the other is a bug you find by being asked about it.
        `SELECT * FROM recordings
         WHERE ended_at IS NOT NULL AND deleted_at IS NULL AND channel_id = ?
           AND (mix_state IS NULL OR mix_state != 'pending')
         ORDER BY started_at DESC`
      )
      .all(channelId) as unknown as RecordingRow[];
  }

  /**
   * Deletes one recording, on the same terms as deleting the channel deletes
   * all of them: marked now, swept a week later, and gone from every list in
   * the meantime.
   *
   * Anybody who can reach it may, which is everybody in its channel. That is
   * deliberately not the rule for deleting a *channel* — only its last member
   * may do that, there being nobody left to disagree — because the two acts
   * are not the same size. A channel is a place other people are still using;
   * one recording is a thing that was made, and whoever was in the room to be
   * recorded has as much standing to unmake it as whoever pressed record.
   *
   * The reach test is `recordingsFor`, the same function play and export ask,
   * so what may be heard, downloaded and deleted cannot come apart.
   */
  deleteRecording(
    recordingId: string,
    userId: string
  ): { ok: true } | Refused {
    const row = this.recordingsFor(userId).find(
      (candidate) => candidate.id === recordingId
    );
    if (!row) {
      return { ok: false, error: 'No such recording.', code: 'not_found' };
    }
    this.db
      .prepare(
        'UPDATE recordings SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL'
      )
      .run(this.now(), recordingId);
    // So the channel screen loses the row now rather than whenever something
    // else happens to change.
    this.emit([row.channel_id]);
    return { ok: true };
  }

  /**
   * Renames one recording, for everybody who can reach it.
   *
   * The same reach test as deleting, and for the same reason: a recording
   * belongs to the channel it was made in, so anybody in that channel has
   * standing over what it is called. The consequence is worth saying out
   * loud — this changes the name in *everyone's* list, not a private label.
   * That is the point rather than a cost. The name exists so two people can
   * talk about one recording by one name, and a rename only one of them saw
   * would destroy exactly the property the settled name was built to have.
   *
   * **An empty name is refused rather than clearing it.** Clearing looks
   * free — `toRecordingView` already falls back when `name` is null — but the
   * fallback it falls back to is `describeChannel(others)`, which is computed
   * from the *viewer's* others and so reads differently to each person. So
   * clearing would not restore the settled name; it would replace one shared
   * name with several private ones. A recording has a name, and renaming it
   * gives it another one.
   */
  renameRecording(
    recordingId: string,
    userId: string,
    name: string
  ): { ok: true } | Refused {
    const row = this.recordingsFor(userId).find(
      (candidate) => candidate.id === recordingId
    );
    if (!row) {
      return { ok: false, error: 'No such recording.', code: 'not_found' };
    }
    // Normalised here rather than at the route, so every caller agrees on
    // what a given input names it — the same reasoning as `SET_NAME`.
    const trimmed = name.trim().slice(0, MAX_RECORDING_NAME_LENGTH);
    if (trimmed === '') {
      return {
        ok: false,
        error: 'A recording needs a name.',
        code: 'invalid',
      };
    }
    this.db
      .prepare('UPDATE recordings SET name = ? WHERE id = ?')
      .run(trimmed, recordingId);
    // Same as deleting: the channel screen shows the new name now rather than
    // whenever something else happens to change.
    this.emit([row.channel_id]);
    return { ok: true };
  }

  /**
   * Marks a deleted channel and everything recorded in it, for the sweep to
   * remove a week later.
   *
   * Nothing is removed here, and the delay is not politeness: `channel_id` is
   * a real foreign key, so a recording outliving its channel by even an
   * instant would be a broken row. Marking both at once keeps every row valid
   * for the whole week and lets one sweep take them together, in the order the
   * key requires.
   */
  private markDeleted(channelId: string, now: number): void {
    this.db
      .prepare('UPDATE recordings SET deleted_at = ? WHERE channel_id = ? AND deleted_at IS NULL')
      .run(now, channelId);
    this.db
      .prepare('UPDATE channels SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL')
      .run(now, channelId);
  }

  /**
   * Removes what was marked more than `DELETED_RETENTION_MS` ago: the audio
   * first, then the rows.
   *
   * The bucket is emptied before the row that names the objects is dropped,
   * because a row is the only record of which keys belong to a recording — the
   * other order leaves objects nobody can ever identify, paid for for ever. A
   * failed delete therefore leaves the row in place to be tried again on the
   * next sweep, which is the recoverable direction.
   */
  sweepDeleted(now: number): { recordings: number; channels: number } {
    const cutoff = now - DELETED_RETENTION_MS;
    const due = this.db
      .prepare(
        'SELECT id, channel_id, s3_key, segment_keys, stems FROM recordings WHERE deleted_at IS NOT NULL AND deleted_at <= ?'
      )
      .all(cutoff) as unknown as Array<{
      id: string;
      channel_id: string;
      s3_key: string;
      segment_keys: string | null;
      stems: string | null;
    }>;

    let recordings = 0;
    for (const row of due) {
      // The mix is asked for unconditionally rather than only when the state
      // says 'ready'. It is derived, so deleting one that was never written
      // costs a no-op, where skipping one that was — a mix stored a moment
      // before the crash that lost the state update — leaves a conversation in
      // the bucket after its row has gone, which is the failure this whole
      // ordering exists to prevent.
      const keys = [...objectKeysOf(row), mixKeyFor(row.channel_id, row.id)];
      // Without a store configured there is nothing to empty and no way to
      // know the objects are gone, so the row stays: a marked recording is
      // already unreachable, and keeping it costs a row rather than an
      // unidentifiable object.
      if (!this.store) continue;
      let emptied = true;
      for (const key of keys) {
        try {
          this.store.delete(key);
        } catch (error) {
          emptied = false;
          this.onMediaError(error, `sweep ${key}`);
        }
      }
      if (!emptied) continue;
      this.db.prepare('DELETE FROM recordings WHERE id = ?').run(row.id);
      recordings += 1;
    }

    // Only channels with nothing left pointing at them, so a recording whose
    // objects would not delete keeps its channel alive rather than orphaning
    // the row or failing the constraint.
    const gone = this.db
      .prepare(
        `DELETE FROM channels
         WHERE deleted_at IS NOT NULL AND deleted_at <= ?
           AND NOT EXISTS (SELECT 1 FROM recordings WHERE recordings.channel_id = channels.id)`
      )
      .run(cutoff);
    return { recordings, channels: Number(gone.changes ?? 0) };
  }

  // --- Persistence --------------------------------------------------------

  private commit(before: ChannelState, after: ChannelState): void {
    this.channels.set(after.id, after);
    this.persistChannel(after);
    // Ending is deletion and nothing else now: the last member cannot leave,
    // only delete. Keyed on the transition rather than on the action so that
    // any other route to `ended` — a migration, a future rule — marks the
    // recordings too rather than stranding them in a channel nobody can reach.
    if (before.status === 'active' && after.status === 'ended') {
      this.markDeleted(after.id, after.endedAt ?? this.now());
    }
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
    if (before.present.length === 0 && after.present.length > 0) {
      this.announceActive(after);
    }
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
      // A backstop, not the mechanism: participants leave on their own once
      // told the channel ended. This guarantees the room does not outlive it.
      setTimeout(() => {
        // The channel's own room, which is not always the one named after it:
        // a channel that received a moving conversation is holding somebody
        // else's, and closing by id would tear down a room it does not own.
        const room = after.mediaRoom;
        this.run(() => this.media?.closeRoom(room), `closeRoom ${room}`);
      }, this.roomCloseGraceMs).unref?.();
      // Keep it briefly so watchers get a final snapshot explaining why it
      // ended, rather than the channel vanishing from under them.
      setTimeout(() => {
        this.channels.delete(after.id);
        this.persisted.delete(after.id);
        this.silenceStated.delete(after.id);
      }, 30_000).unref?.();
    }
  }

  /**
   * Tells the people who are not here that the channel has come alive.
   *
   * A channel is a permanent place, and the thing worth knowing about one is
   * that somebody is in it — which is exactly the transition from nobody
   * present to somebody present. Fired from `commit`, so it cannot disagree
   * with what the clients were told.
   *
   * Suppressed within `ANNOUNCE_INTERVAL_MS` of the last announcement, because
   * presence follows a websocket: one person on a bad connection produces a
   * run of empty-to-occupied transitions that are a network artefact rather
   * than anything happening in the room.
   */
  private announceActive(channel: ChannelState): void {
    if (channel.status !== 'active') return;
    const now = this.now();
    const last = this.lastAnnouncedAt.get(channel.id);
    if (last !== undefined && now - last < ANNOUNCE_INTERVAL_MS) return;
    this.lastAnnouncedAt.set(channel.id, now);

    const arrived = channel.present[0];
    const absent = channel.participants.filter(
      (id) => !channel.present.includes(id)
    );
    // Each is titled from its own recipient's point of view, because an
    // unnamed channel is called after whoever else is in it and there is no
    // one answer to that.
    for (const userId of absent) {
      this.push.notify([userId], {
        title: this.nameFor(channel, userId),
        body: `${this.displayName(arrived)} stepped in.`,
        channelId: channel.id,
      });
    }
  }

  /**
   * What to call a channel when writing to one particular person: its name if
   * it has one, otherwise the roster as they see it.
   *
   * Now genuinely the same fallback the app's header and Home use, by sharing
   * `describeChannel` with them, so a channel does not answer to one thing on
   * the lock screen and another once you have tapped it. It used to say so and
   * be wrong: this returned "3 people" where Home listed the names, and "1
   * people" once everyone else had left.
   *
   * A lock screen has no typography, so the description arrives here stripped
   * of the muted italic that marks it as a description on screen. Nothing to
   * be done about that; the notification is addressed to one person, which is
   * the reading under which a viewer-relative label is true.
   */
  private nameFor(channel: ChannelState, viewer: string): string {
    if (channel.name) return channel.name;
    return describeChannel(
      otherParticipants(channel, viewer).map((id) => this.displayName(id))
    );
  }

  private displayName(userId: string): string {
    return this.accounts.public(userId)?.displayName ?? 'Someone';
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
   * This is the immediate half, fired on a transition so a claim takes effect
   * at once rather than on the next tick. It is best-effort by design: it does
   * not know who is actually in the media room, and a pair it cannot state —
   * either end absent, the speaker publishing nothing yet — is left to
   * `reconcileSilence`, which does. Every pair it does state is remembered, so
   * the reconciliation has something to compare against and does not restate
   * what already landed.
   */
  private assertSilence(
    state: ChannelState,
    speakers: string[] = state.participants
  ): void {
    if (!this.media || state.status !== 'active') return;
    const holder = state.floor.holder;
    for (const speaker of speakers) {
      const silenced = holder !== null && speaker !== holder;
      for (const listener of state.participants) {
        if (listener === speaker) continue;
        this.stateSilence(state, speaker, listener, silenced);
      }
    }
  }

  /**
   * Tells the media plane one pair, and remembers it if it lands.
   *
   * The record is cleared before the call rather than after it fails, so a
   * statement in flight is never mistaken for one in force.
   */
  private stateSilence(
    state: ChannelState,
    speaker: string,
    listener: string,
    silenced: boolean
  ): void {
    if (!this.media) return;
    const room = state.mediaRoom;
    const stated = this.silenceStated.get(state.id) ?? new Map<string, string>();
    this.silenceStated.set(state.id, stated);
    const pair = `${listener}<-${speaker}`;
    stated.delete(pair);
    this.media.setSilenced({ room, speaker, listener, silenced }).then(
      (tracks) => {
        // Nothing published is nothing stated: whoever publishes next is
        // subscribed to by default, so this has to be said again against a
        // real track — which is exactly what the reconciliation will see.
        if (tracks.length > 0) {
          stated.set(pair, silenceSignature(room, silenced, tracks));
        }
      },
      (error) =>
        this.onMediaError(
          error,
          `setSilenced ${state.id} ${pair}=${silenced}`
        )
    );
  }

  /**
   * The floor's standing correction: compares what the room is actually
   * carrying against what was last stated about it, and restates the pairs
   * that disagree.
   *
   * Run once a tick while somebody holds the floor, because everything a
   * one-shot statement rests on can stop being true without anything the
   * reducer sees changing. A silenced speaker whose connection flaps comes
   * back publishing a new track that the old unsubscribe does not cover and
   * that is subscribed to by default — so they are audible again, indefinitely,
   * while every screen says they are silenced. That is what this catches.
   *
   * Only pairs where both ends are in the room are touched, and only speakers
   * who are actually publishing. Acting on anyone else is not merely wasted:
   * it is what used to make `participant does not exist` the loudest line in
   * the log, twice a second for as long as a claim lasted.
   */
  private async reconcileSilence(state: ChannelState): Promise<void> {
    if (!this.media || state.status !== 'active') return;
    const holder = state.floor.holder;
    if (holder === null) return;
    const room = state.mediaRoom;
    const roster = await this.media.audioTracks(room);
    // The channel may have moved rooms or released the floor while we asked.
    const now = this.channels.get(state.id);
    if (!now || now.mediaRoom !== room || now.floor.holder !== holder) return;

    const present = state.participants.filter((id) => roster.has(id));
    const stated = this.silenceStated.get(state.id) ?? new Map<string, string>();
    this.silenceStated.set(state.id, stated);
    for (const speaker of present) {
      const tracks = roster.get(speaker) ?? [];
      if (tracks.length === 0) continue;
      const silenced = speaker !== holder;
      const signature = silenceSignature(room, silenced, tracks);
      for (const listener of present) {
        if (listener === speaker) continue;
        if (stated.get(`${listener}<-${speaker}`) === signature) continue;
        this.stateSilence(state, speaker, listener, silenced);
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

    // A new run gets its row now, not when it ends. An open row is what makes
    // the run survivable: if this process dies mid-capture, the next boot
    // finds the row, keeps the audio it references, and marks it failed —
    // where a row written only at the end would leave nothing to find and the
    // bucket holding audio no recording admits to.
    const runId = after.recording.runId;
    if (runId !== null && runId !== before.recording.runId) {
      this.openRun(after, runId);
    }

    const shouldCapture = after.recording.status === 'recording';
    const isCapturing = this.capturing.has(after.id);

    if (shouldCapture && !isCapturing) {
      this.capturing.set(after.id, {
        handles: [],
        requested: new Set(),
        retryAt: new Map(),
      });
      // Seeded only if absent, because this branch is reached by a resume as
      // well as by a start — pause genuinely stops capture, so resuming looks
      // identical from here. Overwriting would drop everyone who was in the
      // first half of the run and gone by the second.
      if (!this.recordingAudience.has(after.id)) {
        this.recordingAudience.set(after.id, new Set());
      }

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
    } else if (!shouldCapture && isCapturing) {
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

    // A run that has ended is filed now rather than when the channel ends,
    // which is what lets a channel hold more than one. Capture has already
    // been torn down above, so the stems are complete by the time this runs.
    const finished = before.recording.runId;
    if (finished !== null && finished !== after.recording.runId) {
      this.fileRun(after, finished);
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
    // The run is in the path because the index restarts at 001 for each run —
    // `segments` is drained when a run is filed. Without it a channel's second
    // recording would overwrite its first in the bucket, and the first row
    // would still point at those keys: an export of run one playing run two's
    // audio, with nothing anywhere reporting a problem.
    const key = `${state.id}/${state.recording.runId}/${identity}-${index}.ogg`;
    // Where in the recorded audio this capture begins: zero at a run's start,
    // later for someone who joined partway through one. Reserved before the
    // call returns so a second transition cannot pick the same index, and so
    // a failed fatal start leaves a visible gap rather than reusing a key.
    const startMs = recordedMs(state.recording, this.now());
    perParticipant.set(identity, [...previous, { key, startMs }]);

    /** Puts this participant back in the queue for the next tick to try. */
    const tryAgainLater = () => {
      this.releaseSegment(state.id, identity, key);
      run.requested.delete(identity);
      run.retryAt.set(identity, this.now() + 5_000);
    };

    this.run(
      async () => {
        const handle = await this.media!.startRecording({
          room: state.mediaRoom,
          identity,
          key,
        });
        // No track to record yet — a microphone that has not opened, a
        // permission not granted, a connection still coming back. Nobody has
        // failed at anything, so the run carries on without them and this
        // hands them to `ensureEgress`, which is the same path somebody who
        // walks in mid-recording takes. If their microphone opens later they
        // get a stem from that moment; if it never does, `fileRun` simply
        // files a recording they are not on.
        //
        // This used to throw, and with `fatal` set for everyone present at the
        // start it ended the whole run: one silent participant cost everybody
        // else their conversation. A recording missing one voice is worth
        // having; a recording that does not exist is not.
        if (handle === null) {
          tryAgainLater();
          return;
        }
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
        // A genuine failure of the recording apparatus, which is a different
        // thing from a participant with nothing to record.
        if (fatal) {
          this.captureFailed(state.id, identity, key, error);
        } else {
          tryAgainLater();
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
    // Read now rather than inside the call: which room this channel's audio is
    // in is a property of the channel, and the only thing that changes it is a
    // move, which closes playback before it happens.
    const room = this.channels.get(channelId)?.mediaRoom;
    if (!room) return;

    this.openingPlayback.add(channelId);
    this.run(
      async () => {
        try {
          const channel = await this.media!.openPlayback({
            room,
            identity: playbackIdentity(channelId),
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
    const key = `${channelId}/${state.recording.runId}/${MEDIA_IDENTITY}-${index}.ogg`;
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

    // Where in the recorded audio this transition falls. When a run has just
    // ended, `after.recording` is already idle and would read zero, so the
    // run's own final duration is the honest answer — closing every open
    // window at 0 would gate the whole export instead of one span.
    const at =
      after.recording.runId !== null
        ? recordedMs(after.recording, this.now())
        : (after.lastRecording?.durationMs ??
          recordedMs(before.recording, this.now()));
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
      room: channel.mediaRoom,
      identity: userId,
      displayName: account.displayName,
    });
    return { ok: true, token };
  }

  /**
   * The part of a channel that means anything after a restart.
   *
   * Everything absent is absent on purpose, because it describes the process
   * rather than the channel: `present` and `disconnectedAt` are sockets that
   * died with the server; the floor orders a live conversation and there is no
   * live conversation to order; playback points at a temp file the dead
   * process owned; the recording's egress handles are gone. `selfMuted` is
   * volatile by decision rather than necessity — restoring a mute somebody set
   * and forgot is a trap, so everyone comes back audible.
   */
  private durableOf(channel: ChannelState): string {
    return JSON.stringify({
      name: channel.name,
      description: channel.description,
      initiator: channel.initiator,
      participants: channel.participants,
      invitedBy: channel.invitedBy,
      // Both of these outlive the process, and for the same reason: they are
      // facts about the channel rather than about the conversation running in
      // it. An unanswered invitation is still unanswered after a restart, and
      // a channel that inherited its audio still owns that room — restoring it
      // as the channel id would silently split a moved conversation in two,
      // the far end still holding tokens for the room it was handed.
      invited: channel.invited,
      mediaRoom: channel.mediaRoom,
      everPresent: channel.everPresent,
      status: channel.status,
      endedAt: channel.endedAt,
      lastActiveAt: channel.lastActiveAt,
      // Durable for the same reason as those two: when somebody was last in
      // this channel is a fact about the channel, and a deploy is not a thing
      // that should make everybody look freshly arrived.
      lastPresentAt: channel.lastPresentAt,
      lastRecording: channel.lastRecording,
    });
  }

  /** Writes the channel's durable projection, if it has changed. */
  private persistChannel(channel: ChannelState): void {
    const durable = this.durableOf(channel);
    if (this.persisted.get(channel.id) === durable) return;
    this.persisted.set(channel.id, durable);
    this.db
      .prepare(
        // The queryable columns are re-stated beside the blob because SQL
        // filters on them — membership via participants, liveness via
        // ended_at — while the blob is only ever read whole, at boot.
        `UPDATE channels SET ended_at = ?, participants = ?, name = ?,
                description = ?, state = ? WHERE id = ?`
      )
      .run(
        channel.endedAt,
        JSON.stringify(channel.participants),
        channel.name,
        channel.description,
        durable,
        channel.id
      );
  }

  /**
   * Brings the durable channels back after a restart, and squares everything
   * else with the fact of one.
   *
   * Order matters here and it is: finalize interrupted runs, revive channels,
   * close their rooms, sweep dead upload files. The run finalization reads
   * rows the previous process last checkpointed; closing the rooms is what
   * actually terminates that process's orphaned egresses, since their handles
   * died with it — nobody is present in a revived channel by construction, so
   * every room is empty and closing it costs nothing. LiveKit recreates a room
   * when the first client rejoins.
   */
  restore(): void {
    const now = this.now();

    // Runs the previous process never finished. Kept rather than deleted —
    // the audio LiveKit wrote is real and the row's last checkpoint references
    // it — unless nothing was ever captured, in which case the run did not
    // happen. The duration is understated by up to one checkpoint interval,
    // which is the safe direction.
    const strays = this.db
      .prepare(
        'SELECT id, duration_ms, stems, floor_timeline FROM recordings WHERE ended_at IS NULL'
      )
      .all() as unknown as Array<{
      id: string;
      duration_ms: number;
      stems: string | null;
      floor_timeline: string | null;
    }>;
    for (const stray of strays) {
      const stems = stray.stems
        ? (JSON.parse(stray.stems) as Record<string, unknown[]>)
        : {};
      const hasAudio =
        stray.duration_ms > 0 &&
        Object.values(stems).some((segments) => segments.length > 0);
      if (!hasAudio) {
        this.db.prepare('DELETE FROM recordings WHERE id = ?').run(stray.id);
        continue;
      }
      // A claim that was open at the crash runs to the end of what was kept.
      const windows = (
        stray.floor_timeline
          ? (JSON.parse(stray.floor_timeline) as Array<{
              identity: string;
              fromMs: number;
              toMs: number | null;
            }>)
          : []
      ).map((w) => ({ ...w, toMs: w.toMs ?? stray.duration_ms }));
      this.db
        .prepare(
          `UPDATE recordings SET ended_at = ?, failure = ?, floor_timeline = ?,
                  mix_state = 'pending' WHERE id = ?`
        )
        .run(
          now,
          'The server restarted while this was recording.',
          JSON.stringify(windows),
          stray.id
        );
    }

    // Every run whose mix was never finished: the strays just filed, and any
    // the previous process was part way through when it stopped. Both are
    // invisible until this clears them, so it is not optional — a deploy timed
    // badly enough would otherwise hide a recording for good.
    //
    // Without a store there is nothing to mix from, and leaving them pending
    // would hide them on a server that is never going to change its mind.
    const unfinished = this.db
      .prepare(
        `SELECT id, channel_id FROM recordings
         WHERE ended_at IS NOT NULL AND deleted_at IS NULL AND mix_state = 'pending'`
      )
      .all() as unknown as Array<{ id: string; channel_id: string }>;
    for (const row of unfinished) {
      if (this.store) {
        this.startMix(row.id, row.channel_id);
      } else {
        this.db
          .prepare("UPDATE recordings SET mix_state = 'unmixed' WHERE id = ?")
          .run(row.id);
      }
    }

    const rows = this.db
      .prepare('SELECT * FROM channels WHERE ended_at IS NULL')
      .all() as unknown as Array<{
      id: string;
      initiator_id: string;
      created_at: number;
      participants: string | null;
      name: string | null;
      description: string | null;
      state: string | null;
    }>;
    for (const row of rows) {
      // No blob means pre-persistence, and the migration closes those; one
      // surviving anyway is a row this code cannot honestly revive.
      if (!row.state) {
        this.db
          .prepare('UPDATE channels SET ended_at = ? WHERE id = ?')
          .run(row.created_at, row.id);
        continue;
      }
      const channel = this.revive(row);
      this.channels.set(channel.id, channel);
      this.persisted.set(channel.id, this.durableOf(channel));
      // Every restored channel counts as having just announced itself, which
      // is what stops a deploy notifying everybody.
      //
      // A restart drops every socket and revives every channel with nobody
      // present, so the clients that reconnect a second later each produce a
      // nobody-to-somebody transition — indistinguishable, to `announceActive`,
      // from somebody walking in. Two people mid-conversation would each be
      // told the other had stepped into the channel they were already in.
      //
      // The cost is that a genuine arrival in the first few minutes after a
      // deploy goes unannounced. That is the right way round: a missed
      // notification is quiet, and the alternative is every phone lighting up
      // every time the server is restarted.
      this.lastAnnouncedAt.set(channel.id, now);
      // The revived channel's room, which a channel that has moved does not
      // share with its id.
      const room = channel.mediaRoom;
      this.run(() => this.media?.closeRoom(room), `closeRoom ${room}`);
    }

    // An uploaded track belongs to one channel of one process, and dies with
    // it. Nothing else ever removes these, so a server that crashed mid-call
    // leaves somebody's audio file on disk indefinitely.
    //
    // The sweep therefore has to answer "whose is this?", and it answers it by
    // pid: the upload route stamps its own into the directory name, so a
    // directory is safe to delete only when its owner is neither this process
    // nor any process still running. Deleting by prefix alone is not good
    // enough and the difference is not academic — with several servers sharing
    // a tmpdir, which is every jest worker in this suite, a boot would delete
    // a *live* upload out from under a peer. That failed as an unreadable-audio
    // 415 from a route that should have said 403, because the probe found
    // nothing where the file had just been written.
    //
    // A recycled pid can make this skip a sweep it could have done. Leaving a
    // dead file for one more boot is the cheaper mistake.
    const mine = process.pid;
    const orphans = readdirSync(tmpdir()).filter((entry) => {
      const owner = /^thefloor-track-(\d+)-/.exec(entry)?.[1];
      if (owner === undefined) return false;
      const pid = Number(owner);
      if (pid === mine) return false;
      try {
        // Signal 0 checks for existence without delivering anything.
        process.kill(pid, 0);
        return false;
      } catch (error) {
        // ESRCH is the only answer meaning "no such process". EPERM means it
        // exists and belongs to someone else — a server running as another
        // user — and sweeping that would delete a live upload rather than a
        // dead one.
        return (error as { code?: string }).code === 'ESRCH';
      }
    });
    if (orphans.length > 0) {
      this.run(async () => {
        for (const entry of orphans) {
          await rm(join(tmpdir(), entry), { recursive: true, force: true });
        }
      }, 'sweepTrackFiles');
    }

    // Anything whose week ran out while this server was down, or while the
    // previous one was up for less than an hour at a time.
    this.sweepDeleted(now);
  }

  /** A stored channel, made live again with everything volatile reset. */
  private revive(row: {
    id: string;
    initiator_id: string;
    created_at: number;
    participants: string | null;
    name: string | null;
    description: string | null;
    state: string | null;
  }): ChannelState {
    const durable = JSON.parse(row.state!) as {
      name?: string | null;
      description?: string | null;
      initiator?: string;
      participants?: string[];
      invitedBy?: Record<string, string>;
      invited?: Record<string, string>;
      mediaRoom?: string;
      everPresent?: string[];
      lastActiveAt?: number;
      lastPresentAt?: ChannelState['lastPresentAt'];
      lastRecording?: ChannelState['lastRecording'];
    };
    const participants =
      durable.participants ??
      (row.participants ? (JSON.parse(row.participants) as string[]) : []);
    return {
      id: row.id,
      // Written before this field existed means never moved, and a channel
      // that has never moved talks in the room named after it.
      mediaRoom: durable.mediaRoom ?? row.id,
      name: durable.name ?? row.name ?? null,
      description: durable.description ?? row.description ?? null,
      initiator: durable.initiator ?? row.initiator_id,
      participants,
      invitedBy: durable.invitedBy ?? {},
      invited: durable.invited ?? {},
      createdAt: row.created_at,
      // Channels written before this field existed fall back to their creation
      // — the same order they had before, rather than all of them at zero.
      lastActiveAt: durable.lastActiveAt ?? row.created_at,
      status: 'active',
      endedAt: null,
      present: [],
      everPresent: durable.everPresent ?? [],
      floor: initialFloorState(),
      selfMuted: Object.fromEntries(participants.map((id) => [id, false])),
      recording: initialRecordingState(),
      lastRecording: durable.lastRecording ?? null,
      playback: initialPlaybackState(),
      disconnectedAt: {},
      // Empty on a channel written before this existed, which reads as "not
      // known" and shows no idle time — the honest answer, rather than dating
      // everybody's absence from the deploy that added the field.
      lastPresentAt: durable.lastPresentAt ?? {},
    };
  }

  /**
   * Files a finished run as a recording of its own.
   *
   * Called when the run ends rather than when the channel does, which is what
   * lets one channel hold several recordings. Everything the run accumulated
   * is drained here: leaving any of it behind would attribute one run's stems
   * or floor windows to the next, and an export would then be *wrong* rather
   * than missing — a silenced remark made audible, or the wrong audio played
   * back — with nothing to signal it.
   */
  private fileRun(channel: ChannelState, runId: string): void {
    const present = this.recordingAudience.get(channel.id) ?? new Set<string>();
    const perParticipant = this.segments.get(channel.id) ?? new Map();
    const windows = this.floorWindows.get(channel.id) ?? [];
    this.recordingAudience.delete(channel.id);
    this.segments.delete(channel.id);
    this.floorWindows.delete(channel.id);

    this.checkpointedAt.delete(runId);

    // `lastRecording` is the reducer's account of the run that just ended; it
    // is null when nothing was captured, and then the run did not happen —
    // its open row goes with it, or the boot sweep would one day mark a
    // non-event as a failed recording.
    const run = channel.lastRecording;
    const stems = Object.fromEntries(perParticipant) as Record<
      string,
      Array<{ key: string; startMs: number }>
    >;
    const flat = Object.values(stems)
      .flat()
      .map((segment) => segment.key);
    if (!run || run.runId !== runId || run.durationMs <= 0 || flat.length === 0) {
      this.db.prepare('DELETE FROM recordings WHERE id = ?').run(runId);
      return;
    }

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

    // A claim still open when the run ended runs to the end of it.
    for (const window of windows) {
      if (window.toMs === null) window.toMs = run.durationMs;
    }

    // Finalizes the row openRun wrote. Setting ended_at is what moves the
    // recording from "in flight" to "exists": the home screen only lists
    // finished ones, and the boot sweep only touches unfinished ones.
    // Frozen with the roster rather than resolved when the list is read. The
    // ids never change, but what they resolve to does — and an id that stops
    // resolving is dropped rather than reported, which would quietly turn a
    // recording of two people into one that looks like it was nobody.
    const names = Object.fromEntries(
      audience.map((id) => [id, this.displayName(id)])
    );

    // Roster order rather than the order people happened to be captured in, so
    // the name reads the way the channel does. Anyone in the audience but not
    // in the roster — left the channel mid-run — goes on the end.
    const ordered = [
      ...channel.participants.filter((id) => audience.includes(id)),
      ...audience.filter((id) => !channel.participants.includes(id)),
    ];
    // A named channel lends its name to what it records. Several recordings
    // then share one name, which is fine — they are distinguished by when they
    // happened, and the name is there to say where they came from.
    const name =
      channel.name ?? nameRecording(ordered.map((id) => names[id]));

    // Pending only where there is a bucket to mix from and into. Without a
    // store nothing was captured that this process can reach, so the row goes
    // straight to displayable and behaves as every recording did before mixes
    // existed — which is also what keeps a test harness with no storage
    // showing the recordings it makes.
    const mixable = !!this.store;

    this.db
      .prepare(
        `UPDATE recordings SET participants = ?, participant_names = ?,
                name = ?, duration_ms = ?, s3_key = ?,
                segment_keys = ?, stems = ?, floor_timeline = ?, ended_at = ?,
                failure = ?, mix_state = ? WHERE id = ?`
      )
      .run(
        JSON.stringify(ordered),
        JSON.stringify(names),
        name,
        run.durationMs,
        flat[0] ?? '',
        JSON.stringify(flat),
        JSON.stringify(stems),
        JSON.stringify(windows),
        run.endedAt,
        run.failure,
        mixable ? 'pending' : 'unmixed',
        runId
      );

    if (mixable) this.startMix(runId, channel.id);
  }

  /**
   * Makes a filed run's mix, and shows the recording once it exists.
   *
   * The recording is invisible until this resolves, which is the point: by the
   * time a card appears, playing it and exporting it are a fetch rather than a
   * fetch and an encode. What used to happen when somebody tapped Play — the
   * several seconds a long recording takes to mix, spent looking at "Loading…"
   * — happens here instead, while nobody is waiting for it.
   *
   * A failure is not fatal to the recording. It becomes `'unmixed'`, which is
   * displayable and exports by encoding on demand: exactly the behaviour every
   * recording had before this existed, so the worst case is the old speed
   * rather than a conversation nobody can reach.
   */
  private startMix(recordingId: string, channelId: string): void {
    // Not through `this.run`, which reports a failure in a continuation of a
    // promise it has already handed back. Everything that decides whether this
    // recording is visible has to have happened by the time the tracked
    // promise settles, or `mixesSettled` resolves before the row is right and
    // a test — or a shutdown — reads a state that is still moving.
    const work = (async () => {
      try {
        await this.mix(recordingId, { wait: true });
      } catch (error) {
        this.onMediaError(error, `mix ${recordingId}`);
        this.db
          .prepare(
            `UPDATE recordings SET mix_state = 'unmixed'
             WHERE id = ? AND mix_state = 'pending'`
          )
          .run(recordingId);
      } finally {
        this.mixing.delete(recordingId);
        // Both paths emit: one has a recording to show and the other has a
        // recording to stop hiding, and neither can wait for whatever else
        // might next happen in that channel.
        this.emit([channelId]);
      }
    })();
    this.mixing.set(recordingId, work);
  }

  /**
   * Resolves once no mix is in flight.
   *
   * Exposed for the same reason `tick` is: mixing is the one thing a recording
   * now waits on before it exists, and a test that cannot await it is left
   * racing a promise chain with a `setTimeout(0)`.
   */
  async mixesSettled(): Promise<void> {
    while (this.mixing.size > 0) {
      await Promise.allSettled([...this.mixing.values()]);
    }
  }

  /**
   * Encodes one recording and stores the result beside its stems.
   *
   * `wait` is whether a stem that is not in the bucket yet is worth waiting
   * for. It is, immediately after a run: `stopEgress` returns when LiveKit has
   * accepted the stop, not when the upload has landed. It is not when somebody
   * is holding an HTTP request open — there, a missing object means missing,
   * and the caller should be told so rather than left hanging.
   */
  private async mix(
    recordingId: string,
    { wait }: { wait: boolean }
  ): Promise<Buffer> {
    const store = this.store;
    if (!store) throw new Error('Recording storage is not configured.');

    const row = this.db
      .prepare('SELECT * FROM recordings WHERE id = ?')
      .get(recordingId) as unknown as RecordingRow | undefined;
    if (!row) throw new Error(`No such recording: ${recordingId}`);

    const { data } = await encodeRecording(
      {
        stems: parseJson(row.stems) ?? {},
        timeline: parseJson(row.floor_timeline) ?? [],
      },
      (key) =>
        wait
          ? getWhenReady(store, key, { waitMs: this.mixWaitMs })
          : store.get(key)
    );

    // Stored before the row says it exists, so a crash between the two leaves
    // an object nobody reads rather than a row promising one that is not
    // there. The sweep deletes the key whether or not the state says 'ready',
    // so the orphan is not permanent either.
    await store.put(mixKeyFor(row.channel_id, row.id), data);
    this.db
      .prepare("UPDATE recordings SET mix_state = 'ready' WHERE id = ?")
      .run(row.id);
    return data;
  }

  /**
   * One recording's finished audio, with the floor applied — the bytes both
   * exporting it and playing it back into its channel are made of.
   *
   * Normally one GetObject, because the mix was made when the run ended. The
   * fallbacks are what make that an optimisation rather than a dependency: a
   * row from before mixes existed, or one whose mix failed, is encoded here
   * and stored on the way past, so it is only ever slow once.
   *
   * **This does not decide who may hear it.** The caller has already asked
   * `recordingsFor`, which is the one place that rule lives.
   */
  async recordingAudio(recordingId: string): Promise<Buffer> {
    const store = this.store;
    if (!store) throw new Error('Recording storage is not configured.');

    const row = this.db
      .prepare('SELECT id, channel_id, mix_state FROM recordings WHERE id = ?')
      .get(recordingId) as unknown as
      | Pick<RecordingRow, 'id' | 'channel_id' | 'mix_state'>
      | undefined;
    if (!row) throw new Error(`No such recording: ${recordingId}`);

    if (row.mix_state === 'ready') {
      try {
        return await store.get(mixKeyFor(row.channel_id, row.id));
      } catch (error) {
        // The row says there is a mix and the bucket disagrees. Making it
        // again is both the fix and the answer, and it costs the caller what
        // an export used to cost everybody.
        this.onMediaError(error, `mix missing ${recordingId}`);
      }
    }
    return this.mix(recordingId, { wait: false });
  }

  /**
   * Opens a run's row, empty of audio, null ended_at marking it in flight.
   *
   * The run id is the row id. They identify the same thing, and minting a
   * second identifier would only create something to keep in step. Inserted
   * directly rather than through insertWithUniqueKey because the id already
   * exists in channel state — a retry could not change it — and a collision at
   * 72 random bits is a broken RNG, which should fail loudly here.
   */
  private openRun(channel: ChannelState, runId: string): void {
    this.db
      .prepare(
        `INSERT INTO recordings
           (id, channel_id, initiator_id, invitee_id, participants, started_at,
            duration_ms, s3_key, ended_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, '', NULL)`
      )
      .run(
        runId,
        channel.id,
        channel.initiator,
        // Legacy anchor columns, NOT NULL and never read back; the
        // participants JSON written at finalization is what membership uses.
        channel.participants[1] ?? channel.initiator,
        JSON.stringify(channel.participants),
        channel.recording.startedAt ?? this.now()
      );
  }

  /**
   * Keeps a live run's row roughly current, so a crash loses at most a few
   * seconds of bookkeeping rather than the whole run. The audio itself is
   * LiveKit's to write and is not at risk here — this is about the row knowing
   * which keys exist and how long the run had got.
   */
  private checkpointRun(channel: ChannelState, now: number): void {
    const runId = channel.recording.runId;
    if (runId === null) return;
    if (now - (this.checkpointedAt.get(runId) ?? 0) < RUN_CHECKPOINT_MS) return;
    this.checkpointedAt.set(runId, now);

    const perParticipant = this.segments.get(channel.id) ?? new Map();
    const stems = Object.fromEntries(perParticipant) as Record<
      string,
      Array<{ key: string; startMs: number }>
    >;
    const flat = Object.values(stems)
      .flat()
      .map((segment) => segment.key);
    this.db
      .prepare(
        // Guarded on ended_at so a checkpoint racing a finalization cannot
        // reopen a finished row. Open floor windows are stored with toMs null;
        // the boot sweep closes them if this run never gets to.
        `UPDATE recordings SET duration_ms = ?, s3_key = ?, segment_keys = ?,
                stems = ?, floor_timeline = ? WHERE id = ? AND ended_at IS NULL`
      )
      .run(
        recordedMs(channel.recording, now),
        flat[0] ?? '',
        JSON.stringify(flat),
        JSON.stringify(stems),
        JSON.stringify(this.floorWindows.get(channel.id) ?? []),
        runId
      );
  }
}

/**
 * Every object in the bucket a recording row names, deduplicated.
 *
 * Read from all three columns rather than the tidiest one, because they were
 * written at different times and disagree about coverage: `stems` is the
 * authority for a row written since mid-run joins existed, `segment_keys` is
 * the flat list that preceded it, and `s3_key` is the single key that preceded
 * *that*. A key missed here is an object nobody can ever identify again once
 * the row is gone, so this reads all of them and lets the overlap be harmless.
 */
/**
 * Where a recording's mix lives, beside the stems it was made from.
 *
 * The same `<channel>/<run>/` prefix `startEgress` writes stems under, so
 * everything one run produced is in one place in the bucket — which is what
 * makes an orphaned object identifiable by eye when something has gone wrong.
 * `mixed` cannot collide with a stem, whose name is always `<identity>-<nnn>`.
 *
 * Derived rather than stored: unlike the stems, there is exactly one of these
 * per recording and it is rewritten in place whenever the mix is remade, so a
 * column would only be a second place for the same fact to be wrong.
 */
export function mixKeyFor(channelId: string, recordingId: string): string {
  return `${channelId}/${recordingId}/mixed.ogg`;
}

function objectKeysOf(row: {
  s3_key: string;
  segment_keys: string | null;
  stems: string | null;
}): string[] {
  const keys = new Set<string>();
  if (row.s3_key) keys.add(row.s3_key);
  for (const key of parseJson<string[]>(row.segment_keys) ?? []) {
    if (typeof key === 'string') keys.add(key);
  }
  const stems =
    parseJson<Record<string, Array<string | { key?: string }>>>(row.stems) ?? {};
  for (const segments of Object.values(stems)) {
    for (const segment of segments ?? []) {
      const key = typeof segment === 'string' ? segment : segment?.key;
      if (typeof key === 'string') keys.add(key);
    }
  }
  return [...keys];
}

/** Tolerates the malformed, which is the point: a sweep must not be stoppable. */
function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
