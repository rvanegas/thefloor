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

/**
 * Everybody in this room who could be publishing audio: the whole roster,
 * present or not, and only those guests holding the microphone.
 *
 * **The speaker axis of what the floor states, where `statedIdentities` is the
 * listener axis.** The two were the same list until 2026-09-03, and the
 * difference is a guest who is only listening. Their token carries
 * `canPublish: false`, so there is no track of theirs for a claim to withhold
 * from anybody, and every pair naming one as the speaker is a round trip to
 * the media plane that can only come back empty.
 *
 * Which is why the narrowing is worth a function rather than a filter at the
 * call site: silence is stated per *pair*, so the two axes multiply, and a
 * listener on both of them grows the product on both sides. Bounded here —
 * six participants and however many guests have been granted a microphone —
 * it keeps a claim linear in the size of an audience instead of quadratic.
 *
 * **Members who have stepped out stay**, for the same reason
 * `statedIdentities` keeps them: releasing a claim has to un-silence whoever
 * walked out under it, and undoing a statement means naming the same pair
 * again.
 *
 * This is what the reducer *permits*, not what the room is carrying. The
 * distinction is the division of labour the floor already rests on — the
 * transition is for latency and the reconciliation is for truth — so a grant
 * this has not caught up with is `reconcileSilence`'s to correct, against a
 * roster it measured rather than modelled.
 */
export function statedSpeakers(state: ChannelState): UserId[] {
  const speaking = Object.entries(state.guests ?? {})
    .filter(([, guest]) => guest.maySpeak)
    .map(([id]) => id);
  return [...state.participants, ...speaking];
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
