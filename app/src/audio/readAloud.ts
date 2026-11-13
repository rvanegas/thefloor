import { useCallback, useEffect, useRef, useState } from 'react';
import { CLAUDE_ID } from '../../../core/constants';
import type { LanguagePreference } from '../../../core/settings';
import type { ChannelState } from '../../../core/types';
import {
  detectLanguage,
  engineHook,
  installedVoices,
  onReadAloudReport,
  onReading,
  speak,
  stopSpeaking,
  type DetectedLanguage,
  type Voice,
  type VoiceQuality,
} from '../../modules/read-aloud';
import { deviceRegion } from '../api/region';
import { recordEvent } from './diagnostics';

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
 * The voice a reply will be read in where the phone reads it: `chosen`, while
 * it is still installed — the asker's, since *Floor Settings*' own choice went
 * with its card on 2026-11-13 — otherwise the best quality installed, then the
 * one in the phone's own region, then by name so the answer is stable. Null
 * when nothing is installed for the language, which leaves the choice to iOS.
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

/**
 * The voice this phone would read each language in now, by subtag — what a
 * press of *Ask Claude* sends, so that **every phone reads the reply in the
 * asker's voice** where it has that voice installed. Undefined where this
 * build cannot speak or has no voice for either language.
 *
 * Since 2026-11-13 this is only the fallback's — a reply the server cannot
 * speak, or a build that predates it — and the choice that used to be made on
 * *Floor Settings* is gone with its card, so it is `bestVoice`'s.
 */
