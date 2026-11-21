import { createHash } from 'node:crypto';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  readingProgress,
  sentenceAt,
  sentencesOf,
  speakableText,
  type ReadingSentence,
} from '../../core/reading';
import type { SpeechLanguage } from '../../core/speech';
import type { ChannelState } from '../../core/types';
import { playbackPositionMs } from '../../core/playback';
import { newId, type Db } from './db';
import { SAMPLE_RATE } from './playback';
import { speechPieces, type SpeechProvider } from './speech';

/**
 * A *reading*: a library document spoken aloud into *Listen*, since
 * 2026-11-20 — planning/decision/2026-11-20-a-library-document-is-read-aloud-in-listen.md.
 *
 * **Spoken once and kept a month**, at Rodrigo's word: the audio as Ogg Opus
 * in this server's own `READINGS_DIR`, and in `readings` the text spoken and
 * where each sentence of it falls (core/reading.ts). The same text in the
 * same voice and language is the same reading, so a second play anywhere
 * costs nothing. **On the box's disk rather than in S3** because this server
 * may put to the bucket and never delete from it (planning/CREDENTIALS.md),
 * and a month is a promise only something that can delete keeps.
 *
 * **What it is played as is an ordinary track** (`loadTrack`), carrying
 * `PlaybackTrack.document`: everybody present hears it through the call,
 * every control governs it, and a recording keeps it. Two things follow the
 * track while it plays, both here:
 *
 * - **The *Played audio* lines are the document's own sentences** (`follow`),
 *   written as playback passes each, rather than the room's speech-to-text
 *   of the same audio — exact, and paid for once.
 * - **Claude holds the document and knows where the room is in it**
 *   (`forClaude`), on any press while it is the channel's track.
 */

/** How long a reading is kept from when it was spoken: a month, Rodrigo's word. */
export const READING_KEPT_MS = 30 * 24 * 60 * 60 * 1000;

/** How many of a reading's requests are sent at once. */
const CONCURRENCY = 4;

/**
 * How far the position may move between two looks and still be playback
 * running on, rather than somebody seeking. The tick is 500 ms; this is
 * three of them, for a tick that ran late.
 */
const JUMP_SLACK_MS = 1_500;

export interface Reading {
  id: string;
  name: string;
  library: string;
  title: string;
  voice: string;
  language: SpeechLanguage;
  /** What was spoken: the document as `speakableText` left it. */
  text: string;
  sentences: ReadingSentence[];
  durationMs: number;
  createdAt: number;
}

interface ReadingRow {
  id: string;
  hash: string;
  name: string;
  library: string;
  title: string;
  voice: string;
  language: string;
  text: string;
  sentences: string;
  duration_ms: number;
  audio_key: string | null;
  created_at: number;
}

export interface ReadingsOptions {
  db: Db;
  provider: SpeechProvider;
  /** Where the audio is kept; `READINGS_DIR`. */
  dir: string;
  /** PCM at `SAMPLE_RATE` to Ogg Opus. `encodeSpeech` in export.ts; tests pass the PCM through. */
  encode: (pcm: Buffer) => Promise<Buffer>;
  now: () => number;
  /** A synthesis's billed characters, for the ledger. */
  billed: (entry: { channelId: string; accountId: string; readingId: string; characters: number }) => void;
  /** A sentence the room has just heard, for the live transcript (live.ts). */
  heard?: (channelId: string, line: { text: string; startAt: number; endAt: number }) => void;
  log?: { warn(details: object, message: string): void };
}

export class ReadingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReadingError';
  }
}

export class Readings {
  private cache = new Map<string, Reading>();
  /** Syntheses under way, by hash, so two presses of one document pay once. */
  private underway = new Map<string, Promise<{ reading: Reading; file: string }>>();
  /** Where each channel's reading was at the last look, for `follow`. */
  private followed = new Map<string, { trackId: string; positionMs: number; at: number }>();

  constructor(private options: ReadingsOptions) {}

