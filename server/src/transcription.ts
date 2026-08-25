/**
 * Turning recorded audio into text, behind an interface.
 *
 * The same reason as `MediaServer` and `RecordingStore`: it keeps the rules
 * testable without a network or a key, and it keeps the choice of provider from
 * spreading through the codebase. The suite already runs with no media server
 * and no bucket, and transcription must not be the thing that breaks that.
 *
 * What is *not* here, deliberately, is speaker identification. A recording is
 * stored as one isolated stem per participant — `recordings.stems` — because
 * the floor is applied at encode time and a mix cannot be un-mixed. So we
 * already know whose voice is whose, by construction, from the identity the
 * egress job was opened for. Diarisation would guess at something we hold
 * exactly, and would disagree with the names on the screen while doing it. The
 * provider is asked one question only: what words are in this audio. See
 * planning/TRANSCRIPTS.md.
 *
 * Nothing calls any of this yet. It is the first phase of that design: the
 * credential, the configuration, the disclosure on the privacy page, and the
 * shape the rest is written against.
 *
 * **Fetch https://www.assemblyai.com/docs/llms.txt before changing anything
 * below.** Their parameter names have moved under working code before — the
 * singular `speech_model` this file was first written against is deprecated in
 * favour of the `speech_models` array, and would have failed at runtime having
 * type-checked and read fine. Memory is not evidence about this API.
 *
 * Raw HTTP rather than the `assemblyai` npm package, which is what their own
 * guidance recommends. The package's value is that it uploads, submits and
 * polls for you in one call — and polling for us is a job the server's existing
 * tick owns, so that it survives a restart mid-job. Taking the dependency to
 * not use the part that justifies it, on four endpoints, is the wrong trade.
 */

/**
 * One utterance — a stretch of speech from one person, with the times it ran
 * between.
 *
 * Utterances rather than words, deliberately: a line is what a person can read,
 * tap, and be taken to. Word timings are what utterance boundaries are made of
 * and are not otherwise useful to anything on screen.
 *
 * **The times are recording-timeline milliseconds, not offsets into a stem.**
 * That holds because the audio submitted for one identity is rendered with its
 * `startMs` delays already in place — the same branch of the same filter graph
 * the mix is built from — so a late joiner's leading silence is present in what
 * the provider hears. It is the property that lets a tapped line seek shared
 * playback, and it is why the render is load-bearing rather than tidy.
 */
export interface Utterance {
  startMs: number;
  endMs: number;
  text: string;
  /**
   * The provider's confidence, 0 to 1, or null if it did not say.
   *
   * Kept rather than acted on. On a speakerphone each stem carries the other
   * party faintly, and a transcribed piece of bleed is a line attributed to the
   * wrong person; a floor applied at render time can be revised, one baked into
   * what is stored cannot.
   */
  confidence: number | null;
}

/** What one poll found. `pending` covers both queued and processing. */
export type TranscriptionState =
  | { state: 'pending' }
  | {
      state: 'ready';
      /** What detection decided, per speaker, or null if it did not. */
      languageCode: string | null;
      utterances: Utterance[];
    }
  | { state: 'failed'; error: string };

export interface TranscriptionProvider {
  /**
   * How the provider is named to a person reading the privacy policy. It is
   * the one place a user meets it, and it appears there rather than in the app
   * because the disclosure is the page's job.
   */
  readonly name: string;

  /**
   * Uploads the audio and starts a job, returning the provider's id for it.
   *
   * The bytes are uploaded rather than presigned out of the bucket. What is in
   * the bucket is not what may be sent: the stems there are ungated — they
   * contain what a silenced person said while holding no floor — and the mix
   * there is everybody at once. Uploading also gives `forget` its teeth, since
   * one deletion then removes the audio and the text together.
   */
  submit(audio: Buffer, options: { languageDetection: boolean }): Promise<string>;

  /**
   * One poll. Never throws for a job that is merely unfinished; a job the
   * provider reports as failed comes back as `failed` rather than thrown, so a
   * caller handles one stem's failure without unwinding the others.
   */
  poll(id: string): Promise<TranscriptionState>;

  /**
   * Removes the transcript *and the uploaded audio* from the provider.
   *
   * Called when the text lands here, and again when the recording is swept, on
   * purpose: the first can fail and nobody would notice.
   *
   * The privacy page promises this, so it is the one call in this file whose
   * behaviour has to be confirmed against the live API before the page is
   * allowed to say so — their coding guide documents upload, submit and poll
   * and does not mention deletion at all. See TRANSCRIPTS.md § *Open questions*.
   */
  forget(id: string): Promise<void>;
}

/**
 * Where AssemblyAI's v2 API lives. Overridable so a test can point elsewhere.
 *
 * The US host deliberately, which is what the privacy page says. There is an
 * `api.eu.assemblyai.com` and moving to it would be a change to a published
 * promise rather than a configuration.
 */
