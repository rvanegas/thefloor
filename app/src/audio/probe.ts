import { Platform } from 'react-native';
import { AudioDeviceModule, AudioSession } from '@livekit/react-native';
import { routeSnapshot } from '../../modules/audio-route';

/**
 * The bisection harness for TASKS § *Stepping Back In*, built 2026-08-24.
 *
 * **The instrument turned out to be the fault**, which is why this file exists
 * and why it is shaped the way it is. Opening the diagnostic panel cut the
 * audio, on a device, immediately — and the panel's only job is to read the
 * audio stack. `engineState.ts` claims of its readers that "a snapshot costs
 * nothing… not a theory about what moves, but a reading of what is". That claim
 * is false, and every reading taken through it is suspect evidence.
 *
 * `engineSnapshot` reads nine values in one pass, so it cannot say which of the
 * nine is destructive. This splits them: **one button, one native call**, with
 * the log line written either side of it. The ear says whether the audio
 * stopped; the log says what the engine delegate reported while it did.
 *
 * **Ordered by suspicion**, because each hit costs re-establishing audio:
 * `engineAvailability` returns a computed struct and is the likeliest to query
 * the engine; `isEngineRunning` and the four beside it are marked *"For
 * testing purposes"* in `RTCAudioDeviceModule.h`, which is not a promise of
 * safety under a once-a-second poll; `recordingAlwaysPreparedMode`'s **setter**
 * tears down and rebuilds the input path, so its getter is worth separating;
 * `voiceProcessingBypassed` is declared `assign` rather than `readonly`. The
 * route snapshot is the control — it touches `AVAudioSession` only, never the
 * ADM, and should be innocent. If it is not, the fault is not in WebRTC at all.
 *
 * The implementations cannot be read: these are properties on a prebuilt
 * `RTCAudioDeviceModule`, and LiveKit's WebRTC fork is not a public repository.
 * Only the header ships. So this is measured rather than reasoned about, which
 * is the same conclusion this subsystem has reached four times now.
 *
 * **Nothing here runs by itself.** No mount-time read, no poll, no
 * subscription. A harness that took its own readings would be the very bug it
 * was built to find.
 */

export interface Probe {
  /** Appears on the button and in the log line. */
  name: string;
  /** One native call, and nothing else. */
  run: () => void;
}

/**
 * Every reader `engineSnapshot` makes, one at a time, most suspect first.
 *
 * The return values are deliberately discarded. What is being measured is the
 * *effect* of the call, and a value rendered on screen would invite reading it
 * as a finding — which is exactly how a destructive reader passed for a
 * diagnostic for four days.
 */
export const PROBES: Probe[] = [
  { name: 'engineAvailability', run: () => void AudioDeviceModule.getEngineAvailability() },
  { name: 'isEngineRunning', run: () => void AudioDeviceModule.isEngineRunning() },
  { name: 'recordingAlwaysPrepared', run: () => void AudioDeviceModule.isRecordingAlwaysPreparedMode() },
  { name: 'voiceProcessingEnabled', run: () => void AudioDeviceModule.isVoiceProcessingEnabled() },
  { name: 'voiceProcessingBypassed', run: () => void AudioDeviceModule.isVoiceProcessingBypassed() },
  { name: 'isPlaying', run: () => void AudioDeviceModule.isPlaying() },
  { name: 'isRecording', run: () => void AudioDeviceModule.isRecording() },
  { name: 'isMicrophoneMuted', run: () => void AudioDeviceModule.isMicrophoneMuted() },
  { name: 'muteMode', run: () => void AudioDeviceModule.getMuteMode() },
  // The control. Not the ADM at all — `AVAudioSession` properties through this
  // app's own native module.
  { name: 'routeSnapshot (control)', run: () => void routeSnapshot() },
];

/**
 * Halves, so a walk down the list is not the only way through it.
 *
 * Each hit costs re-establishing audio, which is the expensive step — so
 * bisecting ten candidates in four kills beats walking them in up to ten. The
 * groups overlap the individual probes deliberately: run a group, then the
 * individuals inside whichever group cut the sound.
 */
export const PROBE_GROUPS: Array<{ name: string; probes: Probe[] }> = [
  { name: 'first five', probes: PROBES.slice(0, 5) },
  { name: 'last five', probes: PROBES.slice(5) },
  { name: 'all ten (what the panel used to do)', probes: PROBES },
];

/**
 * Runs one probe with a log line either side of it.
 *
 * Both lines matter and neither is decoration. The *before* line timestamps the
 * call, so an `engine stop` that arrives from the audio thread can be placed
 * relative to it; the *after* line proves the call returned at all, which
 * separates a reader that stops the engine from one that blocks the JS thread
 * against it.
 */
export function runProbe(probe: Probe, record: (text: string) => void): void {
  record(`probe ${probe.name} →`);
  try {
    probe.run();
    record(`probe ${probe.name} ✓`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(`probe ${probe.name} ✗ ${message}`);
  }
}

/**
 * Re-activates the audio session, which is the cheapest thing that might bring
 * a dead engine back.
 *
 * **This exists because the alternative was reinstalling the app.** Nothing in
 * the app re-activates the session once a connection is up — `startAudioSession`
 * is called once per connection and the foreground rebuild returns early while
 * the status is `connected` — so an operator whose engine had died had no way
 * back and reinstalled to keep testing. A harness that costs a reinstall per
 * iteration is a harness nobody completes.
 *
 * It is also the BACKLOG fallback for the edge where a session already active
 * has to become exclusive, made pressable: if this reliably restores sound,
 * the recovery in `useSessionAudio` is the fix and the mechanism matters less
 * than it looks. That edge is rare since 2026-09-05, `channelHasAudio` being
 * true from the moment a track is loaded rather than from the moment one is
 * heard — but it is not gone: the first person arriving in a channel somebody
 * was sitting alone in with nothing playing still crosses it.
 */
export async function restartAudioSession(
  record: (text: string) => void
): Promise<void> {
  if (Platform.OS !== 'ios') return;
  record('restart session →');
  try {
    await AudioSession.stopAudioSession();
    await AudioSession.startAudioSession();
    record('restart session ✓');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(`restart session ✗ ${message}`);
  }
}
