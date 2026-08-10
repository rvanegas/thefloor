export type UserId = string;

export type ChannelEndReason = 'explicit' | 'empty-timeout';

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

export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'stopped';

export interface RecordingState {
  status: RecordingStatus;
  /** When recording first started. Survives pause/resume. */
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
   * it. Display falls back to the roster — the other party's name, or a head
   * count — so a name is a replacement for that, never a requirement.
   */
  name: string | null;
  /** The user who created the channel. */
  initiator: UserId;
  /**
   * Everyone in the channel — the initiator first, then the rest in the order
   * they were invited. Grows on INVITE, never shrinks: leaving a channel is
   * not being removed from it. Capped at MAX_CHANNEL_PARTICIPANTS.
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
  endedAt: number | null;
  endedReason: ChannelEndReason | null;
  /** Users currently in the channel. */
  present: UserId[];
  /**
   * Users who have entered at least once. Recording may only be started once
   * at least two people have connected; leaving afterwards does not revoke
   * that.
   */
  everPresent: UserId[];
  /**
   * When the channel last became empty, or null while at least one user is
   * present. Drives the empty-channel auto-end timer.
   */
  emptySince: number | null;
  floor: FloorState;
  selfMuted: Record<UserId, boolean>;
  recording: RecordingState;
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
  | { type: 'LEAVE'; userId: UserId }
  /**
   * Adds `inviteeId` to the channel. Any current participant may invite;
   * whether the two are contacts is the server's to check, contacts being a
   * server-side concern the reducer knows nothing about.
   */
  | { type: 'INVITE'; userId: UserId; inviteeId: UserId }
  | { type: 'END'; userId: UserId }
  /**
   * Names or renames the channel. Any participant may, at any time — a name
   * is shared furniture, like the track, and carries no floor restriction.
   * An empty or whitespace name clears it back to the roster fallback.
   */
  | { type: 'SET_NAME'; userId: UserId; name: string }
  | { type: 'CLAIM_FLOOR'; userId: UserId }
  | { type: 'RELEASE_FLOOR'; userId: UserId }
  | { type: 'SET_SELF_MUTE'; userId: UserId; muted: boolean }
  | { type: 'START_RECORDING'; userId: UserId }
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
  /** Advances time-driven transitions: floor expiry and empty-channel auto-end. */
  | { type: 'TICK' };
