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
 * **`defaultToSpeaker` is deliberately not stated here**, though the earpiece
 * problem argues for it. Added explicitly alongside `allowBluetooth` in build
 * 18, it cost Bluetooth headphone users their headphones: the route moved to
 * the phone on the first unmute and stayed there. Between a call in the wrong
 * ear and a call in the wrong device entirely, this is the SDK's own
 * combination and the only one observed working for Bluetooth. See BACKLOG.md
 * — the real answer is an output control that can see the current route, and
 * nothing in this stack can.
 */
export const CALL: AppleAudioConfiguration = {
  audioCategory: 'playAndRecord',
  audioCategoryOptions: ['allowBluetooth', 'mixWithOthers'],
  audioMode: 'videoChat',
};
