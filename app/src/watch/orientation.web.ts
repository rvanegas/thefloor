import { useWindowDimensions } from 'react-native';

/**
 * Which way up the window is, which is a real question in a browser too: a
 * laptop window is landscape and a phone browser held upright is not.
 *
 * **What has changed since 2026-09-20 is what the answer is used for.** It is
 * no longer enough on its own: a landscape window only expands the picture
 * when it is also *handheld* — see `isHandheld` in `ui/layout.ts` — which on
 * the web means a phone browser turned sideways and not a laptop sitting
 * still. Every laptop went full screen on the *Watch* tab for a day and had no
 * way out of it, there being no device to turn and nothing here that could
 * turn one. The way out on every platform is the *Exit full screen* button.
 *
 * `returnToPortrait` and `PORTRAIT_HOLD_MS` are gone from both modules. This
 * one's was a documented no-op, which was the first sign that turning the
 * device was the wrong mechanism to hang the only exit on.
 */
export function useIsLandscape(): boolean {
  const { width, height } = useWindowDimensions();
  return width > height;
}
