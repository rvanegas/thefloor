import { isRecordingActive } from './recording';
import type { ChannelState, UserId } from './types';

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

/**
 * Whether *anybody* present has an open microphone — which is what decides the
 * audio session's configuration for everyone, rather than each person's own
 * microphone deciding their own.
 *
 * The reasoning is about Bluetooth, and it is physical rather than a
 * preference. A headset cannot carry a microphone and high-quality stereo at
 * the same time: A2DP is one-way and full-bandwidth, HFP is two-way and mono,
 * and they are different link types, so asking for capture *is* asking iOS to
 * tear one down and bring the other up. `CALL` is the only configuration that
 * is `playAndRecord`, so every crossing of that boundary costs a profile
 * handover, and the route can be — and was — lost inside one.
 *
 * Keying it on your own microphone made self-muting mid-conversation cross that
 * boundary, which dropped a tester's headphones to the phone speaker until they
 * unmuted again. But the answer is not to stop crossing it: there are two
 * situations where high quality is genuinely wanted, and they are the same
 * situation — nobody is talking, so what matters is either another app's audio
 * or the channel's own playback. Whether anyone's microphone is open
 * distinguishes exactly that, and nothing else has to be consulted. No timer,
 * no threshold, and no special case for playback.
 *
 * **Asked about microphones rather than about `selfMuted` directly**, which
 * matters for one case and would otherwise be a regression rather than a fix.
 * Alone in a channel and unmuted, "everybody present is muted" is false — so a
 * literal reading takes the session as a call and silences the music somebody
 * is sitting alone listening to, which is precisely what `IDLE` exists to
 * prevent. Being alone already closes the microphone above, so asking the
 * question this way gets that case right without naming it.
 *
 * Note the consequences, both deliberate. One person's self-mute is now an
 * input to *everybody's* audio session — see planning/STATES.md, where it is
 * the single largest thing that document has to say. And the crossing is
 * audible, which is a feature and not a blemish: a drop to mono says somebody's
 * microphone is open in this channel, and a bloom back to stereo says nobody's
 * is, including yours. Do not pin `CALL` on and do not debounce the transition;
 * both read as obvious cleanups and both delete the cue.
 */
export function anyMicrophoneOpen(channel: ChannelState): boolean {
  return channel.present.some(
    (id) => microphoneNeeded(channel, id) && !channel.selfMuted[id]
  );
}
