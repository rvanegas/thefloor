import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { MemoryRecordingStore } from '../src/storage';
import { MemoryTranscription } from '../src/transcription';

/**
 * The four routes, and the field on the wire.
 *
 * What is worth asserting here is the guard rather than the machinery, which
 * `transcripts.test.ts` covers: who may ask for a transcript is a different
 * rule from who may export one, and getting it wrong is not a bug anybody
 * would notice from the outside until it mattered.
 */

let app: App;
let store: MemoryRecordingStore;
let provider: MemoryTranscription;
let dir: string;
let clock = 1_700_000_000_000;

const RECORDING = 'rec_1';
const CHANNEL = 'chan_1';

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'thefloor-transcript-routes-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function tone(name: string): Promise<Buffer> {
  const path = join(dir, name);
  await new Promise<void>((resolve, reject) => {
    const child = spawn('ffmpeg', [
      '-v', 'error', '-f', 'lavfi',
      '-i', 'sine=frequency=440:duration=2:sample_rate=48000',
      '-c:a', 'libopus', '-y', path,
    ]);
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))
    );
  });
  return readFile(path);
}

function build(withProvider = true) {
  store = new MemoryRecordingStore();
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    store,
    transcription: withProvider ? provider : undefined,
    now: () => clock,
  });
}

const signIn = async (identifier: string, displayName: string) => {
  const code = app.accounts.issueCode(identifier, clock)!;
  const res = await app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, displayName },
  });
  return res.json() as { token: string; account: { id: string } };
};

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

function fileRecording(initiator: string, invitee: string, names: Record<string, string>) {
  app.db
    .prepare(
      `INSERT INTO channels (id, initiator_id, invitee_id, created_at, participants)
       VALUES (?,?,?,?,?)`
    )
    .run(CHANNEL, initiator, invitee, clock, JSON.stringify([initiator, invitee]));
  app.db
    .prepare(
      `INSERT INTO recordings (id, channel_id, initiator_id, invitee_id,
         participants, participant_names, name, started_at, duration_ms,
         s3_key, segment_keys, stems, floor_timeline, ended_at, mix_state)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'ready')`
    )
    .run(
      RECORDING, CHANNEL, initiator, invitee,
      JSON.stringify([initiator, invitee]), JSON.stringify(names),
      // Decided when the run stopped, the same for everybody in it — which is
      // what a search result should name it by.
      'Book club',
      clock, 5_000, '', '[]',
      JSON.stringify({ [initiator]: ['a.ogg'], [invitee]: ['b.ogg'] }),
      '[]', clock + 5_000
    );
}

beforeEach(async () => {
  provider = new MemoryTranscription();
  build();
  store.put('a.ogg', await tone('a.ogg'));
  store.put('b.ogg', await tone('b.ogg'));
});

afterEach(async () => {
  app.transcripts.stop();
  app.channels.stop();
  await app.fastify.close();
});

/** Two signed-in members of one channel with one recording in it. */
async function room() {
  const alice = await signIn('alice@example.com', 'Alice');
  const bob = await signIn('bob@example.com', 'Bob');
  fileRecording(alice.account.id, bob.account.id, {
    [alice.account.id]: 'Alice',
    [bob.account.id]: 'Bob',
  });
  return { alice, bob };
}

const ask = (token: string, method: 'POST' | 'DELETE' = 'POST') =>
  app.fastify.inject({
    method,
    url: `/recordings/${RECORDING}/transcript`,
    headers: auth(token),
  });

const read = (token: string, url = `/recordings/${RECORDING}/transcript`) =>
  app.fastify.inject({ method: 'GET', url, headers: auth(token) });

/** Answers every open job, so the transcript is ready to be read. */
async function complete(text: Record<string, string>) {
  const identities = Object.keys(text);
  for (const [n, job] of provider.submitted.entries()) {
    provider.ready(
      job.id,
      [
        {
          startMs: n * 1_000,
          endMs: n * 1_000 + 900,
          text: text[identities[n]],
          confidence: 0.9,
          speaker: 'A',
        },
      ],
      'en'
    );
  }
  // Past every job's backoff, so the next tick actually polls.
  clock += 120_000;
  await app.transcripts.tick();
}

