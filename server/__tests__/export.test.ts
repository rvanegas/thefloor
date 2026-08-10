import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp, type App } from '../src/app';
import { buildFilterGraph, encodeRecording } from '../src/export';
import { MemoryMailer } from '../src/mail';
import { MemoryRecordingStore } from '../src/storage';

/**
 * The floor is only real in an export if the audio is actually gone from the
 * file. Most of these therefore measure the *output* rather than asserting on
 * the filter string — a filter graph that looks right and mutes nothing would
 * pass any amount of unit testing and still hand a user words they were never
 * allowed to hear.
 */

const ALICE = 'acct_alice';
const BOB = 'acct_bob';

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let out = '';
    child.stdout.on('data', (c) => (out += String(c)));
    child.stderr.on('data', (c) => (out += String(c)));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 || command.includes('ffmpeg')
        ? resolve(out)
        : reject(new Error(out))
    );
  });
}

/** A steady tone, so silence in the output is unambiguous. */
async function tone(dir: string, name: string, seconds: number, hz: number) {
  const path = join(dir, name);
  await run('ffmpeg', [
    '-v', 'error', '-f', 'lavfi',
    '-i', `sine=frequency=${hz}:duration=${seconds}:sample_rate=48000`,
    '-c:a', 'libopus', '-y', path,
  ]);
  return readFile(path);
}

/** Peak level per second, so a gated window can be located exactly. */
async function peaksPerSecond(data: Buffer, dir: string): Promise<number[]> {
  const ogg = join(dir, 'measure.ogg');
  const wav = join(dir, 'measure.wav');
  await writeFile(ogg, data);
  await run('ffmpeg', ['-v', 'error', '-i', ogg, '-ar', '8000', '-ac', '1', '-y', wav]);

  const buf = await readFile(wav);
  let off = 12;
  while (off < buf.length - 8) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'data') {
      off += 8;
      break;
    }
    off += 8 + size;
  }
  const rate = 8000;
  const total = (buf.length - off) >> 1;
  const peaks: number[] = [];
  for (let s = 0; s < Math.floor(total / rate); s++) {
    let peak = 0;
    for (let i = s * rate; i < (s + 1) * rate; i++) {
      const v = Math.abs(buf.readInt16LE(off + i * 2) / 32768);
      if (v > peak) peak = v;
    }
    peaks.push(20 * Math.log10(peak || 1e-9));
  }
  return peaks;
}

describe('the filter graph', () => {
  it('joins a stem, gates its windows, and mixes both speakers', () => {
    const graph = buildFilterGraph(
      {
        stems: { [ALICE]: ['a1.ogg', 'a2.ogg'], [BOB]: ['b1.ogg'] },
        timeline: [{ identity: BOB, fromMs: 3_000, toMs: 6_000 }],
      },
      new Map([['a1.ogg', 0], ['a2.ogg', 1], ['b1.ogg', 2]])
    );
    expect(graph).not.toBeNull();
    // Alice's two segments are rejoined before anything is gated.
    expect(graph!.filter).toContain('[0:a][1:a]concat=n=2:v=0:a=1');
    // Bob is muted across his window, in seconds rather than milliseconds.
    expect(graph!.filter).toContain("volume=enable='between(t,3.000,6.000)':volume=0");
    // Levels are preserved rather than ducked when both are speaking.
    expect(graph!.filter).toContain('amix=inputs=2:normalize=0');
  });

  it('gates nothing when nobody was silenced', () => {
    const graph = buildFilterGraph(
      { stems: { [ALICE]: ['a1.ogg'] }, timeline: [] },
      new Map([['a1.ogg', 0]])
    );
    expect(graph!.filter).not.toContain('volume=');
  });

  it('refuses a recording with no audio', () => {
    expect(buildFilterGraph({ stems: {}, timeline: [] }, new Map())).toBeNull();
  });
});

