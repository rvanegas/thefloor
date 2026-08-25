import { readdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DELETED_RETENTION_MS,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_CHANNEL_PARTICIPANTS,
  MAX_PING_TEXT_LENGTH,
  MAX_RECORDING_NAME_LENGTH,
} from '../../core/constants';
import { playbackPositionMs } from '../../core/playback';
import { recordedMs } from '../../core/recording';
import {
  canAnswerKnock,
  canClaimFloor,
  canDeleteChannel,
  canLoadTrack,
  canOpenWatchScreen,
  hasTheRoom,
  GUEST_ACTIONS,
  createChannel,
  isNamed,
  isParticipant,
  isPartyMuted,
  isPresent,
  isWithheld,
  lastPresenceAt,
  otherParticipants,
  reduce,
} from '../../core/channel';
import { initialFloorState } from '../../core/floor';
import { roomOccupants, statedIdentities } from '../../core/guests';
import { describeChannel, nameRecording } from '../../core/naming';
import { initialPlaybackState } from '../../core/playback';
import { initialRecordingState } from '../../core/recording';
import { initialWatchState, parseYouTubeUrl } from '../../core/watch';
import type {
  PlaybackTrack,
  ChannelAction,
  ChannelState,
} from '../../core/types';
import type {
  GuestView,
  InviteView,
  PublicAccount,
  RejoinableView,
  SharedChannelView,
} from '../../core/protocol';
import type { Accounts } from './accounts';
import { Guests, isGuestId, type AdmittedGuest } from './guests';
import {
  insertWithUniqueKey,
  newId,
  type Db,
  type GuestLinkRow,
  type GuestSessionRow,
  type RecordingRow,
} from './db';
import { encodeRecording } from './export';
import type { MediaServer, PlaybackSession } from './media';
import { getWhenReady, type RecordingStore } from './storage';
import { createPushNotifier, notifications, type PushNotifier } from './push';
import { pairSpan, UsageMeter } from './usage';

export const TICK_INTERVAL_MS = 500;

/** How often deleted rows past their week are looked for. */
export const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * How often the meter asks the rooms what they are actually carrying.
 *
 * Its own timer rather than a fold into the 500ms tick, and the gap is the
 * point. `reconcileSilence` runs at tick rate because a mute that has not
 * landed means somebody is audible who should not be; a meter answers in
 * minutes and gains nothing from latency. A per-channel round trip twice a
 * second is exactly the cost that reconciliation is gated behind a floor claim
 * to avoid, and metering would not be gated behind anything.
 *
 * It is a sampling rate, so it is also the accuracy: every mic and listen span
 * has edges good to within one interval, and a microphone opened and closed
 * inside one window is not recorded at all. See planning/DECISIONS.md § *The
 * meter is two tables and a script*.
 */
export const USAGE_POLL_INTERVAL_MS = 15_000;

/**
 * How long shared playback may go without producing a frame before it is
 * rebuilt.
 *
 * The pump publishes a frame every 10ms whether or not anything is playing, so
 * anything approaching a second here is already a fault. Five seconds is slack
 * for a garbage collection on two shared vCPUs, and it bounds how long a
 * channel can be silent without anybody being able to tell — which used to be
 * *for ever*, because nothing in this system measured it. Everything anybody
 * looked at instead was computed from committed state: the transport advanced,
 * the position moved, pause and play both worked, and no audio was produced.
 * See TASKS § *Stepping Back In*.
 *
 * The rebuild is not free — a reconnect and a republish, a second or so — so
 * this is deliberately not tight enough to fire on an ordinary stutter.
 */
export const PLAYBACK_STALL_MS = 5_000;

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
 * How often one person may be pinged in one channel.
 *
 * Not a flap suppressor like the interval above — nothing here is automatic, so
 * there is no artefact to absorb. It bounds a person: somebody who wants you in
 * a channel can say so, and can say so again in a while, and cannot sit on the
 * button. The recipient has no way to answer a ping and no way to turn one off,
 * which is exactly the shape that needs a limit imposed for them.
 *
 * Five minutes, which is the same figure the notification's own lifetime and
 * the announcement window use, and here it means: not before the last one has
 * stopped being worth delivering. A second ping inside the window would in any
 * case replace the first on the lock screen, so what the limit really prevents
 * is a queue of pings nobody will ever see, each overwriting the last.
 */
export const PING_INTERVAL_MS = 5 * 60 * 1000;

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
 * The resolution `lastPresentAt` is stored at. See `durableOf`: a heartbeating
 * conversation moves those numbers every five seconds, and this is what stops
 * that turning into a row rewrite every five seconds.
 */
const PRESENCE_RESOLUTION_MS = 60_000;

/** Every stamp floored to `PRESENCE_RESOLUTION_MS`, for the durable projection. */
function quantise(
  stamps: ChannelState['lastPresentAt']
): ChannelState['lastPresentAt'] {
  return Object.fromEntries(
    Object.entries(stamps).flatMap(([id, at]) =>
      at === undefined
        ? []
        : [
            [
              id,
              Math.floor(at / PRESENCE_RESOLUTION_MS) * PRESENCE_RESOLUTION_MS,
            ] as const,
          ]
    )
  );
}

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
  // Every watch action a person performs. `WATCH_FAILED` is left out, the same
  // way `PLAYBACK_FAILED` and `RECORDING_FAILED` are: it is a report, and a
  // client able to send one could say a party had stopped that had not.
  //
  // `START_WATCH` *is* here, unlike `SET_TRACK` — the difference being that a
  // track names a file only the server can put on disk, while a party names a
  // link anybody can read. What the server still refuses to take on trust is
  // the id: the wire form carries the URL, and `dispatch` parses it.
  'START_WATCH',
  'STOP_WATCH',
  'WATCH_PLAY',
  'WATCH_PAUSE',
  'WATCH_SEEK',
  'WATCH_READY',
  'SET_WATCH_MUTE',
  'PASTE_CLIP',
  'CLEAR_CLIP',
  'SET_GUEST_SPEECH',
  'EJECT_GUEST',
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
 * A watch party as it comes back from the durable blob: where it was, stopped.
 *
 * The position is banked rather than derived, so the value in the blob is only
 * true of a party that was paused when it was written. One that was playing
 * has a `startedAt` from a process that is gone, and deriving from it would
 * add however long the box was down to a position nobody watched through. So
 * the position it comes back at is the last one anybody actually banked, which
 * understates by at most the length of the final run — the safe direction, and
 * the same one an interrupted recording's duration errs in.
 */
