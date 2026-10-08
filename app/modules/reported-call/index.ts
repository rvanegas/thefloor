import { Platform } from 'react-native';

/**
 * Being in a channel, reported to iOS as an outgoing call shown under the
 * channel's *title* — the *reported call* (GLOSSARY.md).
 *
 * See `ios/ReportedCallModule.swift` for what it does and does not buy. In
 * short: Recents, the green pill, and other calls meeting this one as a call;
 * no call screen, Channel View being that.
 *
 * **Everything here is a no-op that answers `false` or `null` off iOS**, on
 * `modules/call-service`'s reasoning: a local native module, absent under
 * jest, on Android, on the web, and in any build where autolinking missed it.
 * None of those may break a channel — a step-in that is not reported is still
 * a step-in, minus a line in Recents.
 */

interface NativeReportedCall {
  startCall(channelId: string): Promise<boolean>;
  endCall(): Promise<boolean>;
  setTitle(channelId: string, title: string): void;
  setMuted(channelId: string, muted: boolean): void;
  holdsSession(): boolean;
  takePendingChannel(): string | null;
}

function load(): NativeReportedCall | null {
  if (Platform.OS !== 'ios') return null;
  try {
    // Required lazily and defensively, as `call-service` is: a local module
    // that failed to link throws at import time, which would take the whole
    // audio hook with it.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireNativeModule } = require('expo-modules-core');
    return requireNativeModule('ReportedCall') as NativeReportedCall;
  } catch {
    return null;
  }
}

const native = load();

function listen<T>(name: string, handle: (event: T) => void): () => void {
  if (!native) return () => {};
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { EventEmitter } = require('expo-modules-core');
    const subscription = new EventEmitter(native as object).addListener(name, handle);
    return () => subscription.remove();
  } catch {
    return () => {};
  }
}

/** Reports the step-in into `channelId`. `false` when it was refused or there is no CallKit. */
export async function startReportedCall(channelId: string): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.startCall(channelId);
  } catch {
    return false;
  }
}

/**
 * What the call for `channelId` is shown as — the channel's *title*. Applied
 * to a call already up for that channel, kept for one about to start, and
 * ignored for any other.
 */
export function setReportedCallTitle(channelId: string, title: string): void {
  try {
    native?.setTitle(channelId, title);
  } catch {
    // A title that does not arrive leaves the call shown as The Floor.
  }
}

/**
 * The app's mute in `channelId` — Self-Mute, or no microphone, as the lock
 * screen card reads it — which CallKit's flag follows, for CarPlay and the
 * Watch. Sent again unchanged, it undoes a system tap the app refused.
 */
export function setReportedCallMuted(channelId: string, muted: boolean): void {
  try {
    native?.setMuted(channelId, muted);
  } catch {
    // CallKit's flag goes stale; nothing the app hears or sends changes.
  }
}

export function endReportedCall(): void {
  native?.endCall().catch(() => {});
}

/**
 * Whether CallKit holds the audio session right now — from its activation to
 * its deactivation, which trails the call's end by under a second. While it
 * does, the app's own release fails with `-12988` and CallKit's is the one
 * that counts.
 */
export function reportedCallHoldsSession(): boolean {
  try {
    return native?.holdsSession() ?? false;
  } catch {
    return false;
  }
}

/** The channel a Recents tap opened before anything was listening, once. */
export function takeRecentsChannel(): string | null {
  try {
    return native?.takePendingChannel() ?? null;
  } catch {
    return null;
  }
}

/** Each line the module logs, for `recordEvent`. */
export const addReportedCallLogListener = (handle: (line: string) => void) =>
  listen<{ line?: unknown }>('onLog', (event) => {
    if (typeof event?.line === 'string') handle(event.line);
  });

/**
 * A mute the system asked for and the app does not already have — CarPlay,
 * the Watch, Siri. What arrives is the state asked for, not a toggle, as the
 * card's Mute does.
 */
export const addReportedCallMuteListener = (handle: (muted: boolean) => void) =>
  listen<{ muted?: unknown }>('onMute', (event) => {
    if (typeof event?.muted === 'boolean') handle(event.muted);
  });

/** An End this app did not ask for — CarPlay, the Watch, End & Accept. */
export const addReportedCallEndListener = (handle: () => void) =>
  listen('onEnd', () => handle());

/** A Recents tap while the app is running. A cold launch is `takeRecentsChannel`. */
export const addRecentsChannelListener = (handle: (channelId: string) => void) =>
  listen<{ channelId?: unknown }>('onOpenChannel', (event) => {
    if (typeof event?.channelId === 'string' && event.channelId.length > 0) {
      handle(event.channelId);
    }
  });
