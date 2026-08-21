import { Platform } from 'react-native';
import { AudioDeviceModule } from '@livekit/react-native';

/**
 * What the audio engine says about itself, for the one question four fixes
 * failed to answer by reading source.
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
 * so a snapshot costs nothing and can be taken either side of a transition and
 * compared. That is the whole design: not a theory about what moves, but a
 * before and an after.
 *
 * **What each answer would mean**, so the next reading is not another argument:
 *
 * - `recording` **false after a mute** — the input is being stopped, whatever
 *   the mute mode claims, and the handover follows from that. The next lever is
 *   `setRecordingAlwaysPreparedMode`, which exists to hold the input open.
 * - `recording` **true across the mute, `engineRunning` true** — the engine is
 *   not what moves, and neither the track nor the mute mode was ever going to
 *   fix it. Look at the session's route instead, and note that nothing in this
 *   stack can read a route (planning/STATES.md, disagreement 8) — which would
 *   make the syslog relay the only remaining instrument.
 * - `muteMode` **not 0** — `configureMuteMode` did not take, and the reason it
 *   did not is the next question rather than the mute itself.
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
 * The fields that differ between two snapshots, as `name: before -> after`.
 *
 * A diff rather than two dumps because the interesting reading is a *change*
 * across a transition, and ten unchanged booleans either side of it is how the
 * one that moved gets missed in a scrollback.
 */
export function engineDiff(
  before: EngineSnapshot | null,
  after: EngineSnapshot | null
): string {
  if (!before || !after) return 'no engine';
  const keys = Object.keys(before) as (keyof EngineSnapshot)[];
  const moved = keys
    .filter((k) => before[k] !== after[k])
    .map((k) => `${k}: ${String(before[k])} -> ${String(after[k])}`);
  return moved.length === 0 ? 'nothing moved' : moved.join(', ');
}

/**
 * The whole snapshot on one line, short enough to read on a phone.
 *
 * **Needed because `engineDiff` prints only what changed**, and the first
 * reading taken with it — 2026-08-20, build 59 — was `microphoneMuted: false ->
 * true` and nothing else. That looks decisive and is not: `muteMode` does not
 * change across a mute, so a `configureMuteMode` that had silently failed would
 * leave the engine on `RestartEngine` and produce exactly the same display.
 * The absolute values close that hole.
 */
export function engineLine(s: EngineSnapshot | null): string {
  if (!s) return 'no engine';
  const flag = (b: boolean) => (b ? 'T' : 'F');
  return [
    `run=${flag(s.engineRunning)}`,
    `rec=${flag(s.recording)}`,
    `play=${flag(s.playing)}`,
    `mut=${flag(s.microphoneMuted)}`,
    `mode=${s.muteMode}`,
    `vp=${flag(s.voiceProcessingEnabled)}`,
    `byp=${flag(s.voiceProcessingBypassed)}`,
    `prep=${flag(s.recordingAlwaysPrepared)}`,
    `in=${flag(s.inputAvailable)}`,
    `out=${flag(s.outputAvailable)}`,
  ].join(' ');
}

/**
 * Watches for a field that moves and moves back, which a before/after
 * comparison cannot see at all.
 *
 * **This is the hole the first reading fell into.** `engineDiff` samples either
 * side of the await, so an engine that stops and restarts within it is running
 * again by the time the second sample is taken and reports as *nothing
 * happened* — indistinguishable from an engine that never moved, and the more
 * interesting of the two. Sampling across the window catches it.
 *
 * Cheap enough to run on a real transition: every reader is a synchronous
 * native call, and this ships only in a diagnostic build.
 *
 * @returns every field seen to differ from where it started, at any point in
 *          the window, with all the values it was seen to take; the empty
 *          string if none did.
 */
export async function watchTransition(
  before: EngineSnapshot | null,
  windowMs = 1200,
  everyMs = 40
): Promise<string> {
  if (!before) return '';
  const seen = new Map<keyof EngineSnapshot, Set<string>>();
  const deadline = Date.now() + windowMs;
  while (Date.now() < deadline) {
    const now = engineSnapshot();
    if (now) {
      for (const k of Object.keys(before) as (keyof EngineSnapshot)[]) {
        if (now[k] !== before[k]) {
          const set = seen.get(k) ?? new Set<string>();
          set.add(String(now[k]));
          seen.set(k, set);
        }
      }
    }
    await new Promise((r) => setTimeout(r, everyMs));
  }
  if (seen.size === 0) return '';
  return [...seen.entries()]
    .map(([k, vals]) => `${k}->${[...vals].join('/')}`)
    .join(' ');
}
