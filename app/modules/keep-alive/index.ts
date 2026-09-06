import { Platform } from 'react-native';

/**
 * The iOS half of staying alive while nothing is happening.
 *
 * `modules/call-service` is the Android half, and its header used to end the
 * comparison at "iOS declares `UIBackgroundModes: ["audio"]` and the system
 * does the rest". That was measured on 2026-09-05 and is false: a phone locked
 * for five minutes while standing alone in an empty channel came back
 * `drops 2 (recovered 0, expired 2)` from `bin/health`. The entitlement keeps a
 * process alive while it is *producing audio*, and an empty channel produces
 * none — so iOS suspends it, the websocket dies, and the person's presence
 * expires a minute later while they are still standing there.
 *
 * The two platforms therefore need the same thing for opposite reasons.
 * Android wants a visible component so it may keep a process that is
 * capturing; iOS wants audio so it may keep a process that has an entitlement.
 * Neither is a trick; both are the system's stated bargain, taken.
 *
 * See `ios/KeepAliveModule.swift` for what it plays and why the volume is left
 * alone. **Everything here is a no-op answering `false` off iOS**, on the same
 * reasoning as the other two local modules: it is absent under jest, absent on
 * Android and the web, and absent in any build where autolinking did not pick
 * it up. None of those can lose anybody their presence in a way this would have
 * prevented — they either have no such entitlement or no such suspension.
 */

interface NativeKeepAlive {
  startSilence(): Promise<boolean>;
  stopSilence(): Promise<boolean>;
}

function load(): NativeKeepAlive | null {
  if (Platform.OS !== 'ios') return null;
  try {
    // Required lazily and defensively, exactly as the other two are: a local
    // module that failed to link throws at *import* time, which would take the
    // whole audio hook with it rather than merely losing the keep-alive.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireNativeModule } = require('expo-modules-core');
    return requireNativeModule('KeepAlive') as NativeKeepAlive;
  } catch {
    return null;
  }
}

const native = load();

/**
 * Starts the silent loop, so this process is not suspended while it waits.
 *
 * **Only call this while waiting — the session `IDLE` — and only once this app
 * has actually written a category.**
 *
 * The silence itself is inaudible and mixes, so it costs another app's
 * playback nothing. Everything else about how it sounds belongs to the
 * category it plays under, not to it: under `IDLE` a Bluetooth headset stays
 * on A2DP.
 *
 * Started under `CALL` it would buy nothing, there being real audio keeping
 * the process alive already. **Started before any category is set it activates
 * the system default, `soloAmbient`, which does not mix and stops whatever
 * else the phone was playing** — build 146 shipped that and killed a podcast
 * on step-in. `useSessionAudio`'s `sessionConfigured` is the gate.
 *
 * **This is the only thing holding an `IDLE` wait up.** A session with nothing
 * flowing through it earns no background assertion at all and is suspended in
 * about a second — measured seven times. What buys background time is audio
 * actually flowing, which is this.
 *
 * The wait that keeps a *microphone* open needs none of it: capturing holds a
 * process up by itself, measured at 22m 30s on 2026-09-06. When that wait is
 * built, this is for the other branch only.
 *
 * Idempotent: starting a loop that is already playing changes nothing.
 *
 * @returns whether audio is playing as a result. False also covers Android,
 * the web and jest, where there is no module and nothing to start.
 */
export async function startSilence(): Promise<boolean> {
  try {
    return (await native?.startSilence()) ?? false;
  } catch {
    return false;
  }
}

/**
 * Stops the loop, letting the process be suspended again.
 *
 * @returns whether something was actually stopped.
 */
export async function stopSilence(): Promise<boolean> {
  try {
    return (await native?.stopSilence()) ?? false;
  } catch {
    return false;
  }
}
