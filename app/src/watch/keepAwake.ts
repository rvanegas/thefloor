import { useEffect } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

/**
 * Stops the phone locking itself under a film nobody is touching.
 *
 * **This is not what keeps the app in the foreground, and nothing can be.**
 * iOS has no such power and offers none: a person who swaps away has swapped
 * away. What it prevents is the *automatic* case — the idle timer dimming and
 * locking a device whose owner is watching it rather than tapping it — and
 * that is the case the capture exception leans on. See `isScreening` in
 * core/micNeeded.ts: a screen gives up its microphone while the film plays,
 * and iOS refuses a *backgrounded* app a new one, so the reacquisition at the
 * pause has to happen in front. A film on screen is what puts it there.
 *
 * The deliberate swap-away is already covered and needs nothing here: the app
 * stays `LISTENING` and takes the call session at the next foreground, which
 * is the deferred promotion in STATES.md.
 *
 * Tagged per channel so two screens in one process — which cannot happen
 * today and is a cheap thing to be right about — do not release each other's
 * hold.
 */
export function useKeepAwake(tag: string, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    let released = false;
    // Fire and forget: a device that refuses to stay awake is a film that
    // dims, which is a worse evening and not a broken one. Nothing downstream
    // reads the result, and throwing here would take the player down with it.
    void activateKeepAwakeAsync(tag).catch(() => {});
    return () => {
      if (released) return;
      released = true;
      try {
        deactivateKeepAwake(tag);
      } catch {
        // Releasing a hold that was never taken — the activate above having
        // failed — is not a failure worth surfacing either.
      }
    };
  }, [tag, active]);
}
