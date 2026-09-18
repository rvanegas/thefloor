import { Platform } from 'react-native';

/**
 * The audio route, which nothing else in this app can read.
 *
 * See `ios/AudioRouteModule.swift` for why this exists and what each field
 * settles. In short: five builds were spent on "muting hands a Bluetooth
 * headset out of A2DP and back" without anybody being able to ask whether the
 * route moved at all.
 *
 * **Everything here degrades to null rather than throwing.** It is diagnostic
 * code loaded on the path that carries live audio, and it is a *local* native
 * module — so it is absent under jest, absent on Android, and absent in any
 * build where the autolinking did not pick it up. None of those may be able to
 * take a call down.
 */
export interface RouteSnapshot {
  /** Port types and names, e.g. `BluetoothA2DP(AirPods Pro)`. */
  outputs: string[];
  inputs: string[];
  /**
   * The number that settles it without a judgement call: the hands-free
   * profile forces 16 kHz, sometimes 8, where A2DP runs at 44.1 or 48.
   */
  sampleRate: number;
  /**
   * The session as it **is**, in iOS's own spelling —
   * `AVAudioSessionCategoryPlayAndRecord`, `AVAudioSessionModeVideoChat`.
   * `shortName` in `../../src/audio/diagnostics.ts` trims them to the words
   * `AppleAudioConfiguration` uses, which is what makes the comparison against
   * what was asked for a string equality rather than a judgement.
   */
  category: string;
  mode: string;
  /**
   * The category options actually set, named as the SDK names them —
   * `allowBluetooth`, `defaultToSpeaker`, `mixWithOthers` and the rest.
   *
   * **Optional, because a binary can be older than the field.** The native
   * half of this module ships inside the app, so a JavaScript bundle and a
   * `.swift` always agree — except during development, where a Metro reload
   * does not rebuild native code. Absent means unreadable, and the panel says
   * so rather than showing an empty list, which would read as "no options
   * set" and is the more alarming of the two.
   */
  categoryOptions?: string[];
  /**
   * Whether another app is producing sound right now.
   *
   * **A reading, and since 2026-09-08 not an input to anything.** It decided
   * which of two waits somebody got until stepping in became an unconditional
   * claim, and it was never trustworthy for that: it answers false with music
   * plainly playing once this app's own session is active, so it describes our
   * own foreground state wearing another app's name. `secondaryAudioHint` and
   * the notification behind it were the instruments for the same question and
   * went with it — the notification having been shipped in build 150 and never
   * fired once, which is the recorded negative.
   */
  otherAudioPlaying?: boolean;
  /**
   * Whether the Taptic Engine is allowed to run while the session is capturing.
   *
   * **`false` here means a haptic cue is silently discarded**, which is what
   * build 70's silenced-speaker buzz ran into: iOS mutes haptics and system
   * sounds for the duration of any session that is using audio input, and the
   * default is off. See `setAllowHapticsDuringRecording`, which is this app
   * turning it on, and `ios/AudioRouteModule.swift` for the header text.
   *
   * Optional for the same reason `categoryOptions` is: a Metro reload does not
   * rebuild native code, so a bundle can be newer than the `.swift` beneath it.
   */
  allowsHapticsDuringRecording?: boolean;
  /** Only on a change event: iOS's own reason code. */
  reason?: string;
}