  /**
   * The reading of this document in this voice: the one kept, or a new one
   * spoken now. Resolves with the file to load as the track.
   */
  async prepare(input: {
    name: string;
    library: string;
    title: string;
    markdown: string;
    voice: string;
    language: SpeechLanguage;
    channelId: string;
    accountId: string;
  }): Promise<{ reading: Reading; file: string; spoken: boolean }> {
    const text = speakableText(input.markdown);
    if (!text) throw new ReadingError('That document has nothing to read aloud.');
    const hash = createHash('sha256')
      .update(`${input.voice}\n${input.language}\n${text}`)
      .digest('hex');

    const kept = await this.kept(hash);
    if (kept) return { ...kept, spoken: false };

    const running = this.underway.get(hash);
    if (running) return { ...(await running), spoken: false };
    const work = this.speak(hash, text, input).finally(() => this.underway.delete(hash));
    this.underway.set(hash, work);
    return { ...(await work), spoken: true };
  }

  /** A reading by id, while it is kept. */
  get(id: string): Reading | null {
    const cached = this.cache.get(id);
    if (cached) return cached;
    const row = this.options.db
      .prepare('SELECT * FROM readings WHERE id = ? AND deleted_at IS NULL')
      .get(id) as unknown as ReadingRow | undefined;
    if (!row) return null;
    const reading = readingOf(row);
    this.cache.set(id, reading);
    return reading;
  }

  /** Readings past their month: the file and the text go, the row stays as the ledger's. */
  async sweep(): Promise<number> {
    const cutoff = this.options.now() - READING_KEPT_MS;
    const rows = this.options.db
      .prepare('SELECT id, audio_key FROM readings WHERE deleted_at IS NULL AND created_at < ?')
      .all(cutoff) as unknown as Array<{ id: string; audio_key: string | null }>;
    for (const row of rows) {
      if (row.audio_key) {
        await rm(join(this.options.dir, row.audio_key), { force: true });
      }
      this.options.db
        .prepare(
          `UPDATE readings SET deleted_at = ?, text = '', sentences = '[]', audio_key = NULL WHERE id = ?`
        )
        .run(this.options.now(), row.id);
      this.cache.delete(row.id);
    }
    return rows.length;
  }

  /**
   * **The *Played audio* lines of a reading**, looked at on every tick: each
   * sentence whose end playback has passed since the last look is heard, at
   * the wall-clock time it was said. A seek writes nothing for what it
   * jumped over, and a seek back hears those sentences again — the *Record*
   * says what the room heard, in the order it heard it.
   */
  follow(state: ChannelState, now: number): void {
    const track = state.playback.track;
    const reading = track?.document ? this.get(track.document.reading) : null;
    if (!track || !reading || state.status !== 'active') {
      this.followed.delete(state.id);
      return;
    }
    const position = playbackPositionMs(state.playback, now);
    const last = this.followed.get(state.id);
    this.followed.set(state.id, { trackId: track.id, positionMs: position, at: now });
    if (!last || last.trackId !== track.id) return;
    if (state.playback.status !== 'playing' || position <= last.positionMs) return;
    if (position - last.positionMs > now - last.at + JUMP_SLACK_MS) return;
    if (!this.options.heard) return;
    for (const sentence of reading.sentences) {
      if (sentence.endMs <= last.positionMs) continue;
      if (sentence.endMs > position) break;
      this.options.heard(state.id, {
        text: sentence.text,
        startAt: Math.round(now - (position - sentence.startMs)),
        endAt: Math.round(now - (position - sentence.endMs)),
      });
    }
  }

