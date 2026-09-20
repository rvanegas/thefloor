import { useEffect } from 'react';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useIsHandheld } from '../ui/layout';

/**
 * Which way up a phone is allowed to be, which is one rule with one exception.
 *
 * **A handheld is portrait unless it is at the film.** Every screen this
 * application has apart from the film's is a column of rows read upright —
 * the roster, the settings, a transcript, Home — and a phone turned sideways
 * on one of them gets a short, wide version of a layout that wanted height.
 * The film is the one thing that is better for the turn, so it is the one
 * thing the turn is permitted for.
 *
 * **At the film is two screens rather than one, and that is the whole of what
 * changed on 2026-09-20.** The exception was *full screen* alone for a few
 * hours, and a phone that may not be sideways anywhere else is a phone that
 * can never be turned *into* full screen — iOS simply never hands the
 * application the landscape window a turn would be read on. So the exception
 * is the watch card as well: while this device is the screen for a party that
 * will play, on the *Watch* tab, with nothing over it, the phone may turn.
 * Turning it is what expands the picture, and turning it back is what
 * collapses it. `ChannelView` computes that condition — it is the same set of
 * terms full screen itself is guarded by — and `Picture` holds it for the
 * whole application, the picture outliving the screen that asked for it.
 *
 * **Only a handheld**, by the short side — `isHandheld` in `ui/layout.ts`
 * holds that line and why it is 500. A tablet and a browser window are
 * landscape sitting still, and nothing here has any business telling an iPad
 * which way up to be; `unlockAsync` is what they get, which is what they would
 * have had anyway, and on those the buttons are the whole of the control.
 *
 * ## Why it is not a landscape lock, which is the half that is easy to get
 * backwards
 *
 * The obvious implementation of *the film is landscape* is to pin the phone
 * sideways when the picture expands, and this project had one until
 * 2026-09-20. What it cost was the exit: the pin was released on collapse, an
 * unlocked phone goes back to how it is being held, and a press of the exit
 * while sideways handed back the channel screen in landscape.
 *
 * This runs the other way and the bug is structurally impossible rather than
 * merely laid. Nothing is ever *pinned* to landscape. Leaving the film — a
 * tab, a stopped party, a refusal — locks portrait, which is a rotation
 * *towards* the shape the screen underneath wants, so the phone arrives on
 * whatever comes next upright however it is being held.
 *
 * ## The plist is what makes any of this possible
 *
 * iOS takes the orientations an app may adopt from
 * `ios.infoPlist.UISupportedInterfaceOrientations`, and `lockAsync` narrows
 * that set rather than widening it. The landscapes have to stay listed in
 * `app.json` — for the film, and for the iPad, which has its own array — or
 * this would be locking something already locked and the turn would do
 * nothing. `orientation: "default"` is not what does it; that cost a day once.
 * See planning/RELEASING.md § *Orientation is per-platform*, and read the
 * generated plist rather than the JSON.
 *
 * Fire and forget, like `useKeepAwake`: a device that refuses to rotate is a
 * layout that is not what was wanted, and throwing here would take the
 * application down over it.
 */
export function usePortraitUnlessAtTheFilm(atTheFilm: boolean): void {
  const handheld = useIsHandheld();
  useEffect(() => {
    if (!handheld || atTheFilm) {
      void ScreenOrientation.unlockAsync().catch(() => {});
      return;
    }
    void ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.PORTRAIT_UP
    ).catch(() => {});
  }, [handheld, atTheFilm]);
}
