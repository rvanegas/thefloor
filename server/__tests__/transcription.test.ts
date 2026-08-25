import {
  ASSEMBLYAI_MODELS,
  AssemblyAiTranscription,
  intoLines,
  LINE_GAP_MS,
  MemoryTranscription,
  TranscriptionError,
} from '../src/transcription';

/**
 * The provider, tested without a network or a key.
 *
 * What is worth asserting here is the small set of things that are decisions
 * rather than plumbing: that we never ask for diarisation, that the model is
 * pinned by name rather than defaulted, that a failed job comes back as a value
 * instead of a throw, and that words become readable lines. The rest is the
 * provider's business.
 */

/** A `fetch` that answers from a script and records what it was asked. */
function stubFetch(
  answers: Array<{ status?: number; body?: unknown; headers?: Record<string, string> }>
) {
  const calls: Array<{ url: string; method: string; headers: Headers; body: unknown }> = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const answer = answers.shift() ?? { body: {} };
    calls.push({
      url: String(url),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: init?.body,
    });
    return new Response(JSON.stringify(answer.body ?? {}), {
      status: answer.status ?? 200,
      headers: { 'content-type': 'application/json', ...(answer.headers ?? {}) },
    });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const provider = (fetch: typeof globalThis.fetch) =>
  new AssemblyAiTranscription({
    apiKey: 'k',
    baseUrl: 'https://example.test/v2',
    fetch,
  });

describe('Submitting audio', () => {
  it('uploads the bytes and starts a job against them', async () => {
    const { fetch, calls } = stubFetch([
      { body: { upload_url: 'https://cdn.example.test/u/1' } },
      { body: { id: 'job-x', status: 'queued' } },
    ]);

    const id = await provider(fetch).submit(Buffer.from('opus'), {
      languageDetection: true,
      diarize: true,
    });

    expect(id).toBe('job-x');
    expect(calls[0].url).toBe('https://example.test/v2/upload');
    // Raw bytes, not multipart, and not a presigned URL out of the bucket:
    // what is in the bucket is ungated and is not ours to send.
    expect(calls[0].headers.get('content-type')).toBe('application/octet-stream');
    // No `Bearer` — this API takes the key bare, and prefixing it is a 401
    // that reads like a bad key.
    expect(calls[0].headers.get('authorization')).toBe('k');

    const started = JSON.parse(String(calls[1].body));
    expect(started.audio_url).toBe('https://cdn.example.test/u/1');
    // The two decisions in this request. Labels are asked for on every stem —
    // not to tell participants apart, which the stems already answer, but
    // because how many voices are inside one stem is not something this system
    // can declare in advance. The models are named because the provider's own
    // default is an older pair.
    expect(started.speaker_labels).toBe(true);
    expect(started.speech_models).toEqual(ASSEMBLYAI_MODELS);
    expect(started.speech_model).toBeUndefined();
    expect(started.language_detection).toBe(true);
  });

  it('carries the status and any Retry-After when the provider refuses', async () => {
    const { fetch } = stubFetch([
      { status: 429, body: { error: 'slow down' }, headers: { 'retry-after': '30' } },
    ]);

    const failed = await provider(fetch)
      .submit(Buffer.from('opus'), { languageDetection: true, diarize: true })
      .catch((error: unknown) => error as TranscriptionError);

    expect(failed).toBeInstanceOf(TranscriptionError);
    expect((failed as TranscriptionError).status).toBe(429);
    expect((failed as TranscriptionError).retryAfterMs).toBe(30_000);
  });
});

describe('Polling', () => {
  it('reports a queued job as pending rather than throwing', async () => {
    const { fetch } = stubFetch([{ body: { status: 'processing' } }]);
    expect(await provider(fetch).poll('job-x')).toEqual({ state: 'pending' });
  });

  it('reports a failed job as a value, so one stem can fail alone', async () => {
    const { fetch } = stubFetch([
      { body: { status: 'error', error: 'audio_too_short' } },
    ]);
    expect(await provider(fetch).poll('job-x')).toEqual({
      state: 'failed',
      error: 'audio_too_short',
    });
  });

  it('makes lines out of words, which is what comes back with no diarisation', async () => {
    const { fetch } = stubFetch([
      {
        body: {
          status: 'completed',
          language_code: 'es',
          words: [
            { start: 1000, end: 1200, text: 'this', confidence: 0.9 },
            { start: 1200, end: 1500, text: 'sentence', confidence: 0.8 },
            // A gap wider than LINE_GAP_MS, so a second line.
            { start: 4000, end: 4300, text: 'then', confidence: 0.5 },
          ],
        },
      },
    ]);

    const answered = await provider(fetch).poll('job-x');

    expect(answered).toMatchObject({
      state: 'ready',
      // Per speaker, which is what one job per stem buys.
      languageCode: 'es',
      utterances: [
        { startMs: 1000, endMs: 1500, text: 'this sentence' },
        { startMs: 4000, endMs: 4300, text: 'then', confidence: 0.5 },
      ],
    });
    // The mean of the words in the line, which is the number a bleed floor
    // would eventually read.
    const [first] = (answered as { utterances: Array<{ confidence: number }> })
      .utterances;
    expect(first.confidence).toBeCloseTo(0.85);
  });

  it('prefers the provider’s own grouping if it ever sends one', async () => {
    const { fetch } = stubFetch([
      {
        body: {
          status: 'completed',
          utterances: [{ start: 10, end: 20, text: 'grouped', confidence: 0.7 }],
          words: [{ start: 10, end: 20, text: 'grouped', confidence: 0.7 }],
        },
      },
    ]);

    const answered = await provider(fetch).poll('job-x');
    expect(answered).toMatchObject({
      utterances: [{ text: 'grouped', startMs: 10, endMs: 20 }],
    });
  });

  it('deletes by id, which is the promise the privacy page makes', async () => {
    const { fetch, calls } = stubFetch([{ body: {} }]);
    await provider(fetch).forget('job x/1');
    expect(calls[0].method).toBe('DELETE');
    // Encoded rather than interpolated: an id is the provider's to shape.
    expect(calls[0].url).toBe('https://example.test/v2/transcript/job%20x%2F1');
  });
});

describe('Making lines out of words', () => {
  const word = (start: number, end: number, text: string, confidence = 0.9) => ({
    start,
    end,
    text,
    confidence,
  });

  it('keeps words together across a gap shorter than the threshold', () => {
    const lines = intoLines([
      word(0, 100, 'a'),
      word(100 + LINE_GAP_MS - 1, 900, 'b'),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('a b');
  });

  it('leaves nothing behind for audio with no speech in it', () => {
    // A participant who barely spoke — which is the case that also defeats
    // language detection, and the one a confidence floor exists for.
    expect(intoLines([])).toEqual([]);
    expect(intoLines([word(0, 0, '   ')])).toEqual([]);
  });

  it('breaks on a change of voice, whatever the timing says', () => {
    // Two speakers in one line is the one join that cannot be undone later,
    // and it is the case this exists for: a stem carrying a second voice is
    // either played media or somebody who should not be on this microphone.
    const lines = intoLines([
      { start: 0, end: 100, text: 'mine', speaker: 'A' },
      { start: 110, end: 200, text: 'yours', speaker: 'B' },
      { start: 210, end: 300, text: 'again', speaker: 'B' },
    ]);
    expect(lines.map((l) => [l.speaker, l.text])).toEqual([
      ['A', 'mine'],
      ['B', 'yours again'],
    ]);
  });

  it('carries no speaker when the provider labelled none', () => {
    expect(intoLines([word(0, 10, 'a')])[0].speaker).toBeNull();
  });

  it('says nothing about confidence when the provider did not', () => {
    const lines = intoLines([{ start: 0, end: 10, text: 'a' }]);
    expect(lines[0].confidence).toBeNull();
  });
});

describe('The memory double', () => {
  it('is a whole lifecycle without a network', async () => {
    const memory = new MemoryTranscription();
    const id = await memory.submit(Buffer.from('opus'), {
      languageDetection: true,
      diarize: true,
    });

    expect(await memory.poll(id)).toEqual({ state: 'pending' });

    memory.ready(id, [
      { startMs: 0, endMs: 500, text: 'hello', confidence: 0.99, speaker: 'A' },
    ]);
    expect(await memory.poll(id)).toMatchObject({ state: 'ready' });

    await memory.forget(id);
    expect(memory.forgotten).toEqual([id]);
    expect(memory.submitted[0].audio.toString()).toBe('opus');
  });

  it('can fail a submission and a job independently', async () => {
    const memory = new MemoryTranscription();
    const id = await memory.submit(Buffer.from('a'), {
      languageDetection: false,
      diarize: true,
    });
    memory.fails(id, 'audio_too_short');
    expect(await memory.poll(id)).toEqual({
      state: 'failed',
      error: 'audio_too_short',
    });

    memory.refuseSubmissions('no balance');
    await expect(
      memory.submit(Buffer.from('b'), { languageDetection: false, diarize: true })
    ).rejects.toThrow('no balance');
  });
});
