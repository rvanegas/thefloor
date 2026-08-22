import { useEffect, useRef } from 'react';
import * as Haptics from 'expo-haptics';
import { vibrate } from '../../modules/audio-route';
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
 * **The alert vibration, not a notification haptic, and that took two builds
 * to arrive at.** Build 70 produced nothing at all — iOS mutes haptics for the
 * duration of any session using audio input, which is every moment this cue
 * can fire, and `notificationAsync` *resolved* throughout rather than failing.
 * Build 71 fixed the permission and the buzz arrived: "very slight, hardly
 * perceptible". Which is an accurate description of what
 * `NotificationFeedbackType.Warning` is. Apple's notification haptics are
 * tuned for a hand already holding the phone and looking at it, and the whole
 * premise here is the opposite — a phone in a pocket, against a leg, with
 * somebody mid-sentence.
 *
 * So the cue is the strength iOS uses for the same problem when it has one: an
 * incoming call. `vibrate()` in `modules/audio-route` is the vibration motor
 * rather than the Taptic Engine.
 *
 * **The two failures were the same shape and neither announced itself.** One
 * was suppressed by a session property, the other was delivered at a strength
 * nobody could feel; both reported success. There is no readable evidence for
 * either from JavaScript, which is why `haptics ok` in the diagnostics panel
 * exists and why this comment is longer than the function.
 */
const buzz = () => {
  // Android, jest, and any build whose native half predates `vibrate` — none
  // of which is iOS in a pocket, so the weaker cue is the right answer there
  // rather than a compromise.
  if (vibrate()) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
    // A device with no haptic engine, or one that refuses while another
    // generator is running. There is nothing to do about it and nothing to
    // say: the cue is an extra, and a failed cue must not become an error in
    // a conversation.
    () => {}
  );
};

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
