import { EMPTY_SESSION_TIMEOUT_MS } from './constants';
import {
  claimFloor,
  hasExpired,
  initialFloorState,
  releaseFloor,
  satisfiesEligibilityRule,
} from './floor';
import {
  canPauseOrStopRecording,
  failRecording,
  initialRecordingState,
  isRecordingActive,
  pauseRecording,
  resumeRecording,
  startRecording,
  stopRecording,
} from './recording';
import type {
  SessionAction,
  SessionEndReason,
  SessionState,
  UserId,
} from './types';

export function createSession(params: {
  id: string;
  initiator: UserId;
  invitee: UserId;
  now: number;
}): SessionState {
  const { id, initiator, invitee, now } = params;
  return {
    id,
    initiator,
    invitee,
    createdAt: now,
    status: 'active',
    endedAt: null,
    endedReason: null,
    // Creating a session is entering it: the initiator is present immediately
    // and waits there for as long as it takes the other party to join.
    present: [initiator],
    everPresent: [initiator],
    emptySince: null,
    floor: initialFloorState(),
    selfMuted: { [initiator]: false, [invitee]: false },
    recording: initialRecordingState(),
  };
}

export function isParticipant(state: SessionState, userId: UserId): boolean {
  return userId === state.initiator || userId === state.invitee;
}

export function otherParty(state: SessionState, userId: UserId): UserId {
  return userId === state.initiator ? state.invitee : state.initiator;
}

export function isPresent(state: SessionState, userId: UserId): boolean {
  return state.present.includes(userId);
}

export function bothPresent(state: SessionState): boolean {
  return state.present.length === 2;
}

export function bothEverConnected(state: SessionState): boolean {
  return state.everPresent.length === 2;
}

// --- Guards -----------------------------------------------------------------
// The UI uses these directly to enable/disable controls, so a disabled control
// and a rejected action can never disagree.

/**
 * The full claim precondition: the eligibility rule, plus presence. The claim
 * control is unavailable while a user is alone in the session.
 */
export function canClaimFloor(
  state: SessionState,
  userId: UserId,
  now: number
): boolean {
  if (state.status !== 'active') return false;
  if (!isPresent(state, userId) || !bothPresent(state)) return false;
  return satisfiesEligibilityRule(state.floor, userId, now);
}

export function canReleaseFloor(state: SessionState, userId: UserId): boolean {
  return state.status === 'active' && state.floor.holder === userId;
}

export function canStartRecording(state: SessionState): boolean {
  return (
    state.status === 'active' &&
    state.recording.status === 'idle' &&
    bothEverConnected(state)
  );
}

export function canPauseRecording(
  state: SessionState,
  userId: UserId
): boolean {
  return (
    state.status === 'active' &&
    state.recording.status === 'recording' &&
    canPauseOrStopRecording(state.floor, userId)
  );
}

/** Resuming does not cut off the record, so it carries no floor restriction. */
export function canResumeRecording(state: SessionState): boolean {
  return state.status === 'active' && state.recording.status === 'paused';
}

export function canStopRecording(state: SessionState, userId: UserId): boolean {
  return (
    state.status === 'active' &&
    isRecordingActive(state.recording) &&
    canPauseOrStopRecording(state.floor, userId)
  );
}

// --- Reducer ----------------------------------------------------------------

/**
 * Applies `action` at time `now`. Invalid actions are no-ops that return the
 * same state object, so callers can treat identity as "nothing happened".
 */
