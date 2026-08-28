import { AppState } from 'react-native';
import { AudioEngineMuteMode } from '@livekit/react-native';
import type { AppleAudioConfiguration } from '@livekit/react-native';
import {
  onRouteChange,
  routeLine,
  routeSnapshot,
  type RouteSnapshot,
} from '../../modules/audio-route';
import {
  engineSnapshot,
  watchEngineTransitions,
  type EngineSnapshot,
} from './engineState';
import { WANTED_MUTE_MODE } from './muteMode';
import { nameOf } from './session';
import type { AudioIntent } from './useSessionAudio';

/**
 * What the iOS audio stack is doing right now, gathered from every reader
 * there is, and shaped for a panel that shows **what was asked for beside what
 * is**.
 *
 * **That pairing is the whole design, and it comes from the one structural
 * fact this subsystem has.** Three writers mutate the same process-wide
 * `RTCAudioSessionConfiguration.webRTCConfiguration`: this app, the SDK's
 * native policy observer, and WebRTC re-applying its own defaults. The
 * observer runs on the audio worker thread at an engine transition with no
 * JavaScript in the path, so it always lands *after* anything restated from
 * here. Last writer wins. Everything in `session.ts` exists to make the three
 * of them say the same thing — and until now, nothing could check whether they
 * did. Reading back what we asked for proves nothing; only `AVAudioSession`'s
 * own answer does. **A divergence between the two columns is the bug class**,
 * not a symptom of it.
 *
 * **Six builds were spent on audio without this.** The method failure recorded
 * in DECISIONS.md is that reading source felt cheap and measuring felt
 * expensive, so four fixes were reasoned from code that did not contain the
 * mechanism. The second failure is subtler and shapes this file: five separate
 * instruments failed *by going quiet*, and a quiet instrument reads as evidence
 * of absence. Hence the rule followed throughout here — **nothing renders as
 * blank or false when the truth is that it could not be read.** An unreadable
 * value says `unreadable`. `null` and `false` are never allowed to look alike.
 *
 * Every reader is synchronous and native, so a full gather costs nothing and is
 * safe to poll behind a panel. Everything degrades to null: absent under jest,
 * absent on Android, absent if autolinking missed the local module.
 */
export interface AudioDiagnostic {
  /** What `useSessionAudio` last asked of the session, or null before it has. */
  asked: AudioIntent | null;
  /** What the audio engine reports, or null where there is no engine to ask. */
  engine: EngineSnapshot | null;
  /** What `AVAudioSession` reports, or null where the module did not load. */
  route: RouteSnapshot | null;
  /** When this was taken, for a panel that says how fresh it is. */
  at: number;
}

/**
 * Takes one, from everything that can be asked. Never throws.
 *
 * **The native modules are resolved at import, not here, and that is a choice
 * rather than an oversight.** Importing this file reaches
 * `requireNativeModule('AudioRoute')` through `modules/audio-route`, for every
 * account — where before 2026-08-21 nothing in the app imported that module at
 * all. Moving the lookup in here would spare an unflagged account even that.
 *
 * It stays eager because the alternative buys almost nothing and costs the
 * property that makes this safe: the module is written to degrade to null on
 * *every* failure, and it does so once, at startup, where a fault is
 * discoverable. A lazy require would move that first failure to the moment
 * somebody opens the panel — which is to say, to the moment somebody is trying
 * to read something, having already lost the thing they wanted to look at.
 */
export function readDiagnostic(asked: AudioIntent | null): AudioDiagnostic {
  return {
    asked,
    engine: engineSnapshot(),
    route: routeSnapshot(),
    at: Date.now(),
  };
}

/**
 * iOS's spelling of a category or mode, trimmed to the SDK's.
 *
 * `AVAudioSession` answers `AVAudioSessionCategoryPlayAndRecord` where
 * `AppleAudioConfiguration` says `playAndRecord`. Reconciling them here is
 * what turns "is the session what we asked for" from a judgement into a string
 * comparison — and a judgement is exactly what this panel exists to remove.
 *
 * Anything not in that shape is returned as it came. A value this does not
 * recognise is a finding rather than a formatting problem, so it must not be
 * quietly rewritten into something that looks familiar.
 */
