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

interface NativeReadAloud {
  voices(language: string): Voice[];
  speak(text: string, voice: string | null, language: string): Promise<boolean>;
  stop(): Promise<boolean>;
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

export function speak(text: string, voice: string | null, language: string): void {
  void native?.speak(text, voice, language).catch(() => undefined);
}

export function stopSpeaking(): void {
  void native?.stop().catch(() => undefined);
}
