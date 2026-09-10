import { useEffect, useRef } from 'react';
import { useApp } from './AppProvider';

/**
 * The gestures a browser offers, which is what stands in for a hand.
 *
 * `visibilitychange` and `focus` are here because bringing a tab forward is
 * itself somebody arriving at it, and neither produces any of the others.
 * `capture: true` so a click that a component stops still counts — the
 * question is whether a person is there, not whether the application chose to
 * act on what they did.
 */
const HAND = ['pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'] as const;

/**
 * Tells the server this tab is being attended.
 *
 * **It used to decide, and now it reports** — see `useAttention.ts` for the
 * account of that move, which is the same one, and `state/attention.ts` for
 * what counts as evidence.
 *
 * **A hand, rather than the tab merely being visible**, which is where this
 * half legitimately differs from the phone's. An abandoned tab is exactly the
 * ghost the window is hunting: it keeps its socket, its timers and its audio
 * for as long as the machine is awake, and a visible tab in a workspace
 * nobody is looking at is the commonest shape of it. A phone cannot be
 * abandoned in that way — it dims and locks — so there, being frontmost is
 * allowed to speak for somebody who is only reading.
 */
export function useAttention(): void {
  const app = useApp();
  const report = useRef(app.reportAttentive);
  useEffect(() => {
    report.current = app.reportAttentive;
  });

  useEffect(() => {
    const hand = () => report.current();
    const raised = () => {
      if (document.visibilityState !== 'visible') return;
      // The same exception the phone makes for foregrounding: arriving back at
      // a tab is the evidence most worth having and is never rate-limited
      // away.
      report.current(true);
    };

    for (const event of HAND) {
      document.addEventListener(event, hand, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', raised);
    globalThis.addEventListener?.('focus', raised);

    return () => {
      for (const event of HAND) {
        document.removeEventListener(event, hand, { capture: true });
      }
      document.removeEventListener('visibilitychange', raised);
      globalThis.removeEventListener?.('focus', raised);
    };
  }, []);
}