interface NativeAudioRoute {
  snapshot(): RouteSnapshot;
  setAllowHapticsDuringRecording(allow: boolean): Promise<boolean>;
  vibrate(): boolean;
  /**
   * Optional for the reason the lab's three below are, and here it is the
   * ordinary case rather than a reload hazard: every build already installed
   * predates this function, so `undefined` is what a phone that has not
   * updated actually returns.
   *
   * **A string since 2026-09-15, where build 205 shipped a `boolean`.** A
   * bundle calling this against that binary throws on the argument type and is
   * caught below into the same `false` an absent module gives — which is the
   * right answer, since a binary that predates the third kind cannot play it.
   *
   * **And an amplitude beside it since the same day**, for the same reason one
   * layer down: a binary expecting one argument and handed two throws on the
   * count, and false is again the true answer — build 206 renders at a fixed
   * peak and cannot be asked for another.
   */
  chime?(
    kind: string,
    amplitude: number,
    lead: number,
    via: string
  ): boolean;
  /**
   * What the binary's chime renderer actually is, or absent on a binary built
   * before 2026-09-15 evening.
   *
   * **The absence is the reading.** A native fix and a native fix that was
   * never compiled look identical from JavaScript, and one of them had already
   * been reported as *still happening*.
   */
  chimeInfo?(): ChimeInfo;
  /** Renders and loads a chime without playing it. */
  prepareChime?(kind: string, amplitude: number, lead: number): boolean;
  /**
   * The lab's three. Optional on the type because a Metro reload can leave a
   * new bundle talking to a binary built before they existed, and the lab says
   * so rather than throwing.
   */
  configure?(
    category: string,
    mode: string,
    options: string[],
    active: boolean
  ): TrialResult;
  startInput?(): TrialResult;
  stopInput?(): TrialResult;
  /** Optional for the same reason: a bundle can outrun the binary under it. */
  release?(): Promise<TrialResult>;
  addListener(
    event: 'onRouteChange',
    listener: (payload: RouteSnapshot) => void
  ): { remove(): void };
}

function load(): NativeAudioRoute | null {
  if (Platform.OS !== 'ios') return null;
  try {
    // Required lazily and defensively. A local module that failed to link is a
    // missing-module throw at import time, which would take the whole audio
    // hook with it rather than merely losing a diagnostic.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireNativeModule } = require('expo-modules-core');
    return requireNativeModule('AudioRoute') as NativeAudioRoute;
  } catch {
    return null;
  }
}

const native = load();

/**
 * Why a reading came back null, which is two different faults wearing one face.
 *
 * - `absent` — the module never linked. `load()` returned null at import and
 *   nothing here will ever answer. Build 61 shipped exactly this, `.gitignore`'s
 *   unanchored `ios/` having eaten the Swift.
 * - `threw` — the module linked and `snapshot()` failed anyway. Something is
 *   wrong on the native side of a module that is demonstrably present.
 *
 * **They were the same `null` until 2026-09-03, and that cost a diagnosis.** A
 * panel read `module absent or not linked` in a session whose own log held
 * ninety seconds of route lines from this very module — so the reading accused
 * the build of a linking fault while the evidence beside it said the link was
 * fine. `diagnostics.ts` opens with the rule this breaks: nothing may render as
 * blank or false when the truth is that it could not be read, and `null` and
 * `false` are never allowed to look alike. Two causes collapsed into one `null`
 * is that rule broken one level down, where the reader cannot see it.
 */
export type RouteFault = 'absent' | 'threw';

/**
 * Why the last `routeSnapshot` failed, or null if it did not.
 *
 * Held rather than returned beside the snapshot so that every existing caller
 * keeps its `RouteSnapshot | null`, and only the panel — the one thing that
 * reports a cause — has to ask. Seeded from `load()`, so it is already right
 * before anything has been read.
 */
let lastFault: RouteFault | null = native ? null : 'absent';

/** Where the audio is going and coming from right now, or null if unreadable. */
export function routeSnapshot(): RouteSnapshot | null {
  if (!native) {
    lastFault = 'absent';
    return null;
  }
  try {
    const snapshot = native.snapshot();
    lastFault = null;
    return snapshot;
  } catch {
    lastFault = 'threw';
    return null;
  }
}

/**
 * Why the last `routeSnapshot()` came back null, or null when it did not.
 *
 * Read *after* the snapshot it explains — `readDiagnostic` gathers them in that
 * order — because this is the reason for that call rather than a standing
 * property of the module.
 */
export function routeFault(): RouteFault | null {
  return lastFault;
}

/**
 * Asks iOS to let haptics play while this app is capturing.
 *
 * One of the two things in this module that write — `releaseSession` is the
 * other — and it is here rather than in the audio hook because
 * `AVAudioSession` is what has to be told and this is the only file that can
 * reach it.
 *
 * The default is off, and off is what made the silenced-speaker cue produce
 * nothing at all: a session that is using audio input mutes the Taptic Engine
 * for as long as it holds, and this app's session is capturing whenever
 * anybody in the channel has a microphone open — which is precisely the state
 * in which somebody can be silenced. `expo-haptics` reports no error for it.
 * The cue was never refused; it was allowed and then discarded.
 *
 * Cheap, idempotent, and asserted on every write to the session rather than
 * once at startup: three writers mutate that session and none of them documents
 * what it leaves this property at.
 *
 * @returns whether the request took. False also covers "no module", which on
 * iOS means the local module did not link — the same silent absence
 * `routeSnapshot` returns null for.
 */
