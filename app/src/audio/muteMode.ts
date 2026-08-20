import { Platform } from 'react-native';
import {
  AudioDeviceModule,
  AudioEngineMuteMode,
} from '@livekit/react-native';

/**
 * How the audio engine mutes, which is a third writer of this session and the
 * one nobody had found.
 *
 * **Two fixes for the same symptom missed it on 2026-08-20.** Self-muting
 * handed a Bluetooth headset from the hands-free link back to A2DP, audibly,
 * in both directions. `policyFor` corrected the audio *category*; `MicIntent`
 * stopped a mute from releasing the *track*. The route moved anyway, because
 * muting is implemented below both of those.
 *
 * `RTCAudioEngineMuteMode` decides how. The three values are not variations on
 * a theme — they mute at three different depths, and only one of them disturbs
 * the hardware:
 *
 * - **`RestartEngine`** stops and restarts the audio engine. The input is town
 *   down and built again, and iOS releases SCO in between: exactly the handover
 *   we hear, on a path neither earlier fix touched.
 * - **`VoiceProcessing`** mutes inside the voice-processing unit. The engine
 *   keeps running and the link stays up. This is what we ask for.
 * - **`InputMixer`** mutes at the input mixer, also without restarting. It is
 *   the fallback if `VoiceProcessing` ever turns out to cost the echo
 *   canceller, that unit being what performs the cancellation — see
 *   planning/POSTMORTEM-echo.md before going near it.
 *
 * **Set unconditionally rather than only when it differs from the default.**
 * The framework header does not document what the default is, so reading it to
 * decide would make our behaviour depend on a value that an SDK bump could
 * change underneath us. Stating what we want costs one call at startup.
 */
export const WANTED_MUTE_MODE = AudioEngineMuteMode.VoiceProcessing;

/**
 * Asks for it, and reports what it displaced.
 *
 * @returns the mode that was in force beforehand, or null off iOS. Returned
 *          rather than logged here because it is the one moment the previous
 *          value is observable, and if the tone survives this change it is the
 *          number the next session needs.
 */
export async function configureMuteMode(): Promise<AudioEngineMuteMode | null> {
  // Android throws rather than no-ops: the whole audio-engine module is
  // iOS-only, and the category model this is part of does not apply there.
  if (Platform.OS !== 'ios') return null;
  const previous = AudioDeviceModule.getMuteMode();
  await AudioDeviceModule.setMuteMode(WANTED_MUTE_MODE);
  return previous;
}
