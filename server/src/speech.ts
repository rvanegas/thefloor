import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SPEECH_LANGUAGE_NAMES, type SpeechLanguage } from '../../core/speech';
import { SAMPLE_RATE, type Decoder } from './playback';

/**
 * Claude's reply, spoken: AssemblyAI's text-to-speech, and the hour the audio
 * is kept for so the room can hear it again.
 *
 * **Once per paste, on the server**, since 2026-11-13: one request whatever
 * the number of phones, the key never leaving the box, and the samples
 * published into the room as `room-reader:<channel>` — where everybody hears them
 * and a recording keeps them. See
 * planning/task/read-claude-s-reply-aloud-with-assemblyai-s-speech-instead-of-the-phone-s.md.
 *
 * **The HTTP API, streamed, as raw PCM at 48 kHz**: the reply arrives from
 * Claude whole, which is what HTTP is for; raw PCM needs no decoder; and 48
 * kHz is what the pump publishes (`SAMPLE_RATE`), so nothing is resampled.
 * The parameter names are from their docs as fetched on 2026-11-13, pinned
 * here for the reason `transcription.ts` gives.
 */

const ASSEMBLYAI_TTS = 'https://tts.us.assemblyai.com';

/** Their limit on one request's text, in Unicode code points. */
export const SPEECH_MAX_CHARACTERS = 5_000;

export interface SpeechRequest {
  text: string;
  /** An AssemblyAI voice slug, such as `aai-kyla`. */
  voice: string;
  language: SpeechLanguage;
}

export interface SpeechProvider {
  readonly name: string;
  /**
   * Speaks `text`, handing over 16-bit mono PCM at `SAMPLE_RATE` as it
   * arrives. Resolves with the characters billed once the audio is complete;
   * rejects on a refusal before any audio, or a cut after some.
   */
  synthesize(
    request: SpeechRequest,
    onAudio: (pcm: Buffer) => void,
    signal?: AbortSignal
  ): Promise<{ billedCharacters: number }>;
}

export class SpeechError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryAfterMs: number | null = null
  ) {
    super(message);
    this.name = 'SpeechError';
  }
}

export interface AssemblyAiSpeechOptions {
  apiKey: string;
  /** For tests. Defaults to the real API. */
  baseUrl?: string;
  /** For tests. Defaults to the global `fetch`. */
  fetch?: typeof globalThis.fetch;
  /** For tests. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * The longest `Retry-After` waited out. A reply heard five seconds late is
 * still the reply; one heard a minute late has been read on the screen and
 * talked past, and the phone's own voice is the better answer.
 */
const MAX_RETRY_WAIT_MS = 5_000;

export class AssemblyAiSpeech implements SpeechProvider {
  readonly name = 'AssemblyAI';

  private readonly baseUrl: string;
  private readonly fetch: typeof globalThis.fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private options: AssemblyAiSpeechOptions) {
    this.baseUrl = options.baseUrl ?? ASSEMBLYAI_TTS;
    this.fetch = options.fetch ?? globalThis.fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async synthesize(
    request: SpeechRequest,
    onAudio: (pcm: Buffer) => void,
    signal?: AbortSignal
  ): Promise<{ billedCharacters: number }> {
    try {
      return await this.once(request, onAudio, signal);
    } catch (error) {
      // **Once, and only before any audio.** A 429 or 503 costs nothing and
      // says when to come back; a cut after the first audio cannot be resumed
      // and starting again would say the beginning twice.
      if (
        error instanceof SpeechError &&
        (error.status === 429 || error.status === 503) &&
        !signal?.aborted
      ) {
        await this.sleep(Math.min(error.retryAfterMs ?? 1_000, MAX_RETRY_WAIT_MS));
        return this.once(request, onAudio, signal);
      }
      throw error;
    }
  }

  private async once(
    request: SpeechRequest,
    onAudio: (pcm: Buffer) => void,
    signal?: AbortSignal
  ): Promise<{ billedCharacters: number }> {
    const response = await this.fetch(`${this.baseUrl}/v1/speech`, {
      method: 'POST',
      // The key bare, as every AssemblyAI API takes it.
      headers: { authorization: this.options.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        text: request.text,
        voice_id: request.voice,
        // **Always named**: the API detects nothing, and left out the voice
        // speaks its own language whatever the text is in.
        language: SPEECH_LANGUAGE_NAMES[request.language],
        encoding: 'pcm_s16le',
        sample_rate: SAMPLE_RATE,
      }),
      signal,
    });
    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after'));
      let message = `AssemblyAI speech ${response.status}`;
      try {
        const body = (await response.json()) as { code?: string; message?: string };
        message = `${message} ${body.code ?? ''}: ${body.message ?? ''}`.trim();
      } catch {
        // A body that is not JSON is one the gateway wrote; the status says it.
      }
      throw new SpeechError(
        message,
        response.status,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null
      );
    }
    // Sent with the first audio: what the request bills once its body is
    // delivered, which a cut below makes free.
    const billed = Number(response.headers.get('x-tts-billed-characters') ?? 0);
    if (!response.body) return { billedCharacters: billed };

