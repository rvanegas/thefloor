export type UserId = string;

export type SessionEndReason = 'explicit' | 'empty-timeout';

export interface FloorState {
  /** Who holds the floor right now, or null if nobody does. */
  holder: UserId | null;
  /** When the current claim started. Null iff `holder` is null. */
  claimedAt: number | null;
  /** Who made the most recent claim, whether or not it is still active. */
  lastClaimant: UserId | null;
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
  /** Advances time-driven transitions: floor expiry and empty-session auto-end. */
  | { type: 'TICK' };