export function reduce(
  state: SessionState,
  action: SessionAction,
  now: number
): SessionState {
  if (action.type === 'TICK') return tick(state, now);
  if (state.status !== 'active') return state;

  // Reported by the media plane rather than performed by anyone, so it carries
  // no actor to authorise and is not subject to the floor's restrictions —
  // including the one that withholds stop from a silenced party. Capture that
  // has failed has already stopped; refusing to say so helps nobody.
  if (action.type === 'RECORDING_FAILED') {
    if (!isRecordingActive(state.recording)) return state;
    return {
      ...state,
      recording: failRecording(state.recording, action.reason, now),
    };
  }

  if (!isParticipant(state, action.userId)) return state;

  switch (action.type) {
    case 'ENTER': {
      if (isPresent(state, action.userId)) return state;
      return {
        ...state,
        present: [...state.present, action.userId],
        everPresent: state.everPresent.includes(action.userId)
          ? state.everPresent
          : [...state.everPresent, action.userId],
        // Re-entering while the empty-session timer runs cancels it.
        emptySince: null,
      };
    }

    case 'LEAVE': {
      if (!isPresent(state, action.userId)) return state;
      const present = state.present.filter((id) => id !== action.userId);
      return {
        ...state,
        present,
        // A departing floor-holder's claim is force-released, exactly as if
        // released voluntarily. Dropped connections take this same path.
        floor:
          state.floor.holder === action.userId
            ? releaseFloor(state.floor, now)
            : state.floor,
        emptySince: present.length === 0 ? now : null,
      };
    }

    case 'END':
      // Either user may end the session at any time, present or not.
      return endSession(state, 'explicit', now);

    case 'CLAIM_FLOOR': {
      if (!canClaimFloor(state, action.userId, now)) return state;
      return { ...state, floor: claimFloor(state.floor, action.userId, now) };
    }

    case 'RELEASE_FLOOR': {
      if (!canReleaseFloor(state, action.userId)) return state;
      return { ...state, floor: releaseFloor(state.floor, now) };
    }

    case 'SET_SELF_MUTE':
      // Unilateral, unlimited, and with no bearing on floor eligibility.
      return {
        ...state,
        selfMuted: { ...state.selfMuted, [action.userId]: action.muted },
      };

    case 'START_RECORDING': {
      if (!canStartRecording(state)) return state;
      return { ...state, recording: startRecording(state.recording, now) };
    }

    case 'PAUSE_RECORDING': {
      if (!canPauseRecording(state, action.userId)) return state;
      return { ...state, recording: pauseRecording(state.recording, now) };
    }

    case 'RESUME_RECORDING': {
      if (!canResumeRecording(state)) return state;
      return { ...state, recording: resumeRecording(state.recording, now) };
    }

    case 'STOP_RECORDING': {
      if (!canStopRecording(state, action.userId)) return state;
      return { ...state, recording: stopRecording(state.recording, now) };
    }

    default:
      return state;
  }
}

function tick(state: SessionState, now: number): SessionState {
  if (state.status !== 'active') return state;
  let next = state;

  // A claim that has run its three minutes releases automatically.
  if (hasExpired(next.floor, now)) {
    next = { ...next, floor: releaseFloor(next.floor, now) };
  }

  // An empty session auto-ends after a minute. This timer only runs while
  // nobody is present, so a lone initiator can wait indefinitely.
  if (
    next.emptySince !== null &&
    now - next.emptySince >= EMPTY_SESSION_TIMEOUT_MS
  ) {
    next = endSession(next, 'empty-timeout', now);
  }

  return next;
}

function endSession(
  state: SessionState,
  reason: SessionEndReason,
  now: number
): SessionState {
  return {
    ...state,
    status: 'ended',
    endedAt: now,
    endedReason: reason,
    present: [],
    emptySince: null,
    floor: releaseFloor(state.floor, now),
    // Recording runs until the session itself ends, then finalizes.
    recording: isRecordingActive(state.recording)
      ? stopRecording(state.recording, now)
      : state.recording,
  };
}

/** Milliseconds until an empty session auto-ends, or null if it is not empty. */
export function emptyTimeoutRemainingMs(
  state: SessionState,
  now: number
): number | null {
  if (state.status !== 'active' || state.emptySince === null) return null;
  return Math.max(0, EMPTY_SESSION_TIMEOUT_MS - (now - state.emptySince));
}
