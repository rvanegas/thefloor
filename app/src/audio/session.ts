import type {
  AppleAudioConfiguration,
  IOSAudioSessionPolicy,
} from '@livekit/react-native';

/**
 * The three states the iOS audio session is ever in, and the single place they
 * are written down.
 *
 * Three different writers can configure this session: this app, the SDK's
 * native policy observer on every audio-engine transition, and WebRTC itself
 * when it re-applies its own defaults. They all mutate the *same* process-wide
 * `RTCAudioSessionConfiguration.webRTCConfiguration`, so whoever wrote last
 * wins — which is survivable only if they all write the same thing. That is
 * what this module is for: `useSessionAudio` applies them at each edge, and
 * `policyFor` hands the native observer the same answer for the transition it
 * is about to see.
 *
 * **The observer used to be handed a constant, and that was a knowing break of
 * the rule above.** It took `IDLE` as its playout value — the *mixing* one —
 * on the argument that a write we did not ask for could then only ever let
 * another app back in and never take one away. The argument was about
 * `mixWithOthers` alone, and `IDLE` and `CALL` also differ in **category**,
 * which is the Bluetooth route boundary. So a self-mute with somebody else
 * still talking took the engine to playout-only, the observer applied `IDLE`,
 * and the route moved under a rule that exists to hold it still — the tone
 * reported 2026-08-19. `policyFor` closes it by making the observer's playout
 * value the one `sessionFor` would return, so there is nothing left to be
 * licensed. See planning/STATES.md, disagreement 5.
 */

/**
 * What the session asks of the system when there is nothing to hear and
 * nothing to capture: connected to a channel, alone, silent.
 *
 * `playback` rather than `playAndRecord` is the whole point: taking the session
 * as a call drags a Bluetooth speaker from A2DP down to HFP — mono, roughly
 * 16 kHz — and makes every other app's audio unusable for as long as you are in
 * the channel.
 *
 * **`mixWithOthers` is here and in neither of the others**, which is the whole
 * of what "other apps keep playing while nothing is happening" means. Being in
 * an empty channel should cost the speakers nothing — `core/micNeeded.ts` makes the
 * same argument about the microphone, and this is that argument applied to the
 * other end of the session.
 */
export const IDLE: AppleAudioConfiguration = {
  audioCategory: 'playback',
  audioCategoryOptions: ['mixWithOthers'],
  audioMode: 'spokenAudio',
};

/**
 * What the session asks of the system when something is audible but we are not
 * capturing: somebody else is publishing, or a recording is being played into
 * the room, and our own microphone is closed.
 *
 * `IDLE` without `mixWithOthers`, and that single difference is the feature:
 * an exclusive session interrupts whatever else is playing, which is what
 * "pause the podcast when somebody starts talking" is made of. The category
 * stays `playback` — there is nothing to capture, so none of the costs that
 * `playAndRecord` carries are worth paying to be exclusive.
 */
export const LISTENING: AppleAudioConfiguration = {
  audioCategory: 'playback',
  audioCategoryOptions: [],
  audioMode: 'spokenAudio',
};

/**
 * What the session asks of the system while the microphone is capturing.
 *
 * **`videoChat` is what turns on the system echo canceller.** Capturing under
 * a non-voice mode puts a bare microphone next to a loudspeaker playing the
 * other party, who then hears themselves a beat late. Apple also documents
 * this mode as implying `allowBluetooth` and `defaultToSpeaker`, which is the
 * system's own pairing and is left to it.
 *
 * This carried `mixWithOthers` until the audio-activity work, and it did not
 * leave because of the echo: the postmortem is explicit that the option is not
 * the culprit, and the echo was observed stopping under a configuration that
 * had it. It left because a call is audio activity by definition, and the
 * point of the change is that audio activity is exclusive. Nothing about the
 * echo canceller, the Bluetooth eligibility list or the route depends on it.
 *
 * **`defaultToSpeaker` is what puts a call on the loudspeaker rather than the
 * earpiece**, which is the whole of what it means: with `playAndRecord` the
 * default output is `builtInReceiver`, the small speaker you hold to your ear,
 * and this makes it `builtInSpeaker` *when no other route is connected*. It
 * does not override headphones. Apple's own wording, and the intent here.
 *
 * It was in build 18, came out in 19 because a tester's Bluetooth headphones
 * lost the route, and is back because that was the wrong conclusion. The
 * option was not overriding the headphones: **they were not an eligible output
 * at all.** In `playAndRecord` a Bluetooth device is only available as an
 * output if the options say so, and that build listed `allowBluetooth` (which
 * is the mono hands-free profile) and nothing else. With no eligible route,
 * "no other route is connected" was true, and the speaker won correctly from a
 * rule doing exactly what it says.
 *
 * So the eligibility list is the fix, and it is the SDK's own: A2DP for a
 * device that is only listening, HFP for one with a microphone, AirPlay for
 * everything else. Getting this wrong is silent — it does not fail, it just
 * quietly stops offering somebody their headphones.
 */
