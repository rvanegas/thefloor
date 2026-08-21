import {
  DISCONNECT_GRACE_MS,
  MAX_CHANNEL_DESCRIPTION_LENGTH,
  MAX_CHANNEL_NAME_LENGTH,
  MAX_CHANNEL_PARTICIPANTS,
  WAITING_WINDOW_MS,
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
  finishedRun,
  initialRecordingState,
  isRecordingActive,
  pauseRecording,
  resumeRecording,
  startRecording,
  stopRecording,
} from './recording';
import type { ChannelAction, ChannelState, UserId } from './types';

export function createChannel(params: {
  id: string;
  initiator: UserId;
  invitees: UserId[];
  now: number;
  /**
   * The audio to open in. Defaults to the channel's own id, which is what a
   * channel started from nothing wants; a channel created to receive a moving
   * conversation is handed the room those people are already talking in, so
   * that arriving costs them no reconnection.
   */
  mediaRoom?: string;
  /**
   * Who is in it the moment it exists. Defaults to the initiator alone, which
   * is what starting a channel means — you are in it, waiting.
   *
   * A channel created to receive a conversation that is moving is the other
   * case: the people walking in are whoever was standing in the channel being
   * left, which is not everybody who belongs and need not include whoever the
   * conversation began with.
   */
  present?: UserId[];
}): ChannelState {
  const { id, initiator, invitees, now } = params;
  const participants = [initiator, ...invitees];
  // Structural violations, not policy ones: the caller was supposed to have
  // validated the roster, so a bad one here is a bug worth failing loudly on.
  //
  // An empty `invitees` is *not* one of them. A channel of one person is the
  // ordinary way to start one now — you open it and invite from inside — and
  // the rest of the model already answers for that shape: `canDeleteChannel`
  // is the last member's, `canLeaveChannel` is not, and `describeChannel([])`
  // says "Just you".
  if (new Set(participants).size !== participants.length) {
    throw new Error('A channel cannot hold the same person twice.');
  }
  if (participants.length > MAX_CHANNEL_PARTICIPANTS) {
    throw new Error(`A channel holds at most ${MAX_CHANNEL_PARTICIPANTS} people.`);
  }
  const present = params.present ?? [initiator];
  if (present.some((id) => !participants.includes(id))) {
    throw new Error('A channel cannot open with someone who does not belong.');
  }
  return {
    id,
    mediaRoom: params.mediaRoom ?? id,
    name: null,
    description: null,
    initiator,
    participants,
    invitedBy: Object.fromEntries(invitees.map((i) => [i, initiator])),
    createdAt: now,
    lastActiveAt: now,
    status: 'active',
    endedAt: null,
    // Creating a channel is entering it: the initiator is present immediately
    // and waits there for as long as it takes anyone else to join.
    present,
    // Identical to `present` rather than to the roster: having been here is
    // what separates a channel you have opened from one you were added to,
    // and everyone else has still only been added.
    everPresent: present,
    floor: initialFloorState(),
    selfMuted: Object.fromEntries(participants.map((p) => [p, false])),
    recording: initialRecordingState(),
    lastRecording: null,
    playback: initialPlaybackState(),
    waiting: [],
    disconnectedAt: {},
    lastPresentAt: {},
  };
}

export function isParticipant(state: ChannelState, userId: UserId): boolean {
  return state.participants.includes(userId);
}

/**
 * Whether anybody has named this channel.
 *
 * A named channel is a place: it has a name its members say to each other, and
 * it keeps its recordings under that name. An unnamed one is described by its
 * roster instead — see `describeChannel` — so what it is called changes as
 * people join and leave.
 *
 * This used to be the one distinction deciding what an invitation does, a
 * named channel taking newcomers in and an unnamed one moving the conversation
 * to a wider set. It no longer decides anything about `INVITE`: both widen.
 * What survives is that **only `create` still refuses to make a second unnamed
 * channel for a set of people** — two would be indistinguishable on Home, both
 * rendered as the same list of names. Widening can produce such a pair anyway,
 * and that is accepted; what is avoided is a button that makes one per tap.
 */