export function shortName(raw: string): string {
  const stripped = raw
    .replace(/^AVAudioSessionCategory/, '')
    .replace(/^AVAudioSessionMode/, '');
  if (stripped === raw || stripped.length === 0) return raw;
  return stripped[0].toLowerCase() + stripped.slice(1);
}

/** A line in the panel. */
export interface DiagnosticRow {
  label: string;
  value: string;
  /**
   * Set when this line is the disagreement itself — asked and actual differ,
   * or a value is one nothing in this app ever requests. The panel colours
   * these, and they are the only thing on it worth reacting to.
   */
  alarm?: boolean;
}

/** A heading, so the panel is read in groups rather than as forty lines. */
export interface DiagnosticSection {
  title: string;
  rows: DiagnosticRow[];
}

const UNREADABLE = 'unreadable';

/** `T`/`F`, and never a blank: see the note about quiet instruments above. */
function flag(value: boolean | undefined): string {
  if (value === undefined) return UNREADABLE;
  return value ? 'T' : 'F';
}

function list(values: string[] | undefined): string {
  if (values === undefined) return UNREADABLE;
  return values.length === 0 ? '(none)' : values.join(' ');
}

/** Two option lists are the same set, order being iOS's business and not ours. */
function sameOptions(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sorted = [...b].sort();
  return [...a].sort().every((value, i) => value === sorted[i]);
}

function describeConfig(config: AppleAudioConfiguration): string {
  return `${config.audioCategory}/${config.audioMode}`;
}

/**
 * What a sample rate implies about a Bluetooth profile, hedged on purpose.
 *
 * The hands-free profile forces a low rate where A2DP runs at 44.1 or 48, and
 * that is the numeric tell a person cannot be asked to hear. But the measured
 * HFP rate on AirPods Pro was **24 kHz**, not the 16 the documentation implies,
 * so a fixed threshold would have called that A2DP. The boundary here sits
 * above it and the wording says "suggests" rather than "is": the rate is
 * evidence, and `outputs` names the port outright.
 */
export function profileHint(sampleRate: number): string {
  if (sampleRate <= 0) return '';
  if (sampleRate >= 44_000) return 'suggests A2DP';
  return 'suggests hands-free';
}

/**
 * The mute mode by name, the numbers being three undocumented constants.
 *
 * **Written out rather than read off the enum's reverse mapping**, which is
 * what this did first. `AudioEngineMuteMode[2]` gives `'InputMixer'` only
 * because TypeScript compiles a numeric enum into an object that maps both
 * ways — a property of how it was declared, not of the SDK's contract. The
 * jest mock declares the same three values as a plain object and has no
 * reverse mapping at all, so the reverse lookup returned `raw(2)` under test
 * while working on a device.
 *
 * That is the shape of failure this whole file is written against: a reading
 * that is quietly wrong somewhere the developer is not looking. The forward
 * direction is the one the mock and the SDK agree on, so the table is keyed
 * that way and a test pins it against the enum.
 */
export function muteModeName(mode: number): string {
  switch (mode) {
    case AudioEngineMuteMode.Unknown:
      return 'Unknown';
    case AudioEngineMuteMode.VoiceProcessing:
      return 'VoiceProcessing';
    case AudioEngineMuteMode.RestartEngine:
      return 'RestartEngine';
    case AudioEngineMuteMode.InputMixer:
      return 'InputMixer';
    default:
      // A value the SDK has grown since. Shown as itself, because a mode this
      // does not recognise is a finding and not a gap in a lookup table.
      return `raw(${mode})`;
  }
}

/**
 * The whole panel, as sections of labelled lines.
 *
 * Pure, and separated from the readers above for the reason every other rule
 * in this codebase is a function with a test: this is where a disagreement is
 * either noticed or missed, and it is short enough to look obviously right
 * while being wrong.
 */
