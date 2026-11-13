/**
 * The voices Claude's replies may be spoken in, and the languages they speak.
 *
 * **A curated few of AssemblyAI's**, from the starter list of their catalogue
 * as it stood on 2026-11-13 — the English and Spanish ones, those being the
 * two languages this app is used in. Every voice speaks all six of
 * AssemblyAI's languages, so one choice covers a channel whatever it speaks;
 * each sounds best in its own, which is why the picker says which that is.
 * See planning/task/read-claude-s-reply-aloud-with-assemblyai-s-speech-instead-of-the-phone-s.md.
 *
 * Here rather than on the server because the picker draws the same list the
 * server checks a choice against, and two lists are two answers.
 */

/** A language AssemblyAI's speech model speaks, by two-letter subtag. */
export type SpeechLanguage = 'en' | 'es' | 'de' | 'fr' | 'it' | 'pt';

export interface SpeechVoiceInfo {
  /** The AssemblyAI slug, sent as `voice_id`. */
  id: string;
  /** Its catalogue name. */
  name: string;
  /** The language it was recorded in, which it sounds best in. */
  language: SpeechLanguage;
}

export const SPEECH_VOICES: readonly SpeechVoiceInfo[] = [
  { id: 'aai-kyla', name: 'Kyla', language: 'en' },
  { id: 'aai-sara', name: 'Sara', language: 'en' },
  { id: 'aai-audrey', name: 'Audrey', language: 'en' },
  { id: 'aai-peter', name: 'Peter', language: 'en' },
  { id: 'aai-titus', name: 'Titus', language: 'en' },
  { id: 'aai-nancy', name: 'Nancy', language: 'en' },
  { id: 'aai-antonioluis', name: 'Antonio Luis', language: 'es' },
  { id: 'aai-constanza', name: 'Constanza', language: 'es' },
  { id: 'aai-malvina', name: 'Malvina', language: 'es' },
  { id: 'aai-oriol', name: 'Oriol', language: 'es' },
];

export function isSpeechVoice(value: unknown): value is string {
  return typeof value === 'string' && SPEECH_VOICES.some((voice) => voice.id === value);
}

/**
 * AssemblyAI's own defaults, pinned: **their docs say the defaults may
 * change**, and a channel that never chose should not start sounding like
 * somebody else on a day nobody here decided anything. The other four
 * languages fall to English's, which speaks them all.
 */
const DEFAULTS: Partial<Record<SpeechLanguage, string>> = {
  en: 'aai-kyla',
  es: 'aai-antonioluis',
};

/** The voice a reply in `language` is spoken in where the channel chose none. */
export function defaultSpeechVoice(language: SpeechLanguage): string {
  return DEFAULTS[language] ?? 'aai-kyla';
}

/**
 * AssemblyAI's name for a language — **the full English name, not the code**,
 * which their speech API takes where their transcription APIs take codes.
 */
export const SPEECH_LANGUAGE_NAMES: Record<SpeechLanguage, string> = {
  en: 'english',
  es: 'spanish',
  de: 'german',
  fr: 'french',
  it: 'italian',
  pt: 'portuguese',
};

/**
 * A language tag as anything here spells it — `es`, `es-MX`, `en_us`, which is
 * what AssemblyAI's language detection answers — as one AssemblyAI speaks, or
 * null where it speaks no such language.
 */
export function speechLanguageOf(tag: string | null | undefined): SpeechLanguage | null {
  const code = (tag ?? '').replace(/_/g, '-').split('-')[0].toLowerCase();
  return code in SPEECH_LANGUAGE_NAMES ? (code as SpeechLanguage) : null;
}