const ASSEMBLYAI_BASE = 'https://api.assemblyai.com/v2';

/**
 * The models to ask for, pinned rather than defaulted.
 *
 * `speech_models` is an **ordered fallback list**, not parallel execution: the
 * first is used unless the account cannot have it, and exactly one model
 * produces the transcript. The provider's own default is
 * `['universal-3-pro', 'universal-2']`, so the flagship has to be asked for by
 * name — and a default that moves under us is a re-run disagreeing with the run
 * before it for reasons nothing in this repository records. Pinning makes a
 * model change a decision with a diff.
 *
 * The pair also settles multi-language: `universal-3-5-pro` transcribes 18
 * languages natively and code-switches between them without configuration,
 * falling back to `universal-2` (99 languages) for anything outside that. So a
 * speaker who changes language mid-recording is handled rather than mislabelled
 * — which TRANSCRIPTS.md listed as a limit of per-file language detection, and
 * is not one on this model.
 *
 * Note the singular `speech_model` is deprecated, and is a *different shape*
 * on the realtime API — a string rather than an array. We are batch-only, so
 * the array is the one that applies.
 */
export const ASSEMBLYAI_MODELS = ['universal-3-5-pro', 'universal-2'];

/**
 * How long a gap between words starts a new line, in milliseconds.
 *
 * We ask for no diarisation, and the provider returns grouped `utterances` only
 * when it has been asked to tell speakers apart — so with one speaker per stem,
 * which is the whole design, what comes back is words. Lines are therefore ours
 * to make, and this is the seam: a pause long enough to read as one.
 *
 * Chosen rather than derived, and deliberately at render distance from the
 * data — the words' own timings are what is stored, so a different number can
 * be tried later without re-spending anything with the provider.
 */
export const LINE_GAP_MS = 700;

/** How many words a line may run to before it is broken regardless of pauses. */
export const LINE_MAX_WORDS = 60;

/** A provider call that failed, carrying enough to decide whether to retry. */
export class TranscriptionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** From `Retry-After` on a 429 or a 503, when the provider sent one. */
    readonly retryAfterMs: number | null
  ) {
    super(message);
    this.name = 'TranscriptionError';
  }
}

export interface AssemblyAiOptions {
  apiKey: string;
  /** For tests. Defaults to the real API. */
  baseUrl?: string;
  /** For tests. Defaults to the global `fetch`. */
  fetch?: typeof globalThis.fetch;
}

export class AssemblyAiTranscription implements TranscriptionProvider {
  readonly name = 'AssemblyAI';

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetch: typeof globalThis.fetch;

