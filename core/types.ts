export type UserId = string;

export type SessionEndReason = 'explicit' | 'empty-timeout';

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

export interface SessionState {
  id: string;
  /** The user who created the session. */
  initiator: UserId;
  /** The contact who was invited. */
  invitee: UserId;
  createdAt: number;
  status: 'active' | 'ended';
  endedAt: number | null;
  endedReason: SessionEndReason | null;
  /** Users currently in the session. */
  present: UserId[];
  /**
   * Users who have entered at least once. Recording may only be started once
   * both parties have connected; leaving afterwards does not revoke that.
   */
  everPresent: UserId[];
  /**
   * When the session last became empty, or null while at least one user is
   * present. Drives the empty-session auto-end timer.
   */
  emptySince: number | null;
  floor: FloorState;
  selfMuted: Record<UserId, boolean>;
  recording: RecordingState;
  /**
   * When each present user's last connection dropped. Absent means connected.
   *
   * Connectivity and presence are deliberately separate. A socket that drops
   * and returns changes nothing about who is in the session; only staying gone
   * past DISCONNECT_GRACE_MS removes anyone. Without that separation a moment's
   * bad signal reads as leaving, and — worse — a socket dying after its
   * replacement has already connected can evict someone who is demonstrably
   * back.
   */
  disconnectedAt: Partial<Record<UserId, number>>;
}

export type SessionAction =
  | { type: 'ENTER'; userId: UserId }
  | { type: 'LEAVE'; userId: UserId }
  | { type: 'END'; userId: UserId }
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
   * Transport, not intent: reported by whatever holds the connection rather
   * than performed by anyone. Neither changes presence directly — DISCONNECTED
   * starts the grace clock and CONNECTED cancels it.
   */
  | { type: 'CONNECTED'; userId: UserId }
  | { type: 'DISCONNECTED'; userId: UserId }
  /** Advances time-driven transitions: floor expiry and empty-session auto-end. */
  | { type: 'TICK' };
