import type { AppleAudioConfiguration } from '@livekit/react-native';

/**
 * The three states the iOS audio session is ever in, and the single place they
 * are written down.
 *
 * Three different writers can configure this session: this app, the SDK's
 * native policy observer on every audio-engine transition, and WebRTC itself
 * when it re-applies its own defaults. They all mutate the *same* process-wide
 * `RTCAudioSessionConfiguration.webRTCConfiguration`, so whoever wrote last
 * wins — which is survivable only if they all write the same thing. That is
 * what this module is for: `index.ts` hands these to the native policy at
 * startup, and `useSessionAudio` applies them at each edge.
 *
 * **The native policy takes two values and there are now three.** That is a
 * knowing break of the rule above, and it is broken in one direction only.
 * `index.ts` hands the observer `IDLE` as its playout value — the *mixing* one
 * — so a write we did not ask for can only ever let another app back in. It
 * can never take one away. Getting that backwards would silence somebody's
 * music while they sit alone in an empty channel, from a transition nobody
 * asked for and nothing reports.
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
 * an empty channel should cost the speakers nothing — `micNeeded.ts` makes the
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
 * @param micOpen       whether we are actually capturing. Wins outright — a
 *                      call needs `playAndRecord` whoever else is audible.
 * @param othersAudible how many remote tracks we can hear. Track
 *                      subscriptions rather than who is *speaking*: speech is
 *                      smoothed live signal and following it would reconfigure
 *                      the session at every pause in a sentence.
 */
export function sessionFor(
  micOpen: boolean,
  othersAudible: number
): AppleAudioConfiguration {
  if (micOpen) return CALL;
  return othersAudible > 0 ? LISTENING : IDLE;
}
