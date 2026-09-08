import { AndroidAudioTypePresets } from '@livekit/react-native';
import type {
  AndroidAudioTypeOptions,
  AppleAudioConfiguration,
  IOSAudioSessionPolicy,
} from '@livekit/react-native';

/**
 * The states the iOS audio session is ever in, and the single place they are
 * written down.
 *
 * **Three, and the third is nothing at all.** Since 2026-09-08: `CALL` while
 * stepped in, `LISTENING` for a guest with no speech grant, and **deactivated**
 * for a phone that is nearby, stepped out, or not in a room. You hold a session
 * if and only if you are stepped in; there is no case where this app holds one
 * it is not using.
 *
 * **`LISTENING` is a restoration, and it returns for the reason it was
 * removed.** It was `IDLE` without `mixWithOthers` and went at build 90 for
 * interrupting other apps — which is now the intent rather than the defect. A
 * guest's session should resemble a member's in every respect except
 * permission to speak, and letting somebody's podcast play over the voices a
 * guest is listening to would single out the one person who cannot do anything
 * about it.
 *
 * **`IDLE` left with it, and with it the last use of `mixWithOthers`
 * anywhere.** Nothing mixes: a phone has either claimed the audio system or
 * given it back. `IDLE` made sense while a quiet phone was still *connected* —
 * you hold a playback session because a voice could arrive at any moment — and
 * a nearby phone has no media subscription, so nothing can arrive. The session
 * would assert a readiness for audio that cannot happen, and would not even
 * buy process lifetime, an active session with nothing flowing being exactly
 * what iOS suspends. `WAITING` — `CALL` *with* `mixWithOthers` — was the other
 * casualty, and went on 2026-09-06. A reader who finds "the third state" in an
 * older document should check which one it means.
 *
 * Three different writers can configure this session: this app, the SDK's
 * native policy observer on every audio-engine transition, and WebRTC itself
 * when it re-applies its own defaults. They all mutate the *same* process-wide
 * `RTCAudioSessionConfiguration.webRTCConfiguration`, so whoever wrote last
 * wins — which is survivable only if they all write the same thing. That is
 * what this module is for: `useSessionAudio` applies them at each edge, and
 * `policyFor` hands the native observer the same answer for the transition it
 * is about to see.
 *
 * **The observer used to be handed a constant, and that was a knowing break of
 * the rule above.** It took `IDLE` as its playout value — the *mixing* one —
 * on the argument that a write we did not ask for could then only ever let
 * another app back in and never take one away. The argument was about
 * `mixWithOthers` alone, and `IDLE` and `CALL` also differ in **category**,
 * which is the Bluetooth route boundary. So a self-mute with somebody else
 * still talking took the engine to playout-only, the observer applied `IDLE`,
 * and the route moved under a rule that exists to hold it still — the tone
 * reported 2026-08-19. `policyFor` closes it by making the observer's playout
 * value the one `sessionFor` would return, so there is nothing left to be
 * licensed. See planning/STATES.md, disagreement 5.
 */

/**
 * What the session asks of the system for somebody who is in the room and
 * cannot speak in it: a **guest with no speech grant.**
 *
 * `playback` rather than `playAndRecord`, because there is no microphone to
 * open — a guest's LiveKit token is minted unable to publish, and opening a
 * device microphone that nothing is allowed to carry would buy the whole call
 * profile handover to publish nothing.
 *
 * **Exclusive, and that is the half worth reading twice.** There is no
 * `mixWithOthers` here. This configuration existed once and was deleted at
 * build 90 *for* interrupting other apps; it is back because interrupting them
 * is the intent now. See the header at the top of this file.
 *
 * **One consequence, audible.** A guest granted permission to speak crosses
 * from here to `CALL`, which on a Bluetooth headset is an A2DP to hands-free
 * handover — stereo to mono, at the moment they are told they may talk.
 * Nothing is wrong with it and nobody will expect it. A listening guest is on
 * a *better* route than a member, which is a consequence of not needing a
 * microphone rather than a decision.
 */