export const CALL: AppleAudioConfiguration = {
  audioCategory: 'playAndRecord',
  audioCategoryOptions: [
    'allowBluetooth',
    'allowBluetoothA2DP',
    'allowAirPlay',
    'defaultToSpeaker',
  ],
  audioMode: 'videoChat',
};

/**
 * Which of the three the session should be in.
 *
 * A function with a test rather than a condition inline, on the same reasoning
 * as `microphoneNeeded`: this is the rule that decides whether somebody else's
 * music stops, and it is short enough to look obviously right while being
 * wrong in either direction.
 *
 * @param anyMicOpen    whether **anybody present** is capturing, not merely
 *                      whether we are. Wins outright — `playAndRecord` is
 *                      needed whoever else is audible.
 *
 *                      Channel-wide rather than local because the boundary it
 *                      guards is a Bluetooth profile handover, and crossing it
 *                      costs a stereo route that can be lost in the crossing.
 *                      Self-muting while the other party was still talking
 *                      used to cross it, and dropped a tester's headphones to
 *                      the phone speaker until they unmuted. Nobody wants
 *                      stereo mid-conversation; the two situations that do want
 *                      it — another app's audio, and the channel's own playback
 *                      — are both "nobody is talking", which is exactly this
 *                      test. `anyMicrophoneOpen` in core/micNeeded.ts carries the
 *                      whole argument.
 * @param othersAudible how many remote tracks we can hear. Track
 *                      subscriptions rather than who is *speaking*: speech is
 *                      smoothed live signal and following it would reconfigure
 *                      the session at every pause in a sentence.
 */
export function sessionFor(
  anyMicOpen: boolean,
  othersAudible: number
): AppleAudioConfiguration {
  if (anyMicOpen) return CALL;
  return othersAudible > 0 ? LISTENING : IDLE;
}

/**
 * The same answer, shaped for the native observer.
 *
 * **The observer is a second writer of this session and it cannot be argued
 * with, only agreed with.** It runs on the audio worker thread at the engine
 * transition itself, with no JavaScript in the path, so a re-statement from
 * here always lands *after* it. Handing it the value `sessionFor` would return
 * is what makes the two writers say the same thing, which is the invariant
 * `__tests__/session.test.ts` pins.
 *
 * `recording` is `CALL` unconditionally and that is not a special case: the
 * observer reads it only while *this* device is capturing, and our capturing
 * implies `anyMicOpen`, so `sessionFor` would return `CALL` anyway.
 *
 * **Push it before the transition, never after.** The observer reads whatever
 * is stored when the engine moves, so a policy pushed after
 * `setMicrophoneEnabled` describes a transition that has already happened.
 * Pushing is safe to do first in both directions because it is not a write to
 * the session at all — natively it is one atomic property assignment, applied
 * only when the engine next moves.
 *
 * **Push it with `setupIOSAudioManagement` rather than the native setter it
 * wraps.** `AudioDeviceModule.setAutomaticAudioSessionConfiguration` takes
 * `deactivateOnStop` and reads a missing key as *false*, where the SDK wrapper
 * defaults it to true — so calling native directly and omitting it leaves the
 * session active after the last engine stop, silently. Re-pushing mid-call is
 * supported: activation is decided against `RTCAudioSession`'s own state, and
 * the SDK's caution about switching mid-call is about switching *paths*
 * (the deprecated JS callback against this native one), not about a policy.
 */
export function policyFor(
  anyMicOpen: boolean,
  othersAudible: number
): IOSAudioSessionPolicy {
  return { recording: CALL, playout: sessionFor(anyMicOpen, othersAudible) };
}

/**
 * Which of the three this is, for a log line.
 *
 * Identity comparison, which holds because every configuration this app applies
 * comes from `sessionFor` and is therefore one of the constants themselves —
 * the same property the hook's `appliedRef` already relies on.
 */
export function nameOf(config: AppleAudioConfiguration): string {
  if (config === CALL) return 'CALL';
  if (config === LISTENING) return 'LISTENING';
  if (config === IDLE) return 'IDLE';
  return 'unknown';
}
