import * as ScreenOrientation from 'expo-screen-orientation';
import { useWindowDimensions } from 'react-native';

/**
 * Which way up the window is, which since 2026-09-19 is the whole of what
 * decides whether the film is full screen.
 *
 * **The hardware is the control.** There used to be a *Full screen* button on
 * the watch card and an *Exit full screen* button over the picture, and the
 * expanded state locked the phone sideways for as long as it was up. That is
 * two controls saying what the phone already knows, and between them they left
 * the bug that makes the arrangement worth reversing: the release is an
 * `unlockAsync`, and an unlocked phone goes back to the way it is being held —
 * so collapsing while sideways gave back the channel screen in landscape.
 * Turning the phone sideways on *Watch* is what expands the picture now, and
 * turning it upright is what collapses it, and neither can disagree with the
 * glass.
 *
 * **Only possible because `app.json` says `orientation: "default"`** — iOS
 * takes its supported orientations from the Info.plist, and a portrait-locked
 * app would never be handed a landscape window to notice. That is a rebuild
 * and a different decision about every other screen.
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

/**
 * How long the phone is held upright after somebody asks for it.
 *
 * **A grace period, because iOS will not say how the phone is being held.**
 * `expo-screen-orientation` reports the *interface* orientation, and while the
 * interface is locked that reading is the lock rather than the hardware — so
 * there is no event that says "they have turned it back" and nothing to wait
 * for. Releasing at once would be the same as never locking: a phone still
 * held sideways rotates straight back, and the control appears to do nothing.
 *
 * Five seconds is long enough to lower the phone, set it down, or bring it
 * upright, and short enough that somebody who has changed their mind is not
 * stuck in portrait wondering what they did. Being wrong about it costs one
 * more press, which is why this is a number rather than a design.
 */
export const PORTRAIT_HOLD_MS = 5000;

/** The pending release, so a second press restarts it rather than stacking. */
let release: ReturnType<typeof setTimeout> | null = null;

/**
 * The one control the expanded picture has: put the screen back upright.
 *
 * **Not a state change, deliberately.** Full screen is derived from the shape
 * of the window now, so there is nothing here to set and nothing that could
 * disagree with the glass: this turns the interface, the window becomes taller
 * than it is wide, and the picture collapses because of that rather than
 * because a button said so.
 *
 * **Module-level rather than an effect, because the caller unmounts.** The
 * rotation is what takes `FullScreen` down, so a release living in a
 * component's cleanup would fire on the very frame the lock was applied — the
 * trap the old `useLandscapeWhile` was arranged to avoid, arriving from the
 * other side. The timer outlives every screen in the application.
 *
 * Fire and forget in both directions, as `useKeepAwake` is: a device that
 * refuses to rotate is a worse picture, not a broken one, and throwing here
 * would take the channel screen down with it.
 */
export function returnToPortrait(): void {
  if (release) clearTimeout(release);
  void ScreenOrientation.lockAsync(
    ScreenOrientation.OrientationLock.PORTRAIT_UP
  ).catch(() => {});
  release = setTimeout(() => {
    release = null;
    void ScreenOrientation.unlockAsync().catch(() => {});
  }, PORTRAIT_HOLD_MS);
}
