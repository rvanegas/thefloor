/**
 * The arrival: the one thing being nearby notices by itself.
 *
 * **Nearby, foreground, somebody steps in → the phone says so and offers to
 * step in. It does not step in.** Promotion — the automatic version, where the
 * arrival opened a microphone nobody had touched the phone for — was built on
 * 2026-09-08 and removed the same day, before it had been heard on a device.
 * `decisions/2026-09-08-the-arrival-is-offered.md` is why. What is left is the
 * detection, which was always the cheap half.
 *
 * **The trigger is the arrival, not the first word.** First words typically
 * come a few seconds after somebody steps in, and an offer made at the arrival
 * is one that is already under a thumb when the talking starts. Keying it on
 * speech would put the offer up at the moment there was already something
 * being missed.
 *
 * It is also a fact the app already has: an arrival comes over the ordinary
 * websocket in channel state, which a nearby phone is still receiving. Nothing
 * here needs the media room, which is what nearby has no subscription to, and
 * nothing here claims any audio.
 *
 * **Somebody already stepped in does not count as an arrival, and this is the
 * common case rather than a corner.** Declaring nearby in a room where
 * somebody is already talking leaves you nearby, hearing nothing, with no
 * offer, until the next person steps in. That is intended: you chose nearby,
 * and the offer is for arrivals. `somebodyArrived` is that rule, and it is why
 * the previous roster has to be remembered rather than the current one merely
 * counted.
 */

/**
 * Whether somebody has just walked into the room.
 *
 * @param before the room as it was last seen, or null if it has not been seen
 *               yet. **Null is not an arrival**: the first snapshot after
 *               declaring nearby is the room as it already was, and reading it
 *               as an arrival would put an offer up against the state somebody
 *               had just chosen.
 * @param after  the room now.
 * @param me     the person being offered the step in, who is never their own
 *               arrival.
 */
export function somebodyArrived(
  before: readonly string[] | null,
  after: readonly string[],
  me: string
): boolean {
  if (before === null) return false;
  return after.some((id) => id !== me && !before.includes(id));
}

/**
 * Who just walked in — the same rule, naming them, so the offer can.
 *
 * Empty exactly when `somebodyArrived` is false, which is the invariant the
 * tests hold the pair to.
 */
export function whoArrived(
  before: readonly string[] | null,
  after: readonly string[],
  me: string
): string[] {
  if (before === null) return [];
  return after.filter((id) => id !== me && !before.includes(id));
}
