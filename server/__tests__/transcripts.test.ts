import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type Db } from '../src/db';
import { MemoryRecordingStore } from '../src/storage';
import { MemoryTranscription, type Utterance } from '../src/transcription';
import { Transcripts } from '../src/transcripts';
import { UsageMeter } from '../src/usage';

/**
 * The job runner, against the memory provider — no network and no key, which
 * is the whole reason the provider is an interface.
 *
 * These drive `tick` rather than a timer. What is being tested is a state
 * machine that has to survive a process stopping in the middle of it, and a
 * wall clock turns every one of those assertions into a race.
 */

const ALICE = 'acct_alice';
const BOB = 'acct_bob';
const CHANNEL = 'chan_1';
const RECORDING = 'rec_1';

let db: Db;
let store: MemoryRecordingStore;
let provider: MemoryTranscription;
let transcripts: Transcripts;
let clock = 1_700_000_000_000;
let dir: string;
let errors: Array<{ error: unknown; context: string }>;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'thefloor-transcripts-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Real Opus, because encodeStem runs real ffmpeg over it. */
async function tone(name: string, seconds: number): Promise<Buffer> {
  const path = join(dir, name);
  await new Promise<void>((resolve, reject) => {
    const child = spawn('ffmpeg', [
      '-v', 'error', '-f', 'lavfi',
      '-i', `sine=frequency=440:duration=${seconds}:sample_rate=48000`,
      '-c:a', 'libopus', '-y', path,
    ]);
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))
    );
  });
  return readFile(path);
}

