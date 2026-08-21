import { Platform } from 'react-native';
import {
  AudioDeviceModule,
  AudioEngineMuteMode,
} from '@livekit/react-native';

/**
 * Where in the audio graph a mute is imposed, and who owns that point.
 *
 * **`RTCAudioEngineMuteMode` is undocumented.** No comments in the framework
 * header, no JSDoc on the wrapper, nothing in either README — three bare values
 * and a setter described as "Set the microphone mute mode". An earlier version
 * of this file confidently described what each one did; that was inference from
 * the names written up as specification, and it is the same mistake that let a
 * wrong premise survive six builds. What follows is read out of the framework
 * binary's own strings instead.
 *
 * | Mode | Its log line | What it drives |
 * | --- | --- | --- |
 * | `VoiceProcessing` | `Update mute (voice processing):` | Apple's `AVAudioInputNode.setVoiceProcessingInputMuted:` |
 * | `RestartEngine` | — | a stop and start of the `AVAudioEngine` |
 * | `InputMixer` | `Update mute (input mixer):` | a mixer node inside WebRTC's own graph |
 *
 * The difference is not cosmetic. **`VoiceProcessing` asks the OS to mute**;
 * `InputMixer` turns down a node and tells nobody. The same binary carries
 * `setMutedSpeechActivityEventListener` and
 * `AVAudioVoiceProcessingSpeechActivityEvent` — Apple's "you are talking while
 * muted" detector, which works only on the voice-processing path and requires
 * `voiceChat` or `videoChat` mode, which this app's session is in. So the
 * voice-processing mute is an OS-integrated mute with the system actively
 * watching the muted microphone, where the mixer mute is invisible to iOS.
 *
 * **`InputMixer` is what this app asks for, since 2026-08-21**, and the reason
 * is measurement rather than reading. Self-muting on AirPods Pro plays a tone.
 * Six builds attributed it to a Bluetooth profile handover; build 62 read the
 * route either side of a mute and found `BluetoothHFP` at 24 kHz both times,
 * with no route-change notification — from a listener since proven to fire, by
 * disconnecting the headset. So the route does not move, the engine does not
 * restart, and nothing else in the engine's exposed state changes at 40ms
 * sampling. The mute itself is the only thing left that moves, and this is the
 * option that takes the OS out of it.
 *
 * **What is not claimed: that iOS plays the tone.** No string says so and
 * Apple's own frameworks are not inspectable from here. This is an experiment
 * with the last remaining variable, and a tone that survives it puts the cause
 * outside the audio engine altogether — most likely the headset responding to
 * any mute at all, which the app cannot change.
 *
 * `RestartEngine` is the one value positively excluded: build 62 reported
 * `mode=0` with the engine running throughout, so a restart is not happening.
 * A test asserts this constant never becomes it.
 *
 * **Set unconditionally rather than only when it differs from the default.**
 * The default is not documented, and reading it to decide would make our
 * behaviour depend on a value an SDK bump could move. It is also probably
 * `VoiceProcessing` already — which would explain why build 58, whose whole
 * content was setting that value, changed nothing at all.
 */
export const WANTED_MUTE_MODE = AudioEngineMuteMode.InputMixer;

/**
 * Asks for it, and reports what it displaced.
 *
 * @returns the mode that was in force beforehand, or null off iOS. Returned
 *          rather than logged here because it is the one moment the previous
 *          value is observable — and on a device the panel's `mode=` field is
 *          what confirms the request took, which is the check build 58 lacked.
 */
export async function configureMuteMode(): Promise<AudioEngineMuteMode | null> {
  // Android throws rather than no-ops: the whole audio-engine module is
  // iOS-only, and the category model this is part of does not apply there.
  if (Platform.OS !== 'ios') return null;
  const previous = AudioDeviceModule.getMuteMode();
  await AudioDeviceModule.setMuteMode(WANTED_MUTE_MODE);
  return previous;
}
