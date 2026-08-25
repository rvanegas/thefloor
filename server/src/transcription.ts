/**
 * Turning recorded audio into text, behind an interface.
 *
 * The same reason as `MediaServer` and `RecordingStore`: it keeps the rules
 * testable without a network or a key, and it keeps the choice of provider from
 * spreading through the codebase. The suite already runs with no media server
 * and no bucket, and transcription must not be the thing that breaks that.
 *
 * What is *not* here, deliberately, is speaker identification *between
 * participants*. A recording is stored as one isolated stem per participant —
 * `recordings.stems` — because the floor is applied at encode time and a mix
 * cannot be un-mixed. So we already know whose voice is whose, by
 * construction, from the identity the egress job was opened for, and nothing
 * here ever asks the provider to tell Alice from Bob: they were never in the
 * same file.
 *
 * Diarisation *within* one stem is a different question, and is asked of every
 * one of them — see `TranscriptionOptions.diarize`. How many voices are inside
 * a single stem is a thing this system genuinely does not know. See
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
  /**
   * Which voice inside this stem said it — `A`, `B`, … — or null if the
   * provider did not label it.
   *
   * Almost always a single value across a whole stem, since a stem is one
   * person's microphone. It is kept for the times it is not, and there are two
   * of those: the `media` stem, which is whatever somebody played into the
   * room and has no owner at all; and a stem carrying a second voice that
   * should not be there — two people sharing a handset, or the other party
   * bleeding in on a speakerphone.
   *
   * **Storing it is not the same as showing it.** A "Speaker B" under a named
   * participant is two answers on one screen, which is the thing this design
   * refuses. What to do with a stem that comes back with more than one voice
   * is a render-time decision, deliberately unmade until there is some
   * experience of what this provider actually returns.
   */
  speaker: string | null;
}

/** What one poll found. `pending` covers both queued and processing. */
export type TranscriptionState =
  | { state: 'pending' }
  | {
      state: 'ready';
      /** What detection decided, per speaker, or null if it did not. */
      languageCode: string | null;
      utterances: Utterance[];
      /**
       * How much audio the provider says it processed, in milliseconds, or
       * null if it did not say.
       *
       * This is the number they bill on, which is why it is worth having over
       * a local measurement of the same file: rounding, minimum durations and
       * anything free are theirs to apply, and a figure taken from their own
       * response cannot drift from their invoice for a reason we invented.
       */
      billedMs: number | null;
    }
  | { state: 'failed'; error: string };