describe('asking for one', () => {
  it('starts it for a member of the channel', async () => {
    const { alice } = await room();

    const answered = await ask(alice.token);
    await app.transcripts.settled();

    expect(answered.statusCode).toBe(200);
    expect(provider.submitted).toHaveLength(2);
  }, 60_000);

  it('refuses a second one, since the first one cost money', async () => {
    const { alice, bob } = await room();
    await ask(alice.token);
    await app.transcripts.settled();

    const again = await ask(bob.token);
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toMatch(/already has a transcript/i);
  }, 60_000);

  it('tells a stranger the recording does not exist', async () => {
    await room();
    const carol = await signIn('carol@example.com', 'Carol');

    // Absent, deleted and not-yours are one answer: that a recording exists is
    // itself something only the channel's members learn.
    const answered = await ask(carol.token);
    expect(answered.statusCode).toBe(404);
    expect(provider.submitted).toHaveLength(0);
  });

  it('refuses an unauthenticated caller', async () => {
    await room();
    const answered = await app.fastify.inject({
      method: 'POST',
      url: `/recordings/${RECORDING}/transcript`,
    });
    expect(answered.statusCode).toBe(401);
  });

  it('answers 503 when this server has no provider', async () => {
    build(false);
    store.put('a.ogg', await tone('a.ogg'));
    store.put('b.ogg', await tone('b.ogg'));
    const { alice } = await room();

    const answered = await ask(alice.token);
    expect(answered.statusCode).toBe(503);
  });
});

describe('reading one', () => {
  it('returns the lines in the order they were said', async () => {
    const { alice, bob } = await room();
    await ask(alice.token);
    await app.transcripts.settled();
    await complete({
      [alice.account.id]: 'first thing',
      [bob.account.id]: 'second thing',
    });

    const answered = await read(bob.token);
    const body = answered.json();

    expect(answered.statusCode).toBe(200);
    expect(body.state).toBe('ready');
    // Never anonymous: asking sent everybody's audio to a third party.
    expect(body.requestedBy).toMatchObject({ displayName: 'Alice' });
    expect(body.lines.map((l: { text: string }) => l.text)).toEqual([
      'first thing',
      'second thing',
    ]);
    // Names frozen when the run was filed, like everything else about it.
    expect(body.lines[0].displayName).toBe('Alice');
  }, 60_000);

  it('is a 404 to somebody who is not in the channel', async () => {
    const { alice } = await room();
    await ask(alice.token);
    await app.transcripts.settled();
    const carol = await signIn('carol@example.com', 'Carol');

    expect((await read(carol.token)).statusCode).toBe(404);
  }, 60_000);

  it('is a 404 when the recording has no transcript', async () => {
    const { alice } = await room();
    // Whether a recording has been transcribed is the same kind of fact as
    // whether it exists, and gets the same answer.
    expect((await read(alice.token)).statusCode).toBe(404);
  });
});

describe('a guest who spoke in it', () => {
  const GUEST = 'guest_abc';

  it('is named the way the recording named them, not by their id', async () => {
    // A guest resolves to nothing in `accounts` by construction, so a
    // transcript that looked them up live would label them "Someone" — or, if
    // it fell back to the identity, print a raw session id at everybody. What
    // saves it is that `participant_names` already froze their display name
    // when the run was filed, exactly as it does for a member.
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    app.db
      .prepare(
        `INSERT INTO channels (id, initiator_id, invitee_id, created_at, participants)
         VALUES (?,?,?,?,?)`
      )
      .run(
        CHANNEL, alice.account.id, bob.account.id, clock,
        JSON.stringify([alice.account.id, bob.account.id])
      );
    app.db
      .prepare(
        `INSERT INTO recordings (id, channel_id, initiator_id, invitee_id,
           participants, participant_names, started_at, duration_ms, s3_key,
           segment_keys, stems, floor_timeline, ended_at, mix_state)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'ready')`
      )
      .run(
        RECORDING, CHANNEL, alice.account.id, bob.account.id,
        JSON.stringify([alice.account.id, bob.account.id]),
        JSON.stringify({
          [alice.account.id]: 'Alice',
          [GUEST]: 'Sam from the podcast',
        }),
        clock, 5_000, '', '[]',
        JSON.stringify({ [alice.account.id]: ['a.ogg'], [GUEST]: ['b.ogg'] }),
        '[]', clock + 5_000
      );

    await ask(alice.token);
    await app.transcripts.settled();
    // The guest's stem is a job like anybody's — being a guest is not a reason
    // to leave somebody out of the record of what was said.
    expect(provider.submitted).toHaveLength(2);
    await complete({
      [alice.account.id]: 'thanks for coming',
      [GUEST]: 'glad to be here',
    });

    const body = (await read(alice.token)).json();
    const guestLine = body.lines.find(
      (l: { identity: string }) => l.identity === GUEST
    );
    expect(guestLine.displayName).toBe('Sam from the podcast');
    expect(guestLine.displayName).not.toContain('guest_');
  }, 60_000);
});

