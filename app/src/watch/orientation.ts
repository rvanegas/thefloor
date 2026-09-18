import { useEffect } from 'react';
import * as ScreenOrientation from 'expo-screen-orientation';

/**
 * Turns the phone sideways for a full-screen film, and back again.
 *
 * **Only possible because `app.json` says `orientation: "default"`** — iOS
 * takes its supported orientations from the Info.plist, and
 * `expo-screen-orientation` can only choose among the ones already declared.
 * A portrait-locked app would need that changed first, which is a rebuild and
 * a different decision about every other screen.
 *
 * `unlockAsync` rather than a lock back to portrait: the rest of this app
 * rotates freely, so the honest thing on the way out is to stop having an
 * opinion. Somebody who collapses the picture while holding the phone sideways
 * gets the channel screen sideways, which is what they would have got had they
 * never expanded it.
 *
 * **The release is in the cleanup rather than beside the collapse**, which is
 * what makes it survive the exits nobody presses: the film ending, the screen
 * moving to another device, the channel closing under it. Every one of those
 * unmounts this, and a phone left locked sideways by a screen that is no
 * longer there is a bug with no visible cause.
 *
 * Fire and forget in both directions, as `useKeepAwake` is: a device that
 * refuses to rotate is a worse picture, not a broken one, and throwing here
 * would take the channel screen down with it.
 */
export function useLandscapeWhile(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    void ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.LANDSCAPE
    ).catch(() => {});
    return () => {
      void ScreenOrientation.unlockAsync().catch(() => {});
    };
  }, [active]);
}
