import {
  DISCONNECT_GRACE_MS,
  EMPTY_SESSION_TIMEOUT_MS,
  MAX_CHANNEL_NAME_LENGTH,
  MAX_CHANNEL_PARTICIPANTS,
} from './constants';
import {
  claimFloor,
  hasExpired,
  initialFloorState,
  releaseFloor,
  satisfiesEligibilityRule,
} from './floor';
import {
  clearTrack,
  failPlayback,
  hasReachedEnd,
  initialPlaybackState,
  pause as pausePlayback,
  play as playPlayback,
  seek as seekPlayback,
  setTrack,
  setVolume,
} from './playback';
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
  ChannelAction,
  ChannelEndReason,
  ChannelState,
  UserId,
} from './types';

export function createChannel(params: {
  id: string;
  initiator: UserId;
  invitees: UserId[];
  now: number;
}): ChannelState {
  const { id, initiator, invitees, now } = params;
  const participants = [initiator, ...invitees];
  // Structural violations, not policy ones: the caller was supposed to have
  // validated the roster, so a bad one here is a bug worth failing loudly on.
  if (invitees.length === 0) {
    throw new Error('A channel needs at least one invitee.');
  }
  if (new Set(participants).size !== participants.length) {
    throw new Error('A channel cannot hold the same person twice.');
  }
  if (participants.length > MAX_CHANNEL_PARTICIPANTS) {
    throw new Error(`A channel holds at most ${MAX_CHANNEL_PARTICIPANTS} people.`);
  }
  return {
    id,
    name: null,
    initiator,
    participants,
    invitedBy: Object.fromEntries(invitees.map((i) => [i, initiator])),
    createdAt: now,
    status: 'active',
    endedAt: null,
    endedReason: null,
    // Creating a channel is entering it: the initiator is present immediately
    // and waits there for as long as it takes anyone else to join.
    present: [initiator],
    everPresent: [initiator],
    emptySince: null,
    floor: initialFloorState(),
    selfMuted: Object.fromEntries(participants.map((p) => [p, false])),
    recording: initialRecordingState(),
    playback: initialPlaybackState(),
    disconnectedAt: {},
  };
}

export function isParticipant(state: ChannelState, userId: UserId): boolean {
  return state.participants.includes(userId);
}

/** Everyone in the channel except `userId`, in participant order. */
export function otherParticipants(
  state: ChannelState,
  userId: UserId
): UserId[] {
  return state.participants.filter((id) => id !== userId);
}

export function isPresent(state: ChannelState, userId: UserId): boolean {
  return state.present.includes(userId);
}

/**
 * Whether there is anyone to talk to. The generalisation of "both present":
 * the floor means nothing to someone alone in the channel.
 */
export function atLeastTwoPresent(state: ChannelState): boolean {
  return state.present.length >= 2;
}

export function atLeastTwoEverConnected(state: ChannelState): boolean {
  return state.everPresent.length >= 2;
}

// --- Guards -----------------------------------------------------------------
// The UI uses these directly to enable/disable controls, so a disabled control
// and a rejected action can never disagree.

/**
 * The full claim precondition: the eligibility rule, plus presence. The claim
 * control is unavailable while a user is alone in the channel.
 */
export function canClaimFloor(
  state: ChannelState,
  userId: UserId,
  now: number
): boolean {
  if (state.status !== 'active') return false;
  if (!isPresent(state, userId) || !atLeastTwoPresent(state)) return false;
  // Ranked against who is present, not who is in the channel: someone who has
  // left must not occupy the zero slot they cannot use.
  return satisfiesEligibilityRule(state.floor, state.present, userId, now);
}

export function canReleaseFloor(state: ChannelState, userId: UserId): boolean {
  return state.status === 'active' && state.floor.holder === userId;
}

export function canStartRecording(state: ChannelState): boolean {
  return (
    state.status === 'active' &&
    state.recording.status === 'idle' &&
    atLeastTwoEverConnected(state)
  );
}

/**
 * Whether `userId` may bring `inviteeId` into the channel. Any current
 * participant may invite, up to the cap; whether the pair are contacts is the
 * server's to check before dispatching this.
 */
export function canInvite(
  state: ChannelState,
  userId: UserId,
  inviteeId: UserId
): boolean {
  return (
    state.status === 'active' &&
    isParticipant(state, userId) &&
    !isParticipant(state, inviteeId) &&
    state.participants.length < MAX_CHANNEL_PARTICIPANTS
  );
}

