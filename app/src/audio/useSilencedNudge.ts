import { useEffect, useRef } from 'react';
import * as Haptics from 'expo-haptics';
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
 * **What it cannot do is reach a phone that is not in the foreground.** iOS
 * feedback generators are ignored when the app is not active, silently and
 * with no error, so a locked or backgrounded phone gets nothing — and a pocket
 * is often exactly that. This is therefore a partial answer to the case it was
 * built for: it covers the phone face down on a table, or held and not looked
 * at, and not the phone that has locked itself. The remaining case needs a
 * different delivery — a tone into the audio session, which reaches a
 * background app because the audio does, at the cost of playing over the
 * voice it is announcing. See TASKS.md § *Being Silenced Without Looking*;
 * that trade is not settled and is not settled by building this.
 *
 * `Warning` rather than an impact: it is a two-beat pattern rather than a
 * single knock, which is what makes it legible through a pocket and
 * distinguishable from every incidental tap the interface makes.
 */
const buzz = () =>
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
    // A device with no haptic engine, or one that refuses while another
    // generator is running. There is nothing to do about it and nothing to
    // say: the cue is an extra, and a failed cue must not become an error in
    // a conversation.
    //
    // **What this does not catch is the way it actually failed**, and that is
    // worth knowing before trusting a quiet log. In build 70 nothing arrived
    // at all, because iOS mutes haptics for the duration of any session that
    // is using audio input and the default is to do so — so this call
    // *resolved*, every time, and produced nothing. A rejection would have
    // been the easy version. The fix is one property on the session, asserted
    // by `applyConfiguration` and read back in the diagnostics panel as
    // `haptics ok`; see `modules/audio-route`.
    () => {}
  );

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
