import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { CLAUDE_ID } from '../../../core/constants';
import type { LanguagePreference } from '../../../core/settings';
import type { ChannelState } from '../../../core/types';
import {
  installedVoices,
  speak,
  stopSpeaking,
  type Voice,
  type VoiceQuality,
} from '../../modules/read-aloud';
import { deviceRegion } from '../api/region';

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
 * The tag to speak in: the app's language, in the phone's region when the
 * phone is in that language too — so a Mexican phone set to *Español* reads
 * in `es-MX` rather than in whichever Spanish sorts first.
 *
 * *Automatic* resolves as `stringsFor` resolves it — Spanish or else English —
 * because the voice follows the language the app is speaking, which is the one
 * Floor Settings tells you how to get a better voice for.
 */
export function speechLocale(
  preference: LanguagePreference,
  phone: string | undefined = deviceRegion().locale
): string {
  const tag = (phone ?? '').replace(/_/g, '-');
  const phoneLanguage = tag.split('-')[0].toLowerCase();
  // Anything unrecognised reads as *Automatic*, `LanguageProvider`'s rule.
  const language =
    preference === 'en' || preference === 'es'
      ? preference
      : phoneLanguage === 'es'
        ? 'es'
        : 'en';
  return phoneLanguage === language && tag.includes('-') ? tag : language;
}

const RANK: Record<VoiceQuality, number> = { default: 0, enhanced: 1, premium: 2 };

/**
 * The voice a reply will be read in: the best quality installed, then the one
 * in the phone's own region, then by name so the answer is stable. Null when
 * nothing is installed for the language, which leaves the choice to iOS.
 */
export function bestVoice(voices: readonly Voice[], locale: string): Voice | null {
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

const languageOf = (locale: string) => locale.split('-')[0].toLowerCase();

/**
 * What Floor Settings draws: the voice a reply would be read in now, or null
 * where this build cannot speak at all.
 *
 * **Asked again whenever the app comes back to the foreground**, because the
 * card's whole advice is to go to Settings and download a voice, and the
 * person who did is the one coming back to see whether it took.
 */
export function useReadAloudVoice(
  locale: string
): { available: boolean; voice: Voice | null } {
  const look = () => {
    const voices = installedVoices(languageOf(locale));
    return voices === null
      ? { available: false, voice: null }
      : { available: true, voice: bestVoice(voices, locale) };
  };
  const [state, setState] = useState(look);
  useEffect(() => {
    setState(look());
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') setState(look());
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);
  return state;
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
 * **Local, and never into the call**, as every chime is: each phone reads to
 * its own listener. A phone on its speaker with its microphone open may carry
 * the voice into the call as well, which is the chimes' standing too.
 */
export function useClaudeReadAloud(
  live: ChannelState | null,
  locale: string,
  say: (text: string, locale: string) => void = sayWithBestVoice,
  hush: () => void = stopSpeaking
): void {
  const seen = useRef<{ channelId: string; clipId: string | null } | null>(null);

  const channelId = live?.id ?? null;
  const clip = live?.clip ?? null;
  const clipId = clip?.id ?? null;
  // Read through a ref so a change of language does not re-run the effect and
  // read the last reply out a second time.
  const latest = useRef({ clip, locale });
  latest.current = { clip, locale };

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

    const { clip: pasted, locale: tag } = latest.current;
    if (pasted?.authorId !== CLAUDE_ID) return;
    say(pasted.text, tag);
  }, [channelId, clipId, say, hush]);

  useEffect(() => () => hush(), [hush]);
}

function sayWithBestVoice(text: string, locale: string): void {
  const voices = installedVoices(languageOf(locale)) ?? [];
  speak(text, bestVoice(voices, locale)?.identifier ?? null, locale);
}
