import { Platform } from 'react-native';
import { AudioDeviceModule } from '@livekit/react-native';

/**
 * What the audio engine says about itself.
 *
 * **Deleted on 2026-08-21 and restored the same day, for a different job.** It
 * was written as a *transition* instrument — snapshot either side of a mute,
 * print the difference — and came out with the panel that rendered it once the
 * self-mute question was answered. What is back is only the reader: the two
 * comparison helpers, `engineDiff` and `watchTransition`, are still gone,
 * because a live monitor samples one state repeatedly rather than two states
 * around an event. Restoring them is `git show a645a60^:app/src/audio/engineState.ts`
 * if a transition ever needs watching again.
 *
 * It is now read by `diagnostics.ts` on behalf of the panel in
 * `ui/AudioDebugPanel.tsx`, which is shown to accounts with the `debug` column
 * set and to nobody else. That gate is why this is no longer temporary: the
 * thing the earlier panel was deleted to avoid — a diagnostic ageing into
 * furniture — was about something every user could see and nobody could switch
 * off.
 *
 * **The history is the argument for this file.** Self-muting hands a Bluetooth
 * headset from the hands-free link back to A2DP, audibly, and on 2026-08-20
 * that was attributed in turn to the audio session's *category* (`policyFor`),
 * to the mute *releasing the track* (`MicIntent`), and to the engine's *mute
 * mode* (`configureMuteMode`). Three plausible mechanisms, three builds, no
 * change. Each was reasoned from code that turned out not to contain the
 * mechanism, and each round of reasoning was cheaper than measuring right up
 * until it was the fourth one.
 *
 * Every reader below is **synchronous** — blocking-synchronous native methods —
 * so a snapshot costs nothing. That is the whole design: not a theory about
 * what moves, but a reading of what is. It is cheap enough to poll once a
 * second behind a panel, which is what it now does.
 *
 * **What each answer would mean**, so a reading is not another argument. Kept
 * verbatim from when it was written, which was *before* the readings existed —
 * so no interpretation here was fitted to an answer already known:
 *
 * - `recording` **false after a mute** — the input is being stopped, whatever
 *   the mute mode claims, and the handover follows from that. The next lever is
 *   `setRecordingAlwaysPreparedMode`, which exists to hold the input open.
 * - `recording` **true across the mute, `engineRunning` true** — the engine is
 *   not what moves, and neither the track nor the mute mode was ever going to
 *   fix it. Look at the session's route instead. (This said the route was
 *   unreadable, citing planning/STATES.md disagreement 8. It was written the
 *   same day `app/modules/audio-route` proved otherwise, and the panel now
 *   shows both side by side.)
 * - `muteMode` **not `WANTED_MUTE_MODE`** — `configureMuteMode` did not take,
 *   and the reason it did not is the next question rather than the mute
 *   itself. (This read "not 0" when the wanted value was `VoiceProcessing`;
 *   build 63 moved it to `InputMixer`, which is 2. The panel names the mode
 *   and compares it against the constant, so the number is not something to
 *   remember.)
 * - `voiceProcessingEnabled` **false** — the unit that performs echo
 *   cancellation is off, which would be a different and worse bug than the one
 *   being chased.
 */
export interface EngineSnapshot {
  engineRunning: boolean;
  playing: boolean;
  recording: boolean;
  microphoneMuted: boolean;
  muteMode: number;
  voiceProcessingEnabled: boolean;
  voiceProcessingBypassed: boolean;
  recordingAlwaysPrepared: boolean;
  inputAvailable: boolean;
  outputAvailable: boolean;
}

/**
 * Reads every one of them, or returns null where there is no engine to ask.
 *
 * **Never throws.** It is diagnostic code on a path that carries live audio,
 * and a reader that has moved or been removed under an SDK bump must not be
 * able to take a call down — which is a real risk here, since several of these
 * are newer than the rest of the module and none is load-bearing.
 */
export function engineSnapshot(): EngineSnapshot | null {
  if (Platform.OS !== 'ios') return null;
  try {
    const availability = AudioDeviceModule.getEngineAvailability();
    return {
      engineRunning: AudioDeviceModule.isEngineRunning(),
      playing: AudioDeviceModule.isPlaying(),
      recording: AudioDeviceModule.isRecording(),
      microphoneMuted: AudioDeviceModule.isMicrophoneMuted(),
      muteMode: AudioDeviceModule.getMuteMode(),
      voiceProcessingEnabled: AudioDeviceModule.isVoiceProcessingEnabled(),
      voiceProcessingBypassed: AudioDeviceModule.isVoiceProcessingBypassed(),
      recordingAlwaysPrepared: AudioDeviceModule.isRecordingAlwaysPreparedMode(),
      inputAvailable: availability.isInputAvailable,
      outputAvailable: availability.isOutputAvailable,
    };
  } catch {
    return null;
  }
}
