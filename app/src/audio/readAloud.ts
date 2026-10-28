import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { CLAUDE_ID } from '../../../core/constants';
import type { LanguagePreference } from '../../../core/settings';
import type { ChannelState } from '../../../core/types';
import {
  detectLanguage,
  installedVoices,
  speak,
  stopSpeaking,
  type DetectedLanguage,
  type Voice,
  type VoiceQuality,
} from '../../modules/read-aloud';
import { deviceRegion } from '../api/region';
import { storage } from '../state/storage';

/**
 * Claude's replies, read aloud the moment they land, and nothing else.
 *
 * **The only thing this app speaks**, at Rodrigo's word, 2026-10-28: a paste
 * by `CLAUDE_ID`, on the phone of everybody present, as it arrives. Not
 * anybody else's paste, not the *Record*, not a reply that was already there
 * when you walked in. See
 * planning/decision/2026-10-28-claudes-reply-is-read-aloud-on-arrival.md.
 */

/**
 * A language subtag, in the phone's region when the phone speaks it — so a
 * Mexican phone reads Spanish in `es-MX` rather than in whichever Spanish
 * sorts first, and English in plain `en`.
 */
export function localeFor(
  language: string,
  phone: string | undefined = deviceRegion().locale
): string {
  const tag = (phone ?? '').replace(/_/g, '-');
  const phoneLanguage = tag.split('-')[0].toLowerCase();
  return phoneLanguage === language && tag.includes('-') ? tag : language;
}

/**
 * The app's language as a tag to speak in — the fallback, for a reply whose
 * own language cannot be told.
 *
 * *Automatic* resolves as `stringsFor` resolves it, Spanish or else English;
 * anything unrecognised reads as *Automatic*, `LanguageProvider`'s rule.
 */
export function speechLocale(
  preference: LanguagePreference,
  phone: string | undefined = deviceRegion().locale
): string {
  const phoneLanguage = (phone ?? '').replace(/_/g, '-').split('-')[0].toLowerCase();
  const language =
    preference === 'en' || preference === 'es'
      ? preference
      : phoneLanguage === 'es'
        ? 'es'
        : 'en';
  return localeFor(language, phone);
}

/**
 * How sure the recognizer has to be before a reply's own language wins over
 * the app's. Two sentences of prose come back far above it; a reply that is
 * mostly a name, a number or a link is what falls under.
 */
export const LANGUAGE_CONFIDENCE = 0.6;

/**
 * The tag a reply is read in: **the language it is written in**, which is the
 * conversation's, since Claude answers in that — and the app's only where the
 * text will not say. A Spanish reply on a phone set to English is read by a
 * Spanish voice.
 */
export function replyLocale(
  text: string,
  fallback: string,
  detect: (text: string) => DetectedLanguage | null = detectLanguage,
  phone: string | undefined = deviceRegion().locale
): string {
  const found = detect(text);
  if (!found || found.confidence < LANGUAGE_CONFIDENCE) return fallback;
  return localeFor(languageOf(found.language), phone);
}

const RANK: Record<VoiceQuality, number> = { default: 0, enhanced: 1, premium: 2 };

/**
 * The voice a reply will be read in: **the one chosen on Floor Settings**, while
 * it is still installed; otherwise the best quality installed, then the one in
 * the phone's own region, then by name so the answer is stable. Null when
 * nothing is installed for the language, which leaves the choice to iOS.
 *
 * **The choice is this app's because iOS's cannot be read.** The voice picked
 * under Settings › Accessibility is Speak Selection's, and nothing public
 * hands it to an app — `voiceWithLanguage:` promises only "enhanced quality if
 * available", and Rodrigo selected Allison and was given Aaron, which sorts
 * first.
 */
export function bestVoice(
  voices: readonly Voice[],
  locale: string,
  chosen: string | null = null
): Voice | null {
  const picked = chosen && voices.find((voice) => voice.identifier === chosen);
  if (picked) return picked;
  const exact = (voice: Voice) =>
    voice.language.toLowerCase() === locale.toLowerCase() ? 1 : 0;
  const sorted = [...voices].sort(
    (a, b) =>
      RANK[b.quality] - RANK[a.quality] ||
      exact(b) - exact(a) ||
      a.name.localeCompare(b.name)
  );
  return sorted[0] ?? null;
}

function languageOf(locale: string): string {
  return locale.replace(/_/g, '-').split('-')[0].toLowerCase();
}

/** The two languages Floor Settings reports on, the app's own first. */
export type SpokenLanguage = 'en' | 'es';

/**
 * Where each language's chosen voice is kept: **this phone's**, in its
 * keychain, since the voices are installed on the phone rather than on the
 * account — an identifier from one phone names nothing on another.
 */
const ENGLISH_VOICE_KEY = 'thefloor.readAloud.en';
const SPANISH_VOICE_KEY = 'thefloor.readAloud.es';
export const VOICE_KEYS: Record<SpokenLanguage, string> = {
  en: ENGLISH_VOICE_KEY,
  es: SPANISH_VOICE_KEY,
};

/**
 * The chosen identifiers, read once from storage and then held here, so that
 * a reply read the moment it lands does not wait on the keychain.
 */
