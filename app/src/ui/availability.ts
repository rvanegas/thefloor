import type { Strings } from '../i18n';
import { ago, agoOrNull } from './relativeTime';

/**
 * The words these three sentences are built from.
 *
 * **Passed in rather than read from the context, because none of these is a
 * component.** They are pure functions over a snapshot and a clock, tested as
 * such, and a hook inside one would make it a thing only React can call. The
 * views hold the hook and hand the group down, which is the same arrangement
 * `core/naming.ts` uses for the same reason.
 */
type Words = Strings['availability'];

/**
 * "In the app now", "Last seen 3 hours ago", or nothing.
 *
 * `inApp` is read first, because it is a fact where the line below it is an
 * inference. Somebody sitting in a channel for an hour is in the app, and the
 * timestamp in that snapshot is an hour old — nothing has been sent since,
 * because nothing needed to be. Subtracting it would report them as an hour
 * idle, which is the whole of what the old contact row got wrong.
 *
 * **Both fields come off one clock, and since 2026-09-25 it is attention.**
 * `inApp` was a socket, and said *In the app now* about a desktop client left
 * open on a machine nobody was sitting at; `lastSeenAt` was a heartbeat, which
 * is the same lie told as a number. The two could not be corrected separately:
 * the floor below returns *In the app now* for any gap under a minute, and a
 * heartbeat keeps the gap under a minute for as long as the machine is awake —
 * so narrowing the boolean alone would have changed nothing on this screen. See
 * `ContactView.inApp`.
 *
 * A gap under `agoOrNull`'s floor reads as here rather than as "a few seconds
 * ago", and it is now the *only* thing that can produce that sentence from the
 * second branch. That floor is also what keeps a flapping connection steady: a
 * tunnel closes the socket, `inApp` goes false with a stamp a moment old, and
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
  now: number,
  words: Words
): string | null {
  if (!who) return null;
  if (who.inApp) return words.inTheAppNow();
  if (who.lastSeenAt == null) return null;
  const ago = agoOrNull(now - who.lastSeenAt);
  return ago ? words.lastSeen(ago) : words.inTheAppNow();
}

/**
 * How long since anybody was in a channel, in words — "5 minutes ago", "a few
 * seconds ago" — lower case so it can be the second half of a sentence about an
 * invitation.
 *
 * **The room's own number, the reader included, since 2026-11-12**, so every
 * member reading the same channel sees the same interval. From 2026-08-26 it
 * read `lastPresenceByOthers` instead, the reader taken out, on the argument
 * that what somebody scanning this list wants is what they missed; that made
 * the line a different claim for each person reading it, and a room you had
 * just left read as days old to you and as a minute old to everybody else.
 * decision/2026-11-12-everybody-sees-the-same-recency.md has the trade.
 *
 * Not the same fact as the row being live, which is `presentCount > 0`: that is
 * *now* and a threshold of one, this is a *moment*. They never draw at once — a
 * row with anybody in it shows its count instead of an interval — so this is
 * only ever read about an empty room, which is what makes the two impossible to
 * contradict.
 *
 * The bare interval, with no "last here" in front of it. The line sits under a
 * channel's name in a list where every row says the same kind of thing, so the
 * words were carried by all of them to distinguish none, and they pushed the
 * number — the part being scanned for — off the front of the line.
 *
 * **No floor, unlike `describeAvailability`.** The row already says nobody is
 * here — that is why an interval is being drawn at all — so "a few seconds ago"
 * is the honest bottom of the scale rather than a special case. The floor stays
 * where it earns its keep: a *person*'s gap is evidence about where they are,
 * and under a minute the answer is "here", which is a different fact rather
 * than a smaller number.
 *
 * **"Nobody else yet" survives the change**, and is the one place
 * `lastPresenceByOthers` is still read: null there means nobody but the reader
 * has ever been in — a channel a pair get for becoming contacts, or one only
 * the reader has opened — and that is a fact worth words rather than an
 * interval measuring the reader's own visit back to them. Undefined, from a
 * server that predates the field or on a card that never carries it (an
 * invitation, the profile screen), draws the interval.
 *
 * Null-from-`lastPresenceAt` is not-knowing, which only an invitation can
 * reach, and the caller drops the line.
 *
 * Shared by Home and the profile screen rather than written twice, for the
 * reason `describeAvailability` is: they are the same sentence about the same
 * fields.
 */
export function describeQuiet(
  channel: {
    everUsed?: boolean;
    lastPresenceByOthers?: number | null;
    lastPresenceAt?: number;
  },
  now: number,
  words: Words
): string | null {
  if (channel.everUsed === false) return words.notUsedYet();
  if (channel.lastPresenceByOthers === null) return words.nobodyElseYet();
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
  now: number,
  words: Words
): string {
  if (where.present) return words.hereNow();
  if (where.lastPresentAt === null) return words.neverBeenHere();
  const gap = agoOrNull(now - where.lastPresentAt);
  return gap ? words.lastHere(gap) : words.hereNow();
}

/**
 * Capitalised, for the two places one of these lines stands alone rather than
 * ending a sentence somebody else began. Here rather than in either view, so
 * the profile and Home cannot disagree about the capital.
 */
export const sentence = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);
