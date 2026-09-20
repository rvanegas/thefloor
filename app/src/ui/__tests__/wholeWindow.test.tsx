import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { useLayout, WholeWindowContext, type Layout } from '../layout';

/**
 * The window a sideways phone presents, which is the whole of this bug.
 *
 * An iPhone 16 Pro Max on its side is 956 points wide — past `SPLIT_AT`, and
 * so is every other current iPhone — so the rotation that full screen performs
 * in order to give the film the glass was, until the claim existed, the very
 * thing that put Home back beside it and left the picture smaller than it had
 * been in portrait. `layout.test.ts` pins the width rule; this pins the second
 * input to it.
 */
const PHONE_LANDSCAPE = 956;

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 956, height: 440, scale: 3, fontScale: 1 }),
}));

function Probe({ seen }: { seen: (layout: Layout) => void }) {
  seen(useLayout());
  return <Text>probe</Text>;
}

const layoutWith = (taken: boolean): Layout => {
  let seen!: Layout;
  act(() => {
    renderer.create(
      <WholeWindowContext.Provider value={{ taken, claim: () => {} }}>
        <Probe seen={(l) => (seen = l)} />
      </WholeWindowContext.Provider>
    );
  });
  return seen;
};

describe('a window somebody has claimed', () => {
  it('is one screen however wide it is', () => {
    expect(PHONE_LANDSCAPE).toBeGreaterThan(800);
    expect(layoutWith(true)).toBe('stack');
  });

  it('splits again the moment the claim is released', () => {
    // The width rule is not being changed, only overruled while a picture is
    // expanded — a sideways phone is a split for every other screen.
    expect(layoutWith(false)).toBe('split');
  });
});
