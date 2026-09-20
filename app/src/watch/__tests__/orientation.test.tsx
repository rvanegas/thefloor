import React from 'react';
import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { usePortraitUnlessFullScreen } from '../orientation';

/**
 * The window, which is what decides whether this is a phone.
 *
 * Read through `useIsHandheld`, so the short side is the whole of what
 * matters; the numbers below are the ones in `ui/__tests__/layout.test.ts`.
 */
let mockWindow = { width: 393, height: 852, scale: 3, fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

/** Prefixed, jest permitting no other name inside a module factory. */
const mockLock = jest.fn((_lock: number) => Promise.resolve());
const mockUnlock = jest.fn(() => Promise.resolve());
jest.mock('expo-screen-orientation', () => ({
  lockAsync: (lock: number) => mockLock(lock),
  unlockAsync: () => mockUnlock(),
  OrientationLock: { PORTRAIT_UP: 1 },
}));

const PHONE = { width: 393, height: 852, scale: 3, fontScale: 1 };
/** The same phone on its side, which only full screen can produce. */
const PHONE_SIDEWAYS = { width: 852, height: 393, scale: 3, fontScale: 1 };
/** An iPad mini, which this app does not turn either way. */
const TABLET = { width: 744, height: 1133, scale: 2, fontScale: 1 };

function Subject({ fullScreen }: { fullScreen: boolean }): React.ReactElement {
  usePortraitUnlessFullScreen(fullScreen);
  return <View />;
}

/** Mounted inside `act`, an effect being the whole of what is under test. */
function mount(fullScreen: boolean): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<Subject fullScreen={fullScreen} />);
  });
  return tree;
}

beforeEach(() => {
  mockWindow = PHONE;
  mockLock.mockClear();
  mockUnlock.mockClear();
});

/**
 * Which way up a phone may be, which is one rule with one exception.
 *
 * **The hook is three lines and the rule is the whole of it**, so what is
 * asserted here is which call was made against which window — the calls being
 * the only thing this side of the bridge can see, and the rotation itself
 * being iOS's.
 */
describe('the portrait lock', () => {
  it('holds a phone upright outside full screen', () => {
    const tree = mount(false);
    expect(mockLock).toHaveBeenCalledWith(1);
    expect(mockUnlock).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('lets go of it in full screen, both ways up being permitted', () => {
    // The exception, and the reason it is an unlock rather than a landscape
    // lock: a phone watching flat on a table is not asking to be turned.
    const tree = mount(true);
    expect(mockUnlock).toHaveBeenCalled();
    expect(mockLock).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('takes it back when the picture is collapsed', () => {
    /*
      **The old exit bug, run the other way round.** Full screen used to lock
      *landscape*, and releasing that lock handed the phone back to however it
      was being held — sideways, on a screen that wanted upright. This release
      is a lock, so the phone arrives on the card the right way up whatever it
      was doing a moment ago.
    */
    const tree = mount(true);
    mockWindow = PHONE_SIDEWAYS;
    act(() => tree.update(<Subject fullScreen={false} />));
    expect(mockLock).toHaveBeenCalledWith(1);
    act(() => tree.unmount());
  });

  it('never turns a tablet, expanded or not', () => {
    // Nothing here has any business telling an iPad which way up to be; it is
    // landscape sitting still, and so is every browser window.
    mockWindow = TABLET;
    const tree = mount(false);
    act(() => tree.update(<Subject fullScreen={true} />));
    expect(mockLock).not.toHaveBeenCalled();
    expect(mockUnlock).toHaveBeenCalled();
    act(() => tree.unmount());
  });
});