export function diagnosticSections(
  d: AudioDiagnostic,
  steadyHeadset: boolean
): DiagnosticSection[] {
  const { asked, engine, route } = d;

  return [
    { title: 'Session — asked vs actual', rows: sessionRows(asked, route) },
    { title: 'Route', rows: routeRows(route) },
    { title: 'Engine', rows: engineRows(engine) },
    { title: 'Other apps', rows: otherAudioRows(route) },
    { title: 'App', rows: appRows(asked, steadyHeadset) },
  ];
}

function sessionRows(
  asked: AudioIntent | null,
  route: RouteSnapshot | null
): DiagnosticRow[] {
  if (!asked) {
    // Not an error. It is what "connected to no channel" looks like, and the
    // actual column is still worth reading — an app that has asked for nothing
    // and whose session is `playAndRecord` is the most interesting reading
    // this panel can produce.
    return [
      { label: 'asked', value: 'nothing yet — no audio connection' },
      ...actualOnlyRows(route),
    ];
  }

  const wanted = asked.session;
  if (!route) {
    return [
      { label: 'asked', value: `${nameOf(wanted)} ${describeConfig(wanted)}` },
      { label: 'asked opts', value: list(wanted.audioCategoryOptions) },
      { label: 'actual', value: UNREADABLE, alarm: true },
    ];
  }

  const actualCategory = shortName(route.category);
  const actualMode = shortName(route.mode);
  const configMatches =
    actualCategory === wanted.audioCategory && actualMode === wanted.audioMode;
  const actualOptions = route.categoryOptions;
  const optionsMatch =
    actualOptions !== undefined &&
    sameOptions(wanted.audioCategoryOptions ?? [], actualOptions);

  return [
    { label: 'asked', value: `${nameOf(wanted)} ${describeConfig(wanted)}` },
    {
      label: 'actual',
      value: `${actualCategory}/${actualMode}`,
      alarm: !configMatches,
    },
    { label: 'asked opts', value: list(wanted.audioCategoryOptions) },
    {
      label: 'actual opts',
      value: list(actualOptions),
      // An unreadable list is alarming in its own right here: this is the one
      // comparison the panel exists for, and a build whose native half predates
      // the field cannot make it.
      alarm: actualOptions === undefined || !optionsMatch,
    },
    {
      // The observer's value, which is the second writer. It is handed
      // `playout` ahead of every transition and applies it without asking, so
      // a playout that is not what `sessionFor` would return is the exact
      // shape of the bug `policyFor` was written to close.
      label: 'observer playout',
      value: `${nameOf(asked.playout)} ${describeConfig(asked.playout)}`,
    },
  ];
}

/** The actual half alone, for when there is nothing to compare it against. */
function actualOnlyRows(route: RouteSnapshot | null): DiagnosticRow[] {
  if (!route) return [{ label: 'actual', value: UNREADABLE, alarm: true }];
  return [
    {
      label: 'actual',
      value: `${shortName(route.category)}/${shortName(route.mode)}`,
      // `playAndRecord` with nothing asked for means somebody else is holding
      // the session as a call. That is the state the once-seen foreground
      // interruption looks like — see TASKS.md § *The Foreground
      // Interruption*, which is reproducible and asks for exactly this
      // reading.
      alarm: shortName(route.category) === 'playAndRecord',
    },
    { label: 'actual opts', value: list(route.categoryOptions) },
  ];
}

function routeRows(route: RouteSnapshot | null): DiagnosticRow[] {
  if (!route) {
    return [
      {
        label: 'route',
        // Distinguished from "no route", which is a different and rarer thing.
        // Build 61 shipped this module without its Swift — `.gitignore`'s
        // unanchored `ios/` ate it — and read exactly this.
        value: 'unreadable — module absent or not linked',
        alarm: true,
      },
    ];
  }
  const rate = Math.round(route.sampleRate);
  const hint = profileHint(route.sampleRate);
  return [
    { label: 'out', value: list(route.outputs) },
    { label: 'in', value: list(route.inputs) },
    { label: 'rate', value: hint ? `${rate} Hz — ${hint}` : `${rate} Hz` },
  ];
}

