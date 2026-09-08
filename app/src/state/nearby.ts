/**
 * Promotion: the one thing being nearby does by itself.
 *
 * **Nearby, foreground, somebody steps in → the phone steps in too, and the
 * user becomes audible.** Not listen-only. It is the half of the 2026-09-08
 * design that is an automatic media reconnect rather than a rule, which is why
 * it was built first: a nearby phone holds no session and no subscription, so
 * promoting means connecting to the room and opening the microphone — the
 * re-entry that froze playout for weeks, and that `deferSubscribe` and
 * `holdForPlayout` exist to survive.
 *
 * **The trigger is the arrival, not the first word**, and that is the whole of
 * what makes it affordable. First words typically come a few seconds after
 * somebody steps in, and those seconds are what the media connection has to get
 * up in. Keying it on speech would start the reconnect at the exact moment
 * there was already something to miss.
 *
 * **Somebody already stepped in does not promote you, and this is the common
 * case rather than a corner.** Declaring nearby in a room where somebody is
 * already talking leaves you nearby, hearing nothing, until the next person
 * arrives. That is intended: you chose nearby, and promotion is for arrivals.
 * `somebodyArrived` is that rule, and it is why the previous roster has to be
 * remembered rather than the current one merely counted.
 */

/**
 * Whether somebody has just walked into the room.
 *
 * @param before the room as it was last seen, or null if it has not been seen
 *               yet. **Null is not an arrival**: the first snapshot after
 *               declaring nearby is the room as it already was, and reading it
 *               as an arrival would promote somebody straight back out of the
 *               state they just chose.
 * @param after  the room now.
 * @param me     the person being promoted, who is never their own arrival.
 */
export function somebodyArrived(
  before: readonly string[] | null,
  after: readonly string[],
  me: string
): boolean {
  if (before === null) return false;
  return after.some((id) => id !== me && !before.includes(id));
}
