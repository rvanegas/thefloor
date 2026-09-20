import { LIST_WIDTH, layoutFor, SPLIT_AT } from '../layout';

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