function engineRows(engine: EngineSnapshot | null): DiagnosticRow[] {
  if (!engine) {
    return [{ label: 'engine', value: UNREADABLE, alarm: true }];
  }
  return [
    {
      label: 'run/rec/play',
      value: `${flag(engine.engineRunning)} ${flag(engine.recording)} ${flag(engine.playing)}`,
    },
    { label: 'mic muted', value: flag(engine.microphoneMuted) },
    {
      label: 'mute mode',
      value: muteModeName(engine.muteMode),
      // The check build 58 lacked: it set a mute mode and never confirmed the
      // request took, so a silent failure looked exactly like a success.
      alarm: engine.muteMode !== WANTED_MUTE_MODE,
    },
    {
      label: 'voice proc',
      value: `on=${flag(engine.voiceProcessingEnabled)} byp=${flag(engine.voiceProcessingBypassed)}`,
      // The unit that cancels echo. Off while capturing is a worse bug than
      // any this panel was built for — see planning/POSTMORTEM-echo.md.
      alarm: !engine.voiceProcessingEnabled || engine.voiceProcessingBypassed,
    },
    { label: 'prepared', value: flag(engine.recordingAlwaysPrepared) },
    {
      label: 'in/out avail',
      value: `${flag(engine.inputAvailable)} ${flag(engine.outputAvailable)}`,
    },
  ];
}

function otherAudioRows(route: RouteSnapshot | null): DiagnosticRow[] {
  if (!route) return [{ label: 'other audio', value: UNREADABLE, alarm: true }];
  return [
    { label: 'other playing', value: flag(route.otherAudioPlaying) },
    { label: 'silence hint', value: flag(route.secondaryAudioHint) },
    {
      // Not about other apps' audio, but about ours in the same way: what iOS
      // will suppress for the duration of a capturing session. False means
      // every haptic this app asks for is discarded without an error — which
      // is what build 70's silenced-speaker cue met. `applyConfiguration`
      // turns it on at every write to the session, so false here is that
      // request having failed or a build that predates it.
      label: 'haptics ok',
      value: flag(route.allowsHapticsDuringRecording),
      alarm: route.allowsHapticsDuringRecording !== true,
    },
  ];
}

function appRows(
  asked: AudioIntent | null,
  steadyHeadset: boolean
): DiagnosticRow[] {
  // Stated even when there is no connection, because "which rule was in force"
  // is a question asked of the whole dump rather than of the session — and a
  // reading taken before anything connected is still evidence about a phone
  // whose setting somebody wants to know.
  const rule: DiagnosticRow = { label: 'steady headset', value: flag(steadyHeadset) };
  if (!asked) return [rule, { label: 'intent', value: 'none — not connected' }];
  return [
    rule,
    { label: 'intent', value: asked.intent },
    {
      // What the hook was told, echoed back by it rather than recomputed here.
      // A second computation of the same rule would agree with the first right
      // up until the moment it mattered.
      //
      // Only the third decides the session, since 2026-08-27. The first two
      // are here because they decide the *microphone*, and a session that
      // looks wrong is usually a microphone question answered oddly.
      //
      // **The third is now the answer to one of two different questions**, and
      // which one is the `steady headset` row above. Without it this line is
      // ambiguous in exactly the case somebody is reading it for: `F` here
      // means *nobody present is capturing* under the default and *this app
      // has no audio at all* under the setting, which are not the same claim.
      label: 'self/needed/audio',
      value: `${flag(asked.selfMuted)} ${flag(asked.micNeeded)} ${flag(asked.hasAudio)}`,
    },
    { label: 'audible', value: String(asked.othersAudible) },
  ];
}

