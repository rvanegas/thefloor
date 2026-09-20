import { useWindowDimensions } from 'react-native';

/**
 * Which way up the window is, which is a real question in a browser too: a
 * laptop window is landscape, a phone browser held upright is not, and the
 * expanded picture follows the shape of the window either way.
 */
export function useIsLandscape(): boolean {
  const { width, height } = useWindowDimensions();
  return width > height;
}

/** Unused here, kept so the two modules have the same shape. */
export const PORTRAIT_HOLD_MS = 5000;

/**
 * Nothing, in a browser, deliberately.
 *
 * `screen.orientation.lock` exists but is refused outside a document that is
 * itself in the browser's full-screen mode, and on a desktop it is either
 * absent or rejects — so the honest web behaviour is the one a window already
 * has. There is no laptop to turn sideways and none to turn back; what shapes
 * the picture there is the window, whose edge somebody is already holding.
 *
 * See orientation.ts for what this is on a phone, and for why the release is a
 * timer rather than an event.
 */
export function returnToPortrait(): void {}
