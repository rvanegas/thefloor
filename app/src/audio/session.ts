import type {
  AppleAudioConfiguration,
  IOSAudioSessionPolicy,
} from '@livekit/react-native';

/**
 * The two states the iOS audio session is ever in, and the single place they
 * are written down.
 *
 * **There were three until 2026-08-27.** `LISTENING` was `IDLE` without
 * `mixWithOthers`, so that shared playback interrupted another app's audio
 * instead of mixing with it, and it was switched off in build 90 on suspicion
 * of racing the engine's own start. It is gone rather than switched off,
 * because the rule it belonged to is gone: anything this app has audio for is
 * now `CALL`, which is exclusive already. The feature it existed for arrives
 * as a consequence instead of as a third configuration.
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
 * wrong in either direction. It is one boolean now, and the boolean is the
 * whole design — see `channelHasAudio` in core/micNeeded.ts, which computes it.
 *
 * @param hasAudio whether **this app** has any audio at all: somebody else in
 *                 the room, a recording running, or shared playback loaded.
 *                 Not whether anybody is capturing, and not whether anything
 *                 is currently coming out of the speaker. The question is
 *                 which app should own the audio system, and the only claimant
 *                 worth handing it back to is another app.
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
 * **`recording: CALL` is unconditional, and as of 2026-08-27 that is true by
 * construction rather than by argument.** It used to rest on *the observer
 * reads it only while this device is capturing, and our capturing implies
 * `anyMicOpen`* — an implication self-mute falsified, since `intentFor`
 * returns `muted` and holds the device open while `anyMicrophoneOpen` excluded
 * the self-muted. That was STATES.md disagreement 11 and the leading suspect
 * in "The Foreground Interruption". The engine can only be recording when
 * `microphoneNeeded` was true, which means somebody else is in the room or a
 * recording is running, and `channelHasAudio` returns true for both. There is
 * no input left on which the observer would apply `CALL` over an `IDLE` we
 * asked for.
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
