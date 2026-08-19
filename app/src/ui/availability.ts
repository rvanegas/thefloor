import { agoOrNull } from './relativeTime';

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
