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
  /** Whether another app is producing sound right now. */
  otherAudioPlaying?: boolean;
  /** Whether iOS thinks our secondary audio should be silenced for it. */
  secondaryAudioHint?: boolean;
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

/** Where the audio is going and coming from right now, or null if unreadable. */
export function routeSnapshot(): RouteSnapshot | null {
  try {
    return native?.snapshot() ?? null;
  } catch {
    return null;
  }
}

/**
 * Asks iOS to let haptics play while this app is capturing.
 *
 * **This is the only thing in this module that writes**, and it is here rather
 * than in the audio hook because `AVAudioSession` is what has to be told and
 * this is the only file that can reach it.
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

/** One line, short enough to read on a phone. */
export function routeLine(r: RouteSnapshot | null): string {
  if (!r) return 'route unreadable';
  const rate = Math.round(r.sampleRate);
  const out = r.outputs.join(',') || 'none';
  const why = r.reason ? ` why=${r.reason}` : '';
  return `${out} sr=${rate} ${r.category}/${r.mode}${why}`;
}