/**
 * The whole panel as plain text, for the copy button.
 *
 * **A screenshot was the previous way this left the phone, and it is a bad
 * one.** The readings that matter are long strings that differ in one token —
 * `playAndRecord/videoChat` against `playback/videoChat`, an options list with
 * one entry added — and a photograph of those has to be re-typed by whoever
 * wants to compare them, or squinted at. Text can be pasted into an issue, a
 * message, or a diff.
 *
 * **Stamped with the build and the wall-clock time**, because the first
 * question asked of a pasted dump is always which binary produced it, and the
 * second is when. `appBuild()` reads the *installed* `CFBundleVersion` rather
 * than `app.json`, so it cannot claim a number the binary does not have.
 *
 * Alarms are marked `<<` rather than by colour, colour being the one thing
 * plain text cannot carry. Without that the copy would lose exactly the
 * information the panel exists to show.
 *
 * **And stamped with the audio-session rule, on the same line as the build**,
 * added 2026-08-28 for the paired runs HF-ONLY-WALK.md § *The comparison* asks
 * for. Two pastes of the same step under the two settings are otherwise
 * byte-indistinguishable in their provenance, which makes a pair of them
 * worthless a week later — and a pair is the whole reason the alternative rule
 * shipped as a setting rather than as a branch. It is in the rows as well; the
 * header is so that the first line answers it without scrolling.
 */
export function diagnosticText(
  d: AudioDiagnostic,
  events: DiagnosticEvent[],
  build: number | null,
  steadyHeadset: boolean
): string {
  const lines: string[] = [
    `The Floor — audio diagnostics`,
    `build ${build ?? 'unknown'} · steady headset ${steadyHeadset ? 'on' : 'off'} · ${new Date(d.at).toISOString()}`,
  ];

  for (const section of diagnosticSections(d, steadyHeadset)) {
    lines.push('', section.title);
    for (const row of section.rows) {
      // Padded so the values line up in a monospaced paste, the same reason
      // the panel gives the label column a fixed width.
      const label = row.label.padEnd(16);
      lines.push(`  ${label}${row.value}${row.alarm ? '   <<' : ''}`);
    }
  }

  lines.push('', 'Log — newest last');
  if (events.length === 0) {
    // Said, not omitted. An absent section reads as an instrument with nothing
    // to report, which is the confusion this whole file is written against.
    lines.push('  nothing recorded yet');
  } else {
    for (const event of events) {
      lines.push(`  ${new Date(event.at).toISOString()} ${event.text}`);
    }
  }

  return lines.join('\n');
}

/**
 * A change worth having a timestamp on, kept in memory and nowhere else.
 *
 * **Some of what this subsystem does cannot be polled.** A route change
 * carries iOS's own reason code, which is the only thing separating a profile
 * handover from a session being deactivated and reactivated from no change at
 * all — and the reason exists only on the notification. Sample the route a
 * second later and it is gone. The same is true of the moment the app comes to
 * the foreground, which is when the one unreproduced interruption was seen.
 *
 * So the panel has a log as well as a reading, and the log is what a
 * transient goes into.
 */
export interface DiagnosticEvent {
  at: number;
  /** One short line, the panel being a phone screen. */
  text: string;
}

/** Enough to cover a minute of fiddling, and bounded so it cannot grow. */
/**
 * How many events the log holds, oldest dropped first.
 *
 * **Forty until 2026-08-24, and forty was chosen for a panel somebody read
 * while a fault was in front of them.** What is being chased now is
 * intermittent: it is provoked over several minutes of stepping in and out and
 * backgrounding, and a single walk to Home and back costs six lines. Forty was
 * about six passes — so the connect and the subscribe that explain a freeze
 * could roll off the top before the freeze itself arrived, and the reading that
 * survived would be the least informative part of the run.
 *
 * Two hundred is a few thousand characters, copied as text and read once. It
 * costs a `slice` on an array of two hundred per event, which is nothing beside
 * the native calls this file already makes.
 *
 * **It is still memory, and that is the remaining weakness.** The log does not
 * survive a force-quit, a crash or an app update, which are exactly the three
 * things somebody does when the audio has stopped and they want it back. Ask
 * for the copy before the reinstall.
 */
