import { useCallback, useEffect, useState } from 'react';

import { storage } from '../state/storage';

/**
 * Which *getting-started channels* have had their explanatory card put away on
 * this install.
 *
 * **A list rather than a flag**, because somebody can be in more than one over
 * a life: they leave the first, sign up again on another address, or the day
 * comes when a second is offered for some reason nobody has thought of yet.
 * Dismissing the card on one channel is a statement about that channel — *I
 * have read this* — and not a standing instruction to never explain anything
 * again.
 *
 * **On the install rather than on the account**, which is the same call
 * `installNotice.ts` and the *introduction*'s dismissals make and for the same
 * reason: it records that a card has been read by whoever is looking at this
 * screen, which is a fact about a person in front of a device. Going through
 * `storage` rather than `localStorage` directly, unlike the install notice,
 * because this one is drawn on a phone.
 *
 * Cleared on sign-out with every other key — see `INSTALL_KEYS`, where this
 * one is listed. Signing in as somebody else on a shared phone should not hand
 * them a channel with the explanation already dismissed.
 */
const COHORT_DISMISSED_KEY = 'thefloor.cohort.dismissed';

/**
 * Whether to draw the card for this channel, and how to put it away.
 *
 * **`null` while it is being read**, rather than `false`. The store is async on
 * a phone, so a boolean starting at "not dismissed" draws the card for a frame
 * and then removes it — a card that flashes on a screen somebody has opened a
 * hundred times. The caller draws nothing until the answer is known, which
 * costs one frame on the first visit and nothing afterwards.
 */
export function useCohortNotice(channelId: string | null): {
  show: boolean;
  dismiss: () => void;
} {
  const [dismissed, setDismissed] = useState<readonly string[] | null>(null);

  useEffect(() => {
    let live = true;
    void storage.get(COHORT_DISMISSED_KEY).then((raw) => {
      if (live) setDismissed(raw ? raw.split(',').filter(Boolean) : []);
    });
    return () => {
      live = false;
    };
  }, []);

  const dismiss = useCallback(() => {
    if (!channelId) return;
    setDismissed((current) => {
      const next = [...(current ?? []), channelId];
      // Written without waiting. The card is already gone from the screen by
      // the time this resolves, and a failed write costs one card shown again
      // — which is the same nuisance `dismissInstallNotice` accepts, and the
      // same reason: nothing here is worth blocking a tap on.
      void storage.set(COHORT_DISMISSED_KEY, next.join(','));
      return next;
    });
  }, [channelId]);

  return {
    show: !!channelId && dismissed !== null && !dismissed.includes(channelId),
    dismiss,
  };
}