export const LISTENING: AppleAudioConfiguration = {
  audioCategory: 'playback',
  audioCategoryOptions: [],
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
 * This carried `mixWithOthers` until the audio-activity work, and it did not
 * leave because of the echo: the postmortem is explicit that the option is not
 * the culprit, and the echo was observed stopping under a configuration that
 * had it. It left because a call is audio activity by definition, and the
 * point of the change is that audio activity is exclusive. Nothing about the
 * echo canceller, the Bluetooth eligibility list or the route depends on it.
 *
 * **`defaultToSpeaker` is what puts a call on the loudspeaker rather than the
 * earpiece**, which is the whole of what it means: with `playAndRecord` the
 * default output is `builtInReceiver`, the small speaker you hold to your ear,
 * and this makes it `builtInSpeaker` *when no other route is connected*. It
 * does not override headphones. Apple's own wording, and the intent here.
 *
 * It was in build 18, came out in 19 because a tester's Bluetooth headphones
 * lost the route, and is back because that was the wrong conclusion. The
 * option was not overriding the headphones: **they were not an eligible output
 * at all.** In `playAndRecord` a Bluetooth device is only available as an
 * output if the options say so, and that build listed `allowBluetooth` (which
 * is the mono hands-free profile) and nothing else. With no eligible route,
 * "no other route is connected" was true, and the speaker won correctly from a
 * rule doing exactly what it says.
 *
 * So the eligibility list is the fix, and it is the SDK's own: HFP for a
 * device with a microphone, AirPlay for everything else. Getting this wrong is
 * silent — it does not fail, it just quietly stops offering somebody their
 * headphones.
 *
 * **`allowBluetoothA2DP` is deliberately absent, and this is the one option
 * whose absence is the point.** A2DP is output-only, so listing it here makes
 * a device that cannot capture — a Bluetooth speaker with no microphone —
 * an eligible *output* under `playAndRecord`. iOS then does exactly as asked:
 * it keeps the remote voice on that speaker and takes the input from the
 * built-in microphone instead, silently, with no failure anywhere. Reported
 * 2026-08-21: a second participant arrived and was audible on a mic-less
 * Bluetooth speaker. That is not merely the wrong route — it is a loudspeaker
 * playing the far end into an open microphone in the same room, which is the
 * echo path the whole of POSTMORTEM-echo.md is about, arrived at from a
 * different direction.
 *
 * Dropping it means a capturing session offers only routes that can *do* both
 * halves: an HFP headset via `allowBluetooth`, AirPlay, or — when neither is
 * there — the built-in speaker and microphone, which `defaultToSpeaker` picks
 * over the earpiece. A2DP is not lost, it is scoped: **being nearby is how you
 * keep stereo**, because being nearby claims nothing at all and this
 * configuration is never applied.
 *
 * **The A2DP split was measured to work and is declined rather than
 * unavailable.** Row 8 of the 2026-09-08 lab run kept a headset in A2DP stereo
 * at 48 kHz by taking the input from the phone, with another app playing
 * normally. It is not taken because it costs the echo canceller, and because
 * it is unsafe with a mic-less Bluetooth speaker — the case this option's
 * absence was written for. What that reading does hand over is a question
 * nobody has answered: whether to condition the *mode* on the output route,
 * `default` while output is A2DP headphones and `videoChat` when it is a
 * loudspeaker. Headphones in somebody's ears are not loudspeakers. Not
 * decided, and not measured either — it needs a far end and a second person.
 *
 * **The audible mono/stereo transition now fires at step-in**, which is the
 * 2026-09-08 change: it says *I am in this room* rather than *there is
 * somebody here*.
 *
 * **This is the option build 19 removed, and it is being removed again for a
 * different reason and with a different expectation.** Build 19 dropped it and
 * a tester's headphones fell back to the phone speaker, which was read as
 * A2DP eligibility being required for headphones to be offered at all. That
 * reading is doubtful — `allowBluetooth` makes an HFP-capable headset eligible
 * for both directions, so AirPods should survive this — and it may be that the
 * device in that session could not do HFP. **It is the thing to check first if
 * headphones misbehave after this**, and it is why `app/modules/audio-route`
 * was kept when the engine panel was deleted: it is the only thing in this
 * stack that can read a route back. **Checked, and it held**: AirPods keep
 * the route and go mono while capturing, on build 72. See DECISIONS.md § *No
 * output that cannot also capture*.
 */
export const CALL: AppleAudioConfiguration = {
  audioCategory: 'playAndRecord',
  audioCategoryOptions: ['allowBluetooth', 'allowAirPlay', 'defaultToSpeaker'],
  audioMode: 'videoChat',
};

/**
 * Which of the **two configurations this app applies** is wanted.
 *
 * - `call` — stepped in, with a microphone to open: a member, or a guest who
 *   may speak.
 * - `listen` — in the room and unable to publish, which is a guest with no
 *   speech grant.
 *
 * **The third state has no value here, because it is not a configuration.**
 * Nearby, stepped out and not in a room are one audio state and it is *none*:
 * the session is deactivated, which is a thing that happens rather than a
 * category that is written. See `policyFor`.
 *
 * **The two remaining values are still worth having, for one reason:** a
 * backgrounded app is granted playback and refused a *new* microphone, so
 * `useSessionAudio` withholds a promotion until the foreground and asks for
 * `listen` meanwhile. Without that this type would collapse — recording
 * enabled is `CALL` and playout-only is `LISTENING`, and the native observer
 * distinguishes them on the audio worker thread without being told.
 *
 * **`idle` was the second value until 2026-09-08** and meant *this app should
 * not have the audio system*. Nothing means that any more while a connection
 * exists: the state it described is now a phone with no connection at all.
 */
export type SessionWant = 'call' | 'listen';

/**
 * Which configuration that is.
 *
 * A function with a test rather than a condition inline, on the same reasoning
 * as `microphoneNeeded`: this is the rule that decides whether somebody else's
 * music stops, and it is short enough to look obviously right while being
 * wrong in either direction.
 *
 * @param want which case this is. `App.tsx` and `useSessionAudio` between them
 *             decide it — `microphoneNeeded` in core/micNeeded.ts answers *may
 *             this person publish*, and the foreground answers *may we take a
 *             microphone now*. This module deliberately does not know how the
 *             answer was reached; it is handed one, and the arguments live
 *             where they are computed.
 */
export function sessionFor(want: SessionWant): AppleAudioConfiguration {
  return want === 'call' ? CALL : LISTENING;
}

/**
 * The whole of what the native observer is told, which since 2026-09-08 is a
 * **constant**.
 *
 * **The observer's three engine states are this design's three audio states**,
 * which is why the whole of it fits the SDK rather than fighting it:
 *
 * | engine | field | state |
 * | --- | --- | --- |
 * | recording enabled | `recording` | **CALL** — stepped in |
 * | playout only | `playout` | **LISTENING** — guest without a speech grant |
 * | neither | `deactivateOnStop` | **deactivated** — nearby, or not in a room |
 *
 * So there is no slot left that wants a mixing configuration, and nothing for
 * this function to be a function *of*: recording enabled is a call, playout
 * only is a listener, and the observer distinguishes them on the audio worker
 * thread without being told which case it is in. It stays a function so that
 * every call site reads as it did, and so that a fourth state would have
 * somewhere to arrive.
 *
 * **The observer is a second writer of this session and it cannot be argued
 * with, only agreed with.** It runs on the audio worker thread at the engine
 * transition itself, with no JavaScript in the path, so a re-statement from
 * here always lands *after* it. Handing it the same answers this app applies is
 * what makes the two writers say the same thing, which is the invariant
 * `__tests__/session.test.ts` pins.
 *
 * **`recording: CALL` is unconditional and is now trivially safe.** It rests
 * on *the observer reads it only while this device is capturing, and our
 * capturing implies the session is a call*, and capturing now implies being
 * stepped in, which is the whole of what a call is. The falsifiable version of
 * this — STATES.md disagreement 11 — needed a rule under which the engine could
 * record beneath a `playback` session, and there is no longer one to write.
 *
 * **`deactivateOnStop` is stated rather than left to the default, and that is
 * deliberate.** The wrapper defaults it to `true`; the native setter it wraps
 * reads a missing key as *false*. Saying it here means the release cannot
 * depend on which of the two a future call site reaches for — and this release
 * is the whole mechanism by which nearby holds no session, so it is not a
 * default worth inheriting silently.
 *
 * **The release happens natively, at the engine transition**, on the audio
 * worker thread with no JavaScript in the path. Nothing has to be armed with
 * something harmless first, because the harmless thing *is* deactivation and it
 * is what the observer does.
 *
 * **Push it before the transition, never after.** The observer reads whatever
 * is stored when the engine moves, so a policy pushed after
 * `setMicrophoneEnabled` describes a transition that has already happened.
 * Pushing is safe to do first in both directions because it is not a write to
 * the session at all — natively it is one atomic property assignment, applied
 * only when the engine next moves.
 *
 * **Push it with `setupIOSAudioManagement` rather than the native setter it
 * wraps.** `AudioDeviceModule.setAutomaticAudioSessionConfiguration` takes
 * `deactivateOnStop` and reads a missing key as *false*, where the SDK wrapper
 * defaults it to true — so calling native directly and omitting it leaves the
 * session active after the last engine stop, silently. Re-pushing mid-call is
 * supported: activation is decided against `RTCAudioSession`'s own state, and
 * the SDK's caution about switching mid-call is about switching *paths*
 * (the deprecated JS callback against this native one), not about a policy.
 */
export function policyFor(): IOSAudioSessionPolicy {
  return { recording: CALL, playout: LISTENING, deactivateOnStop: true };
}

/**
 * Which of the two this is, for a log line.
 *
 * Identity comparison, which holds because every configuration this app applies
 * comes from `sessionFor` and is therefore one of the constants themselves —
 * the same property the hook's `appliedRef` already relies on.
 */
export function nameOf(config: AppleAudioConfiguration): string {
  if (config === CALL) return 'CALL';
  if (config === LISTENING) return 'LISTENING';
  return 'unknown';
}

/* -------------------------------------------------------------------------
 * The same states, said in Android's vocabulary.
 *
 * **The same states, not a second state machine.** Everything above is about
 * what `LISTENING` and `CALL` *mean*; the constants below are those meanings
 * spelled for a different platform, and they are chosen by the same rule in
 * core/micNeeded.ts. A state wanted on one side is wanted on both — adding one
 * here alone is how the two ends start disagreeing about what a call is, which
 * is the thing `core/` exists to prevent.
 *
 * **The third state is where the two platforms genuinely differ, and it is the
 * only Android work the 2026-09-08 redesign called for.** iOS releases the
 * session natively through `deactivateOnStop`; Android has no such observer,
 * so nothing gives the focus back on this app's behalf and the release has to
 * be said out loud. `releaseAndroidAudio` in `useSessionAudio` is that
 * sentence.
 *
 * The shapes are not analogous and it is worth knowing why before looking for
 * a category here. iOS has one process-wide session that three writers mutate
 * and last-writer-wins, which is what the whole of the file above is coping
 * with. Android has no such object: `AndroidAudioTypeOptions` is a bundle of
 * `AudioManager` mode, audio-focus request, stream type and `AudioAttributes`,
 * applied when the session starts, and there is **no native policy observer
 * re-applying anything behind us**. So there is no `policyFor` counterpart and
 * no second writer to keep in agreement — which is the one respect in which
 * Android is the simpler platform here, and the reason `pushPolicy` in
 * `useSessionAudio` stays iOS-only rather than growing a branch.
 * ------------------------------------------------------------------------- */

/**
 * What Android is asked for by somebody in the room who cannot publish — a
 * guest with no speech grant. The counterpart of `LISTENING`.
 *
 * `AndroidAudioTypePresets.media` — `audioMode: 'normal'`, stream `music`,
 * usage `media`, and `audioFocusMode: 'gain'`.
 *
 * **It was `ANDROID_IDLE` until 2026-09-08, and the rename is the change.** It
 * was only ever called idle because iOS's `IDLE` mixed; this preset never did.
 * Both presets request `gain` focus, which stops other apps — so **the mixing
 * this platform never verified is mixing it never did**, and the note that
 * used to stand here calling that an unverified risk describes nothing now.
 * Nothing in this app mixes any more, so there is no behaviour left for it to
 * be wrong about. See planning/ANDROID.md.
 */
export const ANDROID_LISTENING: AndroidAudioTypeOptions =
  AndroidAudioTypePresets.media;

/**
 * What Android is asked for when somebody could be heard.
 *
 * `AndroidAudioTypePresets.communication` — `audioMode: 'inCommunication'`,
 * stream `voiceCall`, usage `voiceCommunication`, content `speech`.
 *
 * **`inCommunication` is this platform's `videoChat`.** On iOS the system
 * voice-processing unit — the echo canceller — is switched on solely by
 * `voiceChat`/`videoChat` mode, and a capturing session left in a non-voice
 * mode is the build 17 echo, written up in planning/POSTMORTEM-echo.md.
 * Android's hardware AEC and noise suppression hang off
 * `MODE_IN_COMMUNICATION` in the same way.
 *
 * **What this fixed was not a missing echo canceller, and the first guess that
 * it was is worth recording because it is the natural one.** Before this
 * existed, `applyFor` returned early off iOS and Android was configured with
 * nothing — but *nothing* does not mean `MODE_NORMAL`. The SDK's own default
 * is `MODE_IN_COMMUNICATION` (`AudioSwitchManager.java`, `audioMode`), so an
 * unconfigured Android build was already capturing under the right mode.
 *
 * What it did not have was the *transition*. It sat in communication mode for
 * the whole time it was connected, whether or not this app had any audio —
 * which was the quiet configuration being unavailable rather than `CALL` being
 * wrong. Since 2026-09-08 a member stepped in is in this one throughout, which
 * is the design rather than a regression: stepping in is the claim, and the
 * transition that matters is now the one at the edge of the room.
 */
export const ANDROID_CALL: AndroidAudioTypeOptions =
  AndroidAudioTypePresets.communication;

/**
 * The order Android should pick an output in when nobody has chosen one.
 *
 * The nearest thing to `CALL`'s category options, and only the nearest: on iOS
 * the options say which routes are *eligible* and the system picks; here the
 * list says which to *prefer* and eligibility is not ours to state. Bluetooth
 * first, then a wired headset, then the loudspeaker, then the earpiece — which
 * is the SDK's own default order, written down rather than inherited so that
 * `defaultToSpeaker`'s Android counterpart is somewhere a reader can find it.
 *
 * **Speaker before earpiece is the deliberate half**, and it is the same
 * decision `defaultToSpeaker` makes on iOS: a channel this app is in should be
 * audible to somebody who has put the phone down, not held to the ear like a
 * telephone call.
 *
 * The A2DP trap that `CALL` is written around does not arise in this form —
 * `'bluetooth'` here is a preference among what the platform already considers
 * usable, not a claim that an output-only device can capture. Whether Android
 * makes the same mistake by another route is unverified; a mic-less Bluetooth
 * speaker is on the list in planning/ANDROID.md of what needs real hardware.
 */
export const ANDROID_OUTPUTS = [
  'bluetooth',
  'headset',
  'speaker',
  'earpiece',
] as const;

/**
 * Which of the two Android should be in, from the same value as `sessionFor`.
 *
 * Deliberately a second function rather than a platform branch inside
 * `sessionFor`: the return types have nothing in common, and a single function
 * returning either would push a discriminated union into every caller to say
 * something the caller already knows from `Platform.OS`. The thing that must
 * not fork is the *question*, and it has not — both take a `SessionWant`.
 */
export function androidSessionFor(want: SessionWant): AndroidAudioTypeOptions {
  return want === 'call' ? ANDROID_CALL : ANDROID_LISTENING;
}

/**
 * What Android is asked for when this app claims nothing: nearby, stepped out,
 * or not in a room.
 *
 * **This is the platform's whole share of the 2026-09-08 redesign.** iOS gets
 * the release for free from `deactivateOnStop`; here nothing gives the audio
 * focus back on this app's behalf, so it is said. `manageAudioFocus: false`
 * with `audioMode: 'normal'` on the media stream is *stop holding anything* —
 * the one configuration in this file that is about giving something up.
 *
 * **Belt and braces, deliberately.** The first half of the release is that a
 * nearby phone has no media connection, so `startAudioSession` never runs and
 * nothing configures anything. That may already be enough. This is the second
 * half, for the path where something *was* configured earlier and the room has
 * since gone: being explicit costs one call and closes a state nobody can
 * observe from inside the app.
 */
export const ANDROID_RELEASED: AndroidAudioTypeOptions = {
  ...AndroidAudioTypePresets.media,
  manageAudioFocus: false,
  audioMode: 'normal',
};

/** Which of the three this is, for a log line. See `nameOf`. */
export function androidNameOf(config: AndroidAudioTypeOptions): string {
  if (config === ANDROID_CALL) return 'CALL';
  if (config === ANDROID_LISTENING) return 'LISTENING';
  if (config === ANDROID_RELEASED) return 'released';
  return 'unknown';
}