export async function setAllowHapticsDuringRecording(
  allow: boolean
): Promise<boolean> {
  try {
    return (await native?.setAllowHapticsDuringRecording(allow)) ?? false;
  } catch {
    return false;
  }
}

/**
 * The alert vibration, at the strength an incoming call uses.
 *
 * Build 71 made the haptic arrive and proved it was the wrong haptic:
 * `NotificationFeedbackType.Warning` is a Taptic transient meant for a hand
 * already holding the phone, and against a leg through a pocket it was
 * reported as hardly perceptible. This is the vibration motor instead. See
 * `ios/AudioRouteModule.swift` for why not `CHHapticEngine`.
 *
 * It is a *system sound*, so `setAllowHapticsDuringRecording` governs it too —
 * without that, this is as silent as the haptic was.
 *
 * @returns whether it played. False means no module, which is Android, jest,
 * or a build whose native half predates this — and is the signal to fall back
 * to `expo-haptics`, which is what `useSilencedNudge` does.
 */
export function vibrate(): boolean {
  try {
    return native?.vibrate() ?? false;
  } catch {
    return false;
  }
}

/**
 * Which chime to play.
 *
 * **Three, not two, since 2026-09-15.** `nearby` was the missing one, and its
 * absence was not silence but a wrong sound: a declaration from outside fired
 * `in`, so a room heard somebody arrive who had only stepped to the edge.
 *
 * **And four since 2026-09-17, where the fourth is not a presence chime at
 * all.** `recording` says a run somebody started has begun — an audible notice
 * to everybody in the room, where until then the notice was a red dot and
 * therefore reached only whoever was looking at the screen. It is in the same
 * type because it is the same renderer and the same alert path, and it is
 * three notes rather than two because it is not answering the question the
 * other three answer. See
 * planning/decisions/2026-09-17-a-recording-somebody-started-says-so-out-loud.md.
 *
 * **A phone whose native half predates it plays nothing**: `chimeNotes` in
 * `AudioRouteModule.swift` returns false for a kind it does not know, which is
 * the deliberate behaviour there — a chime nobody recognises is worse than
 * silence. So an install below the build that adds this keeps exactly today's
 * notice rather than acquiring a wrong sound.
 */
export type ChimeKind = 'in' | 'out' | 'nearby' | 'recording';

/**
 * The shapes `nearby` is being chosen from, which only the audio lab passes.
 *
 * **Temporary, and deliberately not part of `ChimeKind`.** A candidate is not
 * a thing the app plays — it is a thing an ear compares, on the phone, which
 * is the only speaker whose verdict counts. `nearby` aliases the winner in
 * `AudioRouteModule.swift`; when it is picked these go, and so does this type.
 */
export type ChimeCandidate =
  | 'nearby-a'
  | 'nearby-b'
  | 'nearby-c'
  | 'nearby-d';

/**
 * The peak the app plays its chimes at, mirroring `chimeAmplitude` in the
 * Swift.
 *
 * **Two copies on purpose, and neither is the fallback for the other.** The
 * native constant is what an argument-less past build baked in and what a
 * non-finite request lands on; this one is what every ordinary call passes
 * today. They are kept equal so the lab's readout of *what the app does* is
 * the number the app actually does.
 *
 * It is here rather than in `../../src/audio/chime.ts` because the lab imports
 * from this module directly, and a volume sweep wants the starting point in
 * the same file as the function it varies.
 *
 * **1, the top of the ladder, and a constant rather than a choice.** It
 * shipped at 0.18 and was reported from a phone as too quiet to notice; for
 * one day on 2026-09-15 it was an account setting offering five peaks, and
 * the ladder was taken back out because a phone heard all five as much the
 * same — the alert path takes no gain, so the distance the file spans is not
 * the distance an ear gets. Given that, the rung to stand on is the loudest
 * one: nothing is bought by leaving headroom in a file whose level the phone
 * is going to decide anyway.
 *
 * **It is also the ceiling, and the Swift is what enforces that.** `1` is full
 * scale for a sine; `clampAmplitude` pins every request into `[0.01, 1]` and
 * the chime's cache key is computed from the clamped value, so a larger number
 * here would not be louder, would not be a distinct sound, and would not
 * complain. Louder than this is not an amplitude question — it is the path
 * (`ChimePath`) or the waveform. See
 * planning/decisions/2026-09-15-the-chime-has-one-loudness-again.md, and
 * `AudioLabView` for the sweep, which still varies this by hand.
 */
