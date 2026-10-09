/**
 * Transcribing audio as it is spoken, behind an interface — the live
 * transcript's half of what `transcription.ts` is for recordings.
 *
 * One session per speaker, which the provider forces: a streaming session is
 * one WebSocket carrying one mono stream, so a channel of four is four
 * sessions, and who said what is known by construction from whose stream it
 * was. Nothing here asks the provider whose voice it heard. See
 * planning/decision/2026-10-09-a-stem-is-one-voice.md.
 *
 * **Billed by how long a session is open, not by audio sent**, which is why
 * the caller opens one only while somebody's microphone carries audio and
 * closes it soon after it stops. `close` sends `Terminate` and waits for
 * `Termination`, since closing the socket first drops the last turn — the
 * provider's own guidance.
 *
 * **Fetch https://www.assemblyai.com/docs/llms.txt before changing anything
 * below**, for the reason `transcription.ts` gives: their parameter names
 * have moved under working code before.
 */
import WebSocket from 'ws';

/** What a session is fed: 16 kHz mono, signed 16-bit, as `AudioStream` gives it. */
export const STREAM_SAMPLE_RATE = 16_000;

/**
 * The model, pinned. Multilingual because Spanish is spoken here and the
 * English-only model would not hear it; the cheaper of the two families that
 * do, at about $0.15 an hour against the flagship's $0.45 — see
 * planning/task/transcribe-as-the-conversation-happens.md § *Findings*.
 */
export const STREAMING_MODEL = 'universal-streaming-multilingual';

/**
 * How much audio goes in one message, in samples: 50 ms, which is what the
 * provider asks for. LiveKit hands over 10 ms frames, and five times as many
 * messages is load on both ends for nothing.
 */
const CHUNK_SAMPLES = (STREAM_SAMPLE_RATE / 1000) * 50;

/** How long `close` waits for `Termination` before giving up on it. */
const TERMINATION_WAIT_MS = 5_000;

/** One finished turn, timed against the audio this session was sent. */
export interface LiveTurn {
  /** Milliseconds into the audio sent on this session. */
  startMs: number;
  endMs: number;
  text: string;
  confidence: number | null;
}

export interface StreamingHandlers {
  onTurn: (turn: LiveTurn) => void;
  /**
   * The session ended, by `close` or otherwise. `error` is set when it was
   * not asked for — a refused key, the three-hour cap, a dropped socket — and
   * the caller opens another if it still wants one.
   */
  onClose: (result: { error?: Error; billedSeconds: number | null }) => void;
}

export interface StreamingSession {
  /** Queues audio. Safe to call before the socket is open. */
  send(samples: Int16Array): void;
  /** Ends the session cleanly, keeping its last turn. */
  close(): Promise<void>;
}

export interface StreamingTranscriptionProvider {
  open(handlers: StreamingHandlers): StreamingSession;
}

export interface AssemblyAiStreamingOptions {
  apiKey: string;
  /** For tests. Defaults to the real endpoint. */
  url?: string;
}

export class AssemblyAiStreaming implements StreamingTranscriptionProvider {
  constructor(private options: AssemblyAiStreamingOptions) {}

  open(handlers: StreamingHandlers): StreamingSession {
    const params = new URLSearchParams({
      sample_rate: String(STREAM_SAMPLE_RATE),
      speech_model: STREAMING_MODEL,
      format_turns: 'true',
    });
    const base = this.options.url ?? 'wss://streaming.assemblyai.com/v3/ws';
    // The key bare, no `Bearer` — the same as the batch API.
    const socket = new WebSocket(`${base}?${params}`, {
      headers: { Authorization: this.options.apiKey },
    });
    return new AssemblyAiSession(socket, handlers);
  }
}

class AssemblyAiSession implements StreamingSession {
  private pending: Int16Array[] = [];
  private pendingSamples = 0;
  private closing = false;
  private closed = false;
  private billedSeconds: number | null = null;
  private error: Error | undefined;
  private terminated: (() => void) | null = null;

  constructor(
    private socket: WebSocket,
    private handlers: StreamingHandlers
  ) {
    socket.on('open', () => this.flush(false));
    socket.on('message', (data) => this.receive(String(data)));
    socket.on('error', (error) => {
      this.error ??= error instanceof Error ? error : new Error(String(error));
    });
    socket.on('close', (code, reason) => {
      // 1000 after `Termination` is the clean end; anything else is a
      // failure the caller should hear about, with whatever the provider said.
      if (code !== 1000 && !this.closing) {
        this.error ??= new Error(
          `The transcriber closed the stream (${code}${reason.length ? `: ${reason}` : ''})`
        );
      }
      this.finish();
    });
  }