let chosenVoices: Partial<Record<string, string>> = {};
const loadedVoices: Promise<void> = (async () => {
  for (const language of Object.keys(VOICE_KEYS) as SpokenLanguage[]) {
    try {
      const id = await storage.get(VOICE_KEYS[language]);
      if (id) chosenVoices = { ...chosenVoices, [language]: id };
    } catch {
      // Unreadable is unchosen: the best installed voice reads instead.
    }
  }
})();

/** Makes `identifier` the voice for `language` on this phone. */
export async function chooseVoice(
  language: SpokenLanguage,
  identifier: string
): Promise<void> {
  chosenVoices = { ...chosenVoices, [language]: identifier };
  await storage.set(VOICE_KEYS[language], identifier).catch(() => undefined);
}

export interface LanguageVoices {
  language: SpokenLanguage;
  /** The voice a reply in this language would be read in now. */
  voice: Voice | null;
  /**
   * What may be chosen among: the Enhanced and Premium voices installed. The
   * basic ones are left out, being the robotic sound the card exists to get
   * somebody away from — and a list of every basic voice is a page long.
   */
  choices: Voice[];
}

/**
 * What Floor Settings draws: for each language, the voice a reply in it would
 * be read in now and what else may be chosen — or null for the whole where
 * this build cannot speak.
 *
 * **Both languages, not the app's**, because the reply's language decides the
 * voice, and a Spanish reply reaches a phone set to English as readily as an
 * English one.
 *
 * **Asked again whenever the app comes back to the foreground**, because the
 * card's whole advice is to go to Settings and download a voice, and the
 * person who did is the one coming back to see whether it took.
 */
export function useReadAloudVoices(languages: readonly SpokenLanguage[]): {
  found: LanguageVoices[] | null;
  choose: (language: SpokenLanguage, identifier: string) => void;
} {
  const key = languages.join(',');
  const look = (): LanguageVoices[] | null => {
    const found: LanguageVoices[] = [];
    for (const language of languages) {
      const voices = installedVoices(language);
      if (voices === null) return null;
      const locale = localeFor(language);
      found.push({
        language,
        voice: bestVoice(voices, locale, chosenVoices[language] ?? null),
        choices: voices
          .filter((voice) => voice.quality !== 'default')
          .sort(
            (a, b) =>
              RANK[b.quality] - RANK[a.quality] || a.name.localeCompare(b.name)
          ),
      });
    }
    return found;
  };
  const [found, setFound] = useState(look);
  useEffect(() => {
    let live = true;
    setFound(look());
    void loadedVoices.then(() => {
      if (live) setFound(look());
    });
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') setFound(look());
    });
    return () => {
      live = false;
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const choose = (language: SpokenLanguage, identifier: string) => {
    void chooseVoice(language, identifier);
    setFound(look());
  };
  return { found, choose };
}

/**
 * Reads each new reply from Claude aloud, on this device, while present.
 *
 * **Above the channel screen, beside the chimes, for their reason**: somebody
 * who has walked back to Home is still in the room, and a reply spoken only to
 * whoever is looking at the *Record* would miss the people the voice is for.
 *
 * **Takes `live`**, the channel this device is present in, so "only the
 * people in the room" needs no guard of its own — `usePresenceChime`'s
 * arrangement. Leaving the room stops a reply mid-sentence.
 *
 * **A reply is new when the latest paste's id changes to one by Claude.**
 * `ChannelState.clip` is the latest paste in full, so nothing is fetched. The
 * first look at a channel is taken as read, `usePresenceChime`'s rule: a reply
 * already there when you step in was spoken to the people who were there.
 *
 * **In the language the reply is written in** (`replyLocale`), with
 * `fallback` — the app's — only where the text will not say.
 *
 * **Local, and never into the call**, as every chime is: each phone reads to
 * its own listener. A phone on its speaker with its microphone open may carry
 * the voice into the call as well, which is the chimes' standing too.
 */
export function useClaudeReadAloud(
  live: ChannelState | null,
  fallback: string,
  say: (text: string, locale: string) => void = sayWithBestVoice,
  hush: () => void = stopSpeaking,
  detect: (text: string) => DetectedLanguage | null = detectLanguage
): void {
  const seen = useRef<{ channelId: string; clipId: string | null } | null>(null);

  const channelId = live?.id ?? null;
  const clip = live?.clip ?? null;
  const clipId = clip?.id ?? null;
  // Read through a ref so a change of language does not re-run the effect and
  // read the last reply out a second time.
  const latest = useRef({ clip, fallback, detect });
  latest.current = { clip, fallback, detect };

  useEffect(() => {
    if (channelId === null) {
      if (seen.current !== null) hush();
      seen.current = null;
      return;
    }
    const before = seen.current;
    seen.current = { channelId, clipId };
    if (!before) return;
    if (before.channelId !== channelId) {
      hush();
      return;
    }
    if (clipId === null || clipId === before.clipId) return;

    const { clip: pasted, fallback: otherwise, detect: recognize } = latest.current;
    if (pasted?.authorId !== CLAUDE_ID) return;
    say(pasted.text, replyLocale(pasted.text, otherwise, recognize));
  }, [channelId, clipId, say, hush]);

  useEffect(() => () => hush(), [hush]);
}

function sayWithBestVoice(text: string, locale: string): void {
  const language = languageOf(locale);
  const voices = installedVoices(language) ?? [];
  const chosen = chosenVoices[language] ?? null;
  speak(text, bestVoice(voices, locale, chosen)?.identifier ?? null, locale);
}