export const CHIME_AMPLITUDE = 1;

/**
 * The silence every chime opens with, mirroring `chimeLeadSeconds` in the
 * Swift, on the same terms as `CHIME_AMPLITUDE` above.
 *
 * **Zero, and the answer is that it was never the fault.** It was 180ms for
 * part of 2026-09-15, on a theory that a cold output route swallows a cue
 * shorter than its own power-up. What was actually wrong is that the first play
 * of a sound rendered and loaded it in the same breath — `prepareChime` is the
 * fix — and with that ahead of the tap the cue works at 0.18 with no lead at
 * all.
 *
 * **Kept as a dial rather than deleted**, because nobody has listened on a
 * Bluetooth route, which comes up far more slowly than a loudspeaker. The app
 * asks for zero; the lab can ask for a second.
 */
export const CHIME_LEAD = 0;

/**
 * How long one note of a chime lasts, mirroring `chimeNoteSeconds` in the
 * Swift on the same terms as the two constants above.
 *
 * Here because JavaScript has to know how long a sound it cannot hear is
 * going to last — see `CHIME_BEAT` — and `chimeInfo()` reports the same number
 * but only on a phone with a linked native half, which is no use to the
 * scheduler on web or to a test.
 */
export const CHIME_NOTE_SECONDS = 0.09;

/**
 * How many notes each kind is made of, mirroring the row lengths of
 * `chimeNotes` in `AudioRouteModule.swift`.
 *
 * **Only the scheduler reads this**, and only to know when a sound will be
 * finished, so the cost of a row being wrong is a gap slightly off rather than
 * a wrong sound. Keep it right anyway: it is two lines from the table it
 * mirrors, and a kind added here without a row there is a type error, which is
 * the half that catches the likelier mistake.
 */
export const CHIME_NOTES: Record<ChimeKind, number> = {
  in: 2,
  out: 2,
  nearby: 2,
  recording: 3,
};

/**
 * The silence held between two chimes that fall in the same moment.
 *
 * **Without it they are not merely crowded, they are simultaneous.**
 * `AudioServicesPlaySystemSound` returns as soon as it has handed the sound
 * over, so two calls in one tick start together and what a room hears is a
 * chord — with no way to tell that two things happened, let alone which two.
 * Spacing them is what makes a pair of events a pair of sounds.
 *
 * **A third of a second, and it was one note long until 2026-09-17.** The
 * shorter gap was reasoned from the notes rather than heard — a rest the
 * length of one note ought to read as the space between two figures — and a
 * phone reported that two chimes a beat apart could hardly be told from one
 * sound. The reasoning missed the envelope: each note decays as `exp(-t * 18)`
 * and is still at a fifth of its peak when the next one is due, so the tail of
 * one chime is still sounding through a 90ms rest and the pair runs together.
 *
 * **It is longer than a whole chime on purpose.** Two notes are 180ms, so a
 * 300ms rest is the one gap in the sequence that is longer than any gap
 * inside a chime — which is what makes the ear group the notes into figures
 * rather than hearing four or five evenly spaced tones.
 *
 * Raising it lengthens the longest legitimate queue, which is why
 * `CHIME_STALE_MS` in `../../src/audio/chime.ts` is derived from this number
 * rather than set beside it.
 */
export const CHIME_BEAT_SECONDS = 0.3;

