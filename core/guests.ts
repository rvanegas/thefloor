import type { ChannelState, GuestId, UserId } from './types';

/**
 * Who is in the room, as against who belongs to the channel.
 *
 * The distinction this file exists for: a guest is **not a participant**, so
 * every guard written in terms of `isParticipant` refuses them without being
 * told to — recording, invitations, the channel's name, its recordings, its
 * deletion. That is the whole security model, and it is why nothing here is
 * called `isMember`. What a guest *is* is present, and the handful of rules
 * that are about presence rather than membership ask these.
 *
 * Here rather than in `channel.ts` so that `micNeeded.ts` can ask the same
 * questions without importing the reducer.
 */

/**
 * Every one of these tolerates a snapshot with no `guests` at all, and that is
 * about the wire rather than about tidiness.
 *
 * `ChannelState` crosses the network: the app renders what the server sends,
 * and the two are deployed minutes to weeks apart. A client build that knows
 * about guests will meet a server that does not — every time a build is tested
 * against a box that has not been deployed yet — and the failure mode without
 * this is a crash on the channel screen rather than a channel with no guests
 * in it. See AGENTS.md on shipping a wire change to one end first.
 */
export function isGuest(state: ChannelState, id: UserId): boolean {
  return !!state.guests && id in state.guests;
}

/**
 * Everybody who can hear and be heard right now: present participants and
 * every admitted guest, in that order.
 *
 * The order matters only in that it is stable — the floor's claim ladder ranks
 * by when each person last spoke and ties by nothing, so a list that reordered
 * itself would move nobody's turn.
 */
export function roomOccupants(state: ChannelState): UserId[] {
  return [...state.present, ...Object.keys(state.guests ?? {})];
}

/**
 * Everybody the media plane may have been told something about: the whole
 * roster, present or not, and every guest.
 *
 * Wider than `roomOccupants` on purpose, and the difference is what the floor
 * costs when its holder walks out. A mute is a statement about a pair, and
 * undoing it means naming the same pair again — including a member who has
 * since stepped out, who is exactly who a released claim has to un-silence.
 * Narrowing this to who is in the room leaves their audio withheld from
 * everybody who is, and nothing later says otherwise.
 */
export function statedIdentities(state: ChannelState): UserId[] {
  return [...state.participants, ...Object.keys(state.guests ?? {})];
}

/** Whether this id — member or guest — is in the room right now. */
export function inRoom(state: ChannelState, id: UserId): boolean {
  return state.present.includes(id) || isGuest(state, id);
}

/**
 * Whether a guest has been granted the microphone.
 *
 * False for anybody who is not a guest, which is the answer that makes this
 * safe to ask about an id of unknown kind: it is about the grant, and members
 * do not have one. Ask `inRoom` first if what you meant was "may this person
 * speak at all".
 */
export function guestMaySpeak(state: ChannelState, id: GuestId): boolean {
  return state.guests?.[id]?.maySpeak === true;
}
