import * as Haptics from 'expo-haptics';
import { vibrate } from '../../modules/audio-route';

/**
 * The buzz this app uses when somebody has to be told something without words.
 *
 * Extracted from `useSilencedNudge` on 2026-08-22, when a second caller
 * appeared, and the comment travels with it because the *reasoning* is what is
 * worth reusing rather than the four lines:
 *
 * **It reaches a locked phone, and that was not free — it is why the cue is
 * the motor.** iOS feedback generators are ignored when the app is not
 * *active*, silently and with no error, so a locked or backgrounded phone got
 * nothing from `Haptics` — which is most of what a pocket is.
 * `AudioServicesPlaySystemSound` is not a feedback generator and is not gated
 * on `UIApplication` state, which is how iOS vibrates for an incoming call
 * while every app is backgrounded. **Confirmed on a device, build 72.**
 *
 * **And it is the alert vibration rather than a notification haptic**, which
 * took two builds to arrive at. Build 70 produced nothing at all — iOS mutes
 * haptics for the duration of any session using audio input, and
 * `notificationAsync` *resolved* throughout rather than failing. Build 71
 * fixed the permission and the buzz arrived: "very slight, hardly
 * perceptible", which is an accurate description of
 * `NotificationFeedbackType.Warning`. Apple tunes those for a hand already
 * holding the phone; the premise here is the opposite.
 *
 * **Both failures were the same shape and neither announced itself** — one
 * suppressed by a session property, the other delivered at a strength nobody
 * could feel, both reporting success. There is no readable evidence for either
 * from JavaScript, which is why `haptics ok` exists in the diagnostics panel.
 */
export function buzz(): void {
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
}