/**
 * Which path a chime is played down.
 *
 * **`system` is what the app has always used and has no volume control of any
 * kind.** `AudioServicesPlaySystemSound` takes a sound id and nothing else, and
 * what it plays goes out the alert path — a level this app neither sets nor can
 * read. The samples were supposed to be the lever; they were then measured, and
 * they are: the peak sweep spans a real 15dB in the file. A phone heard all
 * five as much the same, which is the reading that puts the path itself under
 * suspicion rather than anything rendered into it.
 *
 * **`player` is `AVAudioPlayer` at full gain**, on the media path, into the
 * session this app already holds. It was ruled out when the chimes were built,
 * on the grounds that it configures `AVAudioSession` itself and would become a
 * fourth writer to the process-wide configuration — and `AVAudioPlayer.h` has
 * no category or activation API on it at all. The objection was true of
 * `expo-audio`, which does manage the session, and was carried across to the
 * bare player without being checked.
 *
 * **It was a comparison, and on 2026-09-17 it became a choice: the app ships
 * on `player`.** The question that settled it was not loudness but the ringer
 * switch. `AudioServicesPlaySystemSound` is an alert, and a phone in silent
 * mode does not play alerts — so every chime was being discarded for any
 * listener with the switch thrown, which is a great many of them and was
 * indistinguishable from the cue being broken. It cost most of a day of
 * chasing a renderer that was working the whole time.
 *
 * **A chime is not an alert, because by the time one can fire you are already
 * in a call.** The silent switch is a statement about being interrupted by
 * things you did not ask for. Somebody present in a channel is listening to a
 * voice through the same speaker at the same moment; a cue that says who just
 * joined that conversation is part of it, not an interruption of it, and
 * suppressing it silences an explanation while leaving the thing it explains
 * audible. That is the whole argument, and it is why this is a judgement about
 * what a presence cue *is* rather than a workaround for a quiet one.
 *
 * **The mechanism is the session, not a flag.** `AVAudioPlayer` plays into
 * whatever session the app already holds and sets nothing itself; in a channel
 * that session is `playAndRecord`, which ignores the ringer switch. So the
 * chime is audible in silent mode exactly when there is a conversation for it
 * to be about, and no flag had to be set for it — outside a channel the app
 * holds no such session and the same call would respect the switch, which is
 * the right behaviour there and is why the audio lab can still be silent with
 * the switch thrown.
 *
 * `system` stays, because it is the control the above was judged against and
 * is what every build before this one played.
 */
export type ChimePath = 'system' | 'player';

/**
 * The path the app plays its chimes down.
 *
 * **A named constant rather than a literal default, because a binary can be
 * older than this choice.** `chime` negotiates its argument count downwards,
 * and the `via` argument is the first one dropped — so a bundle running
 * against a binary built before the path existed silently plays down the alert
 * path and is silent in silent mode, which is the original fault wearing the
 * fix's clothes. `chimeArity` below is how the lab tells the two apart. See
 * planning/SHIMS.md.
 */
export const CHIME_PATH: ChimePath = 'player';

/**
 * Renders a chime and hands it to the system sound server, without playing it.
 *
 * **Call this before the tap, not at it.** The first `chime` for a given kind,
 * amplitude and lead renders a WAV, writes it, creates a `SystemSoundID` and
 * plays it in one breath — and a cue 180ms long has no margin for a server
 * still picking the file up. Warming it is the difference between a cue and a
 * cue's first half.
 *
 * **The cache key includes the amplitude**, which is why this reaches the flat
 * sweep as well: every chip on the peak row is a cold key, so sweeping five
 * peaks one tap each compares five cold sounds rather than five amplitudes.
 *
 * Returns whether it loaded. False on a binary older than this function, which
 * is the same reading it is everywhere else here.
 */
export function prepareChime(
  kind: ChimeKind | ChimeCandidate,
  amplitude: number = CHIME_AMPLITUDE,
  lead: number = CHIME_LEAD
): boolean {
  try {
    return native?.prepareChime?.(kind, amplitude, lead) ?? false;
  } catch {
    return false;
  }
}

/** What the running binary's chime renderer holds, for the lab to display. */
export interface ChimeInfo {
  leadSeconds: number;
  noteSeconds: number;
  amplitude: number;
  sampleRate: number;
  kinds: string[];
}

/**
 * The renderer as the binary actually has it, or null on an older one.
 *
 * **Null does not mean broken; it means stale**, and that is the whole reason
 * this exists. The lab prints it in those words, because "the fix did not
 * work" and "the fix is not in this binary" are the same symptom and only one
 * of them is worth debugging.
 */