describe('the encoded recording', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'thefloor-export-test-'));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('is silent exactly where the speaker held no floor', async () => {
    // The claim this whole design exists for: what was said while silenced must
    // not be in the file a user receives.
    const store = new MemoryRecordingStore();
    store.put('bob.ogg', await tone(dir, 'bob.ogg', 10, 440));

    const { data } = await encodeRecording(
      {
        stems: { [BOB]: ['bob.ogg'] },
        timeline: [{ identity: BOB, fromMs: 3_000, toMs: 7_000 }],
      },
      async (key) => store.get(key)
    );

    const peaks = await peaksPerSecond(data, dir);
    expect(peaks.length).toBeGreaterThanOrEqual(9);
    // Audible before the window.
    expect(peaks[1]).toBeGreaterThan(-20);
    // Gone during it — well below anything a tone could produce.
    for (const s of [4, 5, 6]) expect(peaks[s]).toBeLessThan(-70);
    // Back afterwards.
    expect(peaks[8]).toBeGreaterThan(-20);
  }, 60_000);

  it('leaves the other speaker untouched while one is gated', async () => {
    const store = new MemoryRecordingStore();
    store.put('alice.ogg', await tone(dir, 'alice.ogg', 8, 440));
    store.put('bob.ogg', await tone(dir, 'bob.ogg', 8, 880));

    const { data } = await encodeRecording(
      {
        stems: { [ALICE]: ['alice.ogg'], [BOB]: ['bob.ogg'] },
        timeline: [{ identity: BOB, fromMs: 2_000, toMs: 6_000 }],
      },
      async (key) => store.get(key)
    );

    // Alice is audible throughout, so the mix never goes silent even though
    // Bob is muted for half of it.
    const peaks = await peaksPerSecond(data, dir);
    for (const peak of peaks.slice(0, 7)) expect(peak).toBeGreaterThan(-20);
  }, 60_000);

  it('keeps a stem whole when it was never silenced', async () => {
    const store = new MemoryRecordingStore();
    store.put('alice.ogg', await tone(dir, 'alice.ogg', 6, 440));

    const { data } = await encodeRecording(
      { stems: { [ALICE]: ['alice.ogg'] }, timeline: [] },
      async (key) => store.get(key)
    );
    const peaks = await peaksPerSecond(data, dir);
    for (const peak of peaks.slice(0, 5)) expect(peak).toBeGreaterThan(-20);
  }, 60_000);

  it('joins a paused stem and gates against the joined timeline', async () => {
    // Offsets are positions in the recorded audio, so a window that begins 5s
    // in must land 5s into the *concatenation*, not 5s into either segment.
    const store = new MemoryRecordingStore();
    store.put('b1.ogg', await tone(dir, 'b1.ogg', 4, 440));
    store.put('b2.ogg', await tone(dir, 'b2.ogg', 6, 440));

    const { data } = await encodeRecording(
      {
        stems: { [BOB]: ['b1.ogg', 'b2.ogg'] },
        timeline: [{ identity: BOB, fromMs: 5_000, toMs: 8_000 }],
      },
      async (key) => store.get(key)
    );

    const peaks = await peaksPerSecond(data, dir);
    expect(peaks[1]).toBeGreaterThan(-20); // first segment
    expect(peaks[6]).toBeLessThan(-70); // inside the window, second segment
    expect(peaks[9]).toBeGreaterThan(-20); // after it
  }, 60_000);

  it('refuses a recording with no stems', async () => {
    await expect(
      encodeRecording({ stems: {}, timeline: [] }, async () => Buffer.alloc(0))
    ).rejects.toThrow(/no audio/i);
  });
});


describe('the export endpoint', () => {
  let app: App;
  let store: MemoryRecordingStore;
  let dir: string;
  const clock = 1_700_000_000_000;

  const signIn = async (identifier: string, displayName: string) => {
    const code = app.accounts.issueCode(identifier, clock)!;
    const res = await app.fastify.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { identifier, code, displayName },
    });
    return res.json() as { token: string; account: { id: string } };
  };

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'thefloor-endpoint-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  beforeEach(() => {
    store = new MemoryRecordingStore();
    app = buildApp({
      dbPath: ':memory:',
      mailer: new MemoryMailer(),
      store,
      now: () => clock,
    });
  });

  afterEach(async () => {
    app.sessions.stop();
    await app.fastify.close();
  });

  /** Files a recording row directly; the capture path is tested elsewhere. */
  const fileRecording = (
    id: string,
    initiator: string,
    invitee: string,
    stems: Record<string, string[]>,
    timeline: unknown[] = []
  ) => {
    app.db
      .prepare(
        `INSERT INTO sessions (id, initiator_id, invitee_id, created_at, participants)
         VALUES (?,?,?,?,?)`
      )
      .run('sess_x', initiator, invitee, clock, JSON.stringify([initiator, invitee]));
    app.db
      .prepare(
        `INSERT INTO recordings (id, session_id, initiator_id, invitee_id,
           participants, started_at, duration_ms, s3_key, segment_keys, stems,
           floor_timeline)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        id, 'sess_x', initiator, invitee,
        JSON.stringify([initiator, invitee]), clock, 5_000, '', '[]',
        JSON.stringify(stems), JSON.stringify(timeline)
      );
  };

  it('returns the mixed audio to a participant', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    store.put('a.ogg', await tone(dir, 'ep-a.ogg', 3, 440));
    fileRecording('rec_1', alice.account.id, bob.account.id, {
      [alice.account.id]: ['a.ogg'],
    });

    const response = await app.fastify.inject({
      method: 'GET',
      url: '/recordings/rec_1/export',
      headers: { authorization: `Bearer ${bob.token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('audio/ogg');
    expect(response.rawPayload.length).toBeGreaterThan(1000);
  }, 60_000);

  it('tells a stranger the recording does not exist', async () => {
    // Not 403: that a recording exists is itself something only its
    // participants should be able to learn.
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    const mallory = await signIn('mallory@example.com', 'Mallory');
    store.put('a.ogg', Buffer.from('x'));
    fileRecording('rec_1', alice.account.id, bob.account.id, {
      [alice.account.id]: ['a.ogg'],
    });

    const response = await app.fastify.inject({
      method: 'GET',
      url: '/recordings/rec_1/export',
      headers: { authorization: `Bearer ${mallory.token}` },
    });
    expect(response.statusCode).toBe(404);
  });

  it('refuses an unauthenticated caller', async () => {
    const response = await app.fastify.inject({
      method: 'GET',
      url: '/recordings/rec_1/export',
    });
    expect(response.statusCode).toBe(401);
  });

});
