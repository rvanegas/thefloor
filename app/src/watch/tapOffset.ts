import type { GestureResponderEvent } from 'react-native';

/**
 * How far along the pressed element a tap landed, in points, or null.
 *
 * On a phone this is `locationX`, which is what the press already carries.
 * It is its own module only because a browser's press does not carry it —
 * see tapOffset.web.ts — and the scrubber must not have to know which it is
 * running in.
 */
export function tapOffset(event: GestureResponderEvent): number | null {
  const x = event.nativeEvent.locationX;
  return Number.isFinite(x) ? x : null;
}