    // **Whole samples per write, not per read**: the network can split one,
    // so an odd byte waits for the next read.
    let carry: Buffer | null = null;
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      let bytes = Buffer.from(value);
      if (carry) {
        bytes = Buffer.concat([carry, bytes]);
        carry = null;
      }
      if (bytes.length % 2 === 1) {
        carry = bytes.subarray(bytes.length - 1);
        bytes = bytes.subarray(0, bytes.length - 1);
      }
      if (bytes.length > 0) onAudio(bytes);
    }
    return { billedCharacters: Number.isFinite(billed) ? billed : 0 };
  }
}

/** Speaks in silence, a sample per character, at once or on demand. For tests. */
export class FakeSpeech implements SpeechProvider {
  readonly name = 'Fake';
  readonly requests: SpeechRequest[] = [];
  /** Set to make the next request refuse before any audio. */
  fail: Error | null = null;
  /** Set to hold each request until `release` is called. */
  hold = false;
  private waiting: Array<() => void> = [];

  async synthesize(
    request: SpeechRequest,
    onAudio: (pcm: Buffer) => void
  ): Promise<{ billedCharacters: number }> {
    this.requests.push(request);
    if (this.fail) {
      const error = this.fail;
      this.fail = null;
      throw error;
    }
    if (this.hold) await new Promise<void>((resolve) => this.waiting.push(resolve));
    onAudio(Buffer.alloc(request.text.length * 2, 1));
    return { billedCharacters: [...request.text].length };
  }

  /** Lets every held request finish. */
  release(): void {
    const waiting = this.waiting;
    this.waiting = [];
    for (const resolve of waiting) resolve();
  }
}

/**
 * How long a reply's audio is kept after it was synthesised: an hour, at
 * Rodrigo's word, 2026-11-13 — the life of *Read again*. Long enough for
 * anybody in the room to ask for it; short enough that this is never a store
 * of what Claude said, which the *Record* already is.
 */
export const SPEECH_KEPT_MS = 60 * 60 * 1000;

interface SpeechEntry {
  channelId: string;
  /**
   * While synthesis runs, the audio so far in a buffer that grows by
   * doubling, `bytes` of it used; null once it is on disk.
   */
  data: Buffer | null;
  bytes: number;
  state: 'speaking' | 'ready' | 'failed';
  readyAt: number | null;
  /** Readers waiting on more audio. */
  waiters: Array<() => void>;
}

/**
 * Each reply's audio, by paste id, for an hour: in memory while it arrives,
 * then on the server's disk.
 *
 * **Lost on a restart, deliberately**: everything under `dir` is removed when
 * the store opens. It is derived from the paste, which is kept; keeping it
 * across restarts would make it a second record of the conversation, which
 * `/privacy` would then have to describe. It is never put in S3, and the
 * recording's stem is a separate copy that belongs to the recording.
 */
export class SpeechStore {
  private entries = new Map<string, SpeechEntry>();

