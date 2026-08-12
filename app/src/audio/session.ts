import type { AppleAudioConfiguration } from '@livekit/react-native';

/**
 * The two states the iOS audio session is ever in, and the single place they
 * are written down.
 *
 * Three different writers can configure this session: this app, the SDK's
 * native policy observer on every audio-engine transition, and WebRTC itself
 * when it re-applies its own defaults. They all mutate the *same* process-wide
 * `RTCAudioSessionConfiguration.webRTCConfiguration`, so whoever wrote last
 * wins — which is survivable only if they all write the same thing. That is
 * what this module is for: `index.ts` hands these to the native policy at
 * startup, and `useSessionAudio` applies them at each edge.
 */

/**
 * What the session asks of the system when nothing needs capturing.
 *
 * `playback` rather than `playAndRecord` is the whole point: taking the session
 * as a call drags a Bluetooth speaker from A2DP down to HFP — mono, roughly
 * 16 kHz — and makes every other app's audio unusable for as long as you are in
 * the channel. `mixWithOthers` is what lets that other app keep playing.
 */
export const PLAYBACK_ONLY: AppleAudioConfiguration = {
  audioCategory: 'playback',
  audioCategoryOptions: ['mixWithOthers'],
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
 * `mixWithOthers` does not cost the echo canceller — the echo was observed
 * stopping under exactly this configuration, which is the SDK's own recording
 * policy.
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
    'mixWithOthers',
    'defaultToSpeaker',
  ],
  audioMode: 'videoChat',
};
