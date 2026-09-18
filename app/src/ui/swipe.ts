/**
 * When a drag across the screen means *go somewhere*, and which way.
 *
 * **Pure, and separated from `Panes` for the reason `layout.ts` is separated
 * from the component that reads it.** What is worth getting right here is a
 * table of thresholds — how far is far enough, how straight is straight
 * enough, how fast is fast enough to excuse a short one — and a table is
 * testable where a `PanResponder` inside a component is not. The plumbing left
 * behind is the responder, which no test in this repository can reach.
 *
 * **It answers a direction and nothing else.** Whether there is anywhere to go
 * in that direction is `App.tsx`'s question: the channel you are standing in
 * is the only thing a left swipe can open, and that is a fact about presence
 * rather than about a thumb. See `Panes`.
 */

/** Which way the thumb went, once it has gone far enough to mean it. */
export type Direction = 'left' | 'right';

/**
 * How far a drag must travel before it is taken away from whatever was under
 * it.
 *
 * Deliberately small, and doing none of the deciding. Crossing this only wins
 * the gesture; `swipeOf` decides on release whether it was a swipe at all, so
 * a drag that is taken here and then thought better of still ends in nothing.
 */
export const CAPTURE_AT = 12;

/** How far a drag must travel, on its own, to be a swipe. */
export const COMMIT_AT = 60;

/**
 * Points per millisecond that excuse a short one.
 *
 * A flick is the gesture people actually make once they know the swipe is
 * there; `COMMIT_AT` is what catches the deliberate first one. Both are needed
 * — distance alone makes a practised thumb feel ignored, velocity alone fires
 * on a fast scroll that happened to drift.
 */
export const FLICK_AT = 0.5;

/** A swipe is at least this many times as wide as it is tall. */
export const STRAIGHTNESS = 2;

/**
 * Whether a drag is going sideways rather than down.
 *
 * This is the whole of what keeps a scrolling list scrollable: every screen
 * under this gesture scrolls vertically, and a rule that asked only how far
 * the thumb had gone would take the first diagonal inch of every one of them.
 */
export function isHorizontal(dx: number, dy: number): boolean {
  return Math.abs(dx) > STRAIGHTNESS * Math.abs(dy);
}

/** Whether to take this drag away from whatever was under it. */
export function shouldCapture(dx: number, dy: number): boolean {
  return Math.abs(dx) >= CAPTURE_AT && isHorizontal(dx, dy);
}

/**
 * The swipe a finished drag was, or none.
 *
 * `dx` is net displacement rather than distance travelled, which is what makes
 * dragging back to where you started a cancel without anything having to
 * implement one.
 */
export function swipeOf(dx: number, dy: number, vx: number): Direction | null {
  if (!isHorizontal(dx, dy)) return null;
  const far = Math.abs(dx) >= COMMIT_AT;
  const flicked = Math.abs(vx) >= FLICK_AT && Math.abs(dx) >= CAPTURE_AT;
  if (!far && !flicked) return null;
  return dx < 0 ? 'left' : 'right';
}
