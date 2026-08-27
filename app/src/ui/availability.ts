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
 * How long since anybody *but the reader* was in a channel, in words — "5
 * minutes ago", "a few seconds ago" — lower case so it can be the second half
 * of a sentence about an invitation.
 *
 * **The reader is left out, since 2026-08-26**, and that is the whole of what
 * changed. This used to read `lastPresenceAt`, the last moment anybody at all
 * was here — which counts you. Presence is exclusive, so stepping into a
 * channel to announce yourself and then stepping into the next one left the
 * first reading as the freshest thing on the screen, above a room two other
 * people had spent an hour in yesterday. The one where nothing happened sorted
 * first. What a reader scanning this list wants is what they missed, and they
 * did not miss themselves.
 *
 * It also makes the list answer "which of these are fresh only because of me?"
 * without a second number to compare against, which is what an earlier attempt
 * needed a setting for: those rows simply do not rise. What is *not* answered
 * that way is the opposite question — whether you have already called here —
 * because a number that has forgotten you cannot report you. That is
 * `steppedInAt` and a mark on the row, deliberately a different kind of thing.
 *
 * Not the same fact as the row being live, which is `presentCount > 0`: that is
 * *now* and a threshold of one, this is a *moment* and excludes one particular
 * person. They never draw at once — a row with anybody in it shows its count
 * instead of an interval — so this is only ever read about an empty room, which
 * is what makes the two impossible to contradict.
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
 * Three answers where there used to be two, because the new number is
 * null-capable and the old one was not. A moment is a moment. **Null is nobody
 * else, ever** — a channel a pair get for becoming contacts, or one only the
 * reader has opened — which is a fact and gets words rather than the room's own
 * number, that substitution being the exact thing this exists to stop.
 * **Undefined is a server that predates the field**, which is not a fact about
 * anybody: there the old number under its old meaning is far better than
 * telling somebody a channel they talk in every day has never held anyone but
 * them. That fallback is also what keeps the order identical against such a
 * server.
 *
 * Null-from-`lastPresenceAt` remains what it was — not-knowing, which only an
 * invitation can reach, and the caller drops the line.
 *
 * Shared by Home and the profile screen rather than written twice, for the
 * reason `describeAvailability` is: they are the same sentence about the same
 * fields, and the profile's copy had already drifted into saying only that the
 * channel was empty, which Home's row would have called five minutes ago.
 */
export function describeQuiet(
  channel: {
    everUsed?: boolean;
    lastPresenceByOthers?: number | null;
    lastPresenceAt?: number;
  },
  now: number
): string | null {
  if (channel.everUsed === false) return 'not used yet';
  if (channel.lastPresenceByOthers === null) return 'nobody else yet';
  if (channel.lastPresenceByOthers !== undefined) {
    return ago(now - channel.lastPresenceByOthers);
  }
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