export function canPauseRecording(
  state: ChannelState,
  userId: UserId
): boolean {
  return (
    state.status === 'active' &&
    state.recording.status === 'recording' &&
    canPauseOrStopRecording(state.floor, userId)
  );
}

/** Resuming does not cut off the record, so it carries no floor restriction. */
export function canResumeRecording(state: ChannelState): boolean {
  return state.status === 'active' && state.recording.status === 'paused';
}

export function canStopRecording(state: ChannelState, userId: UserId): boolean {
  return (
    state.status === 'active' &&
    isRecordingActive(state.recording) &&
    canPauseOrStopRecording(state.floor, userId)
  );
}

/**
 * Whether `userId` may load, play, pause, seek, re-level or clear the shared
 * track.
 *
 * **A claim does not pause playback. It confers exclusive control of it.**
 *
 * The floor is not a device for hearing yourself over competing sound; it is
 * for being in control of what is heard, and a track playing to both parties is
 * squarely part of that. So a claim changes nothing about what the media is
 * doing and everything about who may change it.
 *
 * Being derived from `floor.holder` rather than stored is what makes it
 * self-correcting: control returns to both parties the instant a claim ends,
 * however it ends — released, run out after three minutes, or dropped when the
 * holder left — with nothing to keep in step.
 */
export function canControlPlayback(
  state: ChannelState,
  userId: UserId
): boolean {
  if (state.status !== 'active' || !isPresent(state, userId)) return false;
  return state.floor.holder === null || state.floor.holder === userId;
}

// --- Reducer ----------------------------------------------------------------

/**
 * Applies `action` at time `now`. Invalid actions are no-ops that return the
 * same state object, so callers can treat identity as "nothing happened".
 */
export function reduce(
  state: ChannelState,
  action: ChannelAction,
  now: number
): ChannelState {
  if (action.type === 'TICK') return tick(state, now);
  if (state.status !== 'active') return state;

  // Reported by the media plane rather than performed by anyone, so it carries
  // no actor to authorise and is not subject to the floor's restrictions —
  // including the one that withholds stop from a silenced party. Capture that
  // has failed has already stopped; refusing to say so helps nobody.
  // Transport reports, not user actions: no actor to authorise, and neither
  // changes presence on its own.
  if (action.type === 'CONNECTED') {
    if (!(action.userId in state.disconnectedAt)) return state;
    const { [action.userId]: _gone, ...rest } = state.disconnectedAt;
    return { ...state, disconnectedAt: rest };
  }

  if (action.type === 'DISCONNECTED') {
    // Only meaningful for someone actually in the channel, and a second report
    // must not restart the clock — that would make a flapping connection
    // survive indefinitely.
    if (!isPresent(state, action.userId)) return state;
    if (action.userId in state.disconnectedAt) return state;
    return {
      ...state,
      disconnectedAt: { ...state.disconnectedAt, [action.userId]: now },
    };
  }

  if (action.type === 'RECORDING_FAILED') {
    if (!isRecordingActive(state.recording)) return state;
    return {
      ...state,
      recording: failRecording(state.recording, action.reason, now),
    };
  }

  if (action.type === 'PLAYBACK_FAILED') {
    if (!state.playback.track) return state;
    return {
      ...state,
      playback: failPlayback(state.playback, action.reason, now),
    };
  }

  if (!isParticipant(state, action.userId)) return state;

  switch (action.type) {
    case 'ENTER': {
      if (isPresent(state, action.userId)) return state;
      // Entering is itself proof of a live connection, so any pending
      // disconnect clock for this user is cancelled.
      const { [action.userId]: _back, ...others } = state.disconnectedAt;
      return {
        ...state,
        disconnectedAt: others,
        present: [...state.present, action.userId],
        everPresent: state.everPresent.includes(action.userId)
          ? state.everPresent
          : [...state.everPresent, action.userId],
        // Re-entering while the empty-channel timer runs cancels it.
        emptySince: null,
      };
    }

    case 'LEAVE': {
      if (!isPresent(state, action.userId)) return state;
      const present = state.present.filter((id) => id !== action.userId);
      // Whatever they left by — a tap or a grace period running out — they are
      // no longer in the channel, so a pending disconnect clock is moot. Left
      // behind it would fire again on every tick.
      const { [action.userId]: _left, ...stillConnected } = state.disconnectedAt;
      return {
        ...state,
        present,
        disconnectedAt: stillConnected,
        // A departing floor-holder's claim is force-released, exactly as if
        // released voluntarily. Dropped connections take this same path.
        floor:
          state.floor.holder === action.userId
            ? releaseFloor(state.floor, now)
            : state.floor,
        emptySince: present.length === 0 ? now : null,
      };
    }

    case 'INVITE': {
      if (!canInvite(state, action.userId, action.inviteeId)) return state;
      return {
        ...state,
        participants: [...state.participants, action.inviteeId],
        invitedBy: { ...state.invitedBy, [action.inviteeId]: action.userId },
        selfMuted: { ...state.selfMuted, [action.inviteeId]: false },
      };
    }

    case 'END':
      // Any participant may end the channel at any time, present or not.
      return endChannel(state, 'explicit', now);

    case 'SET_NAME': {
      // Normalised here rather than at the edges so every caller — the server,
      // the UI's optimism, a test — agrees on what a given input names it.
      const trimmed = action.name.trim().slice(0, MAX_CHANNEL_NAME_LENGTH);
      const name = trimmed === '' ? null : trimmed;
      if (name === state.name) return state;
      return { ...state, name };
    }

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

    // Every playback action shares one guard, because they are all the same
    // kind of act: changing what the pair are listening to.
    case 'SET_TRACK':
    case 'CLEAR_TRACK':
    case 'PLAY':
    case 'PAUSE':
    case 'SEEK':
    case 'SET_VOLUME': {
      if (!canControlPlayback(state, action.userId)) return state;
      const playback = state.playback;
      switch (action.type) {
        case 'SET_TRACK':
          return { ...state, playback: setTrack(playback, action.track) };
        case 'CLEAR_TRACK':
          return { ...state, playback: clearTrack(playback) };
        case 'PLAY':
          return { ...state, playback: playPlayback(playback, now) };
        case 'PAUSE':
          return { ...state, playback: pausePlayback(playback, now) };
        case 'SEEK':
          return {
            ...state,
            playback: seekPlayback(playback, action.positionMs, now),
          };
        case 'SET_VOLUME':
          return { ...state, playback: setVolume(playback, action.volume) };
      }
    }

    default:
      return state;
  }
}

