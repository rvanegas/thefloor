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
  category: string;
  mode: string;
  /** Only on a change event: iOS's own reason code. */
  reason?: string;
}

interface NativeAudioRoute {
  snapshot(): RouteSnapshot;
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
