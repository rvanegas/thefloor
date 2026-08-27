import { guestMaySpeak, isGuest, roomOccupants } from './guests';
import { isRecordingActive } from './recording';
import { partyWithholds } from './watch';
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
  // A room muted for a watch party has nothing for anybody's microphone to
  // capture for, which is the same question this function already asks about
  // being alone — so it is answered here rather than as a special case at the
  // call site.
  //
  // **Closing the device is the point, not a bonus.** The server withholds the
  // subscriptions anyway, so nobody would hear anything either way; what only
  // closing the microphone achieves is that the video playing on the screen
  // beside the phone is never picked up at all. See DECISIONS.md § *A watch
  // party leaks into the channel through the microphone*. The server's half
  // still has to exist, for builds that predate this rule and go on
  // publishing.
  //
  // **Only while the video plays** — `partyWithholds` is the intent and the
  // transport together — so a pause reopens every microphone in the room. Both
  // crossings then land where they are wanted: `channelHasAudio` asks the same
  // question first, so the room hands the audio system to whatever is playing
  // the film and takes it back at the moment talking becomes possible again.
  if (channel.watch && partyWithholds(channel.watch)) return false;
  // A guest with no grant has no microphone to need. Their LiveKit token is
  // minted unable to publish, so asking for capture would open a device
  // microphone that nothing is allowed to carry — and on a phone that is the
  // same profile handover as a real call, paid for to publish nothing.
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
 * Whether The Floor itself has any audio right now — which is a candidate for
 * what decides the audio session's configuration, and is a question about this
 * app rather than about who is talking.
 *
 * **One of two rules, and the one that is off by default.** `anyMicrophoneOpen`
 * below is the other, and `AppValue.steadyHeadset` picks between them at the
 * single call site in `App.tsx`. Both feed the same `sessionFor(hasAudio)`,
 * which is what makes a setting possible at all: with `LISTENING` unreachable
 * since build 90, each rule was already just one boolean, so what is being
 * switched is a predicate rather than a code path.
 *
 * **It is a user setting rather than a build flag, and that is a claim about
 * the answer.** The two rules trade the same thing in opposite directions —
 * sound quality while the room is quiet, against a link that does not move
 * under the first word somebody says — and which of those is worth more
 * depends on the headset, the room and the person. A build flag would have
 * asserted that one of them is simply right. This does not, and the setting
 * may well outlive planning/HF-ONLY-WALK.md rather than being resolved by it.
 *
 * It also lets one device hear both rules on the same route in one sitting,
 * which is a comparison this subsystem has never once been able to make.
 *
 * **The change is the question rather than the answer.** `anyMicrophoneOpen`
 * asks *is anybody capturing*, and chooses the high-fidelity `playback` session
 * whenever nobody is. Its premise is that a room with no open microphone wants
 * stereo. Only
 * one claimant on that stereo turned out to be real: **another app's audio.**
 * Voices are already degraded by the codec, and shared playback is not trying
 * to be a media player — its quality should not depend on whether somebody is
 * talking over it. So the rule is no longer about fidelity at all. It is about
 * whether this app wants the audio system, and it hands it back only when it
 * genuinely wants nothing.
 *
 * **What that costs, stated plainly**: a channel with people in it holds the
 * hands-free profile for as long as it lasts, so a Bluetooth route stays mono
 * and other apps stay interrupted even while everybody is muted. That is
 * deliberate. A muted room is a live room that happens to be quiet — every
 * mute is unilateral and instant, `canSetSelfMute` refusing only the muting —
 * so handing the route back means handing it back on the strength of a state
 * anybody can leave in the time it takes to say a first syllable, and the
 * profile handover then lands on exactly that syllable.
 *
 * **The 2026-08-19 route loss stays fixed, by a shorter argument.**
 * `anyMicrophoneOpen` existed because keying the session on your *own*
 * microphone made self-muting mid-conversation cross the category boundary and
 * lose a tester's headphones. Here self-mute is not consulted at all: somebody
 * else is in the room, so there is audio, so the session is a call. The
 * session stopped needing to know anything about mutes, and with it the
 * property planning/STATES.md called the largest thing it had to say — that
 * one person's self-mute was an input to everybody's session — is no longer
 * true.
 *
 * The four answers, in the order they are asked:
 *
 * - **A watch party that is withholding has no audio**, and this is the case
 *   that looks like an exception and is not. The Floor carries no video: each
 *   person's own player follows a transport clock, so the film is coming out
 *   of another app, and every voice is withheld for as long as it plays. There
 *   is nothing for this app to play and nothing for it to capture, and the
 *   other app that wants the route is that player. Asked first, because
 *   occupants are present throughout. A pause reopens it, the same crossing
 *   `microphoneNeeded` makes and for the same reason.
 * - **Anybody else in the room is audio**, whether or not they are speaking,
 *   muted, or a guest without the microphone. They can be heard the moment
 *   they are not, and the boundary is not worth crossing on the difference.
 *   The room rather than the roster, for the reason `microphoneNeeded` gives.
 * - **A recording alone is audio**, being the one case that captures with
 *   nobody there.
 * - **Shared playback is audio**, including while paused — the same reading
 *   `isRecordingActive` takes, and for the same reason: pausing a track to
 *   talk about it should not hand the route away and take it back. `idle`
 *   covers both a track loaded and never started and one that has finished.
 *
 * Everything else is `IDLE`: alone in a channel with nothing running, which is
 * the state this whole function exists to protect. Being present somewhere
 * nothing is happening should cost another app's music nothing.
 */
export function channelHasAudio(channel: ChannelState, me: UserId): boolean {
  if (channel.watch && partyWithholds(channel.watch)) return false;
  if (roomOccupants(channel).some((id) => id !== me)) return true;
  if (isRecordingActive(channel.recording)) return true;
  return channel.playback.status !== 'idle';
}

/**
 * Whether *anybody* present has an open microphone — the **default** rule for
 * the audio session's configuration, and the one that has shipped since
 * 2026-08-18.
 *
 * **The alternative is `channelHasAudio` above**, chosen when
 * `AppValue.steadyHeadset` is on, and the header there says why there are two.
 * Everything below is the argument for this one, which is unchanged and still
 * stands on its own terms — what the other rule disputes is not any step of it
 * but the premise underneath: that somebody in a quiet room wants the stereo
 * route badly enough to pay a profile handover when the quiet ends.
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