export function chimeInfo(): ChimeInfo | null {
  try {
    return native?.chimeInfo?.() ?? null;
  } catch {
    return null;
  }
}

/**
 * The presence chime: two notes rising, the same two falling, or one alone.
 *
 * Rendered in the native half and played as a *system sound*, which is the
 * same delivery `vibrate` uses and is chosen for the same reason — it starts
 * no engine and writes no session, where every audio player available to
 * JavaScript would do both. See `ios/AudioRouteModule.swift`.
 *
 * It is a system sound, so — again like `vibrate` —
 * `setAllowHapticsDuringRecording` governs it, and without that it is silent
 * for exactly as long as anybody is capturing.
 *
 * **The peak is an argument, and it is the only volume control there is.**
 * `AudioServicesPlaySystemSound` takes no gain — the file *is* the loudness —
 * so asking for a louder chime means rendering louder samples, which is what
 * this number does. It defaults to what the app plays at; the audio lab is the
 * one caller that passes anything else, and it passes a sweep.
 *
 * @param kind which of the three, or a lab candidate for `nearby`.
 * @param amplitude peak sample value, 0.01 to 1.0, clamped natively.
 * @param lead seconds of silence in front of the notes, 0 to 1, clamped
 * natively — what the output route powers up on. Zero is the cue as it was
 * before 2026-09-15 and is the control the sweep is read against.
 * @param via which path to play it down. `system` is the alert path with no
 * gain, which is what the app ships; `player` is the media path at full gain.
 * The lab is the only caller that passes the second.
 * @returns whether it played. False means no module, or a native half with no
 * `chime` at all.
 *
 * **It no longer means "the binary is older than this bundle", and that change
 * is the point.** An Expo `Function` throws when it receives more arguments
 * than it declares — `validateArgumentsNumber` in `expo-modules-core`, on
 * `received > argumentsCount` — and the catch here turned that into `false`
 * and exact silence. `chime`'s signature moved four times on 2026-09-15 while
 * a quiet chime was being chased, and each move produced a *fresh* silence in
 * any bundle running ahead of its binary, arriving in the middle of debugging
 * the original fault and looking exactly like it.
 *
 * So the call negotiates down: four arguments, then three, then two, then one,
 * keeping the first form the binary accepts. An older binary plays the sound
 * with the later arguments baked in rather than not playing at all, and
 * `chimeArity` says which form was taken so a lab is not reading a lead or a
 * path off its chips that the sound never had. See planning/SHIMS.md.
 */
let acceptedArity: number | null = null;

/**
 * Calls the first form a binary will accept, and says which one that was.
 *
 * Exported so it can be tested, which the rest of this module cannot be: `load`
 * returns null off iOS, so under jest there is no native half to negotiate
 * with and the one piece of logic here that can silently swallow a cue would
 * have no coverage at all.
 *
 * **Only an argument-count refusal is worth stepping down for**, but the
 * exception carries no type worth matching on from here, so every throw is
 * retried. A fault that is not about the count throws on every form, the loop
 * runs out, and the answer is the same `false` it would otherwise have been —
 * at the cost of three more calls on a path that is already failing.
 */
export function playFirstAccepted(
  play: (...args: unknown[]) => boolean,
  forms: unknown[][]
): { played: boolean; arity: number | null } {
  for (const args of forms) {
    try {
      return { played: play(...args), arity: args.length };
    } catch {
      // Wrong count for this binary; try the next form down.
    }
  }
  return { played: false, arity: null };
}

export function chime(
  kind: ChimeKind | ChimeCandidate,
  amplitude: number = CHIME_AMPLITUDE,
  lead: number = CHIME_LEAD,
  via: ChimePath = CHIME_PATH
): boolean {
  const play = native?.chime;
  if (play == null) return false;
  // Richest first, and every shorter call is the same sound with a later
  // argument left at whatever that binary bakes in.
  const result = playFirstAccepted(play as (...a: unknown[]) => boolean, [
    [kind, amplitude, lead, via],
    [kind, amplitude, lead],
    [kind, amplitude],
    [kind],
  ]);
  acceptedArity = result.arity;
  return result.played;
}

