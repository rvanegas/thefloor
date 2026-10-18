/**
 * When to ask for notifications, which is now: the moment somebody has signed
 * in on an install that has not been asked.
 *
 * **iOS grants one dialog per install, ever.** `requestPermissionsAsync`
 * returns the stored answer for good afterwards. From 2026-09-08 this module
 * spent it late and argued for it first, with a full page of explanation and a
 * wait for a second launch or a first conversation; on 2026-10-17 that was
 * dropped. The dialog is raised straight after authentication, and somebody
 * who declines is not left unreachable: the app turns on notifications by
 * email for them — see `emailNotifications` in core/settings.ts.
 *
 * Pure, and separated from `AppProvider` for the reason `detail.ts` gives:
 * this is where the policy lives, and the component around it is not reachable
 * by any test here.
 */

/**
 * What iOS says about this install, flattened to the three answers that lead
 * anywhere different.
 *
 * `undetermined` is the only state in which a dialog can still be shown.
 * Everything else — refused, restricted by a profile, revoked in Settings
 * later — is `denied`, because the app's move is the same in all of them and
 * it is not the dialog.
 */
export type Permission = 'granted' | 'undetermined' | 'denied';

/**
 * What the app should be doing about notifications right now.
 *
 * - `'prompt'` — raise the system dialog. Only ever while it is unspent.
 * - `'nudge'` — the dismissable banner on Home, for a refused install, a day
 *   apart at most. It never raises a dialog; it opens the short prompt, whose
 *   button is the Settings app.
 * - `'none'` — the ordinary case, including everybody who has said yes and
 *   everybody who switched push off in Floor Settings.
 */
export type Ask = 'none' | 'prompt' | 'nudge';

/** A day, which is the most often anybody may be nudged again. */
export const NUDGE_INTERVAL_MS = 24 * 60 * 60 * 1_000;

/**
 * What to do right now, which is nothing most of the time.
 *
 * **Push switched off in Floor Settings silences all of it**, the banner
 * included: somebody who has said they want no push has answered the question
 * the banner asks, and the screen they said it on is where they turn it back.
 *
 * **The cadence is measured from the last time somebody was nudged, not from
 * the last time they said no.** Being shown the banner is the imposition, and
 * one that reappeared until it was formally dismissed would punish ignoring
 * it.
 */
export function askDue(
  now: number,
  state: {
    permission: Permission;
    /** `pushNotificationsOff` from the account settings. */
    pushOff: boolean;
    /** When the banner was last raised, or null for never. */
    nudgedAt: number | null;
  }
): Ask {
  if (state.permission === 'granted' || state.pushOff) return 'none';
  if (state.permission === 'undetermined') return 'prompt';
  if (state.nudgedAt === null) return 'nudge';
  return now - state.nudgedAt >= NUDGE_INTERVAL_MS ? 'nudge' : 'none';
}
