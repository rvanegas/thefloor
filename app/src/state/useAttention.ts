import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { roomOccupants } from '../../../core/guests';
import type { ChannelState } from '../../../core/types';
import { useApp } from './AppProvider';
import { attend, NOT_STANDING, touched, unattended, type Attention } from './attention';

/**
 * How often the clock is looked at. The same reasoning as the web half: the
 * window is fifteen minutes, so this is chosen to be cheap, and it has to be a
 * poll because *audible* is a state rather than an event.
 */
const LOOK_INTERVAL_MS = 30_000;

/**
 * Steps an unattended phone out of the channel it is standing in.
 *
 * **This file was a no-op until 2026-09-06, and its own reasoning explains
 * why it stopped being allowed to be one.** It used to say: *"A phone that is
 * put away loses the process within a second, and its presence about a minute
 * later, without anybody deciding anything… There is no state in which an iOS
 * app is holding a channel that nobody is near, so there is nothing here to
 * measure."*
 *
 * That was true when it was written and this project falsified it twice.
 * `holdForPlayout` (build 143) keeps a microphone open and muted, and an open
 * microphone is capturing, and capturing keeps a backgrounded process alive —
 * accidentally at first. The silence keep-alive (145) did it deliberately, and
 * the microphone hold does it for as long as somebody is waiting. So a pocketed
 * phone now holds a channel indefinitely, which is precisely the ghost the web
 * half exists to remove.
 *
 * **Presence is supposed to mean responsiveness.** A room of such phones reads
 * as occupied, and `announceActive` fires only on the empty-to-occupied edge —
 * so an occupied ghost room silently swallows every arrival notification
 * anybody in it would have received. That was observed in the field before
 * this was written.
 *
 * **The rules are the web half's, unchanged**, and that is the point of
 * `attention.ts` being separate: somebody else being audible refreshes the
 * clock, an arrival refreshes it, your own voice never does. So a phone in a
 * pocket beside a live conversation keeps its seat, and one alone in a quiet
 * room loses it — which is the difference between a stuck member and a defunct
 * visit.
 *
 * **The one thing that differs is what counts as a hand.** A browser has
 * clicks and keystrokes; a phone has exactly one deliberate act, which is
 * bringing the app to the front. Everything else a person does to a phone is
 * invisible to us.
 *
 * **The server has a counterpart and they are not redundant.** Rule A in
 * `channels.ts` retires a room in which *nothing at all* is published unmuted;
 * this retires *one device* that is not attending a room somebody else may
 * still be holding open. Neither can see what the other sees: the server
 * cannot tell who is backgrounded, and a phone cannot tell whether the room is
 * defunct or merely quiet for a moment.
 */
export function useAttention(
  live: ChannelState | null,
  me: string,
  speaking: string[]
): void {
  const app = useApp();
  const clock = useRef<Attention>(NOT_STANDING);

  // Held rather than closed over, and written in an effect rather than during
  // render, for the reasons the web half gives at the same line.
  const latest = useRef({ live, me, speaking, act: app.act });
  useEffect(() => {
    latest.current = { live, me, speaking, act: app.act };
  });

  useEffect(() => {
    const look = () => {
      const { live: here, me: mine, speaking: audible, act } = latest.current;
      const now = Date.now();

      // Expiry before the look, as on the web: a phone that was suspended for
      // twenty minutes and wakes to find somebody mid-sentence has no evidence
      // about the twenty minutes it did not observe.
      if (unattended(clock.current, now)) {
        const channelId = clock.current.channelId;
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

    look();
    const timer = setInterval(look, LOOK_INTERVAL_MS);

    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      clock.current = touched(clock.current, Date.now());
    });

    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);
}
