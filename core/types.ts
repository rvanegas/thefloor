export type UserId = string;

export interface FloorState {
  /** Who holds the floor right now, or null if nobody does. */
  holder: UserId | null;
  /** When the current claim started. Null iff `holder` is null. */
  claimedAt: number | null;
  /** Who made the most recent claim, whether or not it is still active. */
  /**
   * When each user last claimed. The claim delay is derived from the ordering
   * this gives, so there is nothing else to keep in step with it.
   *
   * Absent means never claimed, which counts as having spoken longest ago —
   * so anyone who has not taken a turn is always among those who may claim
   * immediately.
   */
  lastClaimedAt: Record<UserId, number>;
  /** When the most recent claim ended. Null while a claim is active. */
  lastReleasedAt: number | null;
}

/**
 * There is no 'stopped'. A stopped run is simply over, and the channel returns
 * to idle so another can begin — which is what makes several recordings in one
 * channel possible. What was captured is described by `lastRecording`, and the
 * recording itself is by then a row of its own.
 *
 * Dropping the state rather than keeping it as a transient is deliberate: it
 * makes "`runId` is non-null exactly while a run is in progress" total, and it
 * made the compiler point at every place that assumed otherwise.
 */
export type RecordingStatus = 'idle' | 'recording' | 'paused';

export interface RecordingState {
  status: RecordingStatus;
  /**
   * This run's id, and the id of the row it will be filed as. Non-null
   * exactly while a run is in progress.
   *
   * Minted by the server rather than the reducer, which has no business
   * generating identifiers, and arrives on the action the way a track does.
   */
  runId: string | null;
  /** When this run started. Survives pause/resume. */
  startedAt: number | null;
  /** Recorded milliseconds accumulated across previous run segments. */
  accumulatedMs: number;
  /** When the current run segment began; null unless status is 'recording'. */
  segmentStartedAt: number | null;
  /**
   * Why capture stopped, when it stopped for a reason nobody asked for.
   *
   * Recording is the one feature where the interface makes a promise about the
   * world rather than about itself — a red dot saying audio is being kept. If
   * capture is not actually running, saying so is not a nicety; someone may be
   * speaking on the strength of that indicator.
   */
  failure: string | null;
}

/**
 * A recording run that is over, kept so the channel can say what it captured.
 *
 * Only the most recent one: the rest are rows in the database and reachable
 * from the home screen, so holding a history here would be a second copy of
 * something already durable.
 */
export interface FinishedRun {
  /** The recording's id, so a client could link straight to it. */
  runId: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  /** Set when the run ended for a reason nobody asked for. */
  failure: string | null;
}

/** A file one party supplied for both to listen to. */
export interface PlaybackTrack {
  id: string;
  /** What to call it on screen. Taken from the uploaded file's name. */
  title: string;
  durationMs: number;
}

export type PlaybackStatus = 'idle' | 'playing' | 'paused';

export interface PlaybackState {
  /** The loaded track, or null when there is none. Null iff status is 'idle'. */
  track: PlaybackTrack | null;
  status: PlaybackStatus;
  /** Position banked at the last transition, in ms into the track. */
  positionMs: number;
  /** When the current run began; null unless status is 'playing'. */
  startedAt: number | null;
  /**
   * Shared, 0..1, applied by the server as it publishes.
   *
   * Shared rather than per-listener because it is part of what the channel
   * sounded like: it is applied to the samples before they are published and
   * encoded, so it reaches both parties and the recording alike. A volume each
   * party set for themselves would be their device's business, invisible here.
   */
  volume: number;
  /**
   * Why playback stopped, when it stopped for a reason nobody asked for.
   *
   * Same reasoning as RecordingState.failure: the interface says audio is
   * playing, and silence that contradicts it needs an explanation rather than
   * leaving the pair to wonder which of them broke it.
   */
  failure: string | null;
}

