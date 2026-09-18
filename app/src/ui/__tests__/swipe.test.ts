import {
  CAPTURE_AT,
  COMMIT_AT,
  FLICK_AT,
  isHorizontal,
  shouldCapture,
  swipeOf,
} from '../swipe';

/**
 * The thresholds, which are the half of the gesture a test can reach.
 *
 * The responder is `PanResponder` over these three functions, and a responder
 * is a thing nothing here has — the same division `layout.test.ts` makes for
 * the same reason. What is pinned is the table: what counts as sideways, what
 * counts as far enough, and what a drag that changed its mind comes to.
 */

describe('what counts as going sideways', () => {
  it('takes a flat drag', () => {
    expect(isHorizontal(100, 0)).toBe(true);
  });

  it('refuses a scroll', () => {
    expect(isHorizontal(0, 100)).toBe(false);
    expect(isHorizontal(10, 100)).toBe(false);
  });

  /**
   * The diagonal is the case this rule exists for: every screen under this
   * gesture scrolls, and a thumb travelling down a list is never perfectly
   * vertical.
   */
  it('refuses a drag no wider than it is tall', () => {
    expect(isHorizontal(50, 50)).toBe(false);
    expect(isHorizontal(100, 50)).toBe(false);
    expect(isHorizontal(101, 50)).toBe(true);
  });

  it('is unsigned — both directions are sideways', () => {
    expect(isHorizontal(-100, 10)).toBe(true);
    expect(isHorizontal(100, -10)).toBe(true);
  });

  it('is still nothing when nothing has moved', () => {
    expect(isHorizontal(0, 0)).toBe(false);
  });
});

describe('when the drag is taken away from what is under it', () => {
  it('waits for it to travel', () => {
    expect(shouldCapture(CAPTURE_AT - 1, 0)).toBe(false);
    expect(shouldCapture(CAPTURE_AT, 0)).toBe(true);
    expect(shouldCapture(-CAPTURE_AT, 0)).toBe(true);
  });

  it('never takes a vertical one, however far it goes', () => {
    expect(shouldCapture(40, 400)).toBe(false);
  });
});

describe('what a finished drag was', () => {
  it('is a swipe once it has gone far enough', () => {
    expect(swipeOf(-COMMIT_AT, 0, 0)).toBe('left');
    expect(swipeOf(COMMIT_AT, 0, 0)).toBe('right');
  });

  it('is nothing a point short of it', () => {
    expect(swipeOf(COMMIT_AT - 1, 0, 0)).toBe(null);
  });

  /** A practised thumb flicks; only the first one is ever deliberate. */
  it('excuses a short one that was fast', () => {
    expect(swipeOf(CAPTURE_AT, 0, FLICK_AT)).toBe('right');
    expect(swipeOf(-CAPTURE_AT, 0, -FLICK_AT)).toBe('left');
  });

  it('does not excuse a fast one that barely moved', () => {
    expect(swipeOf(CAPTURE_AT - 1, 0, 10)).toBe(null);
  });

  /**
   * The cancel nothing had to implement. `dx` is net displacement, so a drag
   * taken out and brought back arrives at the release with nothing to show.
   */
  it('is nothing when the thumb came back', () => {
    expect(swipeOf(2, 0, 0)).toBe(null);
  });

  it('refuses a long scroll that drifted sideways', () => {
    expect(swipeOf(80, 300, 1)).toBe(null);
  });
});
