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
 * accidentally at first, then deliberately, and since 2026-09-08 as the whole
 * design: stepping in is an open microphone. So a pocketed phone holds a
 * channel indefinitely, which is precisely the ghost the web half exists to
 * remove.
 *
 * **Presence is supposed to mean responsiveness.** A room of such phones reads
 * as occupied, and `announceActive` fires only on the empty-to-occupied edge —
 * so an occupied ghost room silently swallows every arrival notification
 * anybody in it would have received. That was observed in the field before
 * this was written.
 *
 * **This half only ever expires a device standing alone, since 2026-09-07**,
 * and that is the largest way it differs from the web. The shared rules still
 * apply — somebody else audible refreshes the clock, an arrival refreshes it,
 * your own voice never does — but reaching the end of the window is not enough
 * on a phone: the room has to be empty of everybody else as well.
 *
 * The reason is that the window cannot tell the two quiet rooms apart. A room
 * somebody walked away from and a room where two people are deliberately quiet
 * — music with a muted listener, two people asleep — produce identical
 * readings, and the right answers are opposite. On 2026-09-06 it resolved that
 * ambiguity the worst possible way: because `attend` discards your own voice,
 * the only person *making* the audio was the only person whose clock was
 * ageing, and it removed him while everybody listening to him stayed. Alone,
 * there is no such ambiguity and nothing to get wrong.
 *
 * **So this is also the bound on every visit**, since 2026-09-08. Stepping in
 * opens the microphone — iOS will not grant a backgrounded app a new one, so it
 * has to be open before the phone is pocketed — and capturing keeps the process
 * alive indefinitely. Nothing else stops that; this does. It used to bound one
 * case, the solo wait; the solo wait is now every visit, so this timer is the
 * only thing between a pocketed phone and a room it holds for ever.
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
       *
       * **The question this was added to settle is answered: iOS does not
       * freeze these timers.** A backgrounded phone holding a LiveKit
       * connection logged sixteen consecutive looks at `gap=30s` across a full
       * fifteen-minute window on 2026-09-06, with no missed tick. So a late
       * look is not the explanation for any step-out, and any future report
       * that blames one has to produce a line showing it. Kept for exactly
       * that: it costs a few characters and it is the only thing that can
       * distinguish a device that was not observing from one that was.
       */
      const gap = lastLook === 0 ? 0 : now - lastLook;
      lastLook = now;

      const others = present.filter((id) => id !== mine).length;
      const seen =
        `others=${others}` +
        ` audible=${audible.filter((id) => id !== mine).length}` +
        // **Your own voice, which is counted nowhere else.** `audible` above
        // excludes you, by the rule in `attend` that your own voice never
        // refreshes your own clock — so a room where you were the only sound
        // for fifteen minutes and a room that was silent produce identical
        // lines. That ambiguity is exactly what made the 2026-09-06 diagnosis
        // take three attempts, and this is the one character that ends it.
        ` self=${audible.includes(mine) ? 'T' : 'F'}` +
        ` fg=${foreground ? 'T' : 'F'}` +
        ` gap=${Math.round(gap / 1000)}s`;

      // **Only a device standing alone may be expired, since 2026-09-07.**
      //
      // The rule this replaced expired anybody whose window ran out, and it
      // could not tell an abandoned room from one where two people are
      // deliberately quiet — music with a muted listener, or two people asleep
      // — because no measure taken from the audio separates them. It removed
      // the wrong person on 2026-09-06: `attend` discards your own voice, so
      // the one participant producing the audio was the only one whose clock
      // was ageing, while everybody listening to him was refreshed by him.
      //
      // Alone, there is nothing to misjudge. A phone by itself in a channel is
      // holding the room open against nobody, and this is the only bound on
      // that: stepping in opens the microphone, and an open microphone keeps
      // the process alive with nothing else to stop it.
      //
      // Two pocketed phones with open microphones are therefore never expired
      // here. That is the decision rather than a gap: Rule A retires the room
      // if neither is publishing unmuted, and if both are, nobody is willing to
      // say from the audio alone that the room is empty of people.
      const alone = others === 0;

      // Expiry before the look, as on the web: a phone that was suspended for
      // twenty minutes and wakes to find somebody mid-sentence has no evidence
      // about the twenty minutes it did not observe.
      if (alone && unattended(clock.current, now)) {
        const channelId = clock.current.channelId;
        // The one line that is never rate-limited. Every question asked of
        // this clock so far has been answered by inference from usage spans,
        // and twice that inference was wrong; this says outright that the app
        // ended the visit, and what it believed when it did.
        recordEvent(`attention expired after ${Math.round(age / 1000)}s ${seen}`);
        clock.current = NOT_STANDING;
        // **`ATTENTION_EXPIRED`, not `STEP_OUT`.** A step-out is `exit:
        // 'chosen'` and reads as a tap on the button; this was the app's
        // decision, and `exit: 'inattentive'` is the row that says so. It does
        // not leave them *Nearby*, deliberately: the fifteen minutes it takes
        // to get here is the same fifteen minutes Nearby would grant, and it
        // has been spent whether or not anybody was shown it.
        if (channelId) act(channelId, { type: 'ATTENTION_EXPIRED' });
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
          // A phone wants this and a browser does not — see `Look`. Without
          // it, becoming solo is the one transition that arms the rule above
          // while handing it a window that is already nearly spent, so the
          // last person out of a room could take somebody with them.
          departureCounts: true,
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