export function askerVoices(): Record<string, string> | undefined {
  const found: Record<string, string> = {};
  for (const language of ['en', 'es']) {
    const voices = installedVoices(language);
    if (!voices) return undefined;
    const voice = bestVoice(voices, localeFor(language));
    if (voice) found[language] = voice.identifier;
  }
  return Object.keys(found).length > 0 ? found : undefined;
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
 * **In the asker's voice** (`Clip.voices`, from `askerVoices`) where this
 * phone has it installed, and in this phone's own choice where it has not.
 *
 * **Local, and never into the call**: each phone reads to its own listener,
 * on the call's own audio engine, so the echo canceller keeps it out of the
 * microphone — see `ios/CallEngine.swift` in modules/read-aloud. What the
 * native half does with each reply goes to the diagnostics log as it happens.
 *
 * **Returns what *Restart* and *Stop* need**, at Rodrigo's word, 2026-10-29:
 * while a reply is being heard, those two controls are on screen
 * (`ReadingBar`). Whether one is being heard is the native half's to say
 * (`onReading`), since only it knows when the last sentence has played.
 *
 * **A reply the server speaks is not read here at all**, since 2026-11-13:
 * `Clip.speech` says the room is hearing it as `claude:<channel>`, so this
 * phone hears it with everybody else. `room` is that voice as the snapshot
 * describes it — `claudeSaying`, which only the server can know — and what
 * acts on it: *Restart* becomes *Read again*, for everybody, and *Stop*
 * quiets it on this phone alone (`hushClaudeVoice`) until it says something
 * else.
 */
export function useClaudeReadAloud(
  live: ChannelState | null,
  fallback: string,
  say: (
    text: string,
    locale: string,
    voices: Record<string, string> | undefined,
    reply: string
  ) => void = sayWithBestVoice,
  hush: () => void = stopSpeaking,
  detect: (text: string) => DetectedLanguage | null = detectLanguage,
  follow: (listener: (reply: string | null) => void) => () => void = onReading,
  room: RoomVoice | null = null
): ReadAloudControls {
  const seen = useRef<{ channelId: string; clipId: string | null } | null>(null);
  // What each reply in this room was handed to the reader as, by paste id, so
  // *Restart* can hand the one being heard over again exactly as it was.
  const spoken = useRef(new Map<string, SpokenReply>());
  const [reading, setReading] = useState<string | null>(null);
  // The reply the room is saying that this phone has stopped hearing, until
  // the room says something else.
  const [hushedFor, setHushedFor] = useState<string | null>(null);
  const saying = room?.saying ?? null;
  const hushRoom = room?.hush;
  useEffect(() => {
    if (hushedFor !== null && hushedFor !== saying) {
      hushRoom?.(false);
      setHushedFor(null);
    }
  }, [saying, hushedFor, hushRoom]);
  // The reply a restart is re-reading: the stop it begins with publishes
  // nothing-being-read, and taking that at its word would pull the bar out
  // from under the thumb that pressed it and put it back a moment later.
  const restarting = useRef<string | null>(null);

  useEffect(
    () =>
      follow((reply) => {
        if (reply === null && restarting.current !== null) return;
        restarting.current = null;
        setReading(reply);
      }),
    [follow]
  );

  const channelId = live?.id ?? null;
  const clip = live?.clip ?? null;
  const clipId = clip?.id ?? null;
  // Read through a ref so a change of language does not re-run the effect and
  // read the last reply out a second time.
  const latest = useRef({ clip, fallback, detect });
  latest.current = { clip, fallback, detect };

  useEffect(() => {
    const leave = () => {
      hush();
      spoken.current.clear();
      restarting.current = null;
      setReading(null);
    };
    if (channelId === null) {
      if (seen.current !== null) leave();
      seen.current = null;
      return;
    }
    const before = seen.current;
    seen.current = { channelId, clipId };
    if (!before) return;
    if (before.channelId !== channelId) {
      leave();
      return;
    }
    if (clipId === null || clipId === before.clipId) return;

    const { clip: pasted, fallback: otherwise, detect: recognize } = latest.current;
    if (pasted?.authorId !== CLAUDE_ID) return;
    // Spoken by the server, into the room: heard here already.
    if (pasted.speech) return;
    const reply = {
      text: pasted.text,
      locale: replyLocale(pasted.text, otherwise, recognize),
      voices: pasted.voices,
    };
    spoken.current.set(clipId, reply);
    say(reply.text, reply.locale, reply.voices, clipId);
  }, [channelId, clipId, say, hush]);

  useEffect(() => () => hush(), [hush]);

  /**
   * **Restart is the reply being heard, from its first sentence** — not the
   * latest one, which differ only when a second reply landed while the first
   * was still being read. Anything queued behind it goes, as *Stop* would
   * take it: the press was about this one.
   */
  const restart = useCallback(() => {
    // The room's reply, again, for everybody — *Read again* by another name.
    if (saying !== null) {
      room?.readAgain(saying);
      return;
    }
    const reply = reading === null ? undefined : spoken.current.get(reading);
    if (!reading || !reply) return;
    restarting.current = reading;
    hush();
    say(reply.text, reply.locale, reply.voices, reading);
  }, [reading, say, hush, saying, room]);

  // Mounted once, above every screen, for the life of the app — so the
  // native half's lines reach the log whether or not the panel is open.
  useEffect(() => {
    const hook = engineHook();
    if (hook) recordEvent(`read-aloud engine hook ${hook}`);
    return onReadAloudReport(recordEvent);
  }, []);

  const stop = useCallback(() => {
    restarting.current = null;
    hush();
    if (saying !== null) {
      hushRoom?.(true);
      setHushedFor(saying);
    }
  }, [hush, saying, hushRoom]);

  const roomReading = saying !== null && hushedFor !== saying;
  return {
    reading: reading !== null || roomReading,
    forRoom: saying !== null,
    restart,
    stop,
  };
}

/**
 * Claude's voice in the room, for `useClaudeReadAloud`: what it is saying,
 * by paste id (`ChannelView.claudeSaying`), and the two things this phone can
 * do about it. Since 2026-11-13.
 */
export interface RoomVoice {
  saying: string | null;
  /** *Read again*: the reply, said into the room once more for everybody. */
  readAgain: (pasteId: string) => void;
  /** Quiets Claude's voice on this phone alone, or lets it back. */
  hush: (hushed: boolean) => void;
}

interface SpokenReply {
  text: string;
  locale: string;
  voices: Record<string, string> | undefined;
}

/** What `ReadingBar` draws from: whether a reply is being heard, and the two acts. */
export interface ReadAloudControls {
  reading: boolean;
  /**
   * Whether the reply is the room's — said by the server for everybody — so
   * *Restart* is *Read again* for everybody too. Since 2026-11-13.
   */
  forRoom: boolean;
  /** The reply being heard, again from its first sentence. */
  restart: () => void;
  /** Silence, and nothing queued behind it is read either. */
  stop: () => void;
}

/**
 * The voice a reply is read in on this phone: **the asker's**, where this
 * phone has it installed; else this phone's own rule, `bestVoice`.
 */
export function readingVoice(
  installed: readonly Voice[],
  locale: string,
  asked: string | undefined,
  own: string | null
): Voice | null {
  const theirs = asked && installed.find((voice) => voice.identifier === asked);
  return theirs || bestVoice(installed, locale, own);
}

function sayWithBestVoice(
  text: string,
  locale: string,
  voices: Record<string, string> | undefined,
  reply: string
): void {
  const language = languageOf(locale);
  const voice = readingVoice(
    installedVoices(language) ?? [],
    locale,
    voices?.[language],
    null
  );
  speak(text, voice?.identifier ?? null, locale, reply);
}
