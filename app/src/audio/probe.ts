import { Platform } from 'react-native';
import { AudioDeviceModule, AudioSession } from '@livekit/react-native';
import { configureSession, routeSnapshot } from '../../modules/audio-route';
import { hasMicrophone } from '../../../core/micNeeded';
import type { ChannelState, UserId } from '../../../core/types';
import { CALL } from './session';

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
  /**
   * One native call, and nothing else.
   *
   * **A promise is awaited rather than dropped**, which matters only for the
   * writes below: `setAppleAudioConfiguration` is asynchronous, and a `✓`
   * written before the call had landed would timestamp the wrong instant in a
   * log whose whole use is ordering an `engine stop` against the thing that
   * caused it.
   */
  run: () => void | Promise<void>;
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
 *
 * Asynchronous since the writes arrived, and the `await` is the point rather
 * than a formality — see `Probe.run`. A synchronous reader resolves in a
 * microtask and its two lines still bracket nothing but itself.
 */
export async function runProbe(
  probe: Probe,
  record: (text: string) => void
): Promise<void> {
  record(`probe ${probe.name} →`);
  try {
    await probe.run();
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

/**
 * **The writes, which are a different experiment in the same rig.**
 *
 * Added 2026-09-27 for the question *whether the engine stop is caused by the
 * mode change specifically* — the task that asked it is closed and its premise
 * gone; decisions/2026-09-27-the-teardown-was-never-on-the-critical-path.md is
 * where that went. The
 * ten probes above ask which *reader* is destructive; these ask what a
 * **write** does to a running engine, which is the question three builds were
 * spent guessing at between 2026-09-23 and 2026-09-26.
 *
 * What is settled already: `setAppleAudioConfiguration` mid-run stops the
 * engine and nothing restarts it — build 296, the log in `session.ts` where
 * `SCREENING` used to be. What is not settled is the scope of that, because the
 * write that was measured changed the mode and the options together. Either
 * **any** write stops the engine, and the configuration route is permanently
 * dead, or the **mode** does, and a narrower write reopens it. The two lead to
 * opposite designs and the code currently carries the pessimistic reading on a
 * single measurement.
 *
 * **These are kept out of `PROBES` and out of `PROBE_GROUPS` deliberately.**
 * That list is readers, which are *meant* to be innocent and are suspected of
 * not being; every one of these is known to write process-wide state and one of
 * them is known to kill the engine. A group button that swept both would
 * destroy the reading it was taking.
 *
 * **Read them in order, and stop at the first one that stops the engine.**
 *
 * - `CALL unchanged` is the most informative single press: the values already
 *   in force, so nothing about the configuration changes and only the act of
 *   writing remains. An `engine stop` here means any write is fatal and the
 *   rest of the list is moot. **A quiet result here is the weaker half of the
 *   evidence**, though — a write of identical values may be short-circuited
 *   before it reaches the observer at all, which is why the two below change
 *   exactly one thing each.
 * - `options only` and `mode only` are that pair. Between them they say which
 *   half of `SCREENING` did it, and `mode only` is the one the task predicts.
 * - `SCREENING as it was` is the control, and it is the one that must stop the
 *   engine. If it does not, the rig is not reproducing build 296 and nothing
 *   above it means anything.
 * - `raw AVAudioSession` is the discriminator worth having last: it writes the
 *   same category, mode and options through this app's own native module,
 *   bypassing the SDK entirely. If the LiveKit write stops the engine and this
 *   one does not, the stop is the SDK's observer reacting rather than iOS
 *   tearing anything down — which is a fixable thing rather than a platform
 *   fact.
 *
 * **The lab is the wrong instrument for this and that is not an oversight.**
 * `AudioLabView` writes configurations all day, and its header says to run it
 * *outside any channel* so that nothing else is writing. This question is only
 * about a write while the engine runs, so it has to be asked from inside a
 * channel, where the lab's whole premise does not hold.
 */
export const WRITE_PROBES: Probe[] = [
  {
    name: 'write CALL unchanged (livekit)',
    run: () => AudioSession.setAppleAudioConfiguration(CALL),
  },
  {
    name: 'write options only: CALL + A2DP (livekit)',
    run: () =>
      AudioSession.setAppleAudioConfiguration({
        ...CALL,
        audioCategoryOptions: [
          ...(CALL.audioCategoryOptions ?? []),
          'allowBluetoothA2DP',
        ],
      }),
  },
  {
    name: 'write mode only: playAndRecord/default (livekit)',
    run: () =>
      AudioSession.setAppleAudioConfiguration({
        ...CALL,
        audioMode: 'default',
      }),
  },
  {
    // What build 296 shipped, exactly: the control that has to reproduce.
    name: 'write SCREENING as it was (livekit, control)',
    run: () =>
      AudioSession.setAppleAudioConfiguration({
        audioCategory: 'playAndRecord',
        audioCategoryOptions: ['allowBluetoothA2DP'],
        audioMode: 'default',
      }),
  },
  {
    // Not the ADM and not the SDK — `AVAudioSession` through this app's own
    // module, with `active: true` because the session is already active and
    // `setActive` is where an interruption would happen if one were going to.
    name: 'write CALL unchanged (raw AVAudioSession)',
    run: () =>
      void configureSession(
        'playAndRecord',
        'videoChat',
        [...(CALL.audioCategoryOptions ?? [])],
        true
      ),
  },
];

/**
 * **The film probe: keep the microphone through the film, and watch the
 * engine.**
 *
 * Added 2026-09-27, once the writes above had cleared the configuration. What
 * stopped build 296's engine is unknown, and the remaining suspect is the film
 * itself — a `WKWebView` acquiring the audio session for video playback, 316ms
 * before `watch playing` and 1,254ms after the write that was blamed for it.
 *
 * **This deliberately does not restore `SCREENING`.** The obvious probe would
 * reinstate the configuration and press Play, and it would confound the two
 * variables again — which is the mistake that cost 2026-09-23 and 2026-09-26
 * both. The configuration has been measured and is innocent, so the probe
 * removes it from the experiment: the session stays `CALL`, `videoChat` and all,
 * and the only new thing is that **the engine is still up and capturing when
 * the film's audio arrives.**
 *
 * It works by suppressing one clause. `microphoneNeeded` subtracts
 * `isScreening`; this ORs `hasMicrophone` back in, so a screening device keeps
 * the device it would otherwise release. Everything else that predicate decides
 * is untouched — not in the room, or a guest with no grant, and there is still
 * no microphone, because those are `hasMicrophone` rather than the film.
 *
 * **It answered, the same day it was written: the film stops the engine.**
 * `engine stop play=T rec=T` lands 1,208 to 1,432ms after the press and 217 to
 * 316ms before `watch playing`, three times, including once with nothing
 * subscribed — so neither the configuration nor the party mute's unsubscription
 * is the cause. Both directions still enabled is the signature of an
 * interruption from outside, and the only other instance anybody has logged is
 * iOS taking the session from a backgrounded app. See
 * planning/decisions/2026-09-27-the-film-stops-the-engine.md.
 *
 * **It is kept because it is the only way to press Play without releasing the
 * microphone**, which is the control for anything measured about that press. It
 * answered two more questions the same afternoon. Releasing mid-film works: the
 * pause's retake brings the engine up in 713ms against 735ms on the shipped
 * path, so the pause already pays that beat. And then the whole premise fell —
 * nineteen presses, a median of 1463ms released against 1662ms held, so the
 * teardown was never in the picture's way at all. See
 * planning/decisions/2026-09-27-the-teardown-was-never-on-the-critical-path.md.
 *
 * So there is no longer a design waiting on this. Keep it for the next reading
 * that needs a press with the microphone held — a headset run is the obvious
 * one, being the measurement nobody has taken.
 *
 * **The room is still muted for the run and that is not incidental** — it is
 * what makes this safe to press. A run with a screen in the room is
 * enforced-muted by `watchPlay`, so the missing echo canceller has nothing to
 * transmit and nobody hears the film through somebody's microphone. The
 * loudspeaker feedback measured on 2026-09-27 was two unmuted devices in one
 * room, which is the test rig rather than the feature.
 *
 * Off on every launch, and there is no persistence on purpose: this holds a
 * microphone open through a film, which is a thing to be doing for one reading
 * and not a state to wake up in.
 */
let filmProbe = false;

/** Who to tell, `App.tsx` being the one that recomputes `micNeeded`. */
const filmProbeWatchers = new Set<() => void>();

/** Whether the microphone is being kept through the film. */
export function filmProbeEngaged(): boolean {
  return filmProbe;
}

/**
 * Turns it on or off, and says so in the log.
 *
 * The line matters as much as the flag: a reading taken while this was on and
 * a reading taken while it was off are different experiments, and the log is
 * the only place that distinction survives to be read tomorrow.
 */
export function setFilmProbe(on: boolean, record: (text: string) => void): void {
  if (filmProbe === on) return;
  filmProbe = on;
  record(
    on
      ? 'film probe on — keeping the microphone through the film'
      : 'film probe off — the film releases the microphone again'
  );
  for (const watcher of filmProbeWatchers) watcher();
}

/**
 * Whether the probe is adding a microphone back for this person in this room.
 *
 * **A function rather than the flag, because the guard is the load-bearing
 * half.** `hasMicrophone` is everything `microphoneNeeded` decides *except* the
 * film — in the room, and a guest with a grant — so ORing this can only ever
 * restore what `isScreening` subtracted. Written here rather than spelled out
 * at the call site so that the one thing this must never do is stated once and
 * tested once: open a microphone for somebody who has no business holding one.
 */
export function filmProbeKeepsMicrophone(
  channel: ChannelState,
  me: UserId
): boolean {
  return filmProbe && hasMicrophone(channel, me);
}

/** Subscribes to changes, in the idiom `diagnostics.ts` already uses. */
export function subscribeFilmProbe(watcher: () => void): () => void {
  filmProbeWatchers.add(watcher);
  return () => filmProbeWatchers.delete(watcher);
}

/**
 * **The muted-start probe: begin the film silent, and give it its sound when
 * it is running.**
 *
 * Added 2026-09-28, out of the one thing the film probe could not answer. A
 * resume is 1,304ms from press to picture and about 1,150 of that is
 * `AVAudioSession` renegotiating — the player takes its first step nine
 * milliseconds after the category lands, and holding the microphone changes
 * none of it, so the renegotiation is `WKWebView`'s rather than ours. See
 * planning/decisions/2026-09-28-the-film-waits-for-the-audio-session.md.
 *
 * **What has never been tried is not needing one.** iOS gates *audible*
 * playback on an active session; silent playback plausibly does not need one at
 * all. So this mutes the player before `playVideo` and unmutes it on the first
 * reading that says `playing`. If the picture then moves in the cold start's
 * 150ms, a resume becomes a picture that starts at once and gains its sound a
 * second later — which is a far better second than a still frame.
 *
 * **The risk is that it moves the stutter into the sound**, the unmute
 * triggering the same renegotiation with the film already running. The
 * transition lines say which immediately: `watch player unmuted` against the
 * category change beside it.
 *
 * It has never been exercised, and that is worth saying plainly: `mutedAll`
 * mutes the room's microphones and not the film, so no code path in this
 * application has ever muted a player.
 *
 * Off on every launch and not persisted, for the film probe's reason: a
 * reading, not a state to wake up in.
 */
let mutedStart = false;

const mutedStartWatchers = new Set<() => void>();

/** Whether a play should begin muted. Read by `WatchPlayer` at the command. */
export function mutedStartEngaged(): boolean {
  return mutedStart;
}

/** Turns it on or off, and says so in the log — `setFilmProbe`'s reasoning. */
export function setMutedStart(
  on: boolean,
  record: (text: string) => void
): void {
  if (mutedStart === on) return;
  mutedStart = on;
  record(
    on
      ? 'muted-start probe on — the film begins silent'
      : 'muted-start probe off — the film begins with its sound'
  );
  for (const watcher of mutedStartWatchers) watcher();
}

/** Subscribes to changes, in the idiom `diagnostics.ts` already uses. */
export function subscribeMutedStart(watcher: () => void): () => void {
  mutedStartWatchers.add(watcher);
  return () => mutedStartWatchers.delete(watcher);
}
