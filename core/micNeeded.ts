import { guestMaySpeak, isGuest, roomOccupants } from './guests';
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
  // A guest with no grant has no microphone to need. Their LiveKit token is
  // minted unable to publish, so asking for capture would open a device
  // microphone that nothing is allowed to carry — and on a phone that is the
  // same profile handover as a real call, paid for to publish nothing.
  // A muted room has nothing for anybody's microphone to capture for, which is
  // the same question this function already asks about being alone — so it is
  // answered in the same place rather than as a special case at the call site.
  //
  // **Closing the device is the point, not a bonus.** The server withholds the
  // subscriptions anyway, so nobody would hear anything either way; what only
  // closing the microphone achieves is that the video playing on the screen
  // beside the phone is never picked up at all. See DECISIONS.md § *A watch
  // party leaks into the channel through the microphone*. The server's half
  // still has to exist, for builds that predate this rule and go on
  // publishing.
  //
  // It also means `anyMicrophoneOpen` is false for the whole room, so every
  // audio session goes to its high-quality configuration for the film — which
  // falls out of asking the question here and would have to be written by hand
  // anywhere else.
  if (channel.watch?.mutedAll) return false;
  if (isGuest(channel, me) && !guestMaySpeak(channel, me)) return false;
  // The room, not the roster. A member alone with a guest is not alone: the
  // guest can hear them, and a microphone that stayed shut would leave the
  // member talking to somebody who is demonstrably there. This is the first of
  // the three places the guest design named as wanting the wider question, and
  // it is the one whose failure is silent.
  if (roomOccupants(channel).some((id) => id !== me)) return true;
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
  // Guests included, and for the reason the whole rule exists: what decides
  // the audio session is whether anybody in this room is capturing, and a
  // guest who has been given the microphone is somebody in this room who is
  // capturing. A member listening to a guest speak wants the same call-shaped
  // session they would want listening to a member.
  return roomOccupants(channel).some(
    (id) => microphoneNeeded(channel, id) && !channel.selfMuted[id]
  );
}
