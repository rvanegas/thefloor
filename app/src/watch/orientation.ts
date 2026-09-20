import { useWindowDimensions } from 'react-native';

/**
 * Which way up the window is, which is half of what decides whether the film
 * is full screen on a phone and none of what decides it anywhere else.
 *
 * **The hardware is *a* control, and since 2026-09-20 not the only one.** For
 * a day it was: a *Full screen* button on the watch card and an *Exit full
 * screen* button over the picture had both been removed as two controls saying
 * what the phone already knew, and because between them they left a real bug —
 * the expanded state locked the phone sideways, the release is an
 * `unlockAsync`, and an unlocked phone goes back to the way it is being held,
 * so collapsing while sideways gave back the channel screen in landscape.
 *
 * What that missed is that a window is not landscape because somebody turned
 * it. A browser window and an iPad are landscape sitting still, and neither
 * has a turn to perform — so both entered a state they could not leave. The
 * buttons are back on every platform and the turn is an extra route on a
 * handheld, which is the one surface where turning is a gesture. `ChannelView`
 * holds the rule; `isHandheld` in `ui/layout.ts` holds the line.
 *
 * **The landscape lock is gone and is not coming back**, and with it
 * `returnToPortrait`, `PORTRAIT_HOLD_MS` and every call this project made to
 * `expo-screen-orientation`. Nothing here turns the device any more: the
 * buttons collapse the picture directly, which is a thing that works in a
 * browser. The dependency is still in `app/package.json` because dropping it
 * is a prebuild; it has no importer.
 *
 * **The turn is only possible because the Info.plist lets the phone turn**,
 * which is a rebuild and a different decision about every other screen. iOS
 * takes the supported orientations from the plist, and a portrait-locked app is
 * never handed a landscape window to notice — so this hook would return false
 * forever and that route would be unreachable. The buttons would still work,
 * which is now the difference between a bug and a missing shortcut.
 *
 * `orientation: "default"` in `app.json` is *not* what does it, which cost a
 * day: this shipped on 2026-09-19 on that premise and did nothing at all on a
 * phone. `ios.infoPlist.UISupportedInterfaceOrientations` is spelled out
 * there — for the iPad's sake, orientation being per-platform and Expo having
 * no key for that — and an explicit entry stands the orientation plugin down
 * rather than merging with it. The phone's array is the one that has to list
 * the landscapes; see planning/RELEASING.md § *Orientation is per-platform*,
 * and read the generated plist rather than the JSON.
 *
 * Width against height rather than `getOrientationAsync`: the window is what
 * the layout is drawn into, it is what `useLayout` already reads, and on an
 * iPad in a split the interface orientation is not the shape of the pane.
 * `useWindowDimensions` re-renders on rotation, which is what makes this a
 * hook rather than a reading.
 */
export function useIsLandscape(): boolean {
  const { width, height } = useWindowDimensions();
  return width > height;
}