  send(samples: Int16Array): void {
    if (this.closing || this.closed) return;
    this.pending.push(samples);
    this.pendingSamples += samples.length;
    if (this.pendingSamples >= CHUNK_SAMPLES) this.flush(false);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.flush(true);
    this.closing = true;
    if (this.socket.readyState !== WebSocket.OPEN) {
      this.socket.terminate();
      this.finish();
      return;
    }
    const ended = new Promise<void>((resolve) => {
      this.terminated = resolve;
    });
    this.socket.send(JSON.stringify({ type: 'Terminate' }));
    const timer = setTimeout(() => {
      this.socket.terminate();
      this.finish();
    }, TERMINATION_WAIT_MS);
    await ended;
    clearTimeout(timer);
  }

  /** Sends what is queued, in 50 ms messages, and all of it when `all`. */
  private flush(all: boolean): void {
    if (this.socket.readyState !== WebSocket.OPEN) return;
    if (this.pendingSamples === 0) return;
    const joined = new Int16Array(this.pendingSamples);
    let at = 0;
    for (const part of this.pending) {
      joined.set(part, at);
      at += part.length;
    }
    let sent = 0;
    while (joined.length - sent >= CHUNK_SAMPLES || (all && sent < joined.length)) {
      const end = Math.min(joined.length, sent + CHUNK_SAMPLES);
      const chunk = joined.subarray(sent, end);
      this.socket.send(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
      sent = end;
    }
    const rest = joined.slice(sent);
    this.pending = rest.length ? [rest] : [];
    this.pendingSamples = rest.length;
  }

  private receive(raw: string): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    if (message.type === 'Turn') {
      const turn = turnFrom(message);
      if (turn) this.handlers.onTurn(turn);
      return;
    }
    if (message.type === 'Termination') {
      // "This is the duration the session is billed on."
      const seconds = message.session_duration_seconds;
      this.billedSeconds = typeof seconds === 'number' ? seconds : null;
      return;
    }
    if (message.type === 'Error') {
      this.error ??= new Error(
        `The transcriber refused the stream: ${String(message.error ?? message.error_code)}`
      );
    }
  }

  private finish(): void {
    if (this.closed) return;
    this.closed = true;
    this.terminated?.();
    this.handlers.onClose({ error: this.error, billedSeconds: this.billedSeconds });
  }
}

/**
 * A finished turn out of a `Turn` message, or null for anything that is not
 * one yet.
 *
 * Finished means both flags, the provider's own definition: with
 * `format_turns` on, every turn ends twice, once raw and once formatted, and
 * only the second is the text to keep. Partials — `end_of_turn` false — are
 * not shown in this version.
 */
export function turnFrom(message: Record<string, unknown>): LiveTurn | null {
  if (message.end_of_turn !== true || message.turn_is_formatted !== true) {
    return null;
  }
  const text = typeof message.transcript === 'string' ? message.transcript.trim() : '';
  if (!text) return null;
  const words = Array.isArray(message.words)
    ? (message.words as Array<{ start?: number; end?: number; confidence?: number }>)
    : [];
  const starts = words.map((w) => w.start).filter((n): n is number => typeof n === 'number');
  const ends = words.map((w) => w.end).filter((n): n is number => typeof n === 'number');
  const scores = words
    .map((w) => w.confidence)
    .filter((n): n is number => typeof n === 'number');
  const startMs = starts.length ? Math.min(...starts) : 0;
  return {
    startMs,
    endMs: ends.length ? Math.max(...ends) : startMs,
    text,
    confidence: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
  };
}

/** Records what was sent and answers with what a test says. */
export class MemoryStreaming implements StreamingTranscriptionProvider {
  readonly sessions: MemoryStreamSession[] = [];

  open(handlers: StreamingHandlers): StreamingSession {
    const session = new MemoryStreamSession(handlers);
    this.sessions.push(session);
    return session;
  }

  /** The sessions not yet closed, oldest first. */
  live(): MemoryStreamSession[] {
    return this.sessions.filter((s) => !s.closed);
  }
}

export class MemoryStreamSession implements StreamingSession {
  /** Every sample sent, in order. */
  readonly samples: number[] = [];
  closed = false;

  constructor(private handlers: StreamingHandlers) {}

  send(samples: Int16Array): void {
    if (this.closed) return;
    for (const s of samples) this.samples.push(s);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.handlers.onClose({ billedSeconds: this.samples.length / STREAM_SAMPLE_RATE });
  }

  /** Answers with a finished turn, as the provider would. */
  turn(turn: LiveTurn): void {
    this.handlers.onTurn(turn);
  }

  /** Ends the session the way the provider ending it would. */
  fail(message: string): void {
    if (this.closed) return;
    this.closed = true;
    this.handlers.onClose({ error: new Error(message), billedSeconds: null });
  }
}
