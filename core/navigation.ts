/**
 * The four acts that move somebody between Home and the channel they are
 * standing in, named so that both ends can count them.
 *
 * **Two ways out and two ways in, and the pairing is the whole point.** A
 * count of the Home glyph on its own says nothing — it is large if the app is
 * used and small if it is not, and neither reading is about the glyph. What is
 * worth knowing is its share against the gesture that does the same thing, and
 * a name for only half of a pair cannot express that. So `swipeOut` is here
 * because `home` is, and `liveCard` is here because `swipeIn` is.
 *
 * **These are counts and not events.** Nothing downstream holds who did one,
 * when, or in what order — `nav_counts` is a running total per kind, per
 * build, per day, with no account on it. See the schema, and /privacy, whose
 * promise about what is not collected is the reason the shape is this one
 * rather than a row per tap.
 *
 * The shape lives here for `core/tried.ts`' reason: it is on the wire, and two
 * copies of a wire shape drift.
 */

/**
 * One of the four, by the control rather than by what it achieves.
 *
 * Deliberately not `leave` and `enter`: two of these mean the same thing to
 * the application and differ only in what the thumb did, which is the entire
 * question. A vocabulary that named the outcome could not ask it.
 */
export type NavAction =
  /** The Home glyph in a channel header — `ChannelView`'s way out. */
  | 'home'
  /** The right swipe off a channel screen, which does what `home` does. */
  | 'swipeOut'
  /** The left swipe into the channel this device is standing in. */
  | 'swipeIn'
  /** The pinned live line on Home, which does what `swipeIn` does. */
  | 'liveCard';

/** In pairs, out before in, the control before the gesture that copies it. */
export const NAV_ACTIONS: readonly NavAction[] = [
  'home',
  'swipeOut',
  'swipeIn',
  'liveCard',
];

/**
 * Whether a name off the wire is one of the four rather than anything at all.
 *
 * Refused rather than counted under whatever arrived, for `isTriedId`'s
 * reason: an unknown name is a client bug, and a counter that accepted any
 * string would grow a row for every typo and quietly make the report
 * unreadable.
 */
export function isNavAction(value: unknown): value is NavAction {
  return (
    typeof value === 'string' &&
    (NAV_ACTIONS as readonly string[]).includes(value)
  );
}