export interface ChannelState {
  id: string;
  /**
   * What the participants call this channel, or null when nobody has named
   * it. A name is never required: display falls back to `describeChannel`
   * over the roster.
   *
   * The two are not the same kind of thing, though, and the interface says so.
   * A name is one string every member reads and can therefore say to another
   * member. The fallback is a *description*, written from one viewer's side —
   * you see "Dana Chu", she sees your name — so it is rendered in muted italic
   * rather than dressed as a name that everybody shares.
   */
  name: string | null;
  /**
   * A description of what the channel is for, as Markdown, or null when nobody
   * has written one.
   *
   * Stored as its source rather than as anything parsed: the markup is what a
   * person typed and what they will see when they edit it again, and rendering
   * is the client's business. Only inline formatting is meaningful — this sits
   * in a header, not in a document.
   */
  description: string | null;
  /** The user who created the channel. */
  initiator: UserId;
  /**
   * Everyone who belongs to this channel — the initiator first, then the rest
   * in the order they were invited. Grows on INVITE and shrinks only on
   * LEAVE_CHANNEL. Capped at MAX_CHANNEL_PARTICIPANTS.
   *
   * Membership is not presence. Stepping out empties your place in `present`
   * and leaves this untouched; only leaving the channel outright removes you
   * from here, and the channel ends when the last person does.
   */
  participants: UserId[];
  /**
   * Who invited each participant. Absent for the initiator. This is what an
   * invitation shows as its sender — "X is waiting in a channel" should name
   * whoever actually asked, not whoever happened to create the channel.
   */
  invitedBy: Record<UserId, UserId>;
  createdAt: number;
  status: 'active' | 'ended';
  /**
   * When the last member left, or null while the channel exists. There is
   * exactly one way a channel ends, so nothing records a reason.
   */
  endedAt: number | null;
  /**
   * Users currently in the channel — able to hear and be heard. A subset of
   * `participants`, and the thing stepping out changes.
   */
  present: UserId[];
  /**
   * Users who have entered at least once. What distinguishes a channel
   * somebody has opened from one they were merely added to, which is how an
   * invitation is expressed now that there is no separate invite object.
   */
  everPresent: UserId[];
  floor: FloorState;
  selfMuted: Record<UserId, boolean>;
  recording: RecordingState;
  /** The most recent run that has finished, or null if none has. */
  lastRecording: FinishedRun | null;
  playback: PlaybackState;
  /**
   * When each present user's last connection dropped. Absent means connected.
   *
   * Connectivity and presence are deliberately separate. A socket that drops
   * and returns changes nothing about who is in the channel; only staying gone
   * past DISCONNECT_GRACE_MS removes anyone. Without that separation a moment's
   * bad signal reads as leaving, and — worse — a socket dying after its
   * replacement has already connected can evict someone who is demonstrably
   * back.
   */
  disconnectedAt: Partial<Record<UserId, number>>;
}

export type ChannelAction =
  | { type: 'ENTER'; userId: UserId }
  /**
   * Stop being present: audio unsubscribed, place in `present` given up,
   * membership untouched. Named for its button rather than as LEAVE, because
   * an action still called LEAVE would let every existing call site keep
   * compiling while quietly meaning something far more destructive.
   */
  | { type: 'STEP_OUT'; userId: UserId }
  /**
   * Adds `inviteeId` to the channel. Any current participant may invite;
   * whether the two are contacts is the server's to check, contacts being a
   * server-side concern the reducer knows nothing about.
   */
  | { type: 'INVITE'; userId: UserId; inviteeId: UserId }
  /**
   * Give up membership: removed from the roster, and the channel disappears
   * from this user's Home. Implies stepping out, necessarily — `present` must
   * never hold someone who is not a participant.
   *
   * When the last member leaves, the channel ends. That is the only way a
   * channel ends; nobody can destroy one that other people still belong to.
   */
  | { type: 'LEAVE_CHANNEL'; userId: UserId }
  /**
   * Names or renames the channel. Any participant may, at any time — a name
   * is shared furniture, like the track, and carries no floor restriction.
   * An empty or whitespace name clears it back to the roster fallback.
   */
  | { type: 'SET_NAME'; userId: UserId; name: string }
  /**
   * Writes or rewrites the description. Any participant may, like the name:
   * both are shared furniture rather than anybody's property.
   *
   * An empty or whitespace-only value clears it.
   */
  | { type: 'SET_DESCRIPTION'; userId: UserId; description: string }
  | { type: 'CLAIM_FLOOR'; userId: UserId }
  | { type: 'RELEASE_FLOOR'; userId: UserId }
  | { type: 'SET_SELF_MUTE'; userId: UserId; muted: boolean }
  /** `runId` is minted by the server; a client cannot name one. */
  | { type: 'START_RECORDING'; userId: UserId; runId: string }
  | { type: 'PAUSE_RECORDING'; userId: UserId }
  | { type: 'RESUME_RECORDING'; userId: UserId }
  | { type: 'STOP_RECORDING'; userId: UserId }
  /**
   * Capture could not be started or kept running. Not a user action — the
   * media plane reports it — so it carries no userId and no guard.
   */
  | { type: 'RECORDING_FAILED'; reason: string }
  /**
   * Shared playback. All of these are gated by `canControlPlayback`, which
   * hands the floor-holder exclusive control while a claim is active — a claim
   * is about governing what is heard, and this is part of what is heard.
   */
  | { type: 'SET_TRACK'; userId: UserId; track: PlaybackTrack }
  | { type: 'CLEAR_TRACK'; userId: UserId }
  | { type: 'PLAY'; userId: UserId }
  | { type: 'PAUSE'; userId: UserId }
  | { type: 'SEEK'; userId: UserId; positionMs: number }
  | { type: 'SET_VOLUME'; userId: UserId; volume: number }
  /** Reported by the media plane, like RECORDING_FAILED: no actor, no guard. */
  | { type: 'PLAYBACK_FAILED'; reason: string }
  /**
   * Transport, not intent: reported by whatever holds the connection rather
   * than performed by anyone. Neither changes presence directly — DISCONNECTED
   * starts the grace clock and CONNECTED cancels it.
   */
  | { type: 'CONNECTED'; userId: UserId }
  | { type: 'DISCONNECTED'; userId: UserId }
  /**
   * Advances time-driven transitions: floor expiry, a track reaching its end,
   * and a dropped connection outlasting the grace period. Nothing here ends a
   * channel — only its last member leaving does that.
   */
  | { type: 'TICK' };
