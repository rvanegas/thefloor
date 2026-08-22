import { useEffect, useRef } from 'react';
import { buzz } from './cue';
import { isSilenced } from '../../../core/floor';
import type { ChannelState, UserId } from '../../../core/types';
import { NO_NUDGE, step } from './nudge';

/**
 * Buzzes somebody who is talking while silenced.
 *
 * `nudge.ts` owns when; this owns the two inputs and the buzz itself.
 *
 * **Held above the channel screen, in `App.tsx`, and that is the whole point.**
 * Walking back to Home leaves you in the conversation — presence is not a
 * screen — so a cue mounted inside `ChannelView` would switch itself off for
 * precisely the people who are not looking at the channel. It follows `live`,
 * the channel you are *present in*, for the same reason the audio does.
 *
 * **The cue is `buzz` in `cue.ts`, which is the vibration motor rather than
 * the Taptic Engine**, and the two builds that took are written down there.
 * What matters here is the consequence: it reaches a locked phone, which is
 * most of what a pocket is and the case this whole cue was built for.
 * **Confirmed on a device, build 72**: locked phone, somebody claims the
 * floor, keep talking, and it buzzes.
 *
 * So the delivery that was held open for this case — a tone into the audio
 * session, which reaches a background app because the audio does, at the cost
 * of playing over the very voice it is announcing — **is not needed and must
 * not be built.** See DECISIONS.md § *The buzz reaches a locked phone, so the
 * tone is not built*.
 */
export function useSilencedNudge(
  channel: ChannelState | null,
  me: UserId,
  speaking: readonly string[],
  fire: () => void = buzz
): void {
  // The claim rather than the fact of being silenced, so a second claim starts
  // a fresh budget — see `nudge.ts`. Null covers all three of: no channel, no
  // claim, and the claim being ours.
  const claim =
    channel && isSilenced(channel.floor, me) ? channel.floor.claimedAt : null;
  const speakingNow = speaking.includes(me);
  const state = useRef(NO_NUDGE);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      const next = step(state.current, {
        claim,
        speaking: speakingNow,
        now: Date.now(),
      });
      state.current = next.state;
      if (next.buzz) fire();
      // One timer, armed for the next thing that is due and nothing else.
      // Every other input arrives as an event and re-runs this effect.
      if (next.nextAt !== null) {
        timer = setTimeout(run, Math.max(0, next.nextAt - Date.now()));
      }
    };
    run();
    return () => clearTimeout(timer);
  }, [claim, speakingNow, fire]);
}
