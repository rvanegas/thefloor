import { ago, agoOrNull } from './relativeTime';

/**
 * "In the app now", "Last seen 3 hours ago", or nothing.
 *
 * `inApp` is read first, because it is a fact where the line below it is an
 * inference. Somebody sitting in a channel for an hour is in the app, and the
 * timestamp in that snapshot is an hour old — nothing has been sent since,
 * because nothing needed to be. Subtracting it would report them as an hour
 * idle, which is the whole of what the old contact row got wrong.
 *
 * A gap under `agoOrNull`'s floor reads as here rather than as "a few seconds
 * ago". That floor is also what keeps a flapping connection steady: a tunnel
 * closes the socket, `inApp` goes false with a departure a moment old, and
 * without it every lift would show as somebody leaving.
 *
 * Null covers the four ways of not knowing, and none of them is worth a word:
 * a server that predates the fields, somebody who has not connected since they
 * existed, a reader who is not a contact — the server withholds it from them,
 * and a screen that said "unknown" would be reporting on the rule rather than
 * on the person — and an outgoing request, which is an address rather than a
 * person and whose occupancy is exactly what must not be revealed.
 *
 * Shared by the contact list and the profile screen rather than written twice.
 * They are the same sentence about the same two fields, and the version that
 * lived on Home's contact rows drifted from the one on the profile before
 * either had been touched twice.
 */
export function describeAvailability(
  who: { inApp?: boolean; lastSeenAt?: number | null } | null,
  now: number
): string | null {
  if (!who) return null;
  if (who.inApp) return 'In the app now';
  if (who.lastSeenAt == null) return null;
  const ago = agoOrNull(now - who.lastSeenAt);
  return ago ? `Last seen ${ago}` : 'In the app now';
}

/**
 * How long since anybody was in a channel, in words — "5 minutes ago", "a few
 * seconds ago" — lower case so it can be the second half of a sentence about
 * an invitation.
 *
 * The bare interval, with no "last here" in front of it. The line sits under a
 * channel's name in a list where every row says the same kind of thing, so the
 * words were carried by all of them to distinguish none, and they pushed the
 * number — the part being scanned for — off the front of the line.
 *
 * **No floor, unlike `describeAvailability`.** This used to fall back to
 * "nobody here right now" under `agoOrNull`'s minute, on the reasoning that a
 * channel somebody left forty seconds ago is one they have just left. But the
 * row already says nobody is here — that is why an interval is being drawn at
 * all, an occupied channel showing its count instead — so the phrase spent a
 * line restating the heading and then withheld the one fact it had. Every row
 * now answers the same question the same way, and "a few seconds ago" is the
 * honest bottom of the scale rather than a special case. The floor stays where
 * it earns its keep: a *person*'s gap is evidence about where they are, and
 * under a minute the answer is "here", which is a different fact rather than a
 * smaller number.
 *
 * Null is not-knowing, and is the one thing that must not be given a number: a
 * server that predates the stamp sends no key, and only an invitation can
 * reach here that way — a channel row falls back to `lastActiveAt`, which is
 * the same answer for every channel nobody is in. The caller drops the line.
 *
 * Shared by Home and the profile screen rather than written twice, for the
 * reason `describeAvailability` is: they are the same sentence about the same
 * fields, and the profile's copy had already drifted into saying only that the
 * channel was empty, which Home's row would have called five minutes ago.
 */
export function describeQuiet(
  channel: { everUsed?: boolean; lastPresenceAt?: number },
  now: number
): string | null {
  if (channel.everUsed === false) return 'not used yet';
  if (channel.lastPresenceAt === undefined) return null;
  return ago(now - channel.lastPresenceAt);
}

/**
 * Where one person has been in one channel — "Here now", "Last here 5 minutes
 * ago", "Never been here" — for a card on somebody's profile.
 *
 * A third sentence rather than a reuse of either of the two above, because it
 * is about a different subject and the words have to say so. `describeQuiet`
 * answers for the room and would report an afternoon two other people spent in
 * it as though it were theirs; `describeAvailability` answers for the person
 * but across the whole app, and "In the app now" on a channel card would be
 * read as "in this channel", which is exactly the thing it does not mean.
 *
 * `present` first, and the floor under the gap, for the same reason
 * `describeAvailability` has both: a present member's stamp is refreshed by a
 * heartbeat rather than at the moment it describes, so subtracting it reports
 * the age of the snapshot, and a connection flapping would otherwise show as
 * somebody leaving and coming back.
 *
 * Null is never one of the answers, unlike the other two. This is drawn from a
 * field the server either sent or did not, and the caller has already decided
 * what an absent field means — so by the time anything is being described here
 * there is a fact to describe, and "never" is a fact rather than a gap.
 */
export function describePresence(
  where: { present: boolean; lastPresentAt: number | null },
  now: number
): string {
  if (where.present) return 'Here now';
  if (where.lastPresentAt === null) return 'Never been here';
  const gap = agoOrNull(now - where.lastPresentAt);
  return gap ? `Last here ${gap}` : 'Here now';
}

/**
 * Capitalised, for the two places one of these lines stands alone rather than
 * ending a sentence somebody else began. Here rather than in either view, so
 * the profile and Home cannot disagree about the capital.
 */
export const sentence = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);