/**
 * How many arguments the binary's `chime` turned out to take, or null before
 * one has been played or if none of the forms was accepted.
 *
 * **Four means this bundle's own signature; fewer means an older binary** that
 * is playing the sound with the later arguments baked in — so a lab reading a
 * lead or a path off its own chips is reading something the sound did not
 * have. The lab prints it for that reason.
 */
export function chimeArity(): number | null {
  return acceptedArity;
}

/**
 * Every route change iOS reports, with its reason.
 *
 * **The reason is the diagnostic part**, and the absence of any event is a
 * finding in its own right: if a self-mute produces an audible transition and
 * no route change fires, then the sound is not a handover and five builds were
 * aimed at the wrong phenomenon.
 *
 * @returns an unsubscribe function, which is a no-op when there is no module.
 */
export function onRouteChange(
  listener: (payload: RouteSnapshot) => void
): () => void {
  try {
    const sub = native?.addListener('onRouteChange', listener);
    return () => sub?.remove();
  } catch {
    return () => {};
  }
}

/**
 * Gives the audio system back, and tells the app we interrupted that we have.
 *
 * **`notifyOthersOnDeactivation`, which neither half of the SDK passes.**
 * `AudioSession.stopAudioSession` deactivates with no options, and so does the
 * native policy observer's `deactivateOnStop` path — both release the session
 * and neither tells anybody. With the flag, iOS tells whatever was interrupted
 * that it may resume, which the 2026-09-08 lab run measured: every `Release`
 * brought the other app back to full rate.
 *
 * Since that day this app's claim on the audio system is exclusive and its
 * release is the only way anybody gets their podcast back — so the difference
 * between *deactivated* and *deactivated and said so* is the whole of what
 * being nearby buys somebody.
 *
 * **Not the mechanism nearby relies on, but the courtesy on top of it.** The
 * release itself happens natively at the engine's last stop; this is called on
 * the connection's teardown, after the SDK has already stopped its session, so
 * on a healthy path it is asserting a deactivation that has happened. Whether
 * the notification still reaches the other app from there is a question for a
 * device — a headset, a podcast, and a step-out — and it is written down as
 * one in the decision record rather than assumed here.
 *
 * @returns the session as it is afterwards, or null with no native module.
 */
export async function releaseSession(): Promise<TrialResult | null> {
  try {
    return (await native?.release?.()) ?? null;
  } catch {
    return null;
  }
}

/**
 * What a lab trial asked for and what the session became.
 *
 * `asked` is echoed back by the native side rather than remembered here, so a
 * log line carries the request and the result together and neither can drift
 * from the other.
 */
export interface TrialResult extends RouteSnapshot {
  /** The thrown message, or null where iOS accepted the configuration. */
  error?: string | null;
  asked?: { category: string; mode: string; options: string[] };
}

/**
 * Writes the session exactly as asked and returns what it became.
 *
 * **For the audio lab only.** Nothing on any ordinary path may call this: the
 * app has two configurations and `session.ts` owns both. This exists so the
 * matrix can be swept from the phone without a rebuild per row.
 *
 * Returns null where there is no native module — a web build, or a Metro
 * reload against a binary that predates this function.
 */
export function configureSession(
  category: string,
  mode: string,
  options: string[],
  active: boolean
): TrialResult | null {
  try {
    return native?.configure?.(category, mode, options, active) ?? null;
  } catch {
    return null;
  }
}

/**
 * Starts and stops a real input tap, which is the other half of a trial.
 *
 * Apple's claim about `mixWithOthers` under `playAndRecord` is scoped to *while
 * your app has both audio input and output enabled*, so a trial that never
 * captures has not tested it.
 */
export function startInput(): TrialResult | null {
  try {
    return native?.startInput?.() ?? null;
  } catch {
    return null;
  }
}

export function stopInput(): TrialResult | null {
  try {
    return native?.stopInput?.() ?? null;
  } catch {
    return null;
  }
}

/** One line, short enough to read on a phone. */
export function routeLine(r: RouteSnapshot | null): string {
  if (!r) return 'route unreadable';
  const rate = Math.round(r.sampleRate);
  const out = r.outputs.join(',') || 'none';
  const why = r.reason ? ` why=${r.reason}` : '';
  return `${out} sr=${rate} ${r.category}/${r.mode}${why}`;
}
