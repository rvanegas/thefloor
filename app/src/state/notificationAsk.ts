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
 *   nobody has read it here yet. Where a dialog is still to be had it is shown
 *   *before* that dialog, never instead of it — the prompt follows from a
 *   button on it. Where one has already been refused it is shown anyway, and
 *   the button offers Settings.
 * - `'nudge'` — the dismissable banner, afterwards, and in the meantime for a
 *   refused install that is not ready for the screen yet. It never raises a
 *   dialog; it opens the explanation.
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
 * **The explanation is owed to somebody who has refused just as much as to
 * somebody who has not been asked**, which is the correction of 2026-09-08.
 * The first cut showed it only while the dialog was unspent, on the reasoning
 * that it was there to spend the dialog well — and that reads the screen as an
 * accessory to a permission prompt. It is not. What it says is that this
 * application is people reaching each other and an unreachable install is
 * barely an application at all, and the person who most needs to hear it is
 * exactly the one who has already said no, most likely to a system dialog that
 * could not tell them any of it. A banner is too small a thing to carry that
 * once.
 *
 * So it fires for `denied` too, once, and the banner is what returns
 * afterwards. Every install of the builds before this one arrives here in
 * precisely that state — asked at sign-in, refused, holding no local record —
 * and gets the explanation it was never given.
 *
 * **`ready` still gates it in both cases**, for part two's reason rather than
 * the dialog's: a full screen about being unreachable, put in front of
 * somebody who has been in the app for ten seconds and has nobody in it yet,
 * is an interruption about nothing. What a refused install that is not ready
 * yet gets in the meantime is the banner, which is the smaller thing and is
 * what the daily cadence is for.
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

  // Nobody has read it yet and the moment has come — whether the dialog is
  // unspent or was refused years ago. It is the same thing to say either way,
  // and it is only ever said unbidden once.
  if (!state.pitched && state.ready) return 'pitch';

  // Still exploring, and the dialog is intact. Nothing at all until it is
  // worth spending — the whole of what the wait is for.
  if (state.permission === 'undetermined' && !state.pitched) return 'none';

  // Everything else is somebody who has read it, or who has refused and is not
  // ready to be shown a screen about it. A day apart at most, and never the
  // dialog again — see `Ask`.
  if (state.nudgedAt === null) return 'nudge';
  return now - state.nudgedAt >= NUDGE_INTERVAL_MS ? 'nudge' : 'none';
}