  constructor(
    private dir: string,
    private now: () => number = Date.now
  ) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }

  /** Starts a reply's audio. */
  begin(pasteId: string, channelId: string): void {
    this.entries.set(pasteId, {
      channelId,
      data: Buffer.alloc(64 * 1024),
      bytes: 0,
      state: 'speaking',
      readyAt: null,
      waiters: [],
    });
  }

  append(pasteId: string, pcm: Buffer): void {
    const entry = this.entries.get(pasteId);
    if (!entry?.data || entry.state !== 'speaking') return;
    if (entry.bytes + pcm.length > entry.data.length) {
      const grown = Buffer.alloc(Math.max(entry.data.length * 2, entry.bytes + pcm.length));
      entry.data.copy(grown, 0, 0, entry.bytes);
      entry.data = grown;
    }
    pcm.copy(entry.data, entry.bytes);
    entry.bytes += pcm.length;
    this.wake(entry);
  }

  /** The audio is complete: it moves to disk, and its hour starts. */
  finish(pasteId: string): void {
    const entry = this.entries.get(pasteId);
    if (!entry?.data || entry.state !== 'speaking') return;
    writeFileSync(this.pathOf(pasteId), entry.data.subarray(0, entry.bytes));
    entry.data = null;
    entry.state = 'ready';
    entry.readyAt = this.now();
    this.wake(entry);
  }

  /** Synthesis failed; what was said so far is dropped with it. */
  fail(pasteId: string): void {
    const entry = this.entries.get(pasteId);
    if (!entry) return;
    entry.data = null;
    entry.state = 'failed';
    this.wake(entry);
    this.entries.delete(pasteId);
  }

  /** Whether `pasteId` can be heard (again): speaking now, or kept. */
  has(pasteId: string, channelId: string): boolean {
    const entry = this.entries.get(pasteId);
    return entry !== undefined && entry.channelId === channelId && entry.state !== 'failed';
  }

  /** The paste ids this channel can still hear again, for its snapshot. */
  kept(channelId: string): string[] {
    return [...this.entries]
      .filter(([, entry]) => entry.channelId === channelId && entry.state === 'ready')
      .map(([id]) => id);
  }

  /** Drops every reply older than its hour. Returns the channels that lost one. */
  sweep(): Set<string> {
    const cutoff = this.now() - SPEECH_KEPT_MS;
    const touched = new Set<string>();
    for (const [id, entry] of this.entries) {
      if (entry.state === 'ready' && entry.readyAt !== null && entry.readyAt <= cutoff) {
        this.entries.delete(id);
        rmSync(this.pathOf(id), { force: true });
        touched.add(entry.channelId);
      }
    }
    // Anything on disk the map does not know is from a moment this process
    // cannot account for, so it goes too.
    for (const name of readdirSync(this.dir)) {
      const id = name.replace(/\.pcm$/, '');
      if (!this.entries.has(id)) {
        const path = join(this.dir, name);
        if (statSync(path).mtimeMs <= cutoff) rmSync(path, { force: true });
      }
    }
    return touched;
  }

  /** Drops a channel's replies — the channel was deleted. */
  forget(channelId: string): void {
    for (const [id, entry] of this.entries) {
      if (entry.channelId !== channelId) continue;
      this.entries.delete(id);
      rmSync(this.pathOf(id), { force: true });
      this.wake(entry);
    }
  }

  /**
   * A decoder over one reply, from its beginning, for the pump: it reads what
   * has arrived, waits for what has not, and ends with the reply.
   */
  decoder(pasteId: string): Decoder {
    return new SpeechDecoder(this, pasteId);
  }

  /** @internal Bytes from `offset`, waiting while synthesis is behind. */
  async readAt(pasteId: string, offset: number, length: number): Promise<Buffer | null> {
    for (;;) {
      const entry = this.entries.get(pasteId);
      if (!entry || entry.state === 'failed') return null;
      if (entry.state === 'ready') {
        const all = this.cached(pasteId);
        if (offset >= all.length) return null;
        return all.subarray(offset, offset + length);
      }
      // A slice of the buffer as it stands: growing it copies to a new one,
      // so a slice handed out earlier is never written over.
      if (entry.data && entry.bytes > offset) {
        return entry.data.subarray(offset, Math.min(offset + length, entry.bytes));
      }
      await new Promise<void>((resolve) => entry.waiters.push(resolve));
    }
  }

  // One reply read back at a time is the ordinary case — the pump plays one —
  // so the last file read is held rather than read again every 10 ms.
  private cache: { id: string; bytes: Buffer } | null = null;

  private cached(pasteId: string): Buffer {
    if (this.cache?.id !== pasteId) {
      this.cache = { id: pasteId, bytes: readFileSync(this.pathOf(pasteId)) };
    }
    return this.cache.bytes;
  }

  /** Lets go of the held file, once the pump is done with it. */
  release(pasteId: string): void {
    if (this.cache?.id === pasteId) this.cache = null;
  }

  private wake(entry: SpeechEntry): void {
    const waiters = entry.waiters;
    entry.waiters = [];
    for (const resolve of waiters) resolve();
  }

  private pathOf(pasteId: string): string {
    return join(this.dir, `${pasteId.replace(/[^A-Za-z0-9_-]/g, '')}.pcm`);
  }
}

/**
 * One reply as the pump reads it: 10 ms at a time, **silence while synthesis
 * is behind** rather than a wait — a pump that waits stops publishing, and a
 * stem that stops loses its place in the recording — and null when the reply
 * has been said.
 */
class SpeechDecoder implements Decoder {
  private offset = 0;
  private stopped = false;
  private pending: Promise<Buffer | null> | null = null;

  constructor(
    private store: SpeechStore,
    private pasteId: string
  ) {}

  async read(samples: number): Promise<Int16Array | null> {
    if (this.stopped) return null;
    const want = samples * 2;
    this.pending ??= this.store.readAt(this.pasteId, this.offset, want);
    // Synthesis runs many times faster than speech, so this is almost always
    // answered at once; where it is not, a frame of silence goes out and the
    // same read is asked again on the next frame.
    const answer = await Promise.race([
      this.pending,
      new Promise<'late'>((resolve) => setImmediate(() => resolve('late'))),
    ]);
    if (answer === 'late') return new Int16Array(samples);
    this.pending = null;
    if (answer === null) {
      this.store.release(this.pasteId);
      return null;
    }
    this.offset += answer.length;
    const frame = new Int16Array(samples);
    const usable = answer.length - (answer.length % 2);
    for (let i = 0; i < usable / 2; i += 1) frame[i] = answer.readInt16LE(i * 2);
    return frame;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.store.release(this.pasteId);
  }
}
