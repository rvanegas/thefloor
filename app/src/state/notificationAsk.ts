/**
 * When to ask for notifications, which is not the same question as whether to.
 *
 * **iOS grants one dialog per install, ever.** `requestPermissionsAsync`
 * returns the stored answer for good afterwards, so the prompt is a single
 * irreversible thing this app gets to spend, and everything here is about
 * spending it well: after somebody has been told why it matters, and at a
 * moment when the reason is legible rather than in the first ten seconds of a
 * new account when nothing has happened yet.
 *
 * Pure, and separated from `AppProvider` for the reason `detail.ts` gives:
 * this is where the policy lives, it has more cases than it looks like, and
 * the component around it is not reachable by any test here.
 */

/**
 * What iOS says about this install, flattened to the three answers that lead
 * anywhere different.
 *
 * `undetermined` is the one worth having a word for: it is the only state in
 * which a dialog can still be shown, and it is what `canAskAgain` reports
 * before the question has been put. Everything else — refused, restricted by
 * a profile, revoked in Settings later — is `denied`, because the app's move
 * is the same in all of them and it is not the dialog.
 */
export type Permission = 'granted' | 'undetermined' | 'denied';

/**
 * What the app should be putting in front of somebody about notifications.
 *
 * - `'pitch'` — the explanation, unasked for, because the moment has come and
 *   the dialog has never been spent. It is shown *before* the OS prompt, never
 *   instead of it: the prompt follows from a button on it.
 * - `'nudge'` — the dismissable banner, for somebody who has already answered
 *   no. It offers the explanation rather than a dialog, since after a refusal
 *   there is no dialog left to offer.
 * - `'none'` — the ordinary case, including everybody who has said yes.
 */
export type Ask = 'none' | 'pitch' | 'nudge';

/** A day, which is the most often anybody may be asked again. */
export const NUDGE_INTERVAL_MS = 24 * 60 * 60 * 1_000;

/**
 * How many launches count as having had a look around, when nothing else has
 * happened.
 *
 * Two: the launch that installed the app is the one that must not carry a
 * dialog, and the next one is somebody coming back on purpose. It is a floor
 * rather than the criterion — see `worthAsking`.
 */
export const LAUNCHES_BEFORE_ASKING = 2;

/**
 * Whether this account has reached the point where notifications mean
 * something to it.
 *
 * **Two halves, and the second is a floor rather than the real signal.**
 *
 * The real signal is `conversed` — you have been in a channel with somebody
 * else, so you know what it is you would be missing, and the app has earned
 * the question. Asking then is asking about an experience rather than about a
 * word.
 *
 * But waiting for it alone is a trap, and it is the specific trap this feature
 * exists to avoid: **the first conversation is the one most likely to need a
 * notification to happen at all.** Somebody who installs the app, is invited,
 * and is never reachable may never have a conversation *because* nothing can
 * reach them, and a criterion that waits for one would then wait for ever. So
 * a second launch with somebody in the address book is enough on its own.
 *
 * `somebody` is what both halves stand on: a contact, an invitation waiting,
 * or a channel. With none of those there is nobody who could notify you, and
 * a dialog about being reachable is a dialog about nothing — which is exactly
 * the ten-seconds-after-install ask this replaced.
 */
export function worthAsking(state: {
  /** Contacts, invitations and channels — anybody at all who could reach you. */
  somebody: boolean;
  /** You have been present in a channel alongside somebody else. */
  conversed: boolean;
  /** Cold launches of this install that got as far as being signed in. */
  launches: number;
}): boolean {
  if (!state.somebody) return false;
  return state.conversed || state.launches >= LAUNCHES_BEFORE_ASKING;
}

/**
 * What to put in front of somebody right now, which is nothing most of the
 * time.
 *
 * **`denied` skips the criteria deliberately.** They exist to hold the one
 * dialog back until it is worth spending; somebody who has already refused has
 * spent it, and there is nothing left to protect. That is also what carries
 * every install of the builds before this one, where the ask happened at
 * sign-in: they arrive here already denied, with no local record of anything,
 * and fall straight into the daily cadence.
 *
 * **The cadence is measured from the last time somebody was asked, not from
 * the last time they said no.** A banner raised and ignored costs the day, on
 * the reasoning that being shown the thing is the imposition — and a banner
 * that reappeared until it was formally dismissed would be a banner that
 * punished ignoring it.
 */
export function askDue(
  now: number,
  state: {
    permission: Permission;
    /** `worthAsking`, which the caller computes because it reads app state. */
    ready: boolean;
    /** The explanation has been shown at least once, however it went. */
    pitched: boolean;
    /** When anything was last raised about this, or null for never. */
    nudgedAt: number | null;
  }
): Ask {
  if (state.permission === 'granted') return 'none';

  // The one dialog is still unspent, and this is the first thing they will
  // have seen about it. Everything the criteria are for.
  if (state.permission === 'undetermined' && !state.pitched) {
    return state.ready ? 'pitch' : 'none';
  }

  // Everything else is somebody who has answered, or been asked and put it
  // off. A day apart at most, and never the dialog again — see `Ask`.
  if (state.nudgedAt === null) return 'nudge';
  return now - state.nudgedAt >= NUDGE_INTERVAL_MS ? 'nudge' : 'none';
}
