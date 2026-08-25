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

function build(withProvider = true, transcribeIdentifier?: string) {
  store = new MemoryRecordingStore();
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    store,
    transcription: withProvider ? provider : undefined,
    transcribeIdentifier,
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

/** The same, but the second stem is what somebody played rather than Bob. */
async function roomWithMedia() {
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
         participants, participant_names, name, started_at, duration_ms,
         s3_key, segment_keys, stems, floor_timeline, ended_at, mix_state)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'ready')`
    )
    .run(
      RECORDING, CHANNEL, alice.account.id, bob.account.id,
      JSON.stringify([alice.account.id, bob.account.id]),
      JSON.stringify({ [alice.account.id]: 'Alice' }),
      'Book club', clock, 5_000, '', '[]',
      JSON.stringify({ [alice.account.id]: ['a.ogg'], media: ['b.ogg'] }),
      '[]', clock + 5_000
    );
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

/**
 * Answers every open job with utterances of its own, so a stem can come back
 * carrying more than one voice — which is the case `complete` cannot make and
 * the one the played-media stem is actually in.
 */
async function completeWith(
  utterances: Record<string, Array<{ text: string; speaker: string | null; startMs: number }>>
) {
  const identities = Object.keys(utterances);
  for (const [n, job] of provider.submitted.entries()) {
    provider.ready(
      job.id,
      utterances[identities[n]].map((u) => ({
        startMs: u.startMs,
        endMs: u.startMs + 900,
        text: u.text,
        confidence: 0.9,
        speaker: u.speaker,
      })),
      'en'
    );
  }
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

describe('when only one account may spend', () => {
  // Reading and searching are never restricted: a transcript is a shared
  // artefact of a shared conversation. What is restricted is the act that
  // costs money, and deleting with it — deleting spends nothing but destroys
  // something only that account can make again.
  beforeEach(async () => {
    build(true, 'alice@example.com');
    store.put('a.ogg', await tone('a.ogg'));
    store.put('b.ogg', await tone('b.ogg'));
  });

  it('lets the named account start one', async () => {
    const { alice } = await room();
    expect((await ask(alice.token)).statusCode).toBe(200);
  }, 60_000);

  it('matches the address the way signing in does', async () => {
    // Configured in one case and signed in with another is exactly the kind of
    // thing that fails silently once, on the one account nobody can debug.
    build(true, '  ALICE@Example.COM ');
    store.put('a.ogg', await tone('a.ogg'));
    store.put('b.ogg', await tone('b.ogg'));
    const { alice } = await room();
    expect((await ask(alice.token)).statusCode).toBe(200);
  }, 60_000);

  it('refuses anybody else, and says so rather than hiding the recording', async () => {
    const { bob } = await room();
    const answered = await ask(bob.token);

    // 403 rather than 404: Bob can see this recording and can play it. What
    // he cannot do is spend on it, and being told the recording does not
    // exist would be a lie he could disprove by scrolling.
    expect(answered.statusCode).toBe(403);
    expect(answered.json().error).toMatch(/limited to one account/i);
    expect(provider.submitted).toHaveLength(0);
  }, 60_000);

  it('still tells a stranger nothing', async () => {
    // The restriction is checked first, so this asserts the order: somebody
    // outside the channel must not learn the recording exists by being told
    // about a spending rule.
    await room();
    const carol = await signIn('carol@example.com', 'Carol');
    expect((await ask(carol.token)).statusCode).toBe(403);
  }, 60_000);

  it('refuses everybody else the delete too', async () => {
    const { alice, bob } = await room();
    await ask(alice.token);
    await app.transcripts.settled();

    expect((await ask(bob.token, 'DELETE')).statusCode).toBe(403);
    expect((await ask(alice.token, 'DELETE')).statusCode).toBe(200);
  }, 60_000);

  it('lets everybody read and search it', async () => {
    const { alice, bob } = await room();
    await ask(alice.token);
    await app.transcripts.settled();
    await complete({
      [alice.account.id]: 'the part about the badgers',
      [bob.account.id]: 'and then the owls arrived',
    });

    const read = await app.fastify.inject({
      method: 'GET',
      url: `/recordings/${RECORDING}/transcript`,
      headers: auth(bob.token),
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().lines).toHaveLength(2);

    const found = await app.fastify.inject({
      method: 'GET',
      url: `/channels/${CHANNEL}/transcripts/search?q=owls`,
      headers: auth(bob.token),
    });
    expect(found.json().hits).toHaveLength(1);
  }, 60_000);

  it('tells the app who may, so nobody is shown a button that refuses', async () => {
    const { alice, bob } = await room();
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

    expect((await listed(alice.token)).transcript).toMatchObject({
      mayRequest: true,
    });
    expect((await listed(bob.token)).transcript).toMatchObject({
      mayRequest: false,
    });
  }, 60_000);
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

describe('what was played into the room', () => {
  it('is transcribed, and named as the recording rather than as a person', async () => {
    // Without a name of its own it falls through to "Someone", which reads as
    // a participant nobody can identify — the confusion excluding this stem
    // was once meant to avoid, arrived at from the other side.
    const { alice } = await roomWithMedia();

    await ask(alice.token);
    await app.transcripts.settled();
    await complete({
      [alice.account.id]: 'listen to this bit',
      media: 'and the second movement begins',
    });

    const body = (await read(alice.token)).json();
    const played = body.lines.find(
      (l: { identity: string }) => l.identity === 'media'
    );
    expect(played.displayName).toBe('Played audio');
    expect(played.text).toBe('and the second movement begins');

    // And the same in a file somebody downloads.
    const file = await read(
      alice.token,
      `/recordings/${RECORDING}/transcript/export`
    );
    expect(file.body).toContain('Played audio: and the second movement begins');
  }, 60_000);

  it('tells its voices apart when the provider heard more than one', async () => {
    // The ordinary case for this stem: what somebody plays into a room may be
    // an interview. `speaker_labels` separates them; the letter is what makes
    // the separation visible, and without it 200 lines of two people read as
    // one speaker called "Played audio".
    const { alice } = await roomWithMedia();
    await ask(alice.token);
    await app.transcripts.settled();
    await completeWith({
      [alice.account.id]: [{ text: 'listen to this bit', speaker: 'A', startMs: 0 }],
      media: [
        { text: 'welcome to the programme', speaker: 'A', startMs: 1_000 },
        { text: 'thank you for having me', speaker: 'B', startMs: 2_000 },
      ],
    });

    const body = (await read(alice.token)).json();
    const named = Object.fromEntries(
      body.lines.map((l: { text: string; displayName: string }) => [l.text, l.displayName])
    );

    expect(named['welcome to the programme']).toBe('Played audio (A)');
    expect(named['thank you for having me']).toBe('Played audio (B)');
    // And the stem that held one voice keeps its plain name. A letter beside
    // a named participant who was alone on their microphone answers a
    // question nobody asked.
    expect(named['listen to this bit']).toBe('Alice');
  }, 60_000);

  it('carries the letter into a search result too', async () => {
    // Counted from the database rather than from the hits: the matching lines
    // are not the transcript, and a stem whose second voice never said the
    // word would otherwise come back looking single-voiced.
    const { alice } = await roomWithMedia();
    await ask(alice.token);
    await app.transcripts.settled();
    await completeWith({
      [alice.account.id]: [{ text: 'listen to this bit', speaker: 'A', startMs: 0 }],
      media: [
        { text: 'welcome to the programme', speaker: 'A', startMs: 1_000 },
        { text: 'a distinctive remark', speaker: 'B', startMs: 2_000 },
      ],
    });

    const found = await read(
      alice.token,
      `/channels/${CHANNEL}/transcripts/search?q=distinctive`
    );
    expect(found.json().hits).toHaveLength(1);
    expect(found.json().hits[0].displayName).toBe('Played audio (B)');
  }, 60_000);
});

describe('a transcript to read as prose', () => {
  it('makes one entry of a run, with the sentences as paragraphs', async () => {
    // A label per utterance turns one person saying three sentences into
    // three speakers. Grouped, the label alternates and so means something
    // every time it appears.
    const { alice } = await roomWithMedia();
    await ask(alice.token);
    await app.transcripts.settled();
    await completeWith({
      [alice.account.id]: [{ text: 'here it is', speaker: 'A', startMs: 0 }],
      media: [
        { text: 'first sentence', speaker: 'B', startMs: 10_000 },
        { text: 'second sentence', speaker: 'B', startMs: 11_000 },
        { text: 'and a reply', speaker: 'A', startMs: 12_000 },
      ],
    });

    const file = await read(
      alice.token,
      `/recordings/${RECORDING}/transcript/export`
    );

    expect(file.body).toBe(
      [
        '[00:00:00] Alice: here it is',
        '',
        '[00:00:10] Played audio (B): first sentence',
        '',
        'second sentence',
        '',
        '[00:00:12] Played audio (A): and a reply',
        '',
      ].join('\n')
    );
  }, 60_000);

  it('leaves subtitles one cue per utterance, however they were grouped', async () => {
    // A cue is on screen for exactly as long as it says. A grouped one would
    // hold a minute of text under a single subtitle.
    const { alice } = await roomWithMedia();
    await ask(alice.token);
    await app.transcripts.settled();
    await completeWith({
      [alice.account.id]: [{ text: 'here it is', speaker: 'A', startMs: 0 }],
      media: [
        { text: 'first sentence', speaker: 'B', startMs: 10_000 },
        { text: 'second sentence', speaker: 'B', startMs: 11_000 },
        { text: 'and a reply', speaker: 'A', startMs: 12_000 },
      ],
    });

    const file = await read(
      alice.token,
      `/recordings/${RECORDING}/transcript/export?format=vtt`
    );

    expect(file.body).toContain('<v Played audio (B)>first sentence');
    expect(file.body).toContain('<v Played audio (B)>second sentence');
  }, 60_000);
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
      // Nothing is restricting spending on this server, so everybody may.
      mayRequest: true,
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
