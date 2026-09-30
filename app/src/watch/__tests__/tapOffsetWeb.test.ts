/**
 * Where a tap on the film's bar landed, in a browser.
 *
 * The reported bug was *Tapping on progress bar in webapp fails*, and it did
 * worse than fail: `react-native-web` hands `onPress` a DOM click with no
 * `locationX`, so the scrubber sent `NaN`, the wire sent `null`, and the
 * reducer read it as 0 — the film went back to the start for everybody. What
 * is tested here is the measurement from the shape a browser actually sends.
 */

import type { GestureResponderEvent } from 'react-native';
import { tapOffset } from '../tapOffset.web';

/** A click as `react-native-web` passes it to `onPress`. */
function click(clientX: unknown, left: number | null): GestureResponderEvent {
  return {
    nativeEvent: { clientX },
    currentTarget:
      left === null ? null : { getBoundingClientRect: () => ({ left }) },
    // Under the finger, which is the fill for any tap on the part already
    // played — and which must not be what the offset is measured against.
    target: { getBoundingClientRect: () => ({ left: left! + 40 }) },
  } as unknown as GestureResponderEvent;
}

describe('tapOffset, in a browser', () => {
  it('measures the click against the bar, not whatever was under it', () => {
    expect(tapOffset(click(170, 120))).toBe(50);
  });

  it('says nothing rather than a number it does not have', () => {
    expect(tapOffset(click(undefined, 120))).toBeNull();
    expect(tapOffset(click(170, null))).toBeNull();
    expect(tapOffset(click(NaN, 120))).toBeNull();
  });
});
