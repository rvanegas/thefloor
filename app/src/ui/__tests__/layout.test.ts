import {
  HANDHELD_UNDER,
  isHandheld,
  LIST_WIDTH,
  layoutFor,
  SPLIT_AT,
} from '../layout';

/**
 * The breakpoint, which is the half of the layout a test can reach.
 *
 * `useLayout` is `layoutFor` over `useWindowDimensions`, and a window is a
 * thing nothing here has. So the rule is pinned against the widths that
 * actually exist and the hook is kept to one line, which is the same division
 * `webRoute.test.ts` makes for the same reason.
 */

/** Every surface this app is opened on, by the width it presents. */
const WIDTHS: Array<[string, number, 'stack' | 'split']> = [
  ['iPhone SE, portrait', 320, 'stack'],
  ['iPhone 16, portrait', 393, 'stack'],
  ['iPhone 16 Pro Max, portrait', 440, 'stack'],
  ['an iPad window dragged narrow', 507, 'stack'],
  ['iPad mini, portrait', 744, 'stack'],
  /*
    **Every phone on its side is a split**, which is not a mistake and is the
    fact behind the full-screen bug: a window this wide is one a list and a
    screen share happily, so the expanded picture overrules the rule rather
    than moving it. See `wholeWindow.test.tsx`.
  */
  ['iPhone 16, landscape', 852, 'split'],
  ['iPhone 16 Pro Max, landscape', 956, 'split'],
  ['iPad 11", portrait', 820, 'split'],
  ['iPad mini, landscape', 1133, 'split'],
  ['iPad Pro 13", portrait', 1032, 'split'],
  ['iPad Pro 13", landscape', 1376, 'split'],
];

describe('which layout a width asks for', () => {
  for (const [what, width, expected] of WIDTHS) {
    it(`${what} (${width}) is ${expected}`, () => {
      expect(layoutFor(width)).toBe(expected);
    });
  }

  it('splits at the breakpoint and not a point below it', () => {
    expect(layoutFor(SPLIT_AT - 1)).toBe('stack');
    expect(layoutFor(SPLIT_AT)).toBe('split');
  });

  /**
   * The test the breakpoint exists to pass. A split that hands the detail pane
   * less than a phone has made the app worse by growing the screen, which is
   * the one outcome this whole change has to avoid.
   */
  it('never leaves the detail pane narrower than an iPhone', () => {
    expect(SPLIT_AT - LIST_WIDTH).toBeGreaterThanOrEqual(440);
  });

  /**
   * jest mocks the window at 750 wide. If the breakpoint ever falls below
   * that, every test rendering `App` starts silently exercising the split
   * layout — so the mock's own width has to land on the stack side.
   */
  it("stays above jest's mocked window", () => {
    expect(layoutFor(750)).toBe('stack');
  });
});

/**
 * The second rule, which decides where turning the device means anything.
 *
 * **Every entry is a window that actually occurs, in both orientations**,
 * because the whole failure this rule exists to fix was a rule that had only
 * ever been thought about in one of them. `width > height` was taken to mean
 * *somebody turned this*, and a laptop and an iPad are landscape sitting
 * still — both went full screen on *Watch* and could not get out.
 *
 * The number has to separate the widest phone from the narrowest tablet, and
 * the table above already names both: 440 and 744.
 */
const SIZES: Array<[string, number, number, boolean]> = [
  ['iPhone SE, portrait', 320, 568, true],
  ['iPhone SE, landscape', 568, 320, true],
  ['iPhone 16, portrait', 393, 852, true],
  ['iPhone 16, landscape', 852, 393, true],
  ['iPhone 16 Pro Max, portrait', 440, 956, true],
  ['iPhone 16 Pro Max, landscape', 956, 440, true],
  ['iPad mini, portrait', 744, 1133, false],
  ['iPad mini, landscape', 1133, 744, false],
  ['iPad Pro 13", portrait', 1032, 1376, false],
  ['iPad Pro 13", landscape', 1376, 1032, false],
  ['an iPad window dragged narrow', 507, 1000, false],
  ['a laptop browser window', 1440, 900, false],
  ['a desktop browser window, short and wide', 1600, 700, false],
];

describe('which windows are held', () => {
  for (const [what, width, height, expected] of SIZES) {
    it(`${what} (${width}×${height}) is ${expected ? '' : 'not '}handheld`, () => {
      expect(isHandheld({ width, height })).toBe(expected);
    });
  }

  it('reads the short side, so orientation cannot change the answer', () => {
    // The one property the rule must have: turning a device does not turn it
    // into a different kind of device.
    for (const [, width, height] of SIZES) {
      expect(isHandheld({ width, height })).toBe(
        isHandheld({ width: height, height: width })
      );
    }
  });

  it('is handheld below the line and not at it', () => {
    expect(isHandheld({ width: HANDHELD_UNDER - 1, height: 2000 })).toBe(true);
    expect(isHandheld({ width: HANDHELD_UNDER, height: 2000 })).toBe(false);
  });

  /**
   * The two tests the number exists to pass, named after the devices that set
   * it. Everything between 440 and 744 is a judgement; these two ends are not.
   */
  it('clears the widest phone and stops short of the narrowest tablet', () => {
    expect(HANDHELD_UNDER).toBeGreaterThan(440);
    expect(HANDHELD_UNDER).toBeLessThanOrEqual(744);
  });

  /**
   * A phone on its side is past the layout breakpoint and is still a phone.
   * If these two rules ever shared a number, the turn would stop working on
   * the one surface it is for. See `wholeWindow.test.tsx` for the other half
   * of that collision.
   */
  it('is a different question from the layout breakpoint', () => {
    expect(layoutFor(852)).toBe('split');
    expect(isHandheld({ width: 852, height: 393 })).toBe(true);
  });

  /**
   * jest mocks the window at 750×1334, which is neither a phone this app
   * targets nor a tablet. It must land on the *not handheld* side for the same
   * reason the breakpoint must land on `stack`: a test should have to ask for
   * the turn, by mocking `useWindowDimensions`, rather than getting it by not
   * thinking about it.
   */
  it("treats jest's mocked window as not handheld", () => {
    expect(isHandheld({ width: 750, height: 1334 })).toBe(false);
  });
});
