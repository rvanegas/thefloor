/**
 * Where a scroll view has to be so that something inside it is wholly visible.
 *
 * Two things in a recording row expand under the finger: tapping it opens Play,
 * Rename, Export and Delete, and tapping Rename replaces those with a field and
 * a Save button. Both grew downwards off the bottom of the screen, and the
 * second did it under the keyboard — so the fix for the keyboard alone was not
 * enough. Scrolling the *field* into view is what a keyboard-aware scroll view
 * does by default, and it is the wrong unit: it leaves Save underneath the
 * keyboard, which is the one control the person is reaching for.
 *
 * So the unit is the whole card, and the answer is the same in both cases:
 * move by the least that brings its bottom edge inside.
 */

/** A little air beneath, so the card does not sit flush against the edge. */
const MARGIN = 12;

export interface Region {
  /** Distance from the top of the scrollable content. */
  top: number;
  height: number;
}

export interface Viewport {
  /** What the scroll view is currently showing, from the top of the content. */
  offset: number;
  /** How tall the visible part is — shorter when the keyboard is up. */
  height: number;
}

/**
 * The offset to scroll to, or null when the region is already visible.
 *
 * Null rather than the current offset, so a caller can skip the scroll
 * entirely: an animated scroll to where you already are still costs a frame of
 * movement, and doing it on every tap makes a list feel unsteady.
 *
 * A region taller than the viewport cannot be wholly shown, and then its top is
 * what matters — reading starts there, and its bottom is somewhere the person
 * will scroll to themselves.
 */
export function offsetToReveal(
  region: Region,
  viewport: Viewport
): number | null {
  const visibleTop = viewport.offset;
  const visibleBottom = viewport.offset + viewport.height;
  const bottom = region.top + region.height + MARGIN;

  if (region.height + MARGIN > viewport.height) {
    // Taller than the screen, so its bottom cannot be brought in without
    // pushing its top out. Reading starts at the top, so that is what has to
    // be visible — from wherever it currently is, above or below.
    const topVisible = region.top >= visibleTop && region.top < visibleBottom;
    return topVisible ? null : region.top;
  }

  // Fits, so bringing the bottom in cannot push the top out: the fitting
  // branch guarantees `bottom - viewport.height <= region.top`.
  if (bottom > visibleBottom) return bottom - viewport.height;

  if (region.top < visibleTop) return region.top;

  return null;
}