  constructor(options: AssemblyAiOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? ASSEMBLYAI_BASE;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async submit(
    audio: Buffer,
    options: { languageDetection: boolean }
  ): Promise<string> {
    // Ogg/Opus is accepted as-is, which is what the rendered stem already is —
    // no second encode between the filter graph and the wire.
    const uploaded = await this.call('/upload', {
      headers: { 'content-type': 'application/octet-stream' },
      body: audio,
    });
    const url = (uploaded as { upload_url?: string }).upload_url;
    if (!url) throw new Error('AssemblyAI accepted the upload and named no URL');

    const started = await this.call('/transcript', {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        audio_url: url,
        speech_models: ASSEMBLYAI_MODELS,
        // Off, always. We know who is speaking; see the header.
        speaker_labels: false,
        language_detection: options.languageDetection,
        punctuate: true,
        format_text: true,
      }),
    });
    const id = (started as { id?: string }).id;
    if (!id) throw new Error('AssemblyAI started a job and named no id');
    return id;
  }

  async poll(id: string): Promise<TranscriptionState> {
    const body = (await this.call(`/transcript/${encodeURIComponent(id)}`, {
      method: 'GET',
    })) as {
      status?: string;
      error?: string;
      language_code?: string | null;
      utterances?: Array<{
        start?: number;
        end?: number;
        text?: string;
        confidence?: number;
      }>;
      words?: Array<{
        start?: number;
        end?: number;
        text?: string;
        confidence?: number;
      }>;
    };

    if (body.status === 'error') {
      return { state: 'failed', error: body.error ?? 'the provider did not say' };
    }
    if (body.status !== 'completed') return { state: 'pending' };

    // `utterances` comes back only when the provider was asked to tell
    // speakers apart, and it never is here — so words are the ordinary case
    // rather than a fallback, and the grouping is ours. It is read first all
    // the same: if a future request ever does produce utterances, taking the
    // provider's own grouping over a reconstruction of it is right.
    return {
      state: 'ready',
      languageCode: body.language_code ?? null,
      utterances: body.utterances?.length
        ? body.utterances.map((part) => ({
            startMs: part.start ?? 0,
            endMs: part.end ?? part.start ?? 0,
            text: (part.text ?? '').trim(),
            confidence:
              typeof part.confidence === 'number' ? part.confidence : null,
          }))
        : intoLines(body.words ?? []),
    };
  }

  async forget(id: string): Promise<void> {
    await this.call(`/transcript/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  private async call(
    path: string,
    init: { method?: string; headers?: Record<string, string>; body?: Buffer | string }
  ): Promise<unknown> {
    const answered = await this.fetch(`${this.baseUrl}${path}`, {
      method: init.method ?? 'POST',
      headers: { authorization: this.apiKey, ...(init.headers ?? {}) },
      body: init.body,
    });
    if (!answered.ok) {
      // The body carries the reason; the status alone reads as a bug here
      // rather than as the quota, the bad key or the unplayable file it
      // usually is. A 401 in particular covers three unrelated things —
      // no key, a disabled account, and an empty balance.
      const detail = await answered.text().catch(() => '');
      const retryAfter = Number(answered.headers.get('retry-after'));
      throw new TranscriptionError(
        `AssemblyAI ${init.method ?? 'POST'} ${path}: ${answered.status}${
          detail ? ` ${detail.slice(0, 200)}` : ''
        }`,
        answered.status,
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null
      );
    }
    return answered.json();
  }
}

/**
 * Groups timed words into readable lines, breaking on a pause.
 *
 * Exported because it is the half of a transcript's shape that is ours rather
 * than the provider's, and it is worth testing directly: everything above it is
 * a network call and everything below it is prose on a screen.
 *
 * A line's confidence is the mean of its words'. The mean rather than the
 * minimum, which was the other candidate: one hesitant word inside a clear
 * sentence is normal, whereas the thing this number exists to catch — a stem
 * carrying the *other* person faintly, on a speakerphone — is uniformly
 * uncertain across the whole line. A minimum would flag the first and miss
 * nothing the mean misses.
 */
export function intoLines(
  words: Array<{ start?: number; end?: number; text?: string; confidence?: number }>
): Utterance[] {
  const lines: Utterance[] = [];
  let current: Utterance | null = null;
  let confidences: number[] = [];
  let count = 0;

  const close = () => {
    if (!current) return;
    const scored = confidences.length
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : null;
    lines.push({ ...current, confidence: scored });
    current = null;
    confidences = [];
    count = 0;
  };

  for (const word of words) {
    const text = (word.text ?? '').trim();
    if (!text) continue;
    const startMs = word.start ?? 0;
    const endMs = word.end ?? startMs;

    if (current && (startMs - current.endMs > LINE_GAP_MS || count >= LINE_MAX_WORDS)) {
      close();
    }
    if (!current) {
      current = { startMs, endMs, text, confidence: null };
    } else {
      current.text = `${current.text} ${text}`;
      current.endMs = Math.max(current.endMs, endMs);
    }
    if (typeof word.confidence === 'number') confidences.push(word.confidence);
    count += 1;
  }
  close();
  return lines;
}

/** Records what would have been asked of a provider, and answers. For tests. */
export class MemoryTranscription implements TranscriptionProvider {
  readonly name = 'A Memory Of AssemblyAI';

  /** Every job started, in order, newest last. */
  readonly submitted: Array<{
    id: string;
    audio: Buffer;
    languageDetection: boolean;
  }> = [];
  /** Every id forgotten, in order. Deletion is a promise, so it is observable. */
  readonly forgotten: string[] = [];

  /** What the next poll of a given id answers. Absent means `pending`. */
  private answers = new Map<string, TranscriptionState>();
  private failSubmit: string | null = null;
  private next = 1;

  /** Make the job with this id come back ready, on the next poll. */
  ready(id: string, utterances: Utterance[], languageCode: string | null = 'en') {
    this.answers.set(id, { state: 'ready', languageCode, utterances });
  }

  /** Make the job with this id come back failed, on the next poll. */
  fails(id: string, error: string) {
    this.answers.set(id, { state: 'failed', error });
  }

  /** While set, `submit` rejects — the upload failing rather than the job. */
  refuseSubmissions(reason: string | null) {
    this.failSubmit = reason;
  }

  async submit(
    audio: Buffer,
    options: { languageDetection: boolean }
  ): Promise<string> {
    if (this.failSubmit) throw new Error(this.failSubmit);
    const id = `job-${this.next++}`;
    this.submitted.push({
      id,
      audio,
      languageDetection: options.languageDetection,
    });
    return id;
  }

  async poll(id: string): Promise<TranscriptionState> {
    return this.answers.get(id) ?? { state: 'pending' };
  }

  async forget(id: string): Promise<void> {
    this.forgotten.push(id);
    this.answers.delete(id);
  }
}
