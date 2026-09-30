import type { GestureResponderEvent } from 'react-native';

/**
 * How far along the pressed element a tap landed, in a browser.
 *
 * **`react-native-web` hands `onPress` the DOM `click`**, whose `nativeEvent`
 * is a `MouseEvent` and has no `locationX` — its own source says so. Read as
 * if it had one, the scrubber computed `NaN`, which JSON spells `null` and
 * the reducer read as 0: every tap on the web app's bar sent the film back to
 * the start. So the offset is taken the way a browser offers it, the click's
 * `clientX` against the pressed element's own box.
 *
 * **`currentTarget` rather than `target`, and not `offsetX`**, both of which
 * are measured against whatever was under the finger — the bar's fill, for
 * any tap on the part already played.
 */
export function tapOffset(event: GestureResponderEvent): number | null {
  const native = event.nativeEvent as unknown as { clientX?: unknown };
  const element = event.currentTarget as unknown as {
    getBoundingClientRect?: () => { left: number };
  } | null;
  if (typeof native.clientX !== 'number' || !element?.getBoundingClientRect) {
    return null;
  }
  const x = native.clientX - element.getBoundingClientRect().left;
  return Number.isFinite(x) ? x : null;
}
