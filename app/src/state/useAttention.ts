import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { recordEvent } from '../audio/diagnostics';
import { useApp } from './AppProvider';

/**
 * How often the phone says it is still there.
 *
 * The same interval the clock used to be looked at on, kept because the
 * evidence is the same evidence: being frontmost is a state rather than an
 * event, so somebody reading one screen produces nothing to listen for and has
 * to be noticed by asking. `AppProvider.reportAttentive` rate-limits on top of
 * this, so the two cannot fight.
 */
const LOOK_INTERVAL_MS = 30_000;

/**
 * Tells the server this phone is being attended.
 *
 * **It used to decide, and now it reports.** Until 2026-09-09 this file held a
 * private fifteen-minute clock, ran the rule against it, and dispatched
 * `ATTENTION_EXPIRED` when the window ran out — a second copy of a rule the
 * web half also held, differing from it in ways that had to be written down
 * twice. The clock is the server's now, one per account rather than one per
 * device per channel, and what a client owes it is evidence. See
 * `state/attention.ts` for what counts as evidence and why, and
 * `ChannelRegistry.expireInattentive` for what is done with it.
 *
 * **Two consequences of that move are worth saying here**, because they are
 * the reason this hook is shorter than the one it replaces.
 *
 * It is no longer scoped to a channel. The old clock was armed by standing
 * somewhere and inert otherwise — `NOT_STANDING` — so a person nearby, or
 * reading Home, was producing no evidence at all about themselves. Attention
 * is a property of the person now: a hand on any screen says they are there,
 * and every rung they are on in every channel is entitled to know it.
 *
 * And it no longer watches the audio. Somebody else being audible used to
 * refresh the clock; the person being talked at may have walked away, and the
 * phone in their pocket hears the voice perfectly well. What protects a silent
 * listener is `subscribeable` in `core/` — whether there was anything in the
 * room to listen to — rather than a measure taken from the sound of it.
 *
 * **The bound on a pocketed phone is unchanged in strength.** Stepping in
 * opens the microphone, capturing keeps a backgrounded process alive, and
 * nothing else stops that: a phone that stops reporting stops being attended,
 * and fifteen minutes later the server retires it. What changed is who owns
 * the clock, not what it is for.
 */
export function useAttention(): void {
  const app = useApp();
  const report = useRef(app.reportAttentive);
  useEffect(() => {
    report.current = app.reportAttentive;
  });

  useEffect(() => {
    // **A state, read repeatedly, rather than an event.** The listener below
    // catches the moment somebody picks the phone up; this catches every
    // moment after it. A phone offers no scroll or keystroke on behalf of
    // somebody reading one screen, so being frontmost is the whole of the
    // evidence there is — and it is continuous.
    const look = () => {
      if (AppState.currentState !== 'active') return;
      report.current();
    };
    look();
    const timer = setInterval(look, LOOK_INTERVAL_MS);

    const listener = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      // Not rate-limited away: coming back is the most valuable evidence there
      // is, being the one moment that can rescue a clock which is about to run
      // out. `reportAttentive` sends it whatever the gate says.
      report.current(true);
      recordEvent('attention foreground');
    });

    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, []);
}
