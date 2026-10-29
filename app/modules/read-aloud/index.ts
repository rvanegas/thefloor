import { Platform } from 'react-native';

/**
 * The phone's own voices — which are installed, and speaking with one.
 *
 * See `ios/ReadAloudModule.swift` for why this is local rather than
 * `expo-speech`. **Everything here degrades to nothing rather than throwing**,
 * as `audio-route` does and for its reason: it is absent under jest, in a
 * browser, and in any build the autolinking missed, and none of those may
 * take a call down for want of a voice.
 */
export type VoiceQuality = 'default' | 'enhanced' | 'premium';

export interface Voice {
  identifier: string;
  /** What Settings calls it, e.g. `Ava`. */
  name: string;
  /** A BCP 47 tag, e.g. `en-US`. */
  language: string;
  quality: VoiceQuality;
}

export interface DetectedLanguage {
  /** A BCP 47 tag as NaturalLanguage spells it — `en`, `es`, `zh-Hans`. */
  language: string;
  /** 0..1. */
  confidence: number;
}

interface NativeReadAloud {
  voices(language: string): Voice[];
  language(text: string): DetectedLanguage | null;
  speak(
    text: string,
    voice: string | null,
    language: string,
    reply: string
  ): Promise<boolean>;
  stop(): Promise<boolean>;
  hook(): string;
  addListener(
    event: 'onReport',
    listener: (payload: { line: string }) => void
  ): { remove(): void };
  addListener(
    event: 'onReading',
    listener: (payload: { id: string }) => void
  ): { remove(): void };
}

function load(): NativeReadAloud | null {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireNativeModule } = require('expo-modules-core');
    return requireNativeModule('ReadAloud') as NativeReadAloud;
  } catch {
    return null;
  }
}

const native = load();

/**
 * The installed voices for a language subtag, or null where there is no
 * module to ask — which is not the same answer as none installed, and Floor
 * Settings draws nothing for it rather than telling somebody to download what
 * this build could not use.
 */
export function installedVoices(language: string): Voice[] | null {
  if (!native) return null;
  try {
    return native.voices(language);
  } catch {
    return null;
  }
}

/** The language a text is written in, or null where nothing can say. */
export function detectLanguage(text: string): DetectedLanguage | null {
  if (!native) return null;
  try {
    return native.language(text);
  } catch {
    return null;
  }
}

/** `reply` is the paste's id, which `onReading` hands back while it is heard. */
export function speak(
  text: string,
  voice: string | null,
  language: string,
  reply: string
): void {
  void native?.speak(text, voice, language, reply).catch(() => undefined);
}

/**
 * The id of the reply being heard, or null once everything queued has been —
 * the whole of what draws *Restart* and *Stop*. Called on each change, never
 * on subscribing. Returns its unsubscribe.
 */
export function onReading(listener: (reply: string | null) => void): () => void {
  try {
    const sub = native?.addListener('onReading', ({ id }) => listener(id || null));
    return () => sub?.remove();
  } catch {
    return () => {};
  }
}

export function stopSpeaking(): void {
  void native?.stop().catch(() => undefined);
}

/**
 * What the native half found when it hooked the call's audio engine —
 * `installed`, or which selector this LiveKit lacks — and null where there is
 * no module. See `ios/CallEngine.swift`.
 */
export function engineHook(): string | null {
  if (!native) return null;
  try {
    return native.hook();
  } catch {
    return null;
  }
}

/**
 * Each line the native half reports as it renders and plays — every one
 * beginning `read-aloud` — for the diagnostics log. Returns its unsubscribe.
 */
export function onReadAloudReport(listener: (line: string) => void): () => void {
  try {
    const sub = native?.addListener('onReport', ({ line }) => listener(line));
    return () => sub?.remove();
  } catch {
    return () => {};
  }
}
