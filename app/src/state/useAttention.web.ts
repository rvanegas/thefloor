import { useEffect, useRef } from 'react';
import { roomOccupants } from '../../../core/guests';
import type { ChannelState } from '../../../core/types';
import { useApp } from './AppProvider';
import { attend, NOT_STANDING, touched, unattended, type Attention } from './attention';

/**
 * How often the clock is looked at.
 *
 * Nothing here is sensitive to the cadence — the window is fifteen minutes —
 * so this is chosen to be cheap rather than to be precise. It has to be a poll
 * rather than a subscription because *audible* is a state and not an event:
 * somebody talking uninterrupted produces one `ActiveSpeakersChanged` and
 * nothing after it, so an effect keyed on the set changing would see a minute
 * of speech as a single instant. See `attention.ts`.
 */
const LOOK_INTERVAL_MS = 30_000;

/**
 * What counts as a hand on the page.
 *
 * Deliberately wide and deliberately cheap: every one of these is somebody
 * doing something to this document on purpose, and none of them fires without
 * a person. `visibilitychange` and `focus` are here because bringing a tab
 * forward is an act — the same two events `cue.web.ts` listens to in order to
 * clear its mark, kept separate from that because one is about a title bar and
 * this is about presence.
 */
const HAND: string[] = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'];

/**
 * Steps an unattended tab out of the channel it is standing in.
 *
 * The rules and the reasoning are in `attention.ts`; this is the wiring, and
 * it is as thin as it can be made because nothing in this repository can drive
 * a browser. Three things happen here and nothing else does.
 *
 * **The clock is wall-clock, never accumulated ticks.** A frozen mobile tab
 * and a slept laptop run no timers at all, so a counter would come back
 * believing no time had passed. Comparing `Date.now()` against the stamp is
 * what makes waking up read correctly, and it is why a phone browser whose
 * socket somehow survived the screen going off is timed out like any other
 * tab.
 *
 * **Expiry is checked before the look, not after**, which is the same point
 * from the other side. A tab that was frozen for twenty minutes and wakes to
 * find somebody mid-sentence has no evidence about the twenty minutes: it did
 * not observe them. Attending first would let a conversation it never heard
 * excuse an absence, which is exactly the ghost this exists to remove.
 *
 * **It only ever fires against the channel this device is standing in.**
 * `live` is `liveChannelHere`, so a device the server has already stepped out
 * — the mobile-browser path, where the socket died first and `socket.ts`
 * cleared the standing — arrives here as null and disarms this rather than
 * racing it. Which of the two exits somebody takes is decided by whichever
 * clock ran out first, and they mean different things: a phone in a pocket is
 * Nearby and one tap away, a machine somebody walked away from has stepped
 * out.
 */
export function useAttention(
  live: ChannelState | null,
  me: string,
  speaking: string[]
): void {
  const app = useApp();
  const clock = useRef<Attention>(NOT_STANDING);

  // Read by the interval and by the listeners, both of which outlive any one
  // render, so the latest values are held rather than closed over. Written in
  // an effect rather than during the render that produced them: a ref assigned
  // while rendering is a write React is entitled to throw away and redo.
  const latest = useRef({ live, me, speaking, act: app.act });
  useEffect(() => {
    latest.current = { live, me, speaking, act: app.act };
  });

  useEffect(() => {
    const look = () => {
      const { live: here, me: mine, speaking: audible, act } = latest.current;
      const now = Date.now();

      if (unattended(clock.current, now)) {
        const channelId = clock.current.channelId;
        // Before the action rather than after it: the snapshot that agrees
        // takes a round trip, and a second tick inside it must not send a
        // second Step Out.
        clock.current = NOT_STANDING;
        if (channelId) act(channelId, { type: 'STEP_OUT' });
        return;
      }

      clock.current = attend(
        clock.current,
        {
          channelId: here?.id ?? null,
          me: mine,
          occupants: here ? roomOccupants(here) : [],
          audible,
        },
        now
      );
    };

    // At once, so stepping in stamps the clock now rather than up to half a
    // minute later, and so leaving disarms it immediately.
    look();
    const timer = setInterval(look, LOOK_INTERVAL_MS);

    const hand = () => {
      clock.current = touched(clock.current, Date.now());
    };
    const raised = () => {
      if (document.visibilityState === 'visible') hand();
    };

    for (const event of HAND) {
      document.addEventListener(event, hand, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', raised);
    globalThis.addEventListener?.('focus', hand);

    return () => {
      clearInterval(timer);
      for (const event of HAND) {
        document.removeEventListener(event, hand, { capture: true });
      }
      document.removeEventListener('visibilitychange', raised);
      globalThis.removeEventListener?.('focus', hand);
    };
  }, []);
}
