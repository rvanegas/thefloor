import { useEffect } from 'react';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useIsHandheld } from '../ui/layout';

/**
 * Which way up a phone is allowed to be, which is one rule with one exception.
 *
 * **A handheld is portrait unless the film has the glass.** Every screen this
 * application has apart from the expanded picture is a column of rows read
 * upright — the roster, the settings, a transcript — and a phone turned
 * sideways on one of them gets a short, wide version of a layout that wanted
 * height. The film is the one thing that is better for the turn, so it is the
 * one thing the turn is permitted for, and inside it **both** orientations
 * are: somebody watching a phone flat on a table, or in bed, is not asking to
 * be rotated out of full screen.
 *
 * **Only a handheld**, by the short side — `isHandheld` in `ui/layout.ts`
 * holds that line and why it is 500. A tablet and a browser window are
 * landscape sitting still, and nothing here has any business telling an iPad
 * which way up to be; `unlockAsync` is what they get, which is what they would
 * have had anyway.
 *
 * ## What this replaced, which was a gesture rather than a lock
 *
 * From 2026-09-19 to 2026-09-20 turning a phone sideways on *Watch* is what
 * expanded the picture, and `useIsLandscape` lived here to say so. It cannot
 * survive this: a phone that may not become landscape outside full screen is
 * never handed the window that route read, so the turn is not a route any
 * more. The buttons are — *Full screen* on the watch card and *Exit full
 * screen* over the picture, which is what every platform already used and
 * what a phone held upright always needed. `ChannelView` holds that rule.
 *
 * **And the old exit bug is gone rather than laid.** What made it one was a
 * *landscape* lock: full screen pinned the phone sideways, exiting released
 * the pin, and an unlocked phone goes back to how it is being held — so a
 * press of the exit handed back the channel screen sideways. This lock runs
 * the other way. Exiting locks portrait, which is a rotation *towards* the
 * shape the screen underneath wants, and the phone arrives on the card
 * upright however it is being held.
 *
 * ## The plist is what makes any of this possible
 *
 * iOS takes the orientations an app may adopt from
 * `ios.infoPlist.UISupportedInterfaceOrientations`, and `lockAsync` narrows
 * that set rather than widening it. The landscapes have to stay listed in
 * `app.json` — for full screen, and for the iPad, which has its own array —
 * or the lock would be locking something already locked and full screen would
 * be a bigger portrait picture. `orientation: "default"` is not what does it;
 * that cost a day once. See planning/RELEASING.md § *Orientation is
 * per-platform*, and read the generated plist rather than the JSON.
 *
 * Fire and forget, like `useKeepAwake`: a device that refuses to rotate is a
 * layout that is not what was wanted, and throwing here would take the
 * application down over it.
 */
export function usePortraitUnlessFullScreen(fullScreen: boolean): void {
  const handheld = useIsHandheld();
  useEffect(() => {
    if (!handheld || fullScreen) {
      void ScreenOrientation.unlockAsync().catch(() => {});
      return;
    }
    void ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.PORTRAIT_UP
    ).catch(() => {});
  }, [handheld, fullScreen]);
}
