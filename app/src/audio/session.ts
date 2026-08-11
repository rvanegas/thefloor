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
 * other party, who then hears themselves a beat late.
 *
 * **`defaultToSpeaker` is what keeps it audible.** `playAndRecord` routes to
 * the receiver — the earpiece — unless told otherwise, and a voice mode alone
 * does not reliably override that while `mixWithOthers` is set. The symptom is
 * a conversation you can only hear by holding the phone against your ear, at
 * full volume, with no control on screen that explains it. It remains a
 * *default*: headphones and Bluetooth still take the route when present.
 *
 * `mixWithOthers` is carried over from the playout side so entering a call does
 * not interrupt another app. It does not cost the echo canceller; that pairing
 * is the SDK's own recording policy and was observed working.
 */
export const CALL: AppleAudioConfiguration = {
  audioCategory: 'playAndRecord',
  audioCategoryOptions: ['allowBluetooth', 'mixWithOthers', 'defaultToSpeaker'],
  audioMode: 'videoChat',
};
