import { Platform } from 'react-native';
import {
  AudioDeviceModule,
  audioDeviceModuleEvents,
} from '@livekit/react-native';

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

/**
 * Records the moment the audio engine starts and stops, which the poll above
 * cannot see.
 *
 * **`engineSnapshot` answers "what is it now"; this answers "when did it
 * change", and the difference is the whole reason this exists.** A reading of
 * `engineRunning: false` taken four minutes after the fact says the engine is
 * stopped and nothing about what stopped it. Every candidate for that — a
 * category write, a track arriving, a foregrounding — is stamped in the same
 * log, so a transition line between two of them is what turns a list of
 * suspects into an answer. Written 2026-08-24 for TASKS § *Stepping Back In*,
 * where a phone held a healthy room, a subscribed track and a correctly
 * configured session, and rendered nothing.
 *
 * **It registers on `willStartEngine` and `didStopEngine`, and those two
 * specifically.** The delegate has six slots, each holding a single handler,
 * and the SDK's own audio policy is applied from inside `willEnableEngine` and
 * `didDisableEngine` — both guarded on whether a JS handler is registered, so
 * registering on either does not sit alongside the policy, it **replaces** it.
 * The symptom would be an echo or a dropped route in a build nobody associates
 * with logging. These two are read by nothing and carry the same
 * `isPlayoutEnabled` / `isRecordingEnabled` pair.
 *
 * Three rules, and each is load-bearing rather than defensive:
 *
 * - **Never throw.** A handler that rejects returns a non-zero code, and a
 *   non-zero code *cancels the engine operation it was called about*. So a
 *   logging fault here would not merely fail to log, it would stop the audio
 *   it was watching — the instrument becoming the fault, which is the one
 *   outcome that would make this worse than having no instrument.
 * - **Return immediately.** The native side blocks the audio worker thread
 *   until this resolves.
 * - **Touch nothing but the sink.** Calling into the engine or a peer
 *   connection from inside one of these can deadlock against the very
 *   operation being held up.
 *
 * The sink is passed in rather than imported so that this file goes on owing
 * nothing to `diagnostics.ts`, which already reads `engineSnapshot` from here.
 */
export function watchEngineTransitions(
  record: (text: string) => void
): void {
  if (Platform.OS !== 'ios') return;

  const handler =
    (what: string) =>
    async ({
      isPlayoutEnabled,
      isRecordingEnabled,
    }: {
      isPlayoutEnabled: boolean;
      isRecordingEnabled: boolean;
    }): Promise<void> => {
      try {
        record(
          `engine ${what} play=${flag(isPlayoutEnabled)} rec=${flag(isRecordingEnabled)}`
        );
      } catch {
        // See above: escaping here would cancel the engine operation.
      }
    };

  try {
    audioDeviceModuleEvents.setWillStartEngineHandler(handler('start'));
    audioDeviceModuleEvents.setDidStopEngineHandler(handler('stop'));
  } catch {
    // An SDK bump that moved or removed these leaves the panel with its poll
    // and no transitions, which is where it was before this existed.
  }
}

/** The spelling the panel's own rows use, so the log reads like the reading. */
function flag(value: boolean): string {
  return value ? 'T' : 'F';
}