describe('the file it exports', () => {
  const exportUrl = (format?: string) =>
    `/recordings/${RECORDING}/transcript/export${format ? `?format=${format}` : ''}`;

  beforeEach(async () => {
    const { alice, bob } = await room();
    await ask(alice.token);
    await app.transcripts.settled();
    await complete({
      [alice.account.id]: 'first thing',
      [bob.account.id]: 'second thing',
    });
  });

  it('reads as prose by default', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const answered = await read(alice.token, exportUrl());

    expect(answered.headers['content-type']).toContain('text/plain');
    expect(answered.headers['content-disposition']).toContain(`${RECORDING}.txt`);
    expect(answered.body).toContain('[00:00:00] Alice: first thing');
    expect(answered.body).toContain('[00:00:01] Bob: second thing');
  }, 60_000);

  it('pairs with the audio as WebVTT', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const answered = await read(alice.token, exportUrl('vtt'));

    expect(answered.headers['content-type']).toContain('text/vtt');
    expect(answered.body.startsWith('WEBVTT')).toBe(true);
    // The recording's timeline, not an offset into anybody's stem — which is
    // what rendering the stems with their delays in place bought.
    expect(answered.body).toContain('00:00:00.000 --> 00:00:00.900');
    expect(answered.body).toContain('<v Alice>first thing');
  }, 60_000);

  it('carries the labels and the confidence as JSON', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const answered = await read(alice.token, exportUrl('json'));

    const lines = answered.json() as Array<Record<string, unknown>>;
    expect(answered.headers['content-type']).toContain('application/json');
    expect(lines[0]).toMatchObject({
      text: 'first thing',
      displayName: 'Alice',
      speaker: 'A',
      confidence: 0.9,
    });
  }, 60_000);

  it('refuses a format it does not have', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    expect((await read(alice.token, exportUrl('srt'))).statusCode).toBe(400);
  }, 60_000);
});

describe('deleting one', () => {
  it('removes the text and leaves the recording alone', async () => {
    const { alice, bob } = await room();
    await ask(alice.token);
    await app.transcripts.settled();
    await complete({
      [alice.account.id]: 'said once',
      [bob.account.id]: 'and again',
    });
    provider.forgotten.length = 0;

    const answered = await ask(bob.token, 'DELETE');

    expect(answered.statusCode).toBe(200);
    expect((await read(alice.token)).statusCode).toBe(404);
    // The recording itself is untouched.
    expect(
      app.db.prepare('SELECT deleted_at FROM recordings WHERE id = ?').get(RECORDING)
    ).toMatchObject({ deleted_at: null });
    // And the provider is told again, because the first telling can fail.
    expect(provider.forgotten).toHaveLength(2);
  }, 60_000);

  it('is a 404 when there is nothing to delete', async () => {
    const { alice } = await room();
    expect((await ask(alice.token, 'DELETE')).statusCode).toBe(404);
  });

  it('may be asked for again afterwards, and costs again', async () => {
    const { alice } = await room();
    await ask(alice.token);
    await app.transcripts.settled();
    await ask(alice.token, 'DELETE');

    const again = await ask(alice.token);
    await app.transcripts.settled();

    expect(again.statusCode).toBe(200);
    expect(provider.submitted).toHaveLength(4);
  }, 60_000);
});

