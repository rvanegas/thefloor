import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { roomOccupants } from '../../../core/guests';
import type { ChannelState } from '../../../core/types';
import { recordEvent } from '../audio/diagnostics';
import { useApp } from './AppProvider';
import {
  attend,
  ATTENTION_WINDOW_MS,
  NOT_STANDING,
  touched,
  unattended,
  type Attention,
} from './attention';

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
 * clicks and keystrokes; a phone has none of them, so what stands in for a
 * hand here is the app being frontmost — **a state rather than an act, since
 * 2026-09-06.** It was read as an act at first, refreshing the clock only at
 * the moment the app came forward, and that is a materially different rule: it
 * expires somebody who is looking at the screen and has simply not brought the
 * app forward in the last fifteen minutes, which on a phone is what reading
 * one screen for a while looks like. A browser can afford the narrower reading
 * because an abandoned tab is exactly the ghost it is hunting; a foregrounded
 * app is not abandoned, because the phone would have dimmed and locked.
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
    // When the previous look ran, held here rather than in a ref because it
    // is the interval's own business and dies with it.
    let lastLook = 0;

    const look = () => {
      const { live: here, me: mine, speaking: audible, act } = latest.current;
      const now = Date.now();

      // **Being in front is evidence, and it is read here rather than only at
      // the transition.** The listener below catches the moment somebody picks
      // the phone up; this catches every moment after it, which is the half
      // that was missing. Somebody looking at the channel is attending it
      // whether or not they have touched anything since, and a phone offers no
      // scroll or keystroke to say so on their behalf — so the app being
      // frontmost is the whole of the evidence there is, and it is continuous
      // rather than an event.
      //
      // Before the expiry check so that the two cannot disagree within a
      // single look. This does not rescue a backgrounded phone, and is not
      // meant to: what expires one of those is the window running out while
      // nobody was audible, which is the rule working rather than a race.
      const foreground = AppState.currentState === 'active';
      if (foreground) {
        clock.current = touched(clock.current, now);
      }

      const standing = clock.current.channelId !== null;
      const age = standing ? now - clock.current.heardAt : 0;
      const present = here ? roomOccupants(here) : [];
      /**
       * What the look saw, in the terms that decide the outcome.
       *
       * **`others` and `audible` are counted separately because the gap
       * between them is the whole rule**, and it is the thing no other record
       * holds. The server knows who is in the room and whose track is unmuted;
       * it does not know who this device had in its active-speaker set at the
       * instant a look ran, and that is what sets `heardAt`. Somebody present,
       * unmuted and simply not talking reads here as `others=1 audible=0`,
       * which is the state that spends the window.
       */
      /**
       * How long since the previous look, which is the fact everything else
       * has had to be inferred around.
       *
       * **A look that is minutes late is a device that was not observing**,
       * and the difference decides how to read every other number here. The
       * clock is refreshed only by what a look sees, so a frozen process
       * accumulates a window's worth of staleness without anybody being
       * absent, and the first look after it spends that staleness at once.
       * Whether iOS actually freezes these timers behind a live LiveKit
       * connection is the open question of 2026-09-06 — the media stack is
       * native and stays up, so a phone can hold its seat while this hook is
       * not running at all. One expiry line carrying a gap of thirty minutes
       * settles it; a whole evening of inference from usage spans did not.
       */
      const gap = lastLook === 0 ? 0 : now - lastLook;
      lastLook = now;

      const seen =
        `others=${present.filter((id) => id !== mine).length}` +
        ` audible=${audible.filter((id) => id !== mine).length}` +
        ` fg=${foreground ? 'T' : 'F'}` +
        ` gap=${Math.round(gap / 1000)}s`;

      // Expiry before the look, as on the web: a phone that was suspended for
      // twenty minutes and wakes to find somebody mid-sentence has no evidence
      // about the twenty minutes it did not observe.
      if (unattended(clock.current, now)) {
        const channelId = clock.current.channelId;
        // The one line that is never rate-limited. Every question asked of
        // this clock so far has been answered by inference from usage spans,
        // and twice that inference was wrong; this says outright that the app
        // ended the visit, and what it believed when it did.
        recordEvent(`attention expired after ${Math.round(age / 1000)}s ${seen}`);
        clock.current = NOT_STANDING;
        if (channelId) act(channelId, { type: 'STEP_OUT' });
        return;
      }

      // **Only the second half of the window is worth shipping.** A line every
      // thirty seconds to say a conversation is going normally is noise that
      // costs a phone's radio and buries the runs that end in an expiry; the
      // approach to one is the only part anybody reads, and it carries the
      // fact that matters — the last moment somebody was audible, which is
      // where the fifteen minutes is measured from.
      if (standing && age >= ATTENTION_WINDOW_MS / 2) {
        recordEvent(`attention age ${Math.round(age / 1000)}s ${seen}`);
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