function tick(state: ChannelState, now: number): ChannelState {
  if (state.status !== 'active') return state;
  let next = state;

  // Someone gone past the grace period has left. Handled before the floor
  // expiry so their claim is released by the leave itself, as any other
  // departure would release it.
  for (const [userId, since] of Object.entries(next.disconnectedAt)) {
    if (since !== undefined && now - since >= DISCONNECT_GRACE_MS) {
      next = reduce(next, { type: 'LEAVE', userId }, now);
    }
  }

  // A claim that has run its three minutes releases automatically.
  if (hasExpired(next.floor, now)) {
    next = { ...next, floor: releaseFloor(next.floor, now) };
  }

  // A track that has run out comes to rest at its end. Without this the derived
  // position stays pinned at the duration while the status still says playing,
  // and the interface shows a track for ever playing its final instant.
  if (hasReachedEnd(next.playback, now)) {
    next = { ...next, playback: pausePlayback(next.playback, now) };
  }

  // An empty channel auto-ends after a minute. This timer only runs while
  // nobody is present, so a lone initiator can wait indefinitely.
  if (
    next.emptySince !== null &&
    now - next.emptySince >= EMPTY_SESSION_TIMEOUT_MS
  ) {
    next = endChannel(next, 'empty-timeout', now);
  }

  return next;
}

function endChannel(
  state: ChannelState,
  reason: ChannelEndReason,
  now: number
): ChannelState {
  return {
    ...state,
    status: 'ended',
    endedAt: now,
    endedReason: reason,
    present: [],
    emptySince: null,
    floor: releaseFloor(state.floor, now),
    // Recording runs until the channel itself ends, then finalizes.
    recording: isRecordingActive(state.recording)
      ? stopRecording(state.recording, now)
      : state.recording,
    // Playback comes to rest rather than being cleared: the final snapshot is
    // what a watcher sees explaining the channel ended, and a track vanishing
    // from it at the same moment reads as a second, unexplained event.
    playback: pausePlayback(state.playback, now),
  };
}

/** Milliseconds until an empty channel auto-ends, or null if it is not empty. */
export function emptyTimeoutRemainingMs(
  state: ChannelState,
  now: number
): number | null {
  if (state.status !== 'active' || state.emptySince === null) return null;
  return Math.max(0, EMPTY_SESSION_TIMEOUT_MS - (now - state.emptySince));
}
