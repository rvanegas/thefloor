import {
  HANDHELD_UNDER,
  isHandheld,
  LIST_WIDTH,
  layoutFor,
  MIN_SEGMENT,
  PICTURE_MIN_WIDTH,
  RESERVE_UNDER_PICTURE,
  SPLIT_AT,
  segmentRowsFor,
  TWO_COLUMN_AT,
  watchShapeFor,
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

/**
 * How many rows the channel's six tabs take, which used to be a count.
 *
 * `MAX_PER_ROW = 4` reads as a rule about how many segments a row holds and
 * argues its case in points — "about forty points, which is not a word" — with
 * a phone's width assumed throughout. On a 740-point pane that assumption made
 * the switch two rows deep for no reason, and the row it did not need was
 * a third of what the watch card had left.
 */
describe('how many rows a set of segments needs', () => {
  /** Panes that actually occur, and what six tabs do in each. */
  const PANES: Array<[string, number, 1 | 2]> = [
    ['iPhone 16, portrait', 393, 2],
    ['iPhone 16 Pro Max, portrait', 440, 2],
    ['an iPad window dragged narrow', 507, 2],
    ['the detail pane of an iPad in portrait', 470, 2],
    /*
      Six words fit from 540 up, so an unsplit browser window at 560 is one
      row — the rule doing what the count could not: 560 is not a phone and
      had no business being treated as one.
    */
    ['a browser window at 560, unsplit', 560, 1],
    ['a browser window dragged to 520', 520, 2],
    ['the detail pane of a 10.2" iPad, landscape', 740, 1],
    ['the detail pane of a 12.9" iPad, landscape', 1026, 1],
    ['the detail pane of a laptop browser', 1100, 1],
  ];
  for (const [what, width, rows] of PANES) {
    it(`gives ${what} ${rows} row(s)`, () => {
      expect(segmentRowsFor(6, width)).toBe(rows);
    });
  }

  it('turns over at exactly six segments' + ' worth of minimum', () => {
    expect(segmentRowsFor(6, 6 * MIN_SEGMENT)).toBe(1);
    expect(segmentRowsFor(6, 6 * MIN_SEGMENT - 1)).toBe(2);
  });

  /*
    Home's switch is two halves of one question and fits everywhere, which is
    the case that must not be made worse by a rule written for six.
  */
  it('never splits a switch that fits, however narrow', () => {
    expect(segmentRowsFor(2, 320)).toBe(1);
    expect(segmentRowsFor(3, 393)).toBe(1);
  });

  /** One segment is one row at any width, zero included. */
  it('does not split what cannot be split', () => {
    expect(segmentRowsFor(1, 0)).toBe(1);
  });
});

/**
 * The watch body's arithmetic, which is the whole of options A, B and C in one
 * function.
 *
 * **Every row is a surface somebody opens this on, and the web is half of
 * them.** A browser window is the case the old rules could not see: short and
 * wide, with no rotation to rescue it, and nothing in a width-only cap to stop
 * a 16:9 picture taking the entire viewport and pushing the transport below
 * the fold.
 *
 * `bodyHeight` is what the picture and the scroll share — the pane less the
 * header, the tabs and the footer — so the numbers below are that rather than
 * the window's own height.
 */
describe('the shape of the watch body', () => {
  /** [what, pane width, body height, columns, picture width] */
  const SURFACES: Array<[string, number, number, 1 | 2, number]> = [
    // A phone: one column, and the height never binds. Unchanged by all of
    // this, which is the point — the rules bite only where there was a fault.
    ['iPhone 16, portrait', 393, 620, 1, 393],
    // The iPad this was reported from. Still one column at 740: below
    // TWO_COLUMN_AT, and the picture is the old 620 because 470 of height is
    // more than 620×9/16 needs.
    ['iPad 10.2", landscape, detail pane', 740, 620, 1, 620],
    // Wide enough for two, and the picture keeps its full width because the
    // column fits in what is left over.
    ['iPad Pro 12.9", landscape, detail pane', 1026, 830, 2, 620],
    ['a laptop browser, detail pane', 1100, 560, 2, 620],
    /*
      **The row this was built for.** A short browser window: wide enough for
      two columns, and with the picture beside the controls it may have the
      whole body height — 300 of it, which binds well before the width cap
      does, so the film is sized by how tall the window is rather than by how
      wide.
    */
    ['a short browser window, detail pane', 940, 300, 2, (300 * 16) / 9],
    /*
      **And the same window with no room for two columns.** 660 is under
      TWO_COLUMN_AT, so the reserve applies and the picture gets 200 of the 350
      — a small film, and a transport somebody can still reach.
    */
    ['a short, narrow browser window', 660, 350, 1, (200 * 16) / 9],
  ];
  for (const [what, width, bodyHeight, columns, pictureWidth] of SURFACES) {
    it(`lays ${what} out in ${columns} column(s)`, () => {
      const shape = watchShapeFor({ width, bodyHeight });
      expect(shape.columns).toBe(columns);
      expect(shape.picture.width).toBeCloseTo(pictureWidth, 5);
      // 16:9 in every case, the box being set on both sides rather than by an
      // aspect that a cap could quietly break.
      expect(shape.picture.height).toBeCloseTo((shape.picture.width * 9) / 16, 5);
    });
  }

  /**
   * **The promise the reserve is there to keep**, stated as an assertion
   * rather than as a comment: under a stacked picture, what is left of the
   * body is never less than the scrubber and the transport row.
   */
  it('always leaves the transport above the fold in one column', () => {
    for (let bodyHeight = 200; bodyHeight <= 1200; bodyHeight += 7) {
      for (const width of [320, 393, 470, 660, 740, 755]) {
        const shape = watchShapeFor({ width, bodyHeight });
        if (shape.columns !== 1) continue;
        expect(bodyHeight - shape.picture.height).toBeGreaterThanOrEqual(
          RESERVE_UNDER_PICTURE
        );
      }
    }
  });

  /**
   * **Two columns must never leave the film worse off than one column would
   * have**, which is what `PICTURE_MIN_WIDTH` is inside `TWO_COLUMN_AT` for.
   * At the turnover the picture is still at least a phone's width.
   */
  it('never shrinks the picture below a phone to make room for a column', () => {
    for (let width = TWO_COLUMN_AT; width <= 1600; width += 1) {
      const shape = watchShapeFor({ width, bodyHeight: 2000 });
      expect(shape.picture.width).toBeGreaterThanOrEqual(PICTURE_MIN_WIDTH);
    }
  });

  /**
   * **An unmeasured body is the first frame, and it gets the old answer.**
   * Before there was a height rule the picture fitted the width and took
   * whatever height that implied; a zero here means nothing has been laid out
   * yet, and guessing small would draw a collapsed picture for a frame.
   */
  it('falls back to the width alone until the body has been measured', () => {
    expect(watchShapeFor({ width: 740, bodyHeight: 0 }).picture.width).toBe(620);
    expect(watchShapeFor({ width: 393, bodyHeight: 0 }).picture.width).toBe(393);
  });

  /**
   * The turnover itself, from both sides — and that it is not `SPLIT_AT`.
   *
   * The two constants are three hundred points and one question apart: a
   * window at `SPLIT_AT` has a 460-point detail pane, which is nowhere near
   * wide enough to put a transport beside a film.
   */
  it('turns over at the sum of its two minimums', () => {
    expect(watchShapeFor({ width: TWO_COLUMN_AT, bodyHeight: 800 }).columns).toBe(2);
    expect(
      watchShapeFor({ width: TWO_COLUMN_AT - 1, bodyHeight: 800 }).columns
    ).toBe(1);
    expect(watchShapeFor({ width: SPLIT_AT - LIST_WIDTH, bodyHeight: 800 }).columns).toBe(1);
  });
});