export const LOG_LIMIT = 200;

let events: DiagnosticEvent[] = [];

/**
 * The backlog waiting to reach the server, and how much of it is kept.
 *
 * Larger than the display ring because it is drained on a timer and may sit
 * through a tunnel, and because losing from here is losing a measurement. Still
 * finite: an app left running for a day with no network must cost bounded
 * memory.
 */
const UNSENT_LIMIT = 1_000;
let unsent: DiagnosticEvent[] = [];
const listeners = new Set<() => void>();

/**
 * Writes a line, oldest dropped first.
 *
 * **Called unconditionally, by every build, for every account** — including the
 * ones with no `debug` flag and therefore no panel. It has to be: a log that
 * started when somebody opened the panel would be empty of exactly the events
 * they opened it to see. It costs a string in a forty-element array, and
 * nothing reads it unless the panel is mounted.
 */
export function recordEvent(text: string): void {
  const event = { at: Date.now(), text };
  events = [...events, event].slice(-LOG_LIMIT);
  // Held separately from the ring above, because the two answer different
  // questions. The ring is what a panel shows and is allowed to forget; this is
  // what has not reached the server yet, and forgetting from it loses evidence
  // rather than scrollback. Bounded all the same — a phone with no signal must
  // not accumulate a session's worth of lines without limit.
  unsent = [...unsent, event].slice(-UNSENT_LIMIT);
  for (const listener of listeners) listener();
}

/**
 * Everything not yet shipped, handed over and forgotten in one step.
 *
 * Atomic on purpose: a reader that copied the buffer and cleared it in two
 * statements would drop whatever landed in between, and what lands in between
 * is precisely an audio event arriving while a batch is being sent.
 */
export function drainEvents(): DiagnosticEvent[] {
  const out = unsent;
  unsent = [];
  return out;
}

/** Puts a failed batch back at the front, oldest first, still bounded. */
export function returnEvents(lines: DiagnosticEvent[]): void {
  unsent = [...lines, ...unsent].slice(-UNSENT_LIMIT);
}

/** Newest last, which is how a log is read. */
export function diagnosticEvents(): DiagnosticEvent[] {
  return events;
}

/** Tells a panel when a line lands. Returns its own unsubscribe. */
export function subscribeDiagnostics(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Only ever called by tests, which must not inherit each other's log. */
export function resetDiagnostics(): void {
  events = [];
  unsent = [];
}

/** Whether the two observers below are already installed. */
let recording = false;

/**
 * Starts recording the two things that cannot be polled: route changes, with
 * iOS's reason code, and the app coming to the foreground.
 *
 * **Idempotent, and never stopped.** Called by the panel when it first mounts,
 * and then left running for the life of the process — because navigating away
 * from the channel screen unmounts the panel, and the whole point of the log
 * is that it is still recording when nobody is looking at it. Two observers
 * that live as long as the app is what this costs.
 *
 * The consequence, stated so nobody has to discover it: **a route change
 * before the panel has ever been opened is not in the log.** Open it once at
 * the start of a session and it will be.
 */
export function startDiagnosticRecording(): void {
  if (recording) return;
  recording = true;

  onRouteChange((snapshot) => {
    // `routeLine` rather than a reading of our own, because it prints the
    // reason — which is the field that exists only on the notification and is
    // gone by the next poll.
    recordEvent(`route ${routeLine(snapshot)}`);
  });

  // The engine's own transitions, which the once-a-second poll above cannot
  // see and which the reading in the panel can only ever report the aftermath
  // of. See `watchEngineTransitions` for why these two delegate slots and no
  // others, and why the handler must not throw.
  watchEngineTransitions(recordEvent);

  AppState.addEventListener('change', (next) => {
    // Foregrounding is the moment the one unreproduced interruption was seen
    // — alone in a channel, another app's playback stopped. Whatever the
    // session was at that instant is a line above this one.
    recordEvent(`app ${next}`);
  });
}
