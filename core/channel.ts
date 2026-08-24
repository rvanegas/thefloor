import {
  DISCONNECT_GRACE_MS,
  MAX_CHANNEL_DESCRIPTION_LENGTH,
  MAX_CHANNEL_NAME_LENGTH,
  MAX_CHANNEL_PARTICIPANTS,
  MAX_CLIP_LENGTH,
  WAITING_WINDOW_MS,
} from './constants';
import {
  claimFloor,
  hasExpired,
  initialFloorState,
  isSilenced,
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
  failWatch,
  hasReachedEnd as watchHasReachedEnd,
  initialWatchState,
  learnDuration,
  partyWithholds,
  setPartyMute,
  startParty,
  stopParty,
  watchPause,
  watchPlay,
  watchSeek,
} from './watch';
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
import { inRoom, isGuest, roomOccupants } from './guests';
import type {
  ChannelAction,
  ChannelState,
  Guest,
  GuestId,
  UserId,
} from './types';

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
    guests: {},
    knocks: [],
    floor: initialFloorState(),
    selfMuted: Object.fromEntries(participants.map((p) => [p, false])),
    recording: initialRecordingState(),
    lastRecording: null,
    playback: initialPlaybackState(),
    watch: initialWatchState(),
    clip: null,
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
 * Whether the room is yours to change: you are in it, or nobody is.
 *
 * **The rule this states is that nobody reaches into a conversation they are
 * not in.** People talking to each other are entitled to be the ones who
 * decide what the channel is called, who is in it, who may get in, what is on
 * the clipboard and what is playing — without a member who is somewhere else
 * altogether renaming the place mid-sentence or letting a stranger's link out
 * into the world. Membership is standing over a channel; it is not standing
 * over an occupation of it.
 *
 * The second half is what keeps that from locking the absent out of their own
 * channel. An empty channel belongs to all of its members equally, and a
 * member who wants to set a track up before anybody arrives, tidy the
 * recordings or fix a typo in the description is interrupting nothing. So the
 * test is not presence — it is the absence of somebody else's conversation.
 *
 * `state.present` is members only, which is deliberate and is the reason this
 * is not written in terms of `roomOccupants`. It costs nothing today —
 * `settleEmpty` takes every guest out with the last member, so a room with no
 * member in it has nobody in it at all, and the two readings agree. What it
 * buys is that the rule says what it means: a conversation is people who
 * belong here talking, and a guest is somebody a member is answering for.
 *
 * `inRoom` rather than `isPresent` so that a guest satisfies it — the two
 * guards a guest is allowed through, the clipboard's, ask this directly.
 * Everything a guest must *not* reach says `isParticipant` beside it rather
 * than leaning on this one to do both jobs; see `canManageGuest`.
 *
 * What this does **not** govern is anything that is already about presence for
 * its own reasons — claiming the floor, self-mute, starting a recording,
 * answering the door — nor leaving, which is personal and always yours. See
 * planning/STATES.md.
 */
export function hasTheRoom(state: ChannelState, id: UserId): boolean {
  return state.present.length === 0 || inRoom(state, id);
}

/**
 * Whether `userId` may change the channel's name or its description.
 *
 * One guard for both because it is one question — what the place is called and
 * what it says about itself are the same kind of fact, written in the same
 * settings screen, and a rule that let you rename a channel you may not
 * describe would be arbitrary.
 *
 * This is the first thing the two actions have ever been guarded by. They
 * were reachable to any member from anywhere, on the reasoning that a
 * channel's name belongs to its members; what that missed is that it also
 * belongs to whoever is using it right now.
 */
export function canEditChannel(state: ChannelState, userId: UserId): boolean {
  return (
    state.status === 'active' &&
    isParticipant(state, userId) &&
    hasTheRoom(state, userId)
  );
}

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
  // The room rather than the roster, which is what lets a guest claim. The
  // floor is about who is talking, and a guest who has been given the
  // microphone is talking; it is also the one grant that was a decision rather
  // than an oversight, made when the capability list was rewritten.
  const room = roomOccupants(state);
  if (!inRoom(state, userId) || room.length < 2) return false;
  // Ranked against who is in the room, not who belongs to the channel: someone
  // who has left must not occupy the zero slot they cannot use.
  return satisfiesEligibilityRule(state.floor, room, userId, now);
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
    // The mirror of `canStartWatch`'s clause. A recording made while a watch
    // party is loaded would be missing the thing everybody was reacting to,
    // and nothing in the file would say so.
    state.watch.party === null &&
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
 * Whether `userId` may bring `inviteeId` into the channel, up to the cap.
 * Whether the pair are contacts is the server's to check before dispatching
 * this.
 *
 * `hasTheRoom` because an invitation lands in a conversation: the newcomer's
 * home screen lights up, and if they take it they walk into whatever is being
 * said. Widening a roster is the most ordinary of these acts and the easiest
 * to do absent-mindedly from a list of contacts, which is why it is governed
 * like the rest rather than trusted to tact.
 */