export interface TranscriptionOptions {
  languageDetection: boolean;
  /**
   * Whether to ask which voice said what, *within* this one file.
   *
   * On for every stem, which reads like a contradiction of this file's header
   * and is not. The header says we never ask whose voice this is, because the
   * stems already know — that is a claim about *attribution between
   * participants*, and it still holds: nothing here ever asks the provider to
   * tell Alice from Bob, because they were never in the same file.
   *
   * This asks something else. How many voices are inside one stem is a thing
   * we do not know and cannot declare in advance — a played track, a shared
   * handset, a speakerphone. Asking uniformly turns that from a declaration
   * somebody has to remember to make into an observation the response carries,
   * and a stem that comes back with one voice, which is nearly all of them,
   * simply confirms what was already assumed.
   *
   * It also has a useful side effect: `utterances` comes back grouped, which
   * is what `intoLines` exists to reconstruct when it does not.
   */
  diarize: boolean;
}

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
  submit(audio: Buffer, options: TranscriptionOptions): Promise<string>;

  /**
   * One poll. Never throws for a job that is merely unfinished; a job the
   * provider reports as failed comes back as `failed` rather than thrown, so a
   * caller handles one stem's failure without unwinding the others.
   */
  poll(id: string): Promise<TranscriptionState>;

  /**
   * Asks the provider to drop the transcript *and the uploaded audio*.
   *
   * Called when the text lands here, and again when the recording is swept, on
   * purpose: the first can fail and nobody would notice.
   *
   * **What it does at their end is not established.** Whether this erases
   * immediately, marks for a later sweep, or covers the uploaded audio as well
   * as the transcript row is a question nobody here has answered against their
   * documentation — their coding guide describes upload, submit and poll and
   * never mentions deletion. `/privacy` therefore says what we do, which is
   * ask, and deliberately promises no window on their behalf. **Do not add one
   * back without a source**; see BACKLOG.md.
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
 * The provider groups its own turns when it labels speakers, which it now does
 * for every stem — so this is the fallback for a response that comes back as
 * bare words, and the seam it uses is a pause long enough to read as one.
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

  async submit(audio: Buffer, options: TranscriptionOptions): Promise<string> {
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
        // Within one stem only — see TranscriptionOptions.diarize. This never
        // tells one participant from another; they are never in the same file.
        speaker_labels: options.diarize,
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
      // Their coding guide documents `audio_duration_ms` on the sync API and
      // says nothing about the async transcript object, which is the one we
      // use. Both spellings are read rather than guessing which: the cost of
      // being wrong is a null and an estimate, and the cost of insisting is a
      // bill nobody can check. Confirm against llms.txt and delete the loser.
      audio_duration?: number;
      audio_duration_ms?: number;
      utterances?: Array<{
        start?: number;
        end?: number;
        text?: string;
        confidence?: number;
        speaker?: string;
      }>;
      words?: Array<{
        start?: number;
        end?: number;
        text?: string;
        confidence?: number;
        speaker?: string;
      }>;
    };

    if (body.status === 'error') {
      return { state: 'failed', error: body.error ?? 'the provider did not say' };
    }
    if (body.status !== 'completed') return { state: 'pending' };

    // `utterances` comes back only when the provider was asked to tell
    // speakers apart, which we now do for every stem — so this is the ordinary
    // path and `intoLines` is the fallback for a response that carries words
    // and no grouping. The provider's own turns are preferred wherever they
    // exist: they are where the speaker labels live, and a reconstruction of a
    // grouping we were given is work done twice and worse.
    return {
      state: 'ready',
      languageCode: body.language_code ?? null,
      billedMs: billedMs(body),
      utterances: body.utterances?.length
        ? body.utterances.map((part) => ({
            startMs: part.start ?? 0,
            endMs: part.end ?? part.start ?? 0,
            text: (part.text ?? '').trim(),
            confidence:
              typeof part.confidence === 'number' ? part.confidence : null,
            speaker: part.speaker ?? null,
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

/** Whichever spelling of the processed duration the response carried. */
function billedMs(body: {
  audio_duration?: number;
  audio_duration_ms?: number;
}): number | null {
  if (typeof body.audio_duration_ms === 'number') {
    return Math.round(body.audio_duration_ms);
  }
  // Seconds in this one, which is the trap: read as milliseconds it under-
  // reports a bill by a factor of a thousand, and a usage report that says a
  // month cost four seconds is one nobody questions until the invoice.
  if (typeof body.audio_duration === 'number') {
    return Math.round(body.audio_duration * 1000);
  }
  return null;
}

/**
 * Groups timed words into readable lines, breaking on a pause.
 *
 * Exported because it is the half of a transcript's shape that can be ours
 * rather than the provider's, and it is worth testing directly: everything
 * above it is a network call and everything below it is prose on a screen.
 *
 * A line's confidence is the mean of its words'. The mean rather than the
 * minimum, which was the other candidate: one hesitant word inside a clear
 * sentence is normal, whereas the thing this number exists to catch — a stem
 * carrying the *other* person faintly, on a speakerphone — is uniformly
 * uncertain across the whole line. A minimum would flag the first and miss
 * nothing the mean misses.
 */
export function intoLines(
  words: Array<{
    start?: number;
    end?: number;
    text?: string;
    confidence?: number;
    speaker?: string;
  }>
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

    // A change of voice ends a line whatever the timing says: two speakers in
    // one line is the one join that cannot be undone later.
    const speaker = word.speaker ?? null;
    if (
      current &&
      (startMs - current.endMs > LINE_GAP_MS ||
        count >= LINE_MAX_WORDS ||
        speaker !== current.speaker)
    ) {
      close();
    }
    if (!current) {
      current = { startMs, endMs, text, confidence: null, speaker };
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
  readonly submitted: Array<
    { id: string; audio: Buffer } & TranscriptionOptions
  > = [];
  /** Every id forgotten, in order. Deletion is a promise, so it is observable. */
  readonly forgotten: string[] = [];

  /** What the next poll of a given id answers. Absent means `pending`. */
  private answers = new Map<string, TranscriptionState>();
  private failSubmit: string | null = null;
  private next = 1;

  /** Make the job with this id come back ready, on the next poll. */
  ready(
    id: string,
    utterances: Utterance[],
    languageCode: string | null = 'en',
    billedMs: number | null = 1_000
  ) {
    this.answers.set(id, { state: 'ready', languageCode, utterances, billedMs });
  }

  /** Make the job with this id come back failed, on the next poll. */
  fails(id: string, error: string) {
    this.answers.set(id, { state: 'failed', error });
  }

  /** While set, `submit` rejects — the upload failing rather than the job. */
  refuseSubmissions(reason: string | null) {
    this.failSubmit = reason;
  }

  async submit(audio: Buffer, options: TranscriptionOptions): Promise<string> {
    if (this.failSubmit) throw new Error(this.failSubmit);
    const id = `job-${this.next++}`;
    this.submitted.push({ id, audio, ...options });
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