  /**
   * What a press of *Ask Claude* is given of the channel's reading: the
   * document whole, and a sentence saying where the room has got to in it —
   * the second apart, since it changes press to press and the first does not.
   */
  forClaude(
    state: ChannelState,
    now: number
  ): { name: string; library: string; title: string; text: string; note: string } | null {
    const track = state.playback.track;
    const reading = track?.document ? this.get(track.document.reading) : null;
    if (!track || !reading) return null;
    const position = playbackPositionMs(state.playback, now);
    const at = sentenceAt(reading.sentences, position);
    const how =
      state.playback.status === 'playing'
        ? 'is listening to it now'
        : position > 0
          ? 'has paused it'
          : 'has it ready to play';
    const where =
      at < 0
        ? 'and has not reached its first sentence.'
        : `and has heard it up to “${reading.sentences[at].text}”, about ${readingProgress(reading.sentences, position)}% of the way through.`;
    return {
      name: reading.name,
      library: reading.library,
      title: reading.title,
      text: reading.text,
      note:
        `The room is having the document ${JSON.stringify(reading.title)} read aloud in Listen. ` +
        `It ${how}, ${where} ` +
        'Its sentences appear in the record as Played audio, at the moments they were heard.',
    };
  }

  private async kept(hash: string): Promise<{ reading: Reading; file: string } | null> {
    const cutoff = this.options.now() - READING_KEPT_MS;
    const row = this.options.db
      .prepare(
        `SELECT * FROM readings
         WHERE hash = ? AND deleted_at IS NULL AND audio_key IS NOT NULL AND created_at >= ?
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(hash, cutoff) as unknown as ReadingRow | undefined;
    if (!row?.audio_key) return null;
    const file = join(this.options.dir, row.audio_key);
    try {
      await access(file);
    } catch {
      return null;
    }
    const reading = readingOf(row);
    this.cache.set(reading.id, reading);
    return { reading, file };
  }

  private async speak(
    hash: string,
    text: string,
    input: Parameters<Readings['prepare']>[0]
  ): Promise<{ reading: Reading; file: string }> {
    const pieces = speechPieces(text);
    const spoken = new Array<Awaited<ReturnType<SpeechProvider['synthesizeWithWords']>>>(pieces.length);
    let next = 0;
    const abort = new AbortController();
    const worker = async () => {
      while (next < pieces.length && !abort.signal.aborted) {
        const at = next;
        next += 1;
        spoken[at] = await this.options.provider.synthesizeWithWords(
          { text: pieces[at], voice: input.voice, language: input.language },
          abort.signal
        );
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pieces.length) }, worker));
    } catch (error) {
      abort.abort();
      throw error;
    }

    const sentences: ReadingSentence[] = [];
    let offsetMs = 0;
    let characters = 0;
    spoken.forEach((part, index) => {
      sentences.push(...sentencesOf(pieces[index], part.words, offsetMs));
      offsetMs += (part.pcm.length / 2 / SAMPLE_RATE) * 1000;
      characters += part.billedCharacters;
    });
    if (offsetMs === 0) throw new ReadingError('That document has nothing to read aloud.');

    const id = newId('rdg');
    this.options.billed({ channelId: input.channelId, accountId: input.accountId, readingId: id, characters });
    const audio = await this.options.encode(Buffer.concat(spoken.map((part) => part.pcm)));
    await mkdir(this.options.dir, { recursive: true });
    const key = `${id}.ogg`;
    const file = join(this.options.dir, key);
    await writeFile(file, audio);

    const reading: Reading = {
      id,
      name: input.name,
      library: input.library,
      title: input.title,
      voice: input.voice,
      language: input.language,
      text,
      sentences,
      durationMs: Math.round(offsetMs),
      createdAt: this.options.now(),
    };
    this.options.db
      .prepare(
        `INSERT INTO readings
           (id, hash, name, library, title, voice, language, text, sentences, duration_ms,
            audio_key, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        hash,
        reading.name,
        reading.library,
        reading.title,
        reading.voice,
        reading.language,
        text,
        JSON.stringify(sentences),
        reading.durationMs,
        key,
        reading.createdAt,
        input.accountId
      );
    this.cache.set(id, reading);
    return { reading, file };
  }
}

function readingOf(row: ReadingRow): Reading {
  return {
    id: row.id,
    name: row.name,
    library: row.library,
    title: row.title,
    voice: row.voice,
    language: row.language as SpeechLanguage,
    text: row.text,
    sentences: JSON.parse(row.sentences) as ReadingSentence[],
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  };
}