function makeRecording(stems: Record<string, string[]>, timeline: unknown[] = []) {
  const account = db.prepare(
    `INSERT INTO accounts (id, identifier, display_name, created_at)
     VALUES (?, ?, ?, ?)`
  );
  account.run(ALICE, 'a@example.com', 'Alice', clock);
  account.run(BOB, 'b@example.com', 'Bob', clock);
  db.prepare(
    `INSERT INTO channels (id, initiator_id, invitee_id, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(CHANNEL, ALICE, BOB, clock);
  db.prepare(
    `INSERT INTO recordings
       (id, channel_id, initiator_id, invitee_id, started_at, duration_ms,
        s3_key, stems, floor_timeline, ended_at, mix_state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready')`
  ).run(
    RECORDING, CHANNEL, ALICE, BOB, clock, 4_000, 'a.ogg',
    JSON.stringify(stems), JSON.stringify(timeline), clock + 4_000
  );
}

const line = (text: string, startMs = 0, speaker: string | null = 'A'): Utterance => ({
  startMs,
  endMs: startMs + 500,
  text,
  confidence: 0.9,
  speaker,
});

const lines = () =>
  db
    .prepare(
      'SELECT identity, text, speaker, start_ms FROM transcript_lines ORDER BY identity, start_ms'
    )
    .all() as unknown as Array<Record<string, unknown>>;

const transcript = () =>
  db.prepare('SELECT * FROM transcripts WHERE recording_id = ?').get(RECORDING) as
    | Record<string, unknown>
    | undefined;

const jobs = () =>
  db
    .prepare('SELECT * FROM transcript_jobs ORDER BY identity')
    .all() as unknown as Array<Record<string, unknown>>;

function build(withProvider = true) {
  transcripts = new Transcripts({
    db,
    usage: new UsageMeter(db, () => clock),
    provider: withProvider ? provider : undefined,
    store,
    now: () => clock,
    onError: (error, context) => errors.push({ error, context }),
  });
}

beforeEach(async () => {
  clock = 1_700_000_000_000;
  errors = [];
  db = openDb(':memory:');
  store = new MemoryRecordingStore();
  provider = new MemoryTranscription();
  store.put('a.ogg', await tone('a.ogg', 4));
  store.put('b.ogg', await tone('b.ogg', 4));
  store.put('media.ogg', await tone('media.ogg', 4));
  build();
});

afterEach(() => {
  transcripts.stop();
  db.close();
});

describe('asking for a transcript', () => {
  it('opens one job per speaker and submits each one', async () => {
    makeRecording({ [ALICE]: ['a.ogg'], [BOB]: ['b.ogg'] });

    await transcripts.request(RECORDING, ALICE);
    await transcripts.settled();

    expect(transcript()).toMatchObject({
      state: 'pending',
      requested_by: ALICE,
      provider: provider.name,
      // The ceiling: two stems, neither longer than the recording.
      billed_ms: 8_000,
    });
    expect(jobs().map((j) => j.identity)).toEqual([ALICE, BOB]);
    expect(jobs().every((j) => j.provider_id)).toBe(true);
    expect(provider.submitted).toHaveLength(2);
    // Every stem is diarised — not to tell Alice from Bob, who are never in
    // the same file, but because a stem may hold more than one voice.
    expect(provider.submitted.every((s) => s.diarize)).toBe(true);
    // And nothing was swallowed on the way: onError is where a failure nobody
    // is waiting on goes, so an empty log is part of the happy path.
    expect(errors).toEqual([]);
  }, 60_000);

  it('leaves played media out of it', async () => {
    // The media stem is whatever somebody played into the room. Transcribing
    // it would attribute a song's lyrics to a participant who does not exist,
    // and charge for the privilege.
    makeRecording({ [ALICE]: ['a.ogg'], media: ['media.ogg'] });

    await transcripts.request(RECORDING, ALICE);
    await transcripts.settled();

    expect(jobs().map((j) => j.identity)).toEqual([ALICE]);
  }, 60_000);

  it('refuses a recording with nothing but played media in it', async () => {
    makeRecording({ media: ['media.ogg'] });
    await expect(transcripts.request(RECORDING, ALICE)).rejects.toThrow(
      /no speech/i
    );
  });

  it('refuses a second one, because the first one cost money', async () => {
    makeRecording({ [ALICE]: ['a.ogg'] });
    await transcripts.request(RECORDING, ALICE);
    await transcripts.settled();

    await expect(transcripts.request(RECORDING, BOB)).rejects.toThrow(
      /already has a transcript/i
    );
  }, 60_000);

  it('is unavailable, and refuses, without a provider', async () => {
    build(false);
    makeRecording({ [ALICE]: ['a.ogg'] });

    expect(transcripts.available()).toBe(false);
    await expect(transcripts.request(RECORDING, ALICE)).rejects.toThrow(
      /not configured/i
    );
  });
});

describe('collecting the text', () => {
  beforeEach(async () => {
    makeRecording({ [ALICE]: ['a.ogg'], [BOB]: ['b.ogg'] });
    await transcripts.request(RECORDING, ALICE);
    await transcripts.settled();
  });

  /** Moves past every job's backoff, so the next tick actually polls. */
  const later = () => {
    clock += 120_000;
  };

  it('records what the provider says it processed, not an estimate', async () => {
    const [first, second] = provider.submitted;
    // 90 and 30 seconds: nothing like the 4-second stems or the 4-second
    // recording, so an estimate could not produce this number by accident.
    provider.ready(first.id, [line('a')], 'en', 90_000);
    provider.ready(second.id, [line('b')], 'en', 30_000);
    later();

    await transcripts.tick();

    expect(transcript()).toMatchObject({
      billed_ms: 120_000,
      billed_exact: 1,
    });
  });

  it('keeps an unmeasured job on its share of the estimate', async () => {
    // A transcript that looks free because the one thing that went wrong was
    // the measuring is worse than one that says it is still estimating.
    const [first, second] = provider.submitted;
    provider.ready(first.id, [line('a')], 'en', 90_000);
    provider.fails(second.id, 'nope');
    later();

    await transcripts.tick();

    // The stem was rendered and measured on the way out even though the job
    // then failed, so this is still a real number — 4 seconds of tone.
    const [alice, bob] = jobs();
    expect(alice.billed_ms).toBe(90_000);
    expect(bob.billed_ms).toBeGreaterThan(3_000);
    expect(transcript()).toMatchObject({ billed_exact: 1 });
  });

  it('stores the lines and finishes once every job has landed', async () => {
    const [first, second] = provider.submitted;
    provider.ready(first.id, [line('hello there')], 'en');
    provider.ready(second.id, [line('and hello back', 1_000)], 'es');
    later();

    await transcripts.tick();

    expect(transcript()).toMatchObject({ state: 'ready', failure: null });
    expect(lines()).toEqual([
      { identity: ALICE, text: 'hello there', speaker: 'A', start_ms: 0 },
      { identity: BOB, text: 'and hello back', speaker: 'A', start_ms: 1_000 },
    ]);
    // Per speaker, which is what one job per stem buys.
    expect(jobs().map((j) => j.language)).toEqual(['en', 'es']);
    // And the promise the privacy page makes, kept as soon as it can be.
    expect(provider.forgotten.sort()).toEqual([first.id, second.id].sort());
  });

  it('waits, quietly, while the provider is still working', async () => {
    later();
    await transcripts.tick();

    expect(transcript()).toMatchObject({ state: 'pending' });
    expect(lines()).toEqual([]);
    expect(provider.forgotten).toEqual([]);
  });

  it('lets one stem fail while the rest of the transcript stands', async () => {
    // A transcript missing one speaker is worth far more than no transcript,
    // and the job row says which one is missing and why.
    const [first, second] = provider.submitted;
    provider.ready(first.id, [line('still here')]);
    provider.fails(second.id, 'audio_too_short');
    later();

    await transcripts.tick();

    expect(transcript()).toMatchObject({ state: 'ready' });
    expect(lines()).toHaveLength(1);
    expect(jobs().map((j) => [j.state, j.failure])).toEqual([
      ['ready', null],
      ['failed', 'audio_too_short'],
    ]);
    // Nothing is left with the provider either way.
    expect(provider.forgotten.sort()).toEqual([first.id, second.id].sort());
  });

  it('fails the transcript only when no speaker produced anything', async () => {
    for (const job of provider.submitted) provider.fails(job.id, 'nope');
    later();

    await transcripts.tick();

    expect(transcript()).toMatchObject({ state: 'failed', failure: 'nope' });
  });

  it('may be asked for again once it has failed, and replaces it', async () => {
    for (const job of provider.submitted) provider.fails(job.id, 'nope');
    later();
    await transcripts.tick();

    await transcripts.request(RECORDING, BOB);
    await transcripts.settled();

    expect(transcript()).toMatchObject({ state: 'pending', requested_by: BOB });
    expect(jobs()).toHaveLength(2);
    expect(provider.submitted).toHaveLength(4);
  }, 60_000);

  it('does not poll a job again until its backoff has passed', async () => {
    // Otherwise a tick every few seconds is a poll every few seconds per job,
    // which is how a provider starts answering 429.
    provider.ready(provider.submitted[0].id, [line('ready now')]);
    await transcripts.tick();

    expect(lines()).toEqual([]);

    later();
    await transcripts.tick();
    expect(lines()).toHaveLength(1);
  });
});

describe('surviving a restart', () => {
  it('resumes a job the last process had already paid for', async () => {
    makeRecording({ [ALICE]: ['a.ogg'] });
    await transcripts.request(RECORDING, ALICE);
    await transcripts.settled();
    const submitted = provider.submitted[0].id;

    // A new process over the same database and the same provider, which is
    // what a restart is. The provider's id is on the row, so the audio is not
    // uploaded — and paid for — a second time.
    build();
    transcripts.restore();
    provider.ready(submitted, [line('said before the restart')]);
    clock += 120_000;
    await transcripts.tick();

    expect(provider.submitted).toHaveLength(1);
    expect(transcript()).toMatchObject({ state: 'ready' });
    expect(lines()).toHaveLength(1);
  }, 60_000);

  it('submits a job the last process had not got to', async () => {
    makeRecording({ [ALICE]: ['a.ogg'] });
    // A row with no provider id: the process stopped between opening the job
    // and handing the audio over.
    db.prepare(
      `INSERT INTO transcripts
         (recording_id, state, requested_by, requested_at, provider)
       VALUES (?, 'pending', ?, ?, ?)`
    ).run(RECORDING, ALICE, clock, provider.name);
    db.prepare(
      `INSERT INTO transcript_jobs (id, recording_id, identity, state)
       VALUES ('job_row', ?, ?, 'pending')`
    ).run(RECORDING, ALICE);

    transcripts.restore();
    await transcripts.settled();

    expect(provider.submitted).toHaveLength(1);
    expect(jobs()[0].provider_id).toBeTruthy();
  }, 60_000);
});

describe('deleting', () => {
  it('takes the text with it and asks the provider to forget the rest', async () => {
    makeRecording({ [ALICE]: ['a.ogg'] });
    await transcripts.request(RECORDING, ALICE);
    await transcripts.settled();
    const submitted = provider.submitted[0].id;
    provider.ready(submitted, [line('on the record')]);
    clock += 120_000;
    await transcripts.tick();
    provider.forgotten.length = 0;

    transcripts.deleteFor(RECORDING);

    expect(transcript()).toBeUndefined();
    expect(lines()).toEqual([]);
    expect(jobs()).toEqual([]);
    // Belt and braces: forget() ran when the text landed, and runs again here,
    // because the first one can fail and nobody would notice.
    expect(provider.forgotten).toEqual([submitted]);
  }, 60_000);

  it('drops a transcript whose recording went while it was in flight', async () => {
    makeRecording({ [ALICE]: ['a.ogg'] });
    await transcripts.request(RECORDING, ALICE);
    await transcripts.settled();
    const submitted = provider.submitted[0].id;

    db.prepare('UPDATE recordings SET deleted_at = ? WHERE id = ?').run(
      clock,
      RECORDING
    );
    provider.ready(submitted, [line('deleted underneath')]);
    clock += 120_000;
    await transcripts.tick();

    // No text is written for a recording that no longer exists, and the
    // provider is told to drop what it has.
    expect(lines()).toEqual([]);
    expect(transcript()).toBeUndefined();
    expect(provider.forgotten).toContain(submitted);
  }, 60_000);
});

describe('sweeping', () => {
  it('drops the transcript of a deleted recording, and asks the provider', async () => {
    makeRecording({ [ALICE]: ['a.ogg'] });
    await transcripts.request(RECORDING, ALICE);
    await transcripts.settled();
    const submitted = provider.submitted[0].id;
    provider.ready(submitted, [line('said once')]);
    clock += 120_000;
    await transcripts.tick();
    provider.forgotten.length = 0;

    // A deletion is a mark; the row survives it for about a week. That week is
    // the window this runs in.
    db.prepare('UPDATE recordings SET deleted_at = ? WHERE id = ?').run(
      clock,
      RECORDING
    );
    await transcripts.tick();

    expect(transcript()).toBeUndefined();
    expect(lines()).toEqual([]);
    expect(provider.forgotten).toEqual([submitted]);
  }, 60_000);

  it('never stands between a recording and its own deletion', async () => {
    // Foreign keys are on, so a transcript row pointing at a recording would
    // refuse the sweep's DELETE outright — a recording nobody could finish
    // deleting because it had once been transcribed.
    makeRecording({ [ALICE]: ['a.ogg'] });
    await transcripts.request(RECORDING, ALICE);
    await transcripts.settled();
    provider.ready(provider.submitted[0].id, [line('on the record')]);
    clock += 120_000;
    await transcripts.tick();
    expect(lines()).toHaveLength(1);

    expect(() =>
      db.prepare('DELETE FROM recordings WHERE id = ?').run(RECORDING)
    ).not.toThrow();
    expect(lines()).toEqual([]);
    expect(jobs()).toEqual([]);
    expect(transcript()).toBeUndefined();
  }, 60_000);
});

describe('a stem that cannot be rendered', () => {
  it('fails its own job and not the others', async () => {
    makeRecording({ [ALICE]: ['a.ogg'], [BOB]: ['missing.ogg'] });

    await transcripts.request(RECORDING, ALICE);
    await transcripts.settled();

    expect(jobs().map((j) => j.state)).toEqual(['pending', 'failed']);
    expect(provider.submitted).toHaveLength(1);
  }, 60_000);
});
