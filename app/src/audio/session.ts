import { AndroidAudioTypePresets } from '@livekit/react-native';
import type {
  AndroidAudioTypeOptions,
  AppleAudioConfiguration,
  IOSAudioSessionPolicy,
} from '@livekit/react-native';

/**
 * The two states the iOS audio session is ever in, and the single place they
 * are written down.
 *
 * **There were three until 2026-08-27, and the third had been unreachable
 * since build 90.** `LISTENING` was `IDLE` without `mixWithOthers`, so that
 * shared playback interrupted another app's audio instead of mixing with it;
 * `EXCLUSIVE_WHEN_AUDIBLE` was set false on suspicion of it racing the
 * engine's own start, and it never returned from `sessionFor` again. Deleting
 * it removes no behaviour from either of the rules below — it is why both of
 * them reduce to a single boolean, and therefore why the choice between them
 * could become a setting rather than a branch.
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
 * What the session asks of the system when this app has no audio at all:
 * connected to a channel, alone, nothing running — or watching a party whose
 * film is playing out of somebody else's player.
 *
 * `playback` rather than `playAndRecord` is the whole point: taking the session
 * as a call drags a Bluetooth speaker from A2DP down to HFP — mono, roughly
 * 16 kHz — and makes every other app's audio unusable for as long as you are in
 * the channel.
 *
 * **`mixWithOthers` is here and not in `CALL`**, and since 2026-08-27 that is
 * the entire remaining purpose of this configuration: the only claimant on the
 * audio system worth handing it back to is **another app**. Being in an empty
 * channel should cost the speakers nothing — `core/micNeeded.ts` makes the
 * same argument about the microphone, and this is that argument applied to the
 * other end of the session.
 */
export const IDLE: AppleAudioConfiguration = {
  audioCategory: 'playback',
  audioCategoryOptions: ['mixWithOthers'],
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
 * over the earpiece. A2DP is not lost, it is scoped: `IDLE` is `playback`,
 * where a Bluetooth device is an eligible output with no option needed at all,
 * so the stereo route is exactly as available as before whenever this app has
 * no audio of its own. **The audible mono/stereo transition is unchanged by
 * this option**, because it was never about it — it is about the category.
 * What did move the transition is the 2026-08-27 rule: it now fires when the
 * room stops being empty rather than when somebody's microphone opens, so it
 * says *there is somebody here* rather than *somebody could be heard*.
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
 * Which of the two the session should be in.
 *
 * A function with a test rather than a condition inline, on the same reasoning
 * as `microphoneNeeded`: this is the rule that decides whether somebody else's
 * music stops, and it is short enough to look obviously right while being
 * wrong in either direction. It is one boolean now — see `channelHasAudio` in
 * core/micNeeded.ts, and `App.tsx`, which is the only place it is called.
 *
 * @param hasAudio whether the session should be a call, computed by
 *                 `channelHasAudio` in core/micNeeded.ts — does this app have
 *                 any audio at all. There were two rules and a setting picking
 *                 between them until 2026-09-05; that header says why there is
 *                 one now. This module deliberately does not know how the
 *                 boolean was reached; it is handed one, and the argument
 *                 about it lives where it is computed.
 */
export function sessionFor(hasAudio: boolean): AppleAudioConfiguration {
  return hasAudio ? CALL : IDLE;
}

/**
 * The same answer, shaped for the native observer.
 *
 * **The observer is a second writer of this session and it cannot be argued
 * with, only agreed with.** It runs on the audio worker thread at the engine
 * transition itself, with no JavaScript in the path, so a re-statement from
 * here always lands *after* it. Handing it the value `sessionFor` would return
 * is what makes the two writers say the same thing, which is the invariant
 * `__tests__/session.test.ts` pins.
 *
 * **`recording: CALL` is unconditional, and as of 2026-09-05 that is safe by
 * construction.** It rests on *the observer reads it only while this device is
 * capturing, and our capturing implies the session is a call*. That
 * implication used to be falsifiable: under the old default rule
 * `anyMicrophoneOpen` excluded the self-muted while `intentFor` returned
 * `muted` and held the device open, so the engine could be recording under a
 * session that was not a call. That is STATES.md disagreement 11 and the
 * leading suspect in "The Foreground Interruption".
 *
 * **It closes with the rule change.** The engine can only be recording where
 * `microphoneNeeded` was true, which means somebody else is in the room or a
 * recording is running, and `channelHasAudio` returns true for both. The hold
 * added the same day closes the other direction: where it keeps the device open
 * it pins `hasAudio` alongside, so the session is a call for exactly as long as
 * the device is held. There is no longer a state in which this device records
 * under `playback`.
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
export function policyFor(hasAudio: boolean): IOSAudioSessionPolicy {
  return { recording: CALL, playout: sessionFor(hasAudio) };
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
  if (config === IDLE) return 'IDLE';
  return 'unknown';
}

/* -------------------------------------------------------------------------
 * The same two states, said in Android's vocabulary.
 *
 * **Two states, not two state machines.** Everything above is about what
 * `IDLE` and `CALL` *mean*; the constants below are the same two meanings
 * spelled for a different platform, and they are chosen by the same
 * `hasAudio` boolean from the same rule in core/micNeeded.ts. If a third state
 * is ever wanted, it is wanted on both sides — adding one here alone is how
 * the two ends start disagreeing about what a call is, which is the thing
 * `core/` exists to prevent.
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
 * What Android is asked for when this app has no audio of its own.
 *
 * `AndroidAudioTypePresets.media` — `audioMode: 'normal'`, stream `music`,
 * usage `media`. The counterpart of `IDLE`'s `playback` category, and it earns
 * the name for the same reason: an empty channel should cost the speakers
 * nothing.
 *
 * **There is no `mixWithOthers` here, and its absence is not a gap.** Mixing on
 * iOS is a category option; on Android it is the audio-*focus* request, which
 * `manageAudioFocus: true` in both presets hands to the SDK. What decides
 * whether another app keeps playing is `audioFocusMode`, `gain` in both — so
 * the mixing behaviour this app relies on is not expressible as one flag here
 * and has not been verified. See planning/ANDROID.md: it is one of the things
 * an emulator cannot answer.
 */
export const ANDROID_IDLE: AndroidAudioTypeOptions =
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
 * which is `IDLE` being unavailable rather than `CALL` being wrong. An empty
 * channel held the phone in voice-call mode, on the voice stream, with
 * everything that costs another app's playback. That is the same argument
 * `IDLE` exists for on iOS, arrived at from the other end.
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
 * Which of the two Android should be in, from the same boolean as `sessionFor`.
 *
 * Deliberately a second function rather than a platform branch inside
 * `sessionFor`: the return types have nothing in common, and a single function
 * returning either would push a discriminated union into every caller to say
 * something the caller already knows from `Platform.OS`. The thing that must
 * not fork is the *question*, and it has not — both take `hasAudio`.
 */
export function androidSessionFor(hasAudio: boolean): AndroidAudioTypeOptions {
  return hasAudio ? ANDROID_CALL : ANDROID_IDLE;
}

/** Which of the two this is, for a log line. See `nameOf`. */
export function androidNameOf(config: AndroidAudioTypeOptions): string {
  if (config === ANDROID_CALL) return 'CALL';
  if (config === ANDROID_IDLE) return 'IDLE';
  return 'unknown';
}