describe('searching a channel', () => {
  const search = (token: string, q: string) =>
    app.fastify.inject({
      method: 'GET',
      url: `/channels/${CHANNEL}/transcripts/search?q=${encodeURIComponent(q)}`,
      headers: auth(token),
    });

  beforeEach(async () => {
    const { alice, bob } = await room();
    await ask(alice.token);
    await app.transcripts.settled();
    await complete({
      [alice.account.id]: 'the part about the badgers',
      [bob.account.id]: 'and then the owls arrived',
    });
  });

  it('finds a line and says which recording and who said it', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const answered = await search(alice.token, 'owls');

    expect(answered.statusCode).toBe(200);
    expect(answered.json().hits).toEqual([
      expect.objectContaining({
        text: 'and then the owls arrived',
        recordingId: RECORDING,
        recordingName: 'Book club',
        displayName: 'Bob',
      }),
    ]);
  }, 60_000);

  it('finds nothing for a word nobody said', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    expect((await search(alice.token, 'penguins')).json().hits).toEqual([]);
  }, 60_000);

  it('answers nothing rather than everything for an empty query', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    expect((await search(alice.token, '   ')).json().hits).toEqual([]);
  }, 60_000);

  it('survives punctuation that would be query syntax', async () => {
    // Searched as a phrase, so an apostrophe or a bare AND is text rather than
    // an expression the index refuses to parse.
    const alice = await signIn('alice@example.com', 'Alice');
    for (const q of ['"', "owls' ", 'AND', 'badgers OR owls', '*']) {
      const answered = await search(alice.token, q);
      expect(answered.statusCode).toBe(200);
    }
  }, 60_000);

  it('is a 404 to somebody who is not in the channel', async () => {
    const carol = await signIn('carol@example.com', 'Carol');
    expect((await search(carol.token, 'owls')).statusCode).toBe(404);
  }, 60_000);

  it('stops finding a transcript somebody deleted', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    expect((await search(alice.token, 'owls')).json().hits).toHaveLength(1);

    await ask(alice.token, 'DELETE');

    expect((await search(alice.token, 'owls')).json().hits).toEqual([]);
  }, 60_000);

  it('stops finding a recording the sweep has removed', async () => {
    // The trap this whole index has: a foreign key cascade does not fire
    // triggers unless recursive_triggers is on, so without that pragma the
    // rows would go and every word of them would stay findable. A deleted
    // conversation that can still be searched for is worse than no index.
    const alice = await signIn('alice@example.com', 'Alice');
    app.db.prepare('DELETE FROM recordings WHERE id = ?').run(RECORDING);

    expect((await search(alice.token, 'owls')).json().hits).toEqual([]);
    expect(
      app.db.prepare('SELECT COUNT(*) AS n FROM transcript_lines').get()
    ).toMatchObject({ n: 0 });
  }, 60_000);
});

describe('what the recordings list carries', () => {
  // Recordings reach a client on the Home snapshot rather than a route of
  // their own, so this is where the field has to be right.
  const listed = async (token: string) => {
    const answered = await app.fastify.inject({
      method: 'GET',
      url: '/home',
      headers: auth(token),
    });
    return (answered.json().recordings ?? []).find(
      (row: { id: string }) => row.id === RECORDING
    );
  };

  it('offers one before anybody asks, and names who would be sent it', async () => {
    // 'none' rather than nothing. Absent is reserved for a server that cannot
    // transcribe — collapsing the two leaves a server that can looking exactly
    // like one that cannot until the first transcript exists, so the button
    // that would start one never appears.
    const { alice } = await room();
    expect((await listed(alice.token)).transcript).toEqual({
      state: 'none',
      provider: provider.name,
      requestedBy: null,
    });
  });

  it('says who asked, and that it is being made', async () => {
    const { alice, bob } = await room();
    await ask(alice.token);
    await app.transcripts.settled();

    expect((await listed(bob.token)).transcript).toMatchObject({
      state: 'pending',
      requestedBy: { displayName: 'Alice' },
    });
  }, 60_000);

  it('says how many speakers produced nothing', async () => {
    // Ready when *any* speaker did, so a card that only said "ready" would
    // present a conversation with somebody missing as though it were whole.
    const { alice, bob } = await room();
    await ask(alice.token);
    await app.transcripts.settled();
    provider.ready(provider.submitted[0].id, [
      { startMs: 0, endMs: 100, text: 'only me', confidence: 0.9, speaker: 'A' },
    ]);
    provider.fails(provider.submitted[1].id, 'audio_too_short');
    clock += 120_000;
    await app.transcripts.tick();

    expect((await listed(bob.token)).transcript).toMatchObject({
      state: 'ready',
      missing: 1,
    });
  }, 60_000);

  it('says nothing on a server that cannot transcribe', async () => {
    build(false);
    const { alice } = await room();
    expect((await listed(alice.token)).transcript).toBeUndefined();
  });
});