export function canInvite(
  state: ChannelState,
  userId: UserId,
  inviteeId: UserId
): boolean {
  return (
    state.status === 'active' &&
    isParticipant(state, userId) &&
    hasTheRoom(state, userId) &&
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
 * however it ends — released, run out at FLOOR_CLAIM_MS, or dropped when the
 * holder left — with nothing to keep in step.
 */
export function canControlPlayback(
  state: ChannelState,
  userId: UserId
): boolean {
  return holdsSharedControl(state, userId);
}

/**
 * Whether `userId` may change what the channel is attending to.
 *
 * Shared playback and the watch party ask the same question, so they ask it
 * once. Both are things the whole channel is given at once, and the floor
 * governs both by the same argument: a claim is not a device for hearing
 * yourself over competing sound, it is for being in control of what is
 * attended to.
 */
function holdsSharedControl(state: ChannelState, userId: UserId): boolean {
  if (state.status !== 'active') return false;
  // `isParticipant` where this used to read `isPresent`, and it is doing the
  // work that word used to: playback is not among GUEST_ACTIONS, and presence
  // was what quietly refused a guest it. `hasTheRoom` alone would let one
  // through, since a guest is always in the room.
  if (!isParticipant(state, userId) || !hasTheRoom(state, userId)) return false;
  return floorPermits(state, userId);
}

/**
 * Whether the floor leaves this person free to change what is attended to.
 *
 * The half of `holdsSharedControl` that is about the claim rather than about
 * where you are standing. Separate because the guards below take it in
 * different combinations, and a claim's effect on what is playing is one rule
 * wherever it is asked.
 */
function floorPermits(state: ChannelState, userId: UserId): boolean {
  return state.floor.holder === null || state.floor.holder === userId;
}

/**
 * Whether `userId` may put something new on — a track, or a video.
 *
 * **Presence, where driving what is already on asks only `hasTheRoom`.** The
 * one place the two shared features are stricter than the rest of the screen,
 * and it applies to both of them identically, which is the point: a channel
 * attends to one thing, and the rule for changing what that thing is should
 * not depend on which of the two it happens to be.
 *
 * `hasTheRoom` is true when nobody is present, deliberately — an empty channel
 * is nobody's conversation to interrupt. That reasoning covers *driving* what
 * is there: an absent member who stops a film somebody left running, or pauses
 * a track, is tidying up after a room that has gone home.
 *
 * It does not cover putting something new on, because that is not tidying and
 * it does not stay put. A party mutes the room by default and runs a clock; a
 * track loads and waits to be played. Either way what the next person to step
 * in walks into was chosen by somebody who is not there, and starting is the
 * moment that choice gets made. So starting is for whoever is in the room, and
 * everything else here is for whoever the room belongs to.
 *
 * Guests never reach this: `present` counts members only, the same reason
 * `hasTheRoom` is not written in terms of `roomOccupants`.
 */
function mayPutSomethingOn(state: ChannelState, userId: UserId): boolean {
  return holdsSharedControl(state, userId) && isPresent(state, userId);
}

/**
 * Whether `userId` may load a track for the channel to listen to.
 *
 * Asked at the upload route rather than in the reducer, `SET_TRACK` being the
 * one thing here a client cannot send — only the server knows where the file
 * landed and how long it really is. The rule is `START_WATCH`'s, and the two
 * are written as one call for that reason.
 */
export function canLoadTrack(state: ChannelState, userId: UserId): boolean {
  return mayPutSomethingOn(state, userId);
}

/**
 * Whether `userId` may open a follower screen on this channel's party.
 *
 * `hasTheRoom` and **not** the floor, which is the combination nothing else
 * uses. The floor is excluded because opening a screen of your own changes
 * nothing about what the channel is doing — somebody in the room whose floor
 * is held by another may still put the film on a laptop. The room is required
 * because the page is a live view of a conversation, and a channel with people
 * talking in it that you have not stepped into is one you are outside of on
 * every device you own.
 *
 * An empty channel is nobody's conversation, so a member may open a screen on
 * one before anybody arrives — which is close to the ordinary order of doing
 * this: open the screen, step in, choose the video.
 */
export function canOpenWatchScreen(
  state: ChannelState,
  userId: UserId
): boolean {
  if (state.status !== 'active') return false;
  return isParticipant(state, userId) && hasTheRoom(state, userId);
}

/**
 * Whether `userId` may drive the watch party's transport.
 *
 * The same rule as `canControlPlayback`, deliberately — see
 * `holdsSharedControl`. A claim confers control of the video without pausing
 * it: the film keeps running and stops being anybody else's to change.
 *
 * Starting one is `canStartWatch` and is stricter. **Stopping is here rather
 * than there**, which is the line `mayPutSomethingOn` draws: ending what
 * somebody left running is available to whoever the room belongs to.
 */
export function canControlWatch(
  state: ChannelState,
  userId: UserId
): boolean {
  return holdsSharedControl(state, userId);
}

/**
 * Whether `userId` may start a watch party.
 *
 * Being in the room — see `mayPutSomethingOn`, which `canLoadTrack` shares —
 * **and** no recording in progress. The two are mutually exclusive because a
 * party is watched on YouTube's own player with its own audio, which The Floor
 * never touches — so a recording made alongside one would be a recording of
 * people reacting to something it does not contain, and could not be made to
 * contain without extracting audio the terms forbid extracting.
 *
 * Refused rather than resolved in the party's favour: the alternative is that
 * one tap silently ends a run somebody may be speaking on the strength of.
 * `canStartRecording` carries the mirror clause, so both buttons grey with a
 * reason rather than either surprising anyone.
 */
export function canStartWatch(state: ChannelState, userId: UserId): boolean {
  return mayPutSomethingOn(state, userId) && state.recording.status === 'idle';
}

/**
 * Whether somebody has asked for the room to be quiet for this film.
 *
 * The *intent*, which outlives any pause. The interface reads this for the
 * toggle — a button that flipped itself back to "Mute the room" every time the
 * video paused would be a control fighting its owner.
 *
 * `?.` because a server older than the field sends snapshots without it, which
 * this build meets between its release and the deploy that follows.
 */
export function partyMuteRequested(state: ChannelState): boolean {
  return state.watch?.mutedAll === true;
}

/**
 * Whether the room's microphones are withheld **right now**.
 *
 * The intent and the transport together: a party mute holds while the video is
 * playing and lifts the moment it pauses, so pausing to talk about what you
 * are watching needs no second tap. Derived rather than stored, which is what
 * makes it self-correcting — there is no play or pause path that has to
 * remember to write it, and every route out of `playing` gives the room its
 * voice back for free: a video running out under `TICK`, a channel emptying
 * through `settleEmpty`, the party being stopped, the channel ending.
 *
 * A question about the room, so it takes no user — the difference from
 * `isSilenced`, and the reason the interface says it once under the roster
 * rather than on six cards. Six identical badges would say one thing six times
 * and imply it was six different facts.
 */
export function isPartyMuted(state: ChannelState): boolean {
  return state.watch ? partyWithholds(state.watch) : false;
}

/**
 * Whether this speaker's audio is withheld from everybody else.
 *
 * The one place the two reasons for withholding are combined, so that no
 * caller has to remember there are two. A claim withholds everybody but its
 * holder and confers control; a party mute withholds everybody and confers
 * nothing — **the holder included**, that being the point of muting a room
 * rather than taking the floor in it.
 *
 * Both ends read this: the server states subscriptions from it, and the app
 * closes its own microphone from it. That is what stops a device deciding it
 * is audible while the room has been told otherwise.
 */
export function isWithheld(state: ChannelState, speaker: UserId): boolean {
  if (isPartyMuted(state)) return true;
  return isSilenced(state.floor, speaker);
}

/**
 * Whether `userId` may put something on the channel's clipboard.
 *
 * `hasTheRoom`, not mere membership. A paste is an act in a conversation that
 * is happening — the reason the task calls it *in channel* — and someone who
 * has stepped out leaving something behind for the others to find later is a
 * message, which this deliberately is not. That reasoning is exactly why the
 * empty case is allowed: nothing is being reached into, so leaving a link on
 * an empty channel's clipboard is furnishing the room rather than talking.
 *
 * No floor restriction, unlike playback: a claim governs what is heard, and a
 * paste makes no sound.
 */
export function canPasteClip(state: ChannelState, userId: UserId): boolean {
  return state.status === 'active' && hasTheRoom(state, userId);
}

/**
 * Whether `userId` may empty the channel's clipboard.
 *
 * The same test as pasting, and deliberately not "only whoever pasted it".
 * There is one slot, so anybody present can already destroy what is there by
 * pasting over it; a clear that were narrower than a replace would protect
 * nothing.
 */
export function canClearClip(state: ChannelState, userId: UserId): boolean {
  return state.status === 'active' && hasTheRoom(state, userId);
}

/**
 * Whether `userId` may mint a link to this channel — and, at the server, may
 * revoke one.
 *
 * This read "membership, not presence" until 2026-08-22, on the reasoning that
 * minting is done from channel settings and a link is a fact about the channel
 * rather than an act in a conversation. The half of that which was true is
 * that a link admits nobody by itself: somebody in the room still has to
 * answer the door. The half that was wrong is that minting one is a decision
 * about who may walk into whatever is being said, taken by someone who is not
 * in it and cannot hear what that is.
 *
 * So it is `hasTheRoom` like the rest, and the empty case is what keeps it
 * from being a nuisance — handing somebody a link ahead of a conversation is
 * the normal way this is used, and there is nothing to interrupt.
 */
export function canInviteGuest(state: ChannelState, userId: UserId): boolean {
  return (
    state.status === 'active' &&
    isParticipant(state, userId) &&
    hasTheRoom(state, userId)
  );
}

/**
 * Whether `userId` may answer somebody at the door.
 *
 * Presence, and membership — a guest cannot let another guest in. That is what
 * keeps a link from being self-propagating: anybody with the address may
 * knock, and only somebody already in the room may open it.
 */
export function canAnswerKnock(state: ChannelState, userId: UserId): boolean {
  return state.status === 'active' && isPresent(state, userId);
}

/**
 * Whether `userId` may grant or withdraw a guest's microphone, or remove them.
 *
 * The same test for all three, and deliberately not "whoever admitted them".
 * A guest is in the room with everybody, so anybody in the room with them has
 * the standing to answer for what they may do — and a rule that named the
 * admitter would leave a channel unable to silence a guest the moment that one
 * person stepped out.
 *
 * `hasTheRoom` for the family's sake rather than for any behaviour: here it
 * collapses to plain presence, because the empty half of it can never be
 * reached with a guest in the state. `settleEmpty` takes every guest out when
 * the last member steps out — nobody may remain in a room with no member to
 * answer for them — so there is no such thing as a guest in an empty channel
 * to manage. It reads as the other six guards do, and if that invariant ever
 * changed this would already say the right thing.
 */
export function canManageGuest(
  state: ChannelState,
  userId: UserId,
  guestId: GuestId
): boolean {
  return (
    state.status === 'active' &&
    // Spelled out rather than left to GUEST_ACTIONS, which would also refuse
    // it: this is the rule that stops a link propagating itself, and it should
    // be readable here rather than inferred from a set two hundred lines away.
    // It is also what `hasTheRoom` cannot say on its own, a guest being in the
    // room by definition.
    isParticipant(state, userId) &&
    hasTheRoom(state, userId) &&
    isGuest(state, guestId)
  );
}

/**
 * The actions a guest may perform.
 *
 * A second lock rather than the only one: what refuses a guest everything else
 * is that they are not in `participants`, and every guard is written in those
 * terms. This exists because the reducer's membership check would otherwise
 * refuse them the handful of things they are meant to be able to do.
 *
 * Adding to it is a decision about what a stranger in the room may do. Note
 * what is not in it: recording, playback, invitations, the name, the
 * description, deleting anything, and answering the door.
 */
export const GUEST_ACTIONS: ReadonlySet<ChannelAction['type']> = new Set([
  'STEP_OUT',
  'CLAIM_FLOOR',
  'RELEASE_FLOOR',
  'SET_SELF_MUTE',
  'PASTE_CLIP',
  'CLEAR_CLIP',
  'REQUEST_SPEECH',
]);

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
    //
    // The room rather than the roster: a guest's connection flaps like
    // anybody's, and a guest dropped at the first stumble would be one who has
    // to knock again to get back into a conversation they are in the middle of.
    if (!inRoom(state, action.userId)) return state;
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

  // Handled here, above the membership check, for the reason the report above
  // it is: it carries no actor, being reported by whatever noticed rather than
  // performed by anybody.
  if (action.type === 'WATCH_FAILED') {
    if (!state.watch.party) return state;
    return { ...state, watch: failWatch(state.watch, action.reason, now) };
  }

  // Raised by the server rather than performed by anyone, exactly as the two
  // failure reports above are: a knock arrives over HTTP from somebody who is
  // by definition not in the channel, and admission is settled by a member
  // through ANSWER_KNOCK below.
  if (action.type === 'KNOCKED') {
    // Nobody to answer means nobody enters, and the page is told rather than
    // left waiting. Stated here as well as at the route, so that a knock
    // cannot survive the room emptying between the two.
    if (state.present.length === 0) return state;
    if (state.knocks.some((knock) => knock.id === action.knock.id)) return state;
    return { ...state, knocks: [...state.knocks, action.knock] };
  }

  if (action.type === 'GUEST_ENTERED') {
    // Same rule, and the reason it is repeated: a guest whose page reconnects
    // into a room everybody has left would otherwise be alone in a channel
    // they cannot be admitted to.
    if (state.present.length === 0) return state;
    return {
      ...state,
      guests: { ...state.guests, [action.guest.id]: action.guest },
      // Keyed on arrival rather than on admission, so a reconnection puts the
      // microphone back as they left it rather than as they were let in.
      selfMuted: { ...state.selfMuted, [action.guest.id]: false },
      // Arriving is proof of a live connection, as it is for a member.
      disconnectedAt: without(state.disconnectedAt, action.guest.id),
      lastActiveAt: now,
    };
  }

  if (action.type === 'GUEST_GONE') {
    return guestGone(state, action.guestId, now);
  }

  // Before the membership check, because a guest cannot be refused this one:
  // it carries an actor but nobody performs it — the tick raises it when a
  // connection outlives its grace — and a guest is exactly who it is most
  // often about. Left below the check it returned the state unchanged, and the
  // stale clock made the tick fire on it again, for ever.
  if (action.type === 'DISCONNECT_EXPIRED' && isGuest(state, action.userId)) {
    return guestGone(state, action.userId, now);
  }

  // The wall every prohibition in the guest design rests on. A guest is not a
  // participant, so this refuses them everything — including every action
  // written after this line, which is the property the design was chosen for.
  // What they may do is named once, in GUEST_ACTIONS.
  if (isGuest(state, action.userId)) {
    if (!GUEST_ACTIONS.has(action.type)) return state;
  } else if (!isParticipant(state, action.userId)) return state;

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

    case 'ANSWER_KNOCK': {
      if (!canAnswerKnock(state, action.userId)) return state;
      const answered = state.knocks.some((k) => k.id === action.knockId);
      if (!answered) return state;
      // Accepting and refusing do the same thing here, and that is not a
      // shortcut: what accepting *additionally* does is mint an identity and a
      // secret, which the reducer has no business generating. The server reads
      // its own answer back off this transition and admits them.
      return {
        ...state,
        knocks: state.knocks.filter((k) => k.id !== action.knockId),
      };
    }

    case 'SET_GUEST_SPEECH': {
      if (!canManageGuest(state, action.userId, action.guestId)) return state;
      const guest = state.guests[action.guestId];
      // An answer to a question nobody asked is still an answer, so a grant
      // out of the blue is allowed — but repeating one changes nothing, and a
      // no-op has to return the same object for `commit` to leave the media
      // plane alone.
      const request = action.maySpeak
        ? 'none'
        : guest.request === 'asking'
          ? 'refused'
          : guest.request;
      if (guest.maySpeak === action.maySpeak && guest.request === request) {
        return state;
      }
      return {
        ...state,
        guests: {
          ...state.guests,
          [action.guestId]: { ...guest, maySpeak: action.maySpeak, request },
        },
      };
    }

    case 'REQUEST_SPEECH': {
      const asking = state.guests[action.userId];
      // Members do not ask; they take. Nothing routes one here — the action is
      // in GUEST_ACTIONS and a member is refused it by the same check that
      // refuses guests everything else — but the reducer says so itself rather
      // than relying on that.
      if (!asking || asking.maySpeak || asking.request === 'asking') {
        return state;
      }
      return {
        ...state,
        guests: {
          ...state.guests,
          [action.userId]: { ...asking, request: 'asking' },
        },
      };
    }

    case 'EJECT_GUEST': {
      if (!canManageGuest(state, action.userId, action.guestId)) return state;
      return guestGone(state, action.guestId, now);
    }

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
      if (!canEditChannel(state, action.userId)) return state;
      // Normalised here rather than at the edges so every caller — the server,
      // the UI's optimism, a test — agrees on what a given input names it.
      const trimmed = action.name.trim().slice(0, MAX_CHANNEL_NAME_LENGTH);
      const name = trimmed === '' ? null : trimmed;
      if (name === state.name) return state;
      return { ...state, name };
    }

    case 'SET_DESCRIPTION': {
      if (!canEditChannel(state, action.userId)) return state;
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
          // Loading a track ends any party, the same way starting a party
          // clears any track. A channel attends to one thing, and mutual
          // replacement is what stops either button ever being dead.
          return {
            ...state,
            playback: setTrack(playback, action.track),
            watch: stopParty(),
          };
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

    case 'START_WATCH': {
      if (!canStartWatch(state, action.userId)) return state;
      return {
        ...state,
        watch: startParty({
          videoId: action.videoId,
          url: action.url,
          durationMs: null,
        }),
        // The other half of the mutual replacement `SET_TRACK` makes. The
        // server's media plane follows committed state, so this is the whole
        // of what tears the playback participant down — there is no
        // `applyWatchToMedia` and nothing here has to know there is a room.
        playback: clearTrack(state.playback),
      };
    }

    // The transport, which is one guard for the same reason playback's five
    // share one: they are all the same kind of act.
    case 'STOP_WATCH':
    case 'WATCH_PLAY':
    case 'WATCH_PAUSE':
    case 'WATCH_SEEK':
    case 'SET_WATCH_MUTE': {
      if (!canControlWatch(state, action.userId)) return state;
      const watch = state.watch;
      switch (action.type) {
        case 'STOP_WATCH':
          // `stopParty` returns the initial state, so the room's microphones
          // come back with the party's end. Nothing in the interface would
          // explain a mute that outlived the thing it was for.
          return { ...state, watch: stopParty() };
        case 'SET_WATCH_MUTE':
          // Note the two things that are *not* here. No write to `selfMuted`:
          // the two are separate states, and clearing this one restores each
          // person's own mute exactly as they left it, which is the whole
          // reason it is not implemented as muting everybody individually.
          // And nothing about the transport, because the mute only holds
          // while the video plays and that is derived — see `isPartyMuted`.
          // A play or pause that had to remember to write a mute would be a
          // pair of states to keep in step, and one of them would drift.
          return { ...state, watch: setPartyMute(watch, action.muted) };
        case 'WATCH_PLAY':
          return { ...state, watch: watchPlay(watch, now) };
        case 'WATCH_PAUSE':
          return { ...state, watch: watchPause(watch, now) };
        case 'WATCH_SEEK':
          return { ...state, watch: watchSeek(watch, action.positionMs, now) };
      }
    }

    case 'WATCH_READY': {
      // Being in the room and nothing more. A duration is a fact reported by
      // a player, not a control, and the floor has no business gating it —
      // the follower page of somebody who does not hold the floor is exactly
      // the one most likely to have loaded the video first.
      if (!isParticipant(state, action.userId)) return state;
      return { ...state, watch: learnDuration(state.watch, action.durationMs) };
    }

    case 'PASTE_CLIP': {
      if (!canPasteClip(state, action.userId)) return state;
      const text = action.clip.text;
      // Refused rather than trimmed to fit, which is what SET_NAME does with
      // an over-long name. A name that loses its end is still the channel's
      // name; half a URL is not a URL, and pasting it would be worse than
      // being told the paste did not happen.
      if (text.length === 0 || text.length > MAX_CLIP_LENGTH) return state;
      return { ...state, clip: action.clip };
    }

    case 'CLEAR_CLIP':
      if (!canClearClip(state, action.userId)) return state;
      if (state.clip === null) return state;
      return { ...state, clip: null };

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

  // A claim that has run its FLOOR_CLAIM_MS releases automatically.
  if (hasExpired(next.floor, now)) {
    next = { ...next, floor: releaseFloor(next.floor, now) };
  }

  // A track that has run out comes to rest at its end. Without this the derived
  // position stays pinned at the duration while the status still says playing,
  // and the interface shows a track for ever playing its final instant.
  if (hasReachedEnd(next.playback, now)) {
    next = { ...next, playback: pausePlayback(next.playback, now) };
  }

  // And a video that has, once a follower has told the channel how long it is.
  // Until one has there is nothing to compare against, so a party whose length
  // is unknown runs until somebody stops it.
  if (watchHasReachedEnd(next.watch, now)) {
    next = { ...next, watch: watchPause(next.watch, now) };
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
 * conversation; every way of leaving one ends it. See
 * planning/DECISIONS-2026-08-20-to-2026-08-21.md § *Every departure clears the
 * self-mute, and the microphone is not the reason why*.
 */
function stepOut(
  state: ChannelState,
  userId: UserId,
  now: number,
  { chosen = true }: { chosen?: boolean } = {}
): ChannelState {
  // A guest's departure is the same event and a different removal: they are
  // not in `present` and never were, and there is no membership for them to
  // keep on the way out.
  if (isGuest(state, userId)) return guestGone(state, userId, now);
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
 * Takes a guest out of the room, however they came to be out of it.
 *
 * Their seat in the database is untouched, which is the difference between
 * this and a member leaving: a member keeps their membership and gives up
 * presence, and a guest gives up presence and keeps a secret that will let
 * them back in until it expires. Ejection is the case where that is not true,
 * and `Guests.eject` is what makes it not true — by revoking, not by anything
 * here.
 *
 * A claim goes with them, exactly as it would for a member: whoever is left
 * must not be silenced by somebody who is no longer in the room.
 */
function guestGone(
  state: ChannelState,
  guestId: GuestId,
  now: number
): ChannelState {
  if (!(guestId in state.guests)) return state;
  const { [guestId]: _gone, ...guests } = state.guests;
  return {
    ...state,
    guests,
    selfMuted: without(state.selfMuted, guestId),
    disconnectedAt: without(state.disconnectedAt, guestId),
    lastActiveAt: now,
    floor:
      state.floor.holder === guestId
        ? releaseFloor(state.floor, now)
        : state.floor,
  };
}

/** One key removed, without mutating what it came from. */
function without<T>(map: Record<string, T>, key: string): Record<string, T> {
  if (!(key in map)) return map;
  const { [key]: _dropped, ...rest } = map;
  return rest;
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
  // **The guests go with the last member**, and this is the rule the whole
  // admission design rests on rather than a tidy-up: nobody may be admitted
  // without a member present to answer for them, so nobody may *remain* in a
  // room that has no member in it either. Without this, the last member
  // stepping out would leave a stranger alone in a channel — able to hear
  // whoever came back next, having been let in by somebody who has gone.
  //
  // Their seats end with it, in `Guests.channelEmptied`, which the server
  // calls on the same transition. The two say the same thing in the two places
  // that have to agree: this one so no screen shows a guest in an empty room,
  // that one so no secret reopens the door.
  state =
    Object.keys(state.guests).length > 0 || state.knocks.length > 0
      ? { ...state, guests: {}, knocks: [], floor: releaseFloor(state.floor, now) }
      : state;
  const paused =
    state.playback.status === 'playing'
      ? { ...state, playback: pausePlayback(state.playback, now) }
      : state;
  // **And so does a watch party**, on exactly the reasoning above: a film
  // running itself out for nobody is not shared watching, and whoever comes
  // back would find it twenty minutes further along than they left it.
  const settled =
    paused.watch.status === 'playing'
      ? { ...paused, watch: watchPause(paused.watch, now) }
      : paused;
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
    guests: {},
    knocks: [],
    floor: releaseFloor(state.floor, now),
    recording: initialRecordingState(),
    lastRecording: isRecordingActive(state.recording)
      ? (finishedRun(state.recording, now) ?? state.lastRecording)
      : state.lastRecording,
    // Playback comes to rest rather than being cleared: the final snapshot is
    // what a watcher sees explaining the channel ended, and a track vanishing
    // from it at the same moment reads as a second, unexplained event.
    playback: pausePlayback(state.playback, now),
    // Comes to rest rather than being cleared, for the reason playback does:
    // the final snapshot is what explains the channel ended, and a video
    // vanishing from it at the same moment reads as a second, unexplained
    // event.
    watch: watchPause(state.watch, now),
  };
}
