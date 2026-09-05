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
 * **The only rule, since 2026-09-05.** There were two, and `AppValue
 * .steadyHeadset` picked between them: this one, and `anyMicrophoneOpen`,
 * which asked *is anybody capturing* and chose the high-fidelity `playback`
 * session whenever nobody was. That setting and that rule are both gone, and
 * the reason is not that the argument for the other one was refuted. It is
 * that the choice stopped existing.
 *
 * The playout fix of 2026-09-05 holds the microphone open, muted, for as long
 * as anything is subscribed — see `useSessionAudio`'s `holdForPlayout` and
 * PLAYOUT.md for the isolation that forced it. That makes the session
 * `playAndRecord` whenever there is anything to hear, so the high-fidelity
 * route the other rule existed to protect is no longer reachable in any
 * channel that has audio in it. The two predicates then differ only when
 * nothing is subscribed, which is when nothing can be heard, and a setting
 * that cannot change what anybody hears is not a setting.
 *
 * planning/HF-ONLY-WALK.md was the device check that was going to decide
 * between them on fidelity grounds. It was never run and has been deleted; the
 * question it was to answer is moot rather than settled, and that distinction
 * is worth keeping — nobody established that stereo-while-quiet was not worth
 * having. It stopped being on offer.
 *
 * **This one is kept rather than the other for a mechanical reason as well as
 * a semantic one.** `hasAudio` is read at connect, from channel state, before
 * anything is subscribed. Under `anyMicrophoneOpen` a channel would come up
 * `IDLE`, the subscription would land a moment later, the hold would make
 * `hasAudio` true, and the session would be rewritten to `CALL` — an engine
 * transition immediately after every connect, which is the collision build 90
 * was written to remove and the exact class of event that orphans a receiver.
 * This rule is already right at connect and nothing moves.
 *
 * **The change is the question rather than the answer.** The rule this
 * replaced asked *is anybody capturing*, and its premise was that a room with
 * no open microphone wants stereo. Only
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