export function isNamed(state: ChannelState): boolean {
  return state.name !== null;
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
 * How long it is since anything was heard from this user in this channel, or
 * null when that is not a question with an answer.
 *
 * Null covers two cases deliberately, neither of them a duration: they are
 * here now, or nothing has ever been heard from them here. The caller shows
 * nothing for both rather than guessing at one.
 *
 * A restart is no longer one of them. `lastPresentAt` is refreshed by
 * STILL_HERE while somebody is present, so what survives a restart is the last
 * heartbeat before it — which is the honest answer to how long it is since
 * anybody heard from them, and self-corrects the moment they reconnect.
 *
 * Clamped at zero. A client computes this against the server's clock, which it
 * learns with a round trip's lag, so a departure a moment ago can arrive as a
 * small negative — and "in -2 seconds" is the kind of thing that reaches a
 * screen exactly once and is remembered for years.
 */
export function idleMs(
  state: ChannelState,
  userId: UserId,
  now: number
): number | null {
  if (isPresent(state, userId)) return null;
  const since = state.lastPresentAt[userId];
  return since === undefined ? null : Math.max(0, now - since);
}

/**
 * Whether somebody is still to be described as waiting rather than as gone.
 *
 * Three things at once, and all three matter. They are not here — somebody
 * present is not waiting for anything. Their absence was not chosen, which is
 * what `waiting` records. And it is recent enough to still mean something,
 * which is WAITING_WINDOW_MS.
 *
 * A function rather than a field so that the window is applied in one place
 * and cannot be forgotten by a caller reading the array directly — the array
 * outlives the window on purpose, there being no tick worth spending to prune
 * a set whose only reader already has the clock in its hand.
 */
export function isWaiting(
  state: ChannelState,
  userId: UserId,
  now: number
): boolean {
  if (!state.waiting.includes(userId)) return false;
  const away = idleMs(state, userId, now);
  return away !== null && away < WAITING_WINDOW_MS;
}

/**
 * The most recent moment anybody is known to have been in this channel —
 * which is what a channel's idleness is measured from.
 *
 * `idleMs` above answers this about one person; this answers it about the
 * room, and is the *maximum* rather than the minimum because a channel is as
 * idle as its least idle member. Somebody who wandered off a week ago says
 * nothing about a room two other people were in an hour ago.
 *
 * Always a number, never null, which is the difference from `idleMs`. Two
 * kinds of fact feed it and one of them is always there: the `lastPresentAt`
 * stamps, and `lastActiveAt`, which is set on creation and on every entry and
 * exit and so is itself a moment somebody was here. Taking the maximum across
 * both kinds is not belt and braces — persisted stamps are floored to the minute
 * (`quantise`, in the server), so after a restart the exit stamp in
 * `lastActiveAt` can be the fresher evidence of the very same departure.
 *
 * While anybody is present this reads as roughly now, STILL_HERE refreshing a
 * present member's stamp every few seconds. So a caller does not have to
 * special-case an occupied channel to keep it out of the idle end of a list —
 * though `presentCount` is the fact to *show*, this being an inference.
 */
export function lastPresenceAt(state: ChannelState): number {
  let latest = state.lastActiveAt;
  for (const at of Object.values(state.lastPresentAt)) {
    if (at !== undefined && at > latest) latest = at;
  }
  return latest;
}

/**
 * Whether there is anyone to talk to. The generalisation of "both present":
 * the floor means nothing to someone alone in the channel.
 */
export function atLeastTwoPresent(state: ChannelState): boolean {
  return state.present.length >= 2;
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

/**
 * Self-mute is unilateral and unlimited, with one exception: the floor-holder.
 *
 * Claiming the floor is asking everyone else to be silent so you can speak, and
 * a claimant who is muted has cut every microphone in the channel including
 * their own. That is not a state anybody means to be in, so a claim clears the
 * claimant's mute (in the reducer) and this refuses to put it back until they
 * release. The way to stop talking is to release the floor, which costs nothing
 * and gives it back to the room.
 *
 * The silenced are *not* covered: their mute does nothing while somebody else
 * holds the floor, but it is theirs to set, and it is what they will be left
 * with when the claim ends.
 */
export function canSetSelfMute(
  state: ChannelState,
  userId: UserId,
  muted: boolean
): boolean {
  // Only muting is refused. Unmuting is always allowed, and is a no-op for a
  // holder who is already unmuted.
  return !muted || state.floor.holder !== userId;
}

/**
 * Recording needs the person starting it to be **present**, and nothing more.
 *
 * One person alone may record — a channel is a place you can talk into before
 * anyone else arrives, and a note to yourself is a use rather than a mistake.
 *
 * Presence, though, is required, and it is the same condition at both ends: a
 * run starts only while somebody is here and stops the moment nobody is. It
 * used to read `everPresent` — "have two ever connected" — which was nearly
 * the same claim as "are two here" while a channel lasted minutes, but which
 * never decays, so in a permanent channel it would let someone record an empty
 * room months later on the strength of a conversation that once happened in
 * it. Requiring the actor rather than merely a head count also means nobody
 * can start recording a room they are not in.
 */
export function canStartRecording(
  state: ChannelState,
  userId: UserId
): boolean {
  return (
    state.status === 'active' &&
    state.recording.status === 'idle' &&
    isPresent(state, userId)
  );
}

/**
 * Whether `userId` may give up membership. Anyone in the channel may, at any
 * time, present or not — and when the last one does, the channel ends.
 */
export function canLeaveChannel(state: ChannelState, userId: UserId): boolean {
  return (
    state.status === 'active' &&
    isParticipant(state, userId) &&
    // The last member cannot leave — there would be nobody to leave it *to*.
    // What that tap does is destroy the channel and everything recorded in it,
    // so it is a different action with a different name, and the interface says
    // so in the same place rather than hiding the difference behind one word.
    state.participants.length > 1
  );
}

/**
 * Whether `userId` may delete the channel outright.
 *
 * Only its last member, and only because there is nobody left to disagree.
 * Deleting is not leaving with an extra consequence: it ends the channel for
 * good and takes every recording made in it, which is why the two are separate
 * actions rather than one that behaves differently depending on the roster.
 */
export function canDeleteChannel(state: ChannelState, userId: UserId): boolean {
  return (
    state.status === 'active' &&
    isParticipant(state, userId) &&
    state.participants.length === 1
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

  // Evidence rather than an event, and the only thing that keeps
  // `lastPresentAt` true for somebody who is here and saying nothing. Guarded
  // on presence, not membership: a socket watching a channel its owner has
  // stepped out of is still sending heartbeats, and letting those land would
  // overwrite the departure with a stream of proof that they are gone.
  if (action.type === 'STILL_HERE') {
    if (!isPresent(state, action.userId)) return state;
    return {
      ...state,
      lastPresentAt: { ...state.lastPresentAt, [action.userId]: now },
    };
  }

  if (action.type === 'RECORDING_FAILED') {
    if (!isRecordingActive(state.recording)) return state;
    return {
      ...state,
      recording: failRecording(state.recording, action.reason, now),
      lastRecording:
        finishedRun(state.recording, now, action.reason) ?? state.lastRecording,
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
        lastActiveAt: now,
        // And proof of a live connection is what `lastPresentAt` records, so
        // entering stamps it. In the server this is usually redundant —
        // `stillHere` fires on every message a socket carries — but not always:
        // `create` dispatches ENTER from an HTTP request that has no socket at
        // all, and a phone can die between entering and its first heartbeat.
        //
        // Without it those cases had no stamp, `idleMs` answered null, and the
        // roster rendered a bare "Stepped out" with no time under it — a
        // departure asserted with nothing behind it, about somebody who had
        // just walked in. A missing socket is not evidence of leaving, which
        // is the rule; it is not a reason to discard evidence of arriving,
        // which is what this is.
        lastPresentAt: { ...state.lastPresentAt, [action.userId]: now },
        // Whatever they were waiting for, they have stopped: they are here.
        waiting: state.waiting.filter((id) => id !== action.userId),
        present: [...state.present, action.userId],
        everPresent: state.everPresent.includes(action.userId)
          ? state.everPresent
          : [...state.everPresent, action.userId],
      };
    }

    case 'STEP_OUT':
      // The mute is cleared inside `stepOut`, which every departure goes
      // through — see there for why it is no longer this case's business.
      return stepOut(state, action.userId, now);

    case 'DISCONNECT_EXPIRED':
      return stepOut(state, action.userId, now, { chosen: false });

    case 'INVITE': {
      if (!canInvite(state, action.userId, action.inviteeId)) return state;

      // One path, whether or not the channel has a name. An unnamed channel
      // used to refuse to widen and move the conversation elsewhere instead;
      // see the action's doc comment in types.ts for why that was undone.
      return {
        ...state,
        participants: [...state.participants, action.inviteeId],
        invitedBy: { ...state.invitedBy, [action.inviteeId]: action.userId },
        selfMuted: { ...state.selfMuted, [action.inviteeId]: false },
      };
    }

    case 'LEAVE_CHANNEL': {
      if (!canLeaveChannel(state, action.userId)) return state;

      // Stepping out first, through the same path a tap takes, so a departing
      // floor-holder releases the floor and an emptied channel stops its
      // recording — one route rather than two that have to agree. It also
      // settles the ordering hazard: the last member leaving mid-recording
      // ends the *run* before the channel ends.
      const gone = stepOut(state, action.userId, now);

      const participants = gone.participants.filter(
        (id) => id !== action.userId
      );
      const { [action.userId]: _muted, ...selfMuted } = gone.selfMuted;
      const { [action.userId]: _invited, ...invitedBy } = gone.invitedBy;
      const { [action.userId]: _claimed, ...lastClaimedAt } =
        gone.floor.lastClaimedAt;

      const next: ChannelState = {
        ...gone,
        participants,
        selfMuted,
        invitedBy,
        everPresent: gone.everPresent.filter((id) => id !== action.userId),
        // Dropped for tidiness rather than necessity: claimDelayMs ranks only
        // people who are present, so a stale entry could never strand the
        // floor. Removing it keeps the record honest.
        floor: { ...gone.floor, lastClaimedAt },
      };

      // Never zero: the last member cannot reach this action at all. Kept as an
      // assertion rather than a branch — if the guard above ever stops holding,
      // a channel with no members must still not survive.
      return participants.length === 0 ? endChannel(next, now) : next;
    }

    case 'DELETE_CHANNEL': {
      if (!canDeleteChannel(state, action.userId)) return state;
      // The same ending its last member's departure used to produce, reached
      // deliberately. What is new is downstream: the server marks the channel
      // and its recordings for deletion, and a sweep removes them a week later.
      return endChannel(
        { ...stepOut(state, action.userId, now), participants: [] },
        now
      );
    }

    case 'SET_NAME': {
      // Normalised here rather than at the edges so every caller — the server,
      // the UI's optimism, a test — agrees on what a given input names it.
      const trimmed = action.name.trim().slice(0, MAX_CHANNEL_NAME_LENGTH);
      const name = trimmed === '' ? null : trimmed;
      if (name === state.name) return state;
      return { ...state, name };
    }

    case 'SET_DESCRIPTION': {
      // Trimmed at the ends but not within: the interior of a description is
      // Markdown, where a blank line separates paragraphs and two trailing
      // spaces force a break. Collapsing that would rewrite what somebody
      // wrote.
      const trimmed = action.description
        .trim()
        .slice(0, MAX_CHANNEL_DESCRIPTION_LENGTH);
      const description = trimmed === '' ? null : trimmed;
      if (description === state.description) return state;
      return { ...state, description };
    }

    case 'CLAIM_FLOOR': {
      if (!canClaimFloor(state, action.userId, now)) return state;
      // A claim unmutes the claimant. Nobody claims the floor in order to stay
      // silent, and a muted holder is the one configuration in which the whole
      // channel is inaudible — see `canSetSelfMute`, which then holds them
      // there until they release.
      return {
        ...state,
        floor: claimFloor(state.floor, action.userId, now),
        selfMuted: { ...state.selfMuted, [action.userId]: false },
      };
    }

    case 'RELEASE_FLOOR': {
      if (!canReleaseFloor(state, action.userId)) return state;
      return { ...state, floor: releaseFloor(state.floor, now) };
    }

    case 'SET_SELF_MUTE':
      // Unilateral, unlimited, and with no bearing on floor eligibility —
      // except that the floor-holder may not mute themselves.
      if (!canSetSelfMute(state, action.userId, action.muted)) return state;
      return {
        ...state,
        selfMuted: { ...state.selfMuted, [action.userId]: action.muted },
      };

    case 'START_RECORDING': {
      if (!canStartRecording(state, action.userId)) return state;
      return {
        ...state,
        recording: startRecording(state.recording, action.runId, now),
      };
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
      return endRun(state, now);
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
  // departure would release it. Not STEP_OUT: that is the departure somebody
  // chose, and `chosen` decides which clocks are stamped — `lastPresentAt` and
  // `waiting`. Nothing else now distinguishes the two.
  for (const [userId, since] of Object.entries(next.disconnectedAt)) {
    if (since !== undefined && now - since >= DISCONNECT_GRACE_MS) {
      next = reduce(next, { type: 'DISCONNECT_EXPIRED', userId }, now);
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

  // Nothing here ends a channel. A channel outlives every silence in it and
  // is destroyed only when the last member leaves.
  return next;
}

/**
 * Gives up presence without giving up membership.
 *
 * Shared by the tap, by a grace period running out, and by LEAVE_CHANNEL,
 * which is what stops those three drifting apart.
 *
 * `chosen` is the one thing the three do not share, and it is now about
 * clocks alone. A tap happens at the moment somebody decides it does; a grace
 * period running out happens DISCONNECT_GRACE_MS *after* the last thing
 * anybody heard, and stamping `lastPresentAt` then would record a presence
 * that was already over — see below, where the difference is the whole of it.
 *
 * It used to carry the self-mute too: a tap cleared it and a lost connection
 * kept it, on the reasoning that the client re-enters by itself and clearing
 * the mute would hand back a live microphone nobody asked for. That rule is
 * gone as of 2026-08-21, because the state it produced could not be described
 * — the roster said "Stepped out 2 hours ago · muted" about somebody who was
 * both absent and, apparently, doing something. A mute belongs to a
 * conversation; every way of leaving one ends it. See DECISIONS.md § *Every
 * departure clears the self-mute, and the microphone is not the reason why*.
 */
function stepOut(
  state: ChannelState,
  userId: UserId,
  now: number,
  { chosen = true }: { chosen?: boolean } = {}
): ChannelState {
  if (!isPresent(state, userId)) return state;
  const present = state.present.filter((id) => id !== userId);
  // However they went — a tap or a grace period running out — they are no
  // longer present, so a pending disconnect clock is moot. Left behind it
  // would fire again on every tick.
  const { [userId]: _left, ...stillConnected } = state.disconnectedAt;

  return settleEmpty(
    {
      ...state,
      present,
      // Stamped on the way out as well as the way in, so an emptied channel
      // is ordered by when it emptied rather than by when it was entered.
      lastActiveAt: now,
      disconnectedAt: stillConnected,
      // The last observation of them. Every deliberate way out passes through
      // here — a tap, and leaving the channel outright — which is the reason to
      // stamp it here rather than in each of those cases.
      //
      // **A connection that expired does not stamp it**, and that is a
      // correction rather than an omission. `stillHere` is called from the
      // transport on every message received, not from the tick, so when a
      // phone goes quiet this value stops by itself at the last thing anybody
      // actually heard. Re-stamping at the moment the grace timer fires
      // overwrote that honest value with one a whole DISCONNECT_GRACE_MS
      // later, and `idleMs` reads it — so every dropped connection reported
      // itself a minute less idle than it was, for ever, from a stamp made at
      // a moment nobody was there.
      lastPresentAt: chosen
        ? { ...state.lastPresentAt, [userId]: now }
        : state.lastPresentAt,
      // The same distinction, kept rather than merely acted on. A tap is a
      // departure and clears any earlier wait; a grace period running out is
      // not one, and is the whole reason this exists.
      waiting: chosen
        ? state.waiting.filter((id) => id !== userId)
        : state.waiting.includes(userId)
          ? state.waiting
          : [...state.waiting, userId],
      // A departing floor-holder's claim is force-released, exactly as if
      // released voluntarily. Dropped connections take this same path.
      floor:
        state.floor.holder === userId
          ? releaseFloor(state.floor, now)
          : state.floor,
      // And so does the microphone: leaving puts it back as you found it,
      // however you left. A mute is a thing you do *during* a conversation —
      // to cough, to type, to talk to somebody in the room you are actually in
      // — so it is scoped to the conversation, and a departure is the end of
      // one whether or not anybody chose it. Carried across, it stops being an
      // action and becomes a setting: you come back inaudible on a decision
      // you made an hour ago and have no cause to remember, and nothing on the
      // way in says why.
      //
      // The re-entry this opens is the point rather than a cost of it. What it
      // does *not* open is a microphone in a pocket — see `microphoneNeeded`,
      // which stays shut until somebody else is present or a recording you
      // started is running. DECISIONS.md carries the case that was traded away.
      selfMuted: { ...state.selfMuted, [userId]: false },
    },
    now
  );
}

/**
 * What being empty costs, applied wherever `present` may have just emptied.
 *
 * **A recording stops when the last person leaves.** Capture needs somebody
 * to capture, and until channels became permanent this happened for free —
 * the empty-channel timer ended the channel a minute later and `endChannel`
 * stopped the recording on its way out. With no such timer, a run left going
 * would record silence until somebody came back, billing an egress per
 * speaker per minute the whole time.
 *
 * **Playback pauses too**, for the weaker reason that music nobody is in the
 * room to hear is not shared listening — it is a track running itself out, so
 * that whoever comes back finds it minutes further along than they left it.
 * Paused rather than cleared: the position survives, and Play picks up where
 * the music was.
 *
 * Nothing resumes on the way back in. That would take remembering *why*
 * playback paused, which `playback.ts` deliberately does not record, and a
 * channel that starts making noise at whoever steps in is worse than a press
 * of Play. Coming back to a paused track is the same thing anyone leaving the
 * track paused would have left behind.
 *
 * It lives in the reducer rather than the registry so that a guard and a
 * control cannot disagree: the interface reads `recording.status` to decide
 * what to show, and a stop applied only on the media plane would leave the
 * screen asserting a recording that had already stopped. The same holds for
 * playback, where the server's media plane follows committed state — see
 * `applyPlaybackToMedia`.
 */
function settleEmpty(state: ChannelState, now: number): ChannelState {
  if (state.present.length > 0) return state;
  const settled =
    state.playback.status === 'playing'
      ? { ...state, playback: pausePlayback(state.playback, now) }
      : state;
  if (!isRecordingActive(settled.recording)) return settled;
  return endRun(settled, now);
}

/**
 * Ends the run in progress and returns the channel to idle, so another may be
 * started straight away. What was captured becomes `lastRecording`, which is
 * both what the interface reports and what tells the server there is a run to
 * file.
 */
function endRun(state: ChannelState, now: number): ChannelState {
  return {
    ...state,
    recording: stopRecording(state.recording, now),
    lastRecording: finishedRun(state.recording, now) ?? state.lastRecording,
  };
}

/**
 * The end of a channel, reached only by its last member leaving.
 *
 * Note what this is *not*: it does not delete anything. The channel keeps its
 * row and its recordings keep pointing at it — `recordings.channel_id` is a
 * real foreign key — so "the channel is destroyed" means it stops being
 * anyone's, not that it stops existing.
 */
function endChannel(state: ChannelState, now: number): ChannelState {
  return {
    ...state,
    status: 'ended',
    endedAt: now,
    present: [],
    floor: releaseFloor(state.floor, now),
    recording: initialRecordingState(),
    lastRecording: isRecordingActive(state.recording)
      ? (finishedRun(state.recording, now) ?? state.lastRecording)
      : state.lastRecording,
    // Playback comes to rest rather than being cleared: the final snapshot is
    // what a watcher sees explaining the channel ended, and a track vanishing
    // from it at the same moment reads as a second, unexplained event.
    playback: pausePlayback(state.playback, now),
  };
}