function revivedWatch(stored: ChannelState['watch'] | undefined): ChannelState['watch'] {
  if (!stored?.party) return initialWatchState();
  return {
    party: stored.party,
    status: 'paused',
    positionMs: stored.positionMs,
    startedAt: null,
    // **Restored**, which it deliberately was not until muting became the
    // default. The old rule dropped it, on the reasoning that a silence nobody
    // in the room set is one nothing on screen explains — and that was right
    // while a mute held regardless of the transport and unmuted was the norm.
    // Neither is true now: a party comes back paused, so a restored mute
    // withholds nothing until somebody presses Play, and at that point it is
    // doing exactly what a freshly started party would do anyway.
    //
    // So what survives is the room's own answer, including an explicit
    // *unmute* — which is the case that would be lost by defaulting either
    // way, and the only one where the stored value carries information.
    //
    // Absent on rows written between the watch party shipping and the mute
    // shipping, which read as false: those channels had no mute to state.
    mutedAll: stored.mutedAll === true,
    // Dropped, unlike the position: a failure is about the run that met it,
    // and the run is over. Coming back with a warning about a page that no
    // longer exists would be a sentence nobody could act on.
    failure: null,
  };
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
 * Told that channels changed, and who left them on the way.
 *
 * `departed` exists because the audience for a change cannot be read off the
 * channel afterwards. A watcher works out who to tell from the participants,
 * and a departure is exactly the change that removes the person who most needs
 * telling — at the limit, `DELETE_CHANNEL` empties the roster and leaves an
 * audience of nobody. So whoever was a participant before and is not one after
 * is carried alongside the ids, computed where both states are in hand rather
 * than reconstructed by the socket layer from a channel that no longer says.
 *
 * Empty for every change that is not a departure, which is nearly all of them.
 */
export type ChangeListener = (channelIds: string[], departed: string[]) => void;

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
  private listeners = new Set<ChangeListener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private usageTimer: ReturnType<typeof setInterval> | null = null;
  /**
   * What this box carried. Owned here rather than passed in because every
   * transition worth metering already goes through `commit`, and the poll
   * needs the same rooms this registry is already holding. See usage.ts.
   */
  readonly usage: UsageMeter;
  /**
   * Who has been let in without an account, and what they may do.
   *
   * Owned here for the same reason the meter is: every transition that could
   * change a guest's standing — the last member leaving, a channel being
   * deleted, the sweep — already passes through this class, and a rule about
   * guests living anywhere else would have to be told about all of them.
   */
  readonly guests: Guests;
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
   * Who started each live run, keyed by run id.
   *
   * Nothing else knows. `RecordingState` does not carry an actor — it is the
   * state of the recording rather than a record of who asked — and the
   * `recordings` row's `initiator_id` is the *channel's* initiator, a legacy
   * anchor column that predates channels holding more than two people. So the
   * one place the answer exists is the action, and it is caught in `apply` on
   * its way past.
   *
   * In memory, and lost with the process: a run does not survive a restart
   * either, so there is never an entry here without a run to go with it.
   */
  private runInitiator = new Map<string, string>();
  /**
   * Mixes in flight, keyed by recording id. A recording is invisible for
   * exactly as long as it is in here.
   */
  private mixing = new Map<string, Promise<void>>();

  /**
   * When each person was last told that each channel had come alive, keyed
   * channel-and-target. See `announceActive`.
   *
   * **Per target rather than per channel**, which it was until 2026-08-20, and
   * the difference is not a refinement. `announceActive` only notifies people
   * who are *absent*, so anybody who was in the room when it last fired was
   * told nothing — and then inherited the suppression anyway. Three people, one
   * of whom is in the channel: they leave, somebody else walks in four minutes
   * later, and the one most likely to care is silenced by a notification they
   * never received.
   *
   * **And an entry clears it**, which is the rest of the rule. The window
   * exists because somebody probably still has the last notification on their
   * lock screen; walking into the channel is direct evidence that they do not.
   * A notice that was acted on is spent, and the next arrival is news rather
   * than a repeat. See `consume`.
   *
   * In memory deliberately: a restart resetting it costs at most one extra
   * notification, which is not worth a column.
   */
  private lastAnnouncedAt = new Map<string, number>();
  /**
   * When each person was last pinged in each channel, keyed channel-and-target.
   *
   * Per target rather than per sender: the limit protects whoever is being
   * pinged, so three people taking turns must not add up to three times the
   * traffic one of them could send. Held in memory like `lastAnnouncedAt`, so a
   * restart forgives everybody — which is the right way for this to fail, a
   * restart being no reason to refuse somebody a ping.
   */
  private lastPingedAt = new Map<string, number>();

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
  ) {
    this.usage = new UsageMeter(db, () => this.now());
    this.guests = new Guests(db);
  }

  // --- Lifecycle ----------------------------------------------------------

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_INTERVAL_MS);
    this.timer.unref?.();
    // Hourly rather than on the 500ms tick: what it looks for is a week old in
    // one case and a month old in the other, and it reads two tables and talks
    // to S3. A boot sweep runs from restore(), so a server that is never up for
    // an hour still sweeps.
    this.sweepTimer = setInterval(() => {
      this.sweepDeleted(this.now());
      this.usage.sweep(this.now());
    }, SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
    // Separate from both, on the reasoning at USAGE_POLL_INTERVAL_MS.
    this.usageTimer = setInterval(
      () => this.pollUsage(),
      USAGE_POLL_INTERVAL_MS
    );
    this.usageTimer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
    if (this.usageTimer) clearInterval(this.usageTimer);
    this.usageTimer = null;
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
      if (channel.status !== 'active') continue;
      // Either reason to withhold wants the same reconciliation, and for the
      // same reason: a track can be replaced under a statement made about it,
      // so a phone that flaps during a muted film comes back audible unless
      // somebody re-checks. Skipping a muted room here would leave exactly the
      // gap this loop exists to close.
      if (channel.floor.holder === null && !isPartyMuted(channel)) continue;
      this.run(() => this.reconcileSilence(channel), `reconcileSilence ${id}`);
    }
    for (const id of this.capturing.keys()) {
      const channel = this.channels.get(id);
      if (channel) {
        this.ensureEgress(channel);
        this.checkpointRun(channel, now);
      }
    }

    // The third self-correction, and the one that is a measurement rather than
    // a restatement: the two above ask whether what was *said* is still true,
    // and this asks whether the shared track is producing anything at all.
    for (const [id, session] of this.playback) {
      const channel = this.channels.get(id);
      if (!channel || channel.status !== 'active') continue;
      if (now - session.producedAt() <= PLAYBACK_STALL_MS) continue;
      this.rebuildPlayback(id, session);
    }
  }

  /**
   * Replaces a shared playback that has stopped being heard.
   *
   * The pump is not asked to recover itself, because the ways it stops are the
   * ways it cannot: a capture that never returns from the media library leaves
   * the loop pending for the life of the process, and a media participant whose
   * connection has gone has nowhere to put a frame. Both leave every piece of
   * state this server shows anybody perfectly correct — which is why this is
   * driven off the heartbeat and not off anything the reducer knows.
   *
   * `openPlayback` already does the whole of the catching up: it reads the
   * current file, resumes at the transport's position and re-opens the stem if
   * a recording is running. So a rebuild is a close and an open, and the only
   * thing that has to be right here is the order — the entry goes first, or the
   * open refuses on the grounds that there is already one.
   *
   * Closing files whatever the old stem had captured, which is the best that
   * can be done for a run this interrupted: the export concatenates a
   * participant's segments, so the gap is silent audio rather than a broken
   * recording.
   */
  private rebuildPlayback(channelId: string, session: PlaybackSession): void {
    this.playback.delete(channelId);
    this.onMediaError(
      new Error('Shared playback stopped producing frames; rebuilding it.'),
      `playbackStalled ${channelId}`
    );
    this.run(() => session.close(), `closeStalledPlayback ${channelId}`);
    this.openPlayback(channelId);
  }

  onChange(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * The live unnamed channel holding exactly these people, if there is one.
   *
   * *Exactly*: a superset is a different conversation and a subset is the one
   * you are leaving. Consulted only by `create`, where it is what makes the
   * Start-a-channel button idempotent rather than a way to accumulate a row
   * per tap. It deliberately no longer governs `INVITE`: widening an unnamed
   * channel can leave two with the same roster, and that is accepted.
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

  private emit(channelIds: string[], departed: string[] = []): void {
    for (const listener of this.listeners) listener(channelIds, departed);
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
      // Notifying the others is `commit`'s, not this branch's: the first entry
      // into a standing channel is a start and is announced as one from there,
      // because the tap that makes it need not come through `create` at all —
      // Home lists these channels, and a card dispatches ENTER directly.
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
    // Skipped outright when there is nobody to tell, rather than left to the
    // notifier's own empty case: that path logs why it sent nothing, and a
    // channel of one would file a "push skipped" line every time somebody
    // tapped Start a channel.
    if (unique.length > 0) {
      this.push.notify(
        unique,
        // The same notification an invitation into an existing channel sends,
        // and a channel is never named at creation — so the nameless form goes
        // out, which is exactly what a new channel is.
        notifications.invited(this.displayName(initiator), null, channel.id)
      );
    }
    return { ok: true, channel };
  }

  /**
   * The standing one-to-one channel a pair have for being contacts, made if it
   * is not there already.
   *
   * Home is a list of channels now and nothing else, so becoming somebody's
   * contact has to *produce* the thing you would talk to them in — otherwise
   * accepting a request adds a person to a screen that no longer has anywhere
   * to put them. This is what the contact list used to be, expressed as the
   * only object the screen understands.
   *
   * Idempotent, and `unnamedChannelFor` is what makes it so: it is the same
   * one-unnamed-channel-per-set rule `create` enforces, asked of the pair. So
   * this is safe on every acceptance path, safe to run again over the whole
   * table at boot, and safe against a `create` that got there first — tapping
   * somebody before this ever ran reuses that channel rather than making a
   * second.
   *
   * **Nobody is placed in it and nobody is told.** `present` is empty, so
   * `everPresent` is too, and that emptiness is the marker both `invitesFor`
   * and `rejoinableFor` read to tell a standing place from a summons — see
   * them. No push either: a contact accepting is not somebody waiting for you
   * in a room, and a notification saying so would be the app inventing an
   * event.
   *
   * `invitedBy` comes out naming the initiator, which is incidental and is
   * never read for this shape: the one thing that reads it is `invitesFor`,
   * which skips these channels entirely.
   */
  ensurePairChannel(
    a: string,
    b: string
  ): { channelId: string; created: boolean } | null {
    if (a === b) return null;
    const existing = this.unnamedChannelFor([a, b]);
    if (existing) return { channelId: existing.id, created: false };

    const createdAt = this.now();
    const id = insertWithUniqueKey(
      () => newId('chan'),
      (candidate) =>
        this.db
          .prepare(
            `INSERT INTO channels (id, initiator_id, invitee_id, created_at, participants)
             VALUES (?, ?, ?, ?, ?)`
          )
          .run(candidate, a, b, createdAt, JSON.stringify([a, b]))
    );
    // Row first, then memory — the same order and the same reason as `create`:
    // a live channel with no row behind it would be adopted by the guard above
    // on every retry, so the row could never be written.
    const channel = createChannel({
      id,
      initiator: a,
      invitees: [b],
      now: createdAt,
      present: [],
    });
    this.channels.set(channel.id, channel);
    this.persistChannel(channel);
    this.emit([channel.id]);
    return { channelId: channel.id, created: true };
  }

  /**
   * Every accepted pair given the channel this invariant promises them.
   *
   * For the accounts that were contacts before the promise existed: without
   * this their Home is empty of exactly the people they talk to, the contact
   * list having been the only place those people appeared. Run at boot, after
   * the channels are revived — `ensurePairChannel` reads the live registry to
   * decide whether one is needed, so running it against an unrevived one would
   * duplicate every channel in the database.
   *
   * Idempotent, so the honest check that it worked is that a second boot
   * creates nothing.
   */
  backfillPairChannels(pairs: Array<[string, string]>): number {
    let created = 0;
    for (const [a, b] of pairs) {
      if (this.ensurePairChannel(a, b)?.created) created += 1;
    }
    return created;
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
    // No exceptions. There used to be one — a non-participant could ENTER a
    // channel holding an outstanding invitation for them, which is how an
    // unnamed channel's invite was answered. Being asked in now makes you a
    // participant immediately, so there is nothing left to answer from outside.
    if (!isParticipant(channel, userId)) {
      return { ok: false, error: 'Not your channel.', code: 'forbidden' };
    }
    if (!CLIENT_ACTIONS.has(action.type)) {
      return { ok: false, error: 'Not an action.', code: 'invalid' };
    }

    // The wire form of START_WATCH carries the URL as typed; the reducer's
    // carries a parsed id beside it. The parse is made here for the same
    // reason INVITE's contact check is made here — it is the server's to make,
    // and the reducer must not be reachable with a video id nobody checked.
    //
    // By the same function the app used to decide whether to offer the button,
    // which is the whole reason `parseYouTubeUrl` is in core: a greyed-out
    // control and a refused action cannot disagree about what a link is.
    if (action.type === 'START_WATCH') {
      const url = (action as { url?: unknown }).url;
      const parsed = typeof url === 'string' ? parseYouTubeUrl(url) : null;
      if (!parsed) {
        return { ok: false, error: 'That is not a YouTube link.', code: 'invalid' };
      }
      return this.apply(channelId, userId, {
        type: 'START_WATCH',
        videoId: parsed.videoId,
        url: url as string,
      } as Omit<ChannelAction, 'userId'> & { type: ChannelAction['type'] });
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
        this.push.notify(
          [contactId],
          notifications.invited(
            this.displayName(userId),
            isNamed(channel) ? channel.name : null,
            channelId
          )
        );
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
      // Clearing a name used to be refused when these people already had an
      // unnamed channel, that being the only way to keep one per set. Widening
      // can now produce such a pair regardless, so the guard bought nothing but
      // a dead button on the one path that was still checked.
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

    // Both carry a guest id from the wire, so both check it is a string before
    // the reducer sees it — and both have consequences outside the reducer,
    // which is why they are here rather than falling through.
    if (action.type === 'SET_GUEST_SPEECH' || action.type === 'EJECT_GUEST') {
      const guestId = (action as { guestId?: unknown }).guestId;
      if (typeof guestId !== 'string' || !guestId) {
        return { ok: false, error: 'Not an action.', code: 'invalid' };
      }
      if (
        action.type === 'SET_GUEST_SPEECH' &&
        typeof (action as { maySpeak?: unknown }).maySpeak !== 'boolean'
      ) {
        return { ok: false, error: 'Not an action.', code: 'invalid' };
      }
      const room = channel.mediaRoom;
      const applied = this.apply(channelId, userId, action);
      // Whether the reducer agreed, rather than whether the call returned:
      // `apply` reports success for a refused action, that being how every
      // guard in core/ says no. Ejecting is durable and irreversible — it
      // revokes the link — so it must not happen off the back of a refusal.
      const gone =
        applied.ok && !this.channels.get(channelId)?.guests[guestId];
      if (action.type === 'EJECT_GUEST' && gone) {
        // The seat and the door, in that order, and then the connection. The
        // db call is what makes this outlast the process; the room call is
        // what makes it immediate.
        this.guests.eject(guestId, userId, this.now());
        this.run(
          () => this.media?.removeParticipant({ room, identity: guestId }),
          `removeParticipant ${channelId}/${guestId}`
        );
      }
      return applied;
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

    // The wire carries the text; the id, the author and the moment are minted
    // here, on the same reasoning as a run id. What is checked is only that
    // the payload is a string at all — the length cap and the presence rule
    // are the reducer's, so that the disabled button and the refusal are
    // computed by the same code.
    if (action.type === 'PASTE_CLIP') {
      const text = (action as { text?: unknown }).text;
      if (typeof text !== 'string') {
        return { ok: false, error: 'Not an action.', code: 'invalid' };
      }
      return this.apply(channelId, userId, {
        type: 'PASTE_CLIP',
        clip: {
          id: newId('clip'),
          authorId: userId,
          pastedAt: this.now(),
          kind: 'text',
          text,
        },
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
    // Before `commit`, which is where the egress spans that need it open.
    const started = next.recording.runId;
    if (started !== null && started !== channel.recording.runId) {
      this.runInitiator.set(started, userId);
    }
    if (next !== channel) {
      this.commit(channel, next);
      // The only path that can change who belongs to a channel, which is why
      // it is the only one that carries departures. Read from the pair rather
      // than from the action: `LEAVE_CHANNEL` and `DELETE_CHANNEL` are the two
      // that do this today, and keying on the transition means a later rule
      // that drops somebody is carried without anybody remembering to add it.
      this.emit(
        [channelId],
        channel.participants.filter((id) => !next.participants.includes(id))
      );
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
    upload: {
      file: string;
      dir: string;
      title: string;
      durationMs: number;
      /** Set when the track is one of this channel's own recordings. */
      recordingId?: string;
    }
  ): Promise<{ ok: true; channel: ChannelState } | Refused> {
    const channel = this.channels.get(channelId);
    if (!channel || channel.status !== 'active') {
      return { ok: false, error: 'No such channel.', code: 'not_found' };
    }
    if (!isParticipant(channel, userId)) {
      return { ok: false, error: 'Not your channel.', code: 'forbidden' };
    }
    // `canLoadTrack`, not `canControlPlayback`: putting something on asks
    // presence where driving what is already on asks only `hasTheRoom`. The
    // two differ on the empty channel, which is the case this route used to
    // allow — see `mayPutSomethingOn` in core, and the watch party's
    // `canStartWatch`, which is the same rule for the same reason.
    if (!canLoadTrack(channel, userId)) {
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
      ...(upload.recordingId ? { recordingId: upload.recordingId } : {}),
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
   * Evidence that somebody present in this channel is still there, from
   * whatever the transport last heard.
   *
   * **Deliberately does not `commit` and does not `emit`.** Nothing a client
   * can read changes while somebody is present — `idleMs` returns null for
   * them whatever this value is — so pushing a snapshot every five seconds per
   * participant would spend a fan-out to redraw an identical screen. The value
   * becomes readable only when they stop being present, and every route out of
   * a channel emits on its own account, so the number is always fresh at the
   * one moment anybody can see it.
   *
   * It skips `commit` for the same reason: that path reconciles the floor,
   * the recording, the egresses and the media room against a *transition*, and
   * a heartbeat is not one. Setting the map and writing the projection is the
   * whole of what this does.
   */
  stillHere(channelId: string, userId: string): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;
    const next = reduce(channel, { type: 'STILL_HERE', userId }, this.now());
    if (next === channel) return;
    this.channels.set(channelId, next);
    this.persistChannel(next);
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
   * Every live channel two people share, and where the second of them has been
   * in each — which is the whole of what a profile adds to what Home already
   * knows about those channels.
   *
   * The same membership test `shareAChannel` asks, run to exhaustion rather
   * than stopped at the first hit, and the pair is deliberately asymmetric:
   * `viewerId` decides which channels appear, `userId` decides what is
   * reported about each. Reading it the other way round would answer a
   * question about the reader on somebody else's screen.
   *
   * Membership rather than presence, for the reason `shareAChannel` gives —
   * and it is what makes "never been here" a state this can report at all. A
   * channel a pair get for becoming contacts is one neither has opened; a
   * channel somebody has been asked into is one everybody but them has. Both
   * are shared channels and both belong on the card.
   *
   * No ordering. The client already holds this set in Home's order, which is
   * least idle first, and joins on the id; a second order here would be one
   * more thing for the two ends to disagree about.
   */
  sharedChannelsFor(viewerId: string, userId: string): SharedChannelView[] {
    const shared: SharedChannelView[] = [];
    for (const channel of this.channels.values()) {
      if (channel.status !== 'active') continue;
      if (!isParticipant(channel, viewerId)) continue;
      if (!isParticipant(channel, userId)) continue;
      shared.push({
        channelId: channel.id,
        present: isPresent(channel, userId),
        // Absent means never, which is the one thing a number must not be
        // invented for: `lastPresentAt` is written by every heartbeat and
        // never by a restart, so an empty slot is evidence rather than a hole.
        lastPresentAt: channel.lastPresentAt[userId] ?? null,
      });
    }
    return shared;
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

  /**
   * Leaves every channel that holds these two people and nobody else.
   *
   * What deleting a contact costs, and the reason it is a channel operation at
   * all. A channel with a third person in it is a place that survives the pair
   * falling out — it is not *about* them — so it is untouched however the
   * relationship ends. A channel of exactly the two is the relationship, and
   * leaving it is what removing somebody means.
   *
   * **Named ones go too.** A name distinguishes two channels holding the same
   * people; it does not make a two-person channel about somebody else. Leaving
   * the standing one while staying in "Weekly Convo" would be a half-exit that
   * left the removed contact still on Home under another heading.
   *
   * The far side is the delicate part, and it turns on whether anything was
   * ever kept there:
   *
   * - **Nothing recorded**, which is nearly all of them, these channels being
   *   created by the dozen for pairs who have not spoken: the channel goes for
   *   both. Left behind it would be a member-of-one channel described as "Just
   *   you", which is what the other person's Home would fill with, one card per
   *   contact who ever removed them, each naming nobody.
   * - **Recordings in it**: it stays, and they keep it. Those are as much
   *   theirs as yours, and a channel is what names a recording and holds it —
   *   so ending it here would delete another person's audio as a side effect of
   *   your tap. Their card reads "Just you" and that is the honest description
   *   of what they are left with.
   *
   * Asked before the first leave, while the row is still there to ask about.
   *
   * Returns the channels touched, so the caller can tell both ends that
   * something on their screen has changed.
   */
  leavePairChannels(userId: string, otherId: string): string[] {
    const touched: string[] = [];
    // A snapshot: `apply` writes to `this.channels` as it commits, and the
    // second of these actions removes an entry from it.
    for (const channel of [...this.channels.values()]) {
      if (channel.status !== 'active') continue;
      if (channel.participants.length !== 2) continue;
      if (!isParticipant(channel, userId)) continue;
      if (!isParticipant(channel, otherId)) continue;

      const keep = this.holdsRecordings(channel.id);
      touched.push(channel.id);
      this.apply(channel.id, userId, { type: 'LEAVE_CHANNEL' });
      if (keep) continue;
      // The other is now its last member, and the last member cannot leave —
      // there is nobody to leave it to. Destroying it is the action that
      // exists for that position, and it is safe to take on their behalf
      // precisely because the branch above established there is nothing in it
      // to destroy.
      this.apply(channel.id, otherId, { type: 'DELETE_CHANNEL' });
    }
    return touched;
  }

  /** Whether anything finished and undeleted was ever recorded in a channel. */
  private holdsRecordings(channelId: string): boolean {
    const row = this.db
      .prepare(
        `SELECT 1 FROM recordings
          WHERE channel_id = ? AND ended_at IS NOT NULL AND deleted_at IS NULL
          LIMIT 1`
      )
      .get(channelId);
    return row !== undefined;
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
   * One shape now: an invitation is membership without presence, whether or not
   * the channel has a name. It used to be two — an unnamed channel could not
   * make you a member, because answering moved everybody somewhere else — and
   * the two were presented identically here because they were the same question
   * to whoever was reading them. Widening removed the difference they had.
   *
   * `everPresent` is the whole test: having been here once, a channel is a
   * place you go back to rather than one you are being asked into.
   */
  invitesFor(userId: string): InviteView[] {
    const invites: InviteView[] = [];
    for (const channel of this.channels.values()) {
      if (channel.status !== 'active') continue;
      if (!isParticipant(channel, userId)) continue;
      if (channel.everPresent.includes(userId)) continue;
      // Nobody has ever been in it, so nobody is asking you anywhere: this is
      // the standing one-to-one channel a pair get for being contacts, and it
      // is a place rather than a summons. Without this every new contact would
      // raise a permanent invitation from whoever accepted first — one that
      // could not be answered, since answering means entering, which is what
      // the channel is for anyway.
      if (channel.everPresent.length === 0) continue;
      // Named after whoever actually asked, which for a mid-channel invite is
      // not necessarily the initiator — and for a standing contact channel is
      // nobody at all. Those are created with an arbitrary initiator and an
      // `invitedBy` naming them, neither of which describes anything that
      // happened; what makes one an invitation is somebody walking into it, so
      // whoever did that is who this is from. Falling through to `initiator`
      // named the viewer as their own inviter about half the time, and the
      // invitation was then dropped by the guard below.
      const from = this.accounts.public(
        channel.invitedBy[userId] ?? channel.everPresent[0] ?? channel.initiator
      );
      // Never from yourself. `invitedBy` has no entry for an initiator, so
      // without this the fallback would credit them with inviting themselves
      // into the channel they opened and have not yet stepped into.
      if (from && from.id !== userId) {
        invites.push({
          channelId: channel.id,
          from,
          createdAt: channel.createdAt,
          // The same three facts a rejoinable channel carries, and for the same
          // reason: an invitation has to be identifiable and has to be honest
          // about whether anyone is there.
          name: isNamed(channel) ? channel.name : null,
          others: otherParticipants(channel, userId)
            .map((id) => this.accounts.public(id))
            .filter((account): account is PublicAccount => !!account),
          presentCount: channel.present.length,
          lastPresenceAt: lastPresenceAt(channel),
        });
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
      // Having been here, **or** nobody having been. The first is the original
      // test and still does the work it was written for: a channel somebody
      // asked you into is an invitation until you answer it, and belongs in
      // that list rather than this one.
      //
      // The second is the standing one-to-one channel a pair get for being
      // contacts. Nobody opened it and nobody was asked into it, so it fails
      // the first test for both of them at once — and `invitesFor` skips it on
      // exactly this condition, so without the alternative here it would appear
      // on nobody's screen at all. The two lists share one rule read from
      // opposite ends; changing either without the other loses a channel.
      if (!channel.everPresent.includes(userId) && channel.everPresent.length > 0) {
        continue;
      }

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
        lastPresenceAt: lastPresenceAt(channel),
        everUsed: channel.everPresent.length > 0,
      });
    }
    // Least idle first. Home sections this list — live, invited, the rest —
    // and preserves this order inside each section, with the never-used
    // channels sunk to the bottom of theirs.
    //
    // `lastPresenceAt` rather than `lastActiveAt`, which moves on an entry and
    // an exit and at no point between, so an hour of conversation left it
    // where it was and a channel two people were talking in sank below one
    // somebody had walked out of. Home used to correct for that by asking
    // `presentCount` separately; it no longer has to.
    return rejoinable.sort(
      (a, b) => (b.lastPresenceAt ?? 0) - (a.lastPresenceAt ?? 0)
    );
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
        // Including ones still being mixed, which this used to withhold so that
        // every card played and exported the moment it was tapped. The cost was
        // worse than the tidiness: what somebody had just recorded was absent
        // from the screen for as long as the mix took — measured at five
        // seconds for a hundred-second run — with nothing to say why, which
        // reads as the recording having failed. The card now appears and says
        // what is not ready yet; see `RecordingView.mixing`.
        `SELECT r.* FROM recordings r
         JOIN channels c ON c.id = r.channel_id
         WHERE r.ended_at IS NOT NULL
           AND r.deleted_at IS NULL
           AND c.deleted_at IS NULL
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
        // The same rule as `recordingsFor`, and it has to be: this is the
        // channel screen's list and that is Home's, and a recording appearing
        // on one and not the other is a bug you find by being asked about it.
        `SELECT * FROM recordings
         WHERE ended_at IS NOT NULL AND deleted_at IS NULL AND channel_id = ?
         ORDER BY started_at DESC`
      )
      .all(channelId) as unknown as RecordingRow[];
  }

  /**
   * `hasTheRoom`, asked about a channel this class holds by id.
   *
   * For the routes that change something a conversation can see without going
   * through the reducer — renaming and deleting a recording — since those have
   * no action to carry the guard. The rule is core's; this is only the lookup.
   *
   * **A channel that is not in memory passes.** That is not a gap: `restore`
   * revives every unended channel at boot, so what is missing here has ended,
   * and an ended channel has nobody in it to interrupt. Its recordings outlive
   * it by a week and its last member is entitled to tidy them.
   */
  private hasTheRoomIn(channelId: string, userId: string): boolean {
    const channel = this.channels.get(channelId);
    return !channel || hasTheRoom(channel, userId);
  }

  /**
   * Whether this person may make a change to one recording that everybody in
   * its channel will see.
   *
   * The rule deleting and renaming already apply, lifted so that a third thing
   * can apply the same one rather than a similar one. Transcribing is the
   * third: it puts a shared artefact on everybody's screen and sends
   * everybody's audio to a third party to do it, which makes it a change to
   * the channel rather than a private read of your own conversation. Exporting
   * is the private read, and deliberately does not come through here.
   *
   * Two checks, and they answer differently on purpose. `recordingsFor` is the
   * reach test — absent, deleted and not-yours are one answer, because that a
   * recording exists is something only the channel's members learn. Holding
   * the room is not concealment: the caller can see the recording and can see
   * who is in the channel, so they are told what is actually in the way.
   */
  mayManageRecording(
    recordingId: string,
    userId: string
  ): { ok: true; row: RecordingRow } | Refused {
    const row = this.recordingsFor(userId).find(
      (candidate) => candidate.id === recordingId
    );
    if (!row) {
      return { ok: false, error: 'No such recording.', code: 'not_found' };
    }
    if (!this.hasTheRoomIn(row.channel_id, userId)) {
      return {
        ok: false,
        error: 'Somebody is in this channel. Step in to change a recording.',
        code: 'conflict',
      };
    }
    return { ok: true, row };
  }

  /**
   * Pushes a fresh snapshot of one channel to everybody in it.
   *
   * Exposed for the one caller that finishes work nobody is waiting on:
   * a transcript landing is not an action anybody took, so no dispatch is
   * going to push a snapshot on its behalf — exactly the reason `mix` emits
   * when it stores a mix. Without it the card says "Transcribing…" until
   * something unrelated happens in that channel.
   */
  announce(channelId: string): void {
    this.emit([channelId]);
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
    // Deleting takes the recording out of everybody's list, including the
    // lists of the people who are in the channel talking right now. See
    // `hasTheRoomIn`.
    if (!this.hasTheRoomIn(row.channel_id, userId)) {
      return {
        ok: false,
        error: 'Somebody is in this channel. Step in to delete a recording.',
        code: 'conflict',
      };
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
    // The name is shared — this doc comment says so two paragraphs up — so a
    // rename changes what everybody in the channel is looking at, and the same
    // rule governs it as governs deleting.
    if (!this.hasTheRoomIn(row.channel_id, userId)) {
      return {
        ok: false,
        error: 'Somebody is in this channel. Step in to rename a recording.',
        code: 'conflict',
      };
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
    // Immediately, unlike everything else here. The week is a recovery window
    // for rows and objects; a link is a door, and a door to a deleted channel
    // stops opening when it is deleted rather than when the sweep gets to it.
    this.guests.revokeChannel(channelId, now);
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

    // The guests go before the channel does, and this is a constraint rather
    // than tidiness: the DELETE below is guarded by a NOT EXISTS against
    // recordings and by nothing else, so a guest row still referencing the
    // channel does not make the sweep skip it — it makes the sweep throw, on a
    // timer, an hour after anybody did anything. Restricted to the channels
    // actually about to go, so one held back by an object that would not
    // delete keeps the names its recordings still need.
    for (const row of this.db
      .prepare(
        `SELECT id FROM channels
         WHERE deleted_at IS NOT NULL AND deleted_at <= ?
           AND NOT EXISTS (SELECT 1 FROM recordings WHERE recordings.channel_id = channels.id)`
      )
      .all(cutoff) as unknown as Array<{ id: string }>) {
      this.guests.forgetChannel(row.id);
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
    this.applySilenceToMedia(before, after);
    this.applyGuestSpeech(before, after);
    this.applyRecordingToMedia(before, after);
    // A run's audience only ever grows. Someone who arrives mid-recording is
    // in that recording and must be able to reach it afterwards; someone who
    // leaves — the channel or merely the room — was still in it, so they are
    // never taken back out.
    const audience = this.recordingAudience.get(after.id);
    // Guests are in the audience of a run in the sense that matters here —
    // they were in the room, so their name belongs on the recording. What they
    // are not is entitled to it: reach is `recordingsFor`, which reads the
    // *channel's* participants, and a guest is not one. See fileRun.
    if (audience) for (const id of roomOccupants(after)) audience.add(id);
    this.applyPlaybackToMedia(before, after);
    this.trackFloorWindows(before, after);
    this.meterCommit(before, after);

    // Someone arriving mid-claim must come back silenced, and someone arriving
    // mid-recording must get a stem. Both are re-stated on arrival because the
    // original statements were made against a roster that did not include them.
    const arrived =
      after.participants.length > before.participants.length ||
      after.present.some((id) => !before.present.includes(id)) ||
      // A guest arriving is an arrival in every way this matters: they need a
      // stem if a run is going, and they need to be told about a claim that
      // was made before they walked in.
      Object.keys(after.guests).some((id) => !(id in before.guests));
    // Whoever has just walked in has answered whatever they were last told
    // about this channel. Done before the announcement below rather than
    // after, so that the arrival cannot be the thing that silences its own
    // audience — the arriver is never in `absent`, so the order is not
    // load-bearing, but reading it in the other order invites the question.
    this.consume(
      after.id,
      after.present.filter((id) => !before.present.includes(id))
    );
    if (before.present.length > 0 && after.present.length === 0) {
      // The rule guest links are given: valid until the channel is emptied of
      // present members. Written here, on the transition, and never asked as a
      // question — presence does not survive a restart, so a boot that asked
      // "is anybody present" would find every channel empty and revoke every
      // outstanding link at every deploy. A restart empties nothing anybody
      // chose to empty. See guests.ts.
      this.guests.channelEmptied(after.id, this.now());
    }
    if (before.present.length === 0 && after.present.length > 0) {
      // Nobody had ever been in it, so this is not somebody arriving where you
      // both have been before: it is the channel starting, and until contacts
      // came with a standing channel each it could only happen inside `create`,
      // which said so itself. Now the first entry into one of those is an
      // ordinary ENTER from a Home card, and without this branch the other
      // person's invitation would arrive as "Alice stepped in" — five minutes'
      // lifetime, about a channel they had never heard of, in place of the
      // month an invitation is given.
      if (before.everPresent.length === 0) this.announceStarted(after);
      else this.announceActive(after);
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
        this.usage.closeSpan(
          this.egressSpan(after.id, after.recording.runId, identity)
        );
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
      // Before the room is torn down, so nothing is left open pointing at a
      // channel that no longer exists. The poll would never visit it again.
      this.usage.closeChannel(after.id);
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
   * **It sends the invitation, not the arrival**, and that is the whole reason
   * this exists as a branch of its own: a standing channel nobody has ever been
   * in is one the other person has never had a conversation in, so the first
   * entry is an invitation to one. `arrived` would give it five minutes and let
   * the room's own traffic overwrite it. See the call site in `commit`.
   *
   * It said `Started a channel with you` until 2026-08-22, when that
   * notification was folded into `invited` for want of any rule that told the
   * two apart. The wording moved with it and is no less true: the channel had
   * existed, silently, since the pair became contacts — what is new is being
   * asked into it.
   *
   * Suppressed within `ANNOUNCE_INTERVAL_MS` of the last announcement, because
   * presence follows a websocket: one person on a bad connection produces a
   * run of empty-to-occupied transitions that are a network artefact rather
   * than anything happening in the room.
   */
  private announceStarted(channel: ChannelState): void {
    if (channel.status !== 'active') return;
    const opener = channel.present[0];
    if (opener === undefined) return;
    const absent = channel.participants.filter((id) => id !== opener);
    if (absent.length === 0) return;
    this.push.notify(
      absent,
      notifications.invited(
        this.displayName(opener),
        isNamed(channel) ? channel.name : null,
        channel.id
      )
    );
    // Deliberately *not* stamping `lastAnnouncedAt`. That map exists to absorb
    // a flapping connection's run of empty-to-occupied transitions, and this
    // fires at most once in a channel's life — while stamping it would silence
    // the next genuine arrival, which is a different event about a room the
    // recipient now knows exists.
  }

  private announceActive(channel: ChannelState): void {
    if (channel.status !== 'active') return;
    const now = this.now();
    const arrived = channel.present[0];
    const absent = channel.participants.filter(
      (id) => !channel.present.includes(id)
    );
    // Each is titled from its own recipient's point of view, because an
    // unnamed channel is called after whoever else is in it and there is no
    // one answer to that — which is why the name is resolved per recipient
    // here rather than once, outside the loop.
    //
    // The window is asked about per recipient for the same reason: whether
    // somebody has been told recently is a fact about them, not about the room.
    // The flap this absorbs is one connection ringing one phone repeatedly,
    // which this still absorbs — the people who did not flap have no stamp to
    // suppress them.
    for (const userId of absent) {
      const key = this.announceKey(channel.id, userId);
      const last = this.lastAnnouncedAt.get(key);
      if (last !== undefined && now - last < ANNOUNCE_INTERVAL_MS) continue;
      this.lastAnnouncedAt.set(key, now);
      this.push.notify(
        [userId],
        notifications.arrived(
          this.nameFor(channel, userId),
          this.displayName(arrived),
          channel.id
        )
      );
    }
  }

  private announceKey(channelId: string, userId: string): string {
    return `${channelId}:${userId}`;
  }

  private pingKey(channelId: string, userId: string): string {
    return `${channelId}:${userId}`;
  }

  /**
   * When each participant may next be pinged, for those who may not be now.
   *
   * The same answer for everybody, the limit protecting whoever is being
   * pinged rather than bounding whoever is sending — so this is composed once
   * per snapshot rather than per viewer.
   *
   * Only the windows still open are listed. Absent means pingable, which keeps
   * the map empty in the ordinary case and means a client can read a missing
   * entry as "go ahead" without knowing the interval.
   */
  pingWindows(channelId: string): Record<string, number> {
    const windows: Record<string, number> = {};
    const channel = this.channels.get(channelId);
    if (!channel) return windows;
    const now = this.now();
    for (const userId of channel.participants) {
      const last = this.lastPingedAt.get(this.pingKey(channelId, userId));
      if (last === undefined) continue;
      const until = last + PING_INTERVAL_MS;
      if (until > now) windows[userId] = until;
    }
    return windows;
  }

  /**
   * Spends whatever announcement these people are holding.
   *
   * Called when somebody becomes present, because going is what answers a
   * notification. Without this a person who was told, walked in, and left
   * again would be refused the next arrival on the strength of a notice they
   * have already acted on — and the case that matters most is the one where
   * they walked in to *wait*, since their own entry is the announcement that
   * starts the window they will later be silenced by.
   */
  private consume(channelId: string, userIds: readonly string[]): void {
    for (const userId of userIds) {
      this.lastAnnouncedAt.delete(this.announceKey(channelId, userId));
    }
  }

  /**
   * Asks one absent participant to come to a channel, in the sender's words.
   *
   * The only notification anybody decides to send, which is why every guard
   * here is about a person rather than about the room. It is refused out loud,
   * unlike the announcements, because somebody is waiting to be told it worked.
   *
   * **Absent only.** Pinging somebody standing in the room is not a thing that
   * makes sense — they can hear you — and the app hides the affordance for
   * anyone present, so a ping arriving for one is a stale screen rather than an
   * intention. Refusing it agrees with the button that is not there.
   *
   * The text is trimmed, and empty becomes null rather than an empty body: a
   * composer somebody tabbed through should send the plain form, not a ping
   * with a colon and nothing after it.
   *
   * Nothing about the channel changes, so this does not go through `dispatch`
   * and there is no action, no reducer, and nothing to persist. A ping is a
   * message about a channel, not a move within one.
   */
  ping(
    channelId: string,
    senderId: string,
    targetId: string,
    text: string | null
  ): { ok: true } | Refused {
    const channel = this.channels.get(channelId);
    if (!channel) {
      return { ok: false, error: 'No such channel.', code: 'not_found' };
    }
    if (!isParticipant(channel, senderId)) {
      return { ok: false, error: 'Not your channel.', code: 'forbidden' };
    }
    if (!isParticipant(channel, targetId)) {
      return { ok: false, error: 'Not in this channel.', code: 'forbidden' };
    }
    if (senderId === targetId) {
      return { ok: false, error: 'You are already here.', code: 'invalid' };
    }
    if (channel.present.includes(targetId)) {
      return { ok: false, error: 'They are already here.', code: 'conflict' };
    }

    const trimmed = text?.trim() ?? '';
    if (trimmed.length > MAX_PING_TEXT_LENGTH) {
      return {
        ok: false,
        error: `A ping holds up to ${MAX_PING_TEXT_LENGTH} characters.`,
        code: 'invalid',
      };
    }

    const now = this.now();
    const key = this.pingKey(channelId, targetId);
    const last = this.lastPingedAt.get(key);
    if (last !== undefined && now - last < PING_INTERVAL_MS) {
      return {
        ok: false,
        error: 'They have just been pinged. Try again in a few minutes.',
        code: 'conflict',
      };
    }
    this.lastPingedAt.set(key, now);

    this.push.notify(
      [targetId],
      notifications.pinged(
        // Named as the person being pinged sees it, the same way an arrival is
        // — an unnamed channel is called after whoever else is in it, and the
        // sender's view of that includes the sender.
        this.nameFor(channel, targetId),
        this.displayName(senderId),
        trimmed || null,
        channelId
      )
    );
    return { ok: true };
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
    // A guest resolves to nothing in `accounts` by construction, so asking
    // there first would name every guest 'Someone' — including in the frozen
    // names of a recording they spoke in, which is the one place a name is
    // kept for ever. The prefix is what tells the two apart without a query.
    if (isGuestId(userId)) {
      return this.guests.displayName(userId) ?? 'Guest';
    }
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
  /**
   * Carries a change in *who may be heard* out to the media plane.
   *
   * Two things can change it and they are combined in `isWithheld`: the floor,
   * which withholds everybody but its holder, and a watch party's mute, which
   * withholds everybody. Both are transitions worth acting on immediately
   * rather than at the next tick — somebody muting a room for a film should
   * not have to wait out a poll to stop being audible.
   *
   * It was `applyFloorToMedia` until the party mute existed, at which point
   * the name would have described half of what it does.
   */
  private applySilenceToMedia(before: ChannelState, after: ChannelState): void {
    if (!this.media) return;
    if (
      before.floor.holder === after.floor.holder &&
      isPartyMuted(before) === isPartyMuted(after)
    ) {
      return;
    }
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
    speakers: string[] = statedIdentities(state)
  ): void {
    if (!this.media || state.status !== 'active') return;
    // The room in both directions, guests included, which is the second of the
    // three widenings the guest design named. A guest must be silenced when a
    // member holds the floor — otherwise a claim silences everybody it knows
    // about and nobody it does not — and must go on hearing whoever holds it,
    // which is the direction that would fail as silence rather than as noise.
    //
    // A party mute covers guests by the same argument and more simply: it
    // withholds everybody, so there is no exception to get wrong.
    const room = statedIdentities(state);
    for (const speaker of speakers) {
      const silenced = isWithheld(state, speaker);
      for (const listener of room) {
        if (listener === speaker) continue;
        this.stateSilence(state, speaker, listener, silenced);
      }
    }
  }

  /**
   * Carries a change in what a guest may do out to the two places that have to
   * agree with the state: the row that outlives this process, and the room
   * that decides whether anybody can hear them.
   *
   * Keyed on the transition rather than on the action, so that any other route
   * to a grant — a future rule, a restore — takes the same two steps. Only
   * guests already in the room are considered: one who has just *arrived*
   * carries their grant in the token they joined with, and calling
   * `setPublishAllowed` against a participant who is still connecting is a
   * `participant does not exist` for nothing.
   */
  private applyGuestSpeech(before: ChannelState, after: ChannelState): void {
    for (const guest of Object.values(after.guests)) {
      const was = before.guests[guest.id];
      if (!was || was.maySpeak === guest.maySpeak) continue;
      this.guests.setMaySpeak(guest.id, guest.maySpeak, this.now());
      if (!this.media) continue;
      const room = after.mediaRoom;
      this.run(
        () =>
          this.media?.setPublishAllowed({
            room,
            identity: guest.id,
            allowed: guest.maySpeak,
          }),
        `setPublishAllowed ${after.id}/${guest.id}`
      );
      // Somebody who has just been given a microphone during a claim must be
      // silenced by it like everybody else, and their new track is not covered
      // by anything stated before it existed.
      if (guest.maySpeak) {
        this.assertSilence(after, [guest.id]);
        this.ensureEgress(after);
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
  /**
   * Asks every occupied room what it is carrying, and moves the meter's mic
   * and listen spans to match.
   *
   * **Measured rather than modelled, and the difference is the reason this
   * exists.** The server holds every input to what the app computes —
   * `microphoneNeeded(channel, id) && !selfMuted[id]` — and the room is opened
   * with `stopMicTrackOnMute`, so a closed microphone genuinely unpublishes
   * and the predicate would name a real stream. It would work, except in the
   * case planning/STATES.md records under `Audio Connected`: the LiveKit room
   * can be dead while the websocket is alive, and then presence asserts a
   * stream that does not exist. The over-count is rare, one-directional, and
   * unbounded in duration — the socket recovers on foreground and the room
   * does not. Asking removes the whole class for every installed build, with
   * no wire change and nothing for a client to have to send.
   *
   * Playback and egress are deliberately *not* polled. Those are published by
   * this process — its own participant, its own egress jobs — so asking
   * LiveKit about them would introduce a second answer that can disagree with
   * the one this server already has, for nothing.
   *
   * Exposed like `tick`, so a test can step it rather than wait fifteen
   * seconds for a timer.
   */
  pollUsage(): void {
    if (!this.media) return;
    for (const [id, channel] of this.channels) {
      if (channel.status !== 'active') continue;
      if (channel.present.length === 0) {
        this.usage.closeOthers(['mic', 'listen'], id, new Set());
        continue;
      }
      this.run(() => this.meterRoom(channel), `meterRoom ${id}`);
    }
  }

  /** One channel's half of `pollUsage`. */
  private async meterRoom(state: ChannelState): Promise<void> {
    const room = state.mediaRoom;
    const roster = await this.media!.audioTracks(room);

    // The channel may have ended or moved rooms while we asked. Metering the
    // answer to a question about a room this channel no longer occupies would
    // attribute somebody else's audio to it.
    const now = this.channels.get(state.id);
    if (!now || now.status !== 'active' || now.mediaRoom !== room) return;

    // The shared-track participant is in the roster too, and is metered from
    // state in `commit` — counting it here would double it, and under an
    // identity that is not an account.
    const media = playbackIdentity(state.id);
    const publishing = now.participants.filter(
      (id) => id !== media && (roster.get(id)?.length ?? 0) > 0
    );

    const keep = new Set<string>();
    for (const identity of publishing) {
      const span = { kind: 'mic', channelId: state.id, accountId: identity };
      this.usage.openSpan({ ...span, source: 'room' });
      keep.add(this.usage.keyOf(span));
    }

    // Downlink: what the SFU sends *to* each person, which is a stream per
    // listener rather than per speaker — one person talking to four costs
    // four. Anyone present hears everybody else, including the shared track,
    // which is why `media` is counted here having been excluded above.
    const audible = publishing.length + (roster.has(media) ? 1 : 0);
    for (const identity of now.present) {
      const others = audible - (publishing.includes(identity) ? 1 : 0);
      if (others <= 0) continue;
      const span = { kind: 'listen', channelId: state.id, accountId: identity };
      this.usage.openSpan({ ...span, source: 'room' });
      keep.add(this.usage.keyOf(span));
    }

    // Everything of these kinds that this pass did not find is over. Written
    // as a statement of what is true rather than as a diff, which is what lets
    // a poll that misses a beat — or a microphone that closed while its phone
    // was unreachable — still close the span.
    this.usage.closeOthers(['mic', 'listen'], state.id, keep);
  }

  private async reconcileSilence(state: ChannelState): Promise<void> {
    if (!this.media || state.status !== 'active') return;
    const holder = state.floor.holder;
    const muted = isPartyMuted(state);
    // Nothing to reconcile when nobody is being withheld for either reason.
    if (holder === null && !muted) return;
    const room = state.mediaRoom;
    const roster = await this.media.audioTracks(room);
    // The channel may have moved rooms, released the floor, or unmuted the
    // room while we asked. Any of the three makes the answer we are about to
    // state one about a state that no longer holds.
    const now = this.channels.get(state.id);
    if (
      !now ||
      now.mediaRoom !== room ||
      now.floor.holder !== holder ||
      isPartyMuted(now) !== muted
    ) {
      return;
    }

    const present = statedIdentities(state).filter((id) => roster.has(id));
    const stated = this.silenceStated.get(state.id) ?? new Map<string, string>();
    this.silenceStated.set(state.id, stated);
    for (const speaker of present) {
      const tracks = roster.get(speaker) ?? [];
      if (tracks.length === 0) continue;
      const silenced = isWithheld(state, speaker);
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
      // The run is over, so every stem is, whatever became of its handle.
      this.usage.closeOthers(['egress'], after.id, new Set());
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
    // Opened here rather than by the poll, because a run shorter than one
    // sampling interval is exactly the run the poll would miss — and what
    // egress spans exist to answer is how many were going at once.
    this.usage.openSpan({
      ...this.egressSpan(state.id, state.recording.runId, identity),
      recordingId: state.recording.runId,
      source: 'state',
    });

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
      this.usage.closeSpan(
        this.egressSpan(state.id, state.recording.runId, identity)
      );
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
    // Guests included: a recording is of the conversation, and a guest who was
    // speaking was in the conversation. They arrive by this path rather than
    // by the fatal cohort that starts a run, because a guest may be in the
    // room with no publish grant and therefore no track — which is not a
    // failure and must not kill somebody else's recording.
    for (const identity of roomOccupants(state)) {
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
   * The half of the meter that reads state rather than the room.
   *
   * Everything here is something this process is the authority for. Playback
   * is published by its own participant and egress by its own jobs, so the
   * transition *is* the truth and there is nothing to ask anybody. Pairs are a
   * fact about presence, which is this server's to know.
   *
   * The microphone is the one stream a phone publishes, and it is metered from
   * the room instead — see `meterRoom`.
   */
  private meterCommit(before: ChannelState, after: ChannelState): void {
    // Playing, not loaded, and per person. The shared-track participant opens
    // on the first track and stays for the channel's life publishing silence
    // between them, so that a recording stem keeps its place; participant
    // lifetime and playing time are different quantities and this is the
    // second one.
    //
    // One span per present listener, because the request asks what each
    // *person* played and a shared track is heard by everybody at once. Note
    // what that makes the total: summing these gives listening time, not
    // stream time — the stream is one however many people are in the room, and
    // `listen` is where its cost is counted. The two answer different
    // questions and neither is the other's total.
    const presence =
      before.present.length !== after.present.length ||
      after.present.some((id) => !before.present.includes(id));
    const playing = after.playback.status === 'playing';
    if (presence || playing !== (before.playback.status === 'playing')) {
      const keep = new Set<string>();
      for (const identity of playing ? after.present : []) {
        const span = {
          kind: 'playback',
          channelId: after.id,
          accountId: identity,
        };
        this.usage.openSpan({ ...span, source: 'state' });
        keep.add(this.usage.keyOf(span));
      }
      // Somebody who stepped out mid-track stops accruing, and somebody who
      // arrived mid-track starts — both fall out of restating it rather than
      // needing a case each.
      this.usage.closeOthers(['playback'], after.id, keep);
    }

    // Every pair present together, restated whenever presence moves. A third
    // person arriving adds two pairs and disturbs neither of the existing
    // ones, which is what `openSpan` being idempotent buys.
    if (presence) {
      const keep = new Set<string>();
      for (let i = 0; i < after.present.length; i += 1) {
        for (let j = i + 1; j < after.present.length; j += 1) {
          const span = pairSpan(after.present[i], after.present[j], after.id);
          this.usage.openSpan({ ...span, source: 'state' });
          keep.add(this.usage.keyOf(span));
        }
      }
      this.usage.closeOthers(['pair'], after.id, keep);
    }
  }

  /** One stem's span, identified the way `startEgress` opened it. */
  private egressSpan(
    channelId: string,
    runId: string | null,
    identity: string
  ): { kind: string; channelId: string; accountId: string; peerId: string } {
    return {
      kind: 'egress',
      channelId,
      // Whoever started the recording, which the request asks these minutes be
      // attributed to and which is not whose voice the stem carries.
      accountId: (runId && this.runInitiator.get(runId)) || identity,
      peerId: identity,
    };
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
   * A credential for one participant to follow one channel's watch party from
   * another screen.
   *
   * The same three checks `mediaToken` makes, and for the same reason — the
   * follower page is reachable by anybody who knows a channel id, and this is
   * the whole of what stands between that and watching along with a
   * conversation you are not in.
   *
   * **And the room besides**, since 2026-08-24, which is the clause that makes
   * that sentence true of members as well as strangers: a channel with people
   * talking in it that you have not stepped into is a conversation you are not
   * in, and a second screen is not a way around that. `canOpenWatchScreen`
   * rather than `canControlWatch` — a follower page changes nothing, so
   * somebody in the room with the floor against them may still open one.
   *
   * Minted whether or not a party is running. A link handed to a laptop before
   * anybody has pasted anything is a page that waits, which is the ordinary
   * order of doing this: open the screen, then choose the video.
   */
  watchToken(
    channelId: string,
    userId: string
  ): { ok: true; token: string } | Refused {
    const channel = this.channels.get(channelId);
    if (!channel || channel.status !== 'active') {
      return { ok: false, error: 'No such channel.', code: 'not_found' };
    }
    if (!isParticipant(channel, userId)) {
      return { ok: false, error: 'Not your channel.', code: 'forbidden' };
    }
    if (!canOpenWatchScreen(channel, userId)) {
      return {
        ok: false,
        error: 'Step in to watch this channel on another screen.',
        code: 'forbidden',
      };
    }
    return {
      ok: true,
      token: this.accounts.issueWatchToken(userId, channelId, this.now()),
    };
  }

  // --- Guests ---------------------------------------------------------------
  //
  // Everything below turns a row in `guest_sessions` into somebody in a room,
  // and back. The rules are in core/ and the storage is in guests.ts; what is
  // here is the *when*, which is this class's job for members too.

  /** Mints a link a member can hand to anybody. */
  mintGuestLink(
    channelId: string,
    userId: string
  ): { ok: true; link: GuestLinkRow } | Refused {
    const channel = this.channels.get(channelId);
    if (!channel) return { ok: false, error: 'No such channel.', code: 'not_found' };
    if (!isParticipant(channel, userId) || channel.status !== 'active') {
      return { ok: false, error: 'Not your channel.', code: 'forbidden' };
    }
    // Separated from the line above so the answer is not "not your channel" to
    // a member whose channel it plainly is. `canInviteGuest` is both halves;
    // what is wanted here is which half refused, and the two are a 403 and a
    // 409 because only one of them is worth waiting out.
    if (!hasTheRoom(channel, userId)) {
      return {
        ok: false,
        error: 'Somebody is in this channel. Step in to make a link.',
        code: 'conflict',
      };
    }
    return {
      ok: true,
      link: this.guests.mintLink(channelId, userId, this.now()),
    };
  }

  /** Every link ever minted for a channel, for whoever belongs to it. */
  guestLinksFor(channelId: string, userId: string): GuestLinkRow[] {
    const channel = this.channels.get(channelId);
    if (!channel || !isParticipant(channel, userId)) return [];
    return this.guests.linksFor(channelId);
  }

  revokeGuestLink(
    channelId: string,
    userId: string,
    token: string
  ): { ok: true } | Refused {
    const channel = this.channels.get(channelId);
    if (!channel || !isParticipant(channel, userId)) {
      return { ok: false, error: 'No such channel.', code: 'not_found' };
    }
    const link = this.guests.link(token);
    if (!link || link.channel_id !== channelId) {
      return { ok: false, error: 'No such link.', code: 'not_found' };
    }
    // Closing a door is as much a decision about who is in the room as opening
    // one, and `mintGuestLink` asks the same question through `canInviteGuest`.
    // Asked after the link is found so that a revoke of something that was
    // never there still reads as not-found rather than as a busy channel.
    if (!hasTheRoom(channel, userId)) {
      return {
        ok: false,
        error: 'Somebody is in this channel. Step in to revoke a link.',
        code: 'conflict',
      };
    }
    this.guests.revokeLink(token, userId, this.now());
    this.emit([channelId]);
    return { ok: true };
  }

  /** What a link opens onto, for the page that has just been opened with it. */
  doorFor(token: string):
    | { ok: true; channelId: string; channelName: string; occupied: boolean }
    | Refused {
    const link = this.guests.liveLink(token);
    const channel = link ? this.channels.get(link.channel_id) : undefined;
    if (!link || !channel || channel.status !== 'active') {
      return { ok: false, error: 'This link is no longer open.', code: 'not_found' };
    }
    return {
      ok: true,
      channelId: channel.id,
      channelName: this.channelName(channel),
      occupied: channel.present.length > 0,
    };
  }

  /**
   * Somebody with a link is at the door.
   *
   * The knock is state rather than a message, so that every member sees the
   * same queue and one answer settles it — and so that a member who walks in
   * ten seconds later sees somebody still waiting rather than nothing.
   */
  knock(
    token: string,
    name: string
  ): { ok: true; channelId: string; knockId: string } | Refused {
    const door = this.doorFor(token);
    if (!door.ok) return door;
    if (!door.occupied) {
      return {
        ok: false,
        error: 'There is nobody in this channel to let you in.',
        code: 'conflict',
      };
    }
    const knockId = newId('knock');
    const applied = this.apply(door.channelId, '', {
      type: 'KNOCKED',
      knock: {
        id: knockId,
        // What they typed, or something that says a person is there without
        // pretending to be a name. The `Anon <n>` they may end up with is
        // assigned on admission, when there is a channel to number them in.
        name: name.trim().slice(0, MAX_DISPLAY_NAME_LENGTH) || 'Someone',
        at: this.now(),
      },
    } as Omit<ChannelAction, 'userId'> & { type: ChannelAction['type'] });
    if (!applied.ok) return applied;
    return { ok: true, channelId: door.channelId, knockId };
  }

  /** Takes a knock back, for a page that gave up waiting. */
  withdrawKnock(channelId: string, knockId: string): void {
    const channel = this.channels.get(channelId);
    if (!channel || !channel.knocks.some((k) => k.id === knockId)) return;
    const next = {
      ...channel,
      knocks: channel.knocks.filter((k) => k.id !== knockId),
    };
    this.commit(channel, next);
    this.emit([channelId]);
  }

  /**
   * A member answers the door.
   *
   * Acceptance is two steps that must not come apart: the reducer takes the
   * knock off the queue, and this mints the seat. Doing the second first would
   * leave a session behind if the first were refused, and there would be
   * nothing to attach it to.
   */
  answerKnock(
    channelId: string,
    userId: string,
    knockId: string,
    accept: boolean,
    /**
     * The link this knock arrived on, which the transport knows and the
     * reducer does not.
     *
     * Deliberately not on the `Knock`: a knock rides in the channel snapshot
     * every member is watching, and a link is a credential — one that opens
     * the door for anybody holding it. So the connection keeps it and hands it
     * over here, which is the last moment it is needed. Recording it on the
     * seat is what lets ejecting a guest close the door they came through.
     */
    linkToken: string | null = null
  ): { ok: true; admitted: AdmittedGuest | null } | Refused {
    const channel = this.channels.get(channelId);
    if (!channel) return { ok: false, error: 'No such channel.', code: 'not_found' };
    if (!canAnswerKnock(channel, userId)) {
      return { ok: false, error: 'Not your channel.', code: 'forbidden' };
    }
    const knock = channel.knocks.find((k) => k.id === knockId);
    if (!knock) return { ok: false, error: 'Nobody is waiting.', code: 'not_found' };

    const answered = this.apply(channelId, userId, {
      type: 'ANSWER_KNOCK',
      knockId,
      accept,
    } as Omit<ChannelAction, 'userId'> & { type: ChannelAction['type'] });
    if (!answered.ok) return answered;
    if (!accept) return { ok: true, admitted: null };

    const admitted = this.guests.admit(
      channelId,
      linkToken,
      knock.name === 'Someone' ? null : knock.name,
      userId,
      this.now()
    );
    this.enterGuest(channelId, admitted.session);
    return { ok: true, admitted };
  }

  /**
   * Puts an admitted guest in the room — on admission, and again on every
   * reconnection.
   */
  private enterGuest(channelId: string, session: GuestSessionRow): void {
    this.apply(channelId, '', {
      type: 'GUEST_ENTERED',
      guest: {
        id: session.id,
        name: session.display_name,
        admittedAt: session.admitted_at,
        maySpeak: session.may_speak === 1,
        request: 'none',
      },
    } as Omit<ChannelAction, 'userId'> & { type: ChannelAction['type'] });
  }

  /**
   * A guest's page comes back with the secret it was given.
   *
   * The path a deploy takes: the box restarts, every socket drops, and this is
   * what stops a guest having to knock at a room whose members may not be
   * looking. It is also what makes revoking a link survivable for the people
   * already inside.
   */
  resumeGuest(
    guestId: string,
    secret: string
  ): { ok: true; channelId: string; session: GuestSessionRow } | Refused {
    const session = this.guests.reconnect(guestId, secret, this.now());
    if (!session) {
      return { ok: false, error: 'This session has ended.', code: 'forbidden' };
    }
    const channel = this.channels.get(session.channel_id);
    if (!channel || channel.status !== 'active') {
      return { ok: false, error: 'This channel is gone.', code: 'not_found' };
    }
    if (channel.present.length === 0) {
      return {
        ok: false,
        error: 'There is nobody in this channel.',
        code: 'conflict',
      };
    }
    this.enterGuest(channel.id, session);
    return { ok: true, channelId: channel.id, session };
  }

  /** A guest's socket has gone, or their grace has run out. */
  guestGone(channelId: string, guestId: string): void {
    this.apply(channelId, '', {
      type: 'GUEST_GONE',
      guestId,
    } as Omit<ChannelAction, 'userId'> & { type: ChannelAction['type'] });
  }

  /** Reports a guest's connection, on the same terms as a member's. */
  reportGuest(
    channelId: string,
    guestId: string,
    state: 'CONNECTED' | 'DISCONNECTED'
  ): void {
    this.report(channelId, guestId, state);
  }

  /**
   * A join credential for a guest, minted unable to publish.
   *
   * That is the whole of what keeps a stranger inaudible until somebody says
   * otherwise: the grant is in the token rather than in the interface, so a
   * page that ignores every rule in this application still cannot make a
   * sound. `SET_GUEST_SPEECH` lifts it live, without a reconnection.
   */
  async guestMediaToken(
    channelId: string,
    guestId: string
  ): Promise<{ ok: true; token: string } | Refused> {
    if (!this.media) {
      return { ok: false, error: 'Audio is not configured.', code: 'invalid' };
    }
    const channel = this.channels.get(channelId);
    const guest = channel?.guests[guestId];
    if (!channel || !guest) {
      return { ok: false, error: 'No such channel.', code: 'not_found' };
    }
    const token = await this.media.issueToken({
      room: channel.mediaRoom,
      identity: guestId,
      displayName: guest.name,
      canPublish: guest.maySpeak,
    });
    return { ok: true, token };
  }

  /** What this guest is shown. See `GuestView` for what is deliberately absent. */
  guestView(channelId: string, guestId: string): GuestView | undefined {
    const channel = this.channels.get(channelId);
    const guest = channel?.guests[guestId];
    if (!channel || !guest) return undefined;
    const holder = channel.floor.holder;
    const muted = channel.selfMuted[guestId] === true;
    const mic: GuestView['you']['mic'] = guest.maySpeak
      ? muted
        ? 'muted'
        : 'open'
      : guest.request === 'asking'
        ? 'asking'
        : guest.request === 'refused'
          ? 'refused'
          : 'listening';
    return {
      channelId: channel.id,
      channelName: this.channelName(channel),
      you: {
        id: guestId,
        name: guest.name,
        mic,
        holdingFloor: holder === guestId,
        silenced: holder !== null && holder !== guestId,
        canClaimFloor: canClaimFloor(channel, guestId, this.now()),
      },
      others: [
        ...channel.present.map((id) => ({
          name: this.displayName(id),
          kind: 'member' as const,
          speaking: holder === id,
        })),
        ...Object.values(channel.guests)
          .filter((other) => other.id !== guestId)
          .map((other) => ({
            name: other.name,
            kind: 'guest' as const,
            speaking: holder === other.id,
          })),
      ],
      recording: channel.recording.status === 'recording',
      clip: channel.clip,
      serverNow: this.now(),
    };
  }

  /**
   * Applies an action on behalf of a guest.
   *
   * Separate from `dispatch` because that one refuses anybody who is not a
   * participant, which is the property the whole design rests on and not one
   * to soften with a flag. What this shares with it is everything that
   * matters: the actor comes from the connection, the allowlist is checked
   * before the reducer sees anything, and ids are minted here rather than
   * accepted.
   */
  dispatchGuest(
    channelId: string,
    guestId: string,
    action: { type: string; [key: string]: unknown }
  ): { ok: true } | Refused {
    const channel = this.channels.get(channelId);
    if (!channel || !channel.guests[guestId]) {
      return { ok: false, error: 'You are not in this channel.', code: 'forbidden' };
    }
    if (!GUEST_ACTIONS.has(action.type as ChannelAction['type'])) {
      return { ok: false, error: 'Not an action.', code: 'invalid' };
    }
    if (action.type === 'PASTE_CLIP') {
      if (typeof action.text !== 'string') {
        return { ok: false, error: 'Not an action.', code: 'invalid' };
      }
      const pasted = this.apply(channelId, guestId, {
        type: 'PASTE_CLIP',
        clip: {
          id: newId('clip'),
          authorId: guestId,
          pastedAt: this.now(),
          kind: 'text',
          text: action.text,
        },
      } as Omit<ChannelAction, 'userId'> & { type: ChannelAction['type'] });
      return pasted.ok ? { ok: true } : pasted;
    }
    const applied = this.apply(channelId, guestId, action as Omit<
      ChannelAction,
      'userId'
    > & { type: ChannelAction['type'] });
    return applied.ok ? { ok: true } : applied;
  }

  /** What to call a channel to somebody with no roster to fall back on. */
  private channelName(channel: ChannelState): string {
    if (channel.name) return channel.name;
    return describeChannel(
      channel.participants.map((id) => this.displayName(id))
    );
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
      // Outlives the process because it is a fact about the channel rather
      // than about the conversation running in it: a channel that inherited
      // its audio still owns that room, and restoring it as the channel id
      // would silently split a moved conversation in two, the far end still
      // holding tokens for the room it was handed. Nothing moves any more, but
      // rows written when things did are still on disk.
      mediaRoom: channel.mediaRoom,
      everPresent: channel.everPresent,
      status: channel.status,
      endedAt: channel.endedAt,
      lastActiveAt: channel.lastActiveAt,
      // Durable for the same reason as those two: when somebody was last in
      // this channel is a fact about the channel, and a deploy is not a thing
      // that should make everybody look freshly arrived.
      //
      // Rounded down to the minute, which is what makes it affordable to keep
      // fresh. STILL_HERE moves this value every five seconds for every
      // present participant, and `persistChannel` writes whenever the
      // projection changes — so at full resolution a four-person conversation
      // would rewrite its row forty-eight times a minute to record something
      // no screen can show, every reader of it going through dayjs thresholds
      // that move at minutes. The cost is that a restored value can be up to
      // a minute earlier than the truth, which is inside the sixty seconds
      // `agoOrNull` already treats as no gap at all.
      lastPresentAt: quantise(channel.lastPresentAt),
      lastRecording: channel.lastRecording,
      // Durable, unlike the track it sits next to, and the difference is that
      // the track is a file the dead process owned while this is the whole of
      // itself. Somebody pastes a URL and the box restarts a minute later for
      // reasons nobody in the channel knows about; losing it would be the kind
      // of small unexplained disappearance that teaches people not to rely on
      // a feature. It costs up to MAX_CLIP_LENGTH characters in this string,
      // which is rebuilt on every commit for the comparison below — cheap at
      // eight thousand, and the reason the cap is not larger.
      clip: channel.clip,
      // Durable, where playback is not, and the difference is the same one the
      // clipboard turns on: playback points at a temp file the dead process
      // owned, and a party is a link and a number. Nothing external has to
      // survive for it to mean what it meant.
      //
      // What is *not* preserved is that it was playing — see `revive`, which
      // brings it back paused.
      watch: channel.watch,
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
      for (const userId of channel.participants) {
        this.lastAnnouncedAt.set(this.announceKey(channel.id, userId), now);
      }
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
    // Spans the dead process left open. Closed at their own start rather than
    // at boot — see closeStrays — and swept on their own horizon, which is
    // USAGE_RETENTION_MS rather than the week above and is applied here so a
    // server that is never up for an hour still expires them.
    this.usage.closeStrays();
    this.usage.sweep(now);
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
      clip?: ChannelState['clip'];
      watch?: ChannelState['watch'];
    };
    const stored =
      durable.participants ??
      (row.participants ? (JSON.parse(row.participants) as string[]) : []);

    // Rows written before unnamed channels widened carry outstanding
    // invitations in `invited`, and nothing can answer one any more:
    // `acceptInvitation` is gone and a non-participant is refused outright. So
    // an invitation becomes what it would be if it were made today — membership
    // without presence, which `invitesFor` still shows as an invitation because
    // `everPresent` does not name them.
    //
    // Dropped rather than thrown on when the channel cannot hold them: a
    // channel already at MAX_CHANNEL_PARTICIPANTS is one they were never going
    // to be able to join, and a restore is not the place to fail loudly.
    const invited = durable.invited ?? {};
    const invitedBy = { ...(durable.invitedBy ?? {}) };
    const participants = [...stored];
    for (const [invitee, inviter] of Object.entries(invited)) {
      if (participants.includes(invitee)) continue;
      if (participants.length >= MAX_CHANNEL_PARTICIPANTS) continue;
      participants.push(invitee);
      invitedBy[invitee] = inviter;
    }

    return {
      id: row.id,
      // Written before this field existed means never moved, and a channel
      // that has never moved talks in the room named after it.
      mediaRoom: durable.mediaRoom ?? row.id,
      name: durable.name ?? row.name ?? null,
      description: durable.description ?? row.description ?? null,
      initiator: durable.initiator ?? row.initiator_id,
      participants,
      invitedBy,
      createdAt: row.created_at,
      // Channels written before this field existed fall back to their creation
      // — the same order they had before, rather than all of them at zero.
      lastActiveAt: durable.lastActiveAt ?? row.created_at,
      status: 'active',
      endedAt: null,
      present: [],
      // Nobody comes back a guest either, and their sessions are what makes
      // that survivable: the room is empty of them, and each of their pages
      // reconnects with the secret it was given. See guests.ts.
      guests: {},
      knocks: [],
      // Nobody comes back waiting. A restart dropped every socket at once, and
      // that says nothing about whether any of them had walked into a channel
      // to hold on for somebody — see `waiting` in core/types.ts.
      waiting: [],
      everPresent: durable.everPresent ?? [],
      floor: initialFloorState(),
      selfMuted: Object.fromEntries(participants.map((id) => [id, false])),
      recording: initialRecordingState(),
      lastRecording: durable.lastRecording ?? null,
      playback: initialPlaybackState(),
      // Kept, where playback is not: this is the content itself rather than a
      // handle on something the dead process owned. Absent on rows written
      // before the field existed, which is an empty clipboard — the same thing
      // those channels had.
      clip: durable.clip ?? null,
      // Kept for the same reason the clipboard is, and brought back
      // **paused at its position** whatever the blob says. The clock ran on
      // through the restart with nobody driving it and every follower's page
      // disconnected, so coming back playing would assert a position no screen
      // in the world is at. Paused is a claim about where everybody had got
      // to, which is true, and pressing play is one tap.
      //
      // Absent on rows written before the field existed, which is a channel
      // with no party — the same thing those channels had.
      watch: revivedWatch(durable.watch),
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
    // The run is over and its spans are closed; nothing will ask again.
    this.runInitiator.delete(runId);
    const present = this.recordingAudience.get(channel.id) ?? new Set<string>();
    const perParticipant = this.segments.get(channel.id) ?? new Map();
    const windows = this.floorWindows.get(channel.id) ?? [];
    this.recordingAudience.delete(channel.id);
    this.segments.delete(channel.id);
    this.floorWindows.delete(channel.id);

    this.checkpointedAt.delete(runId);

    // `lastRecording` is the reducer's account of the run that just ended. Its
    // absence means the reducer never had a run to report, and then nothing
    // happened at all — the open row goes with it, or the boot sweep would one
    // day mark a non-event as a failed recording.
    const run = channel.lastRecording;
    const stems = Object.fromEntries(perParticipant) as Record<
      string,
      Array<{ key: string; startMs: number }>
    >;
    const flat = Object.values(stems)
      .flat()
      .map((segment) => segment.key);
    if (!run || run.runId !== runId || run.durationMs <= 0) {
      this.db.prepare('DELETE FROM recordings WHERE id = ?').run(runId);
      return;
    }

    // A run that ran and captured nothing is filed as a failure rather than
    // deleted, which is what it used to be. Deleting it made a real event
    // invisible: somebody started a recording, watched a timer, stopped it, and
    // was left with no card, no error and nothing in the log to say it had ever
    // happened. It cost an evening on 2026-08-16 to find, and the person it
    // happened to could only conclude the button did not work.
    //
    // The common way in is a solo run. Alone in a channel the microphone is
    // closed — see app/src/audio/micNeeded.ts — and starting a recording is
    // what reopens it, which the app cannot know to do until this server's
    // snapshot reaches it. Capture is running by then, against nobody
    // publishing, so a short enough run ends with no stems at all.
    const captured = flat.length > 0;

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
    // Nothing to mix from, so the row goes straight to displayable — the same
    // answer a storeless test harness gets, and for the same reason.
    const mixable = !!this.store && captured;

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
        run.failure ??
          (captured
            ? null
            : 'Nothing was captured — no audio was being published.'),
        mixable ? 'pending' : 'unmixed',
        runId
      );

    // The row only now qualifies for either list — `ended_at IS NOT NULL` is
    // what moves it from in flight to existing — and the push that followed
    // STOP_RECORDING went out before this, synchronously, when dispatch
    // returned. Without saying so here, the recording somebody had just made
    // did not appear until an unrelated snapshot happened to be sent.
    this.emit([channel.id]);

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
      async (key) => {
        const stem = await (wait
          ? getWhenReady(store, key, { waitMs: this.mixWaitMs })
          : store.get(key));
        // Nobody asked for this, so no account is named. Mixing is what a
        // recording costs by existing, and it is charged to the recording.
        this.usage.recordBytes({
          kind: 'mix-read',
          bytes: stem.length,
          recordingId,
        });
        return stem;
      }
    );

    // Stored before the row says it exists, so a crash between the two leaves
    // an object nobody reads rather than a row promising one that is not
    // there. The sweep deletes the key whether or not the state says 'ready',
    // so the orphan is not permanent either.
    await store.put(mixKeyFor(row.channel_id, row.id), data);
    this.usage.recordBytes({
      kind: 'mix-write',
      bytes: data.length,
      recordingId,
    });
    this.db
      .prepare("UPDATE recordings SET mix_state = 'ready' WHERE id = ?")
      .run(row.id);
    // The card is on screen with Play and Export greyed; this is what ungreys
    // them. Nothing else would: a mix finishing is not an action anybody took,
    // so no dispatch is going to push a snapshot on its behalf.
    this.emit([row.channel_id]);
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
