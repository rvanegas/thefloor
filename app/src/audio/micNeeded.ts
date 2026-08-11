import { isRecordingActive } from '../../../core/recording';
import type { ChannelState, UserId } from '../../../core/types';

/**
 * Whether the microphone has anything to capture *for*.
 *
 * Alone in a channel it has not, and holding it open is not free: it takes the
 * audio session as a call, which drags a Bluetooth speaker from A2DP down to
 * the mono hands-free profile and silences every other app for as long as you
 * are in the channel. Being in an empty channel should cost the speakers
 * nothing.
 *
 * **Recording is the exception, and not a small one.** `core/channel.ts` lets
 * one person alone record — a note to yourself is a use rather than a mistake
 * — so a solo run has to hold the microphone open with nobody there. Written
 * as "alone means closed", this would record silence and say nothing about it,
 * which is why it is a function with a test rather than a condition inline.
 */
export function microphoneNeeded(
  channel: ChannelState,
  me: UserId
): boolean {
  if (channel.present.some((id) => id !== me)) return true;
  return isRecordingActive(channel.recording);
}
