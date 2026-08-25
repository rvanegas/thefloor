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

function build(
  withProvider = true,
  transcribeUnlimitedIdentifier?: string,
  freeTranscriptMinutes?: number
) {
  store = new MemoryRecordingStore();
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    store,
    transcription: withProvider ? provider : undefined,
    transcribeUnlimitedIdentifier,
    freeTranscriptMinutes,
    now: () => clock,
  });
}

/** Lifts the free-use limit for one account, the way `bin/db --write` does. */
function markUnlimited(id: string) {
  app.db
    .prepare('UPDATE accounts SET transcripts_unlimited = 1 WHERE id = ?')
    .run(id);
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

/** Declares who the voices were, which is the whole declaration every time. */
const declare = (token: string, voices: Record<string, unknown>) =>
  app.fastify.inject({
    method: 'PUT',
    url: `/recordings/${RECORDING}/transcript/voices`,
    headers: auth(token),
    payload: { voices },
  });

/** The key one voice is declared against — `voiceKey`, spelled out. */
const key = (identity: string, speaker: string) => `${identity}\u0000${speaker}`;

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

describe('the one free transcript', () => {
  // Everybody may transcribe, once. The limit is on the act that spends, never
  // on reading or searching — a transcript is a shared artefact of a shared
  // conversation, and everybody who can play the recording reads every word.
  beforeEach(async () => {
    build();
    store.put('a.ogg', await tone('a.ogg'));
    store.put('b.ogg', await tone('b.ogg'));
  });

  it('lets anybody in the channel have one', async () => {
    const { bob } = await room();
    expect((await ask(bob.token)).statusCode).toBe(200);
  }, 60_000);

  it('refuses the second, and deleting the first does not give it back', async () => {
    // The whole point of recording the spend on the account: transcript rows
    // are swept, so a count taken from them would hand the credit back — and
    // delete-and-ask-again would be an unlimited supply.
    const { bob } = await room();
    expect((await ask(bob.token)).statusCode).toBe(200);
    await app.transcripts.settled();
    expect((await ask(bob.token, 'DELETE')).statusCode).toBe(200);

    const refused = await ask(bob.token);
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error).toMatch(/one free transcript/i);
  }, 60_000);

  it('gives it back when the transcript fails, having produced nothing', async () => {
    const { bob } = await room();
    expect((await ask(bob.token)).statusCode).toBe(200);
    await app.transcripts.settled();
    for (const job of provider.submitted) provider.fails(job.id, 'no.');
    clock += 120_000;
    await app.transcripts.tick();
    await app.transcripts.settled();

    // Asking again replaces the failed one, which is the retry — and it is
    // allowed, because the first attempt left nothing behind to keep.
    expect((await ask(bob.token)).statusCode).toBe(200);
  }, 60_000);

  it('does not spend it on a request that was refused anyway', async () => {
    // Bob passes the spending rule — his use is unspent — and is then refused
    // by `request`, because Alice already had this one transcribed. Nothing
    // was submitted and nothing was charged, so his credit must still be
    // there: a 409 that quietly costs somebody their one free transcript is
    // the worst version of this feature.
    const { alice, bob } = await room();
    await ask(alice.token);
    await app.transcripts.settled();
    expect((await ask(bob.token)).statusCode).toBe(409);

    const account = app.db
      .prepare('SELECT free_transcript_id FROM accounts WHERE id = ?')
      .get(bob.account.id) as { free_transcript_id: string | null };
    expect(account.free_transcript_id).toBeNull();
  }, 60_000);

  it('holds the credit while one is still being made', async () => {
    // Written when the transcript is asked for rather than when it lands, or
    // five taps in the time one takes to come back are five free transcripts.
    const { bob } = await room();
    await ask(bob.token);
    const account = app.db
      .prepare('SELECT free_transcript_id FROM accounts WHERE id = ?')
      .get(bob.account.id) as { free_transcript_id: string | null };
    expect(account.free_transcript_id).toBe(RECORDING);
  }, 60_000);

  it('still tells a stranger nothing', async () => {
    // The spending rule is checked before the reach test, so this asserts the
    // order: somebody outside the channel must not learn that the recording
    // exists by being told about a limit that only applies to it.
    await room();
    const carol = await signIn('carol@example.com', 'Carol');
    app.db
      .prepare('UPDATE accounts SET free_transcript_id = ? WHERE id = ?')
      .run('rec_somewhere_else', carol.account.id);
    expect((await ask(carol.token)).statusCode).toBe(403);
  }, 60_000);

  it('tells the app it is the free one, so the confirmation can say so', async () => {
    const { alice } = await room();
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
      spendsFreeUse: true,
    });

    markUnlimited(alice.account.id);
    const unlimited = (await listed(alice.token)).transcript;
    expect(unlimited.mayRequest).toBe(true);
    // Nothing to warn about: an unlimited account is not spending a thing it
    // has only one of.
    expect(unlimited.spendsFreeUse).toBeUndefined();
  }, 60_000);

  it('sends the reason with the refusal, since the button now has words', async () => {
    const { bob } = await room();
    await ask(bob.token);
    await app.transcripts.settled();
    await ask(bob.token, 'DELETE');

    const answered = await app.fastify.inject({
      method: 'GET',
      url: '/home',
      headers: auth(bob.token),
    });
    const row = (answered.json().recordings ?? []).find(
      (r: { id: string }) => r.id === RECORDING
    );
    expect(row.transcript.mayRequest).toBe(false);
    expect(row.transcript.requestLimit).toMatch(/one free transcript/i);
  }, 60_000);
});

describe('an account marked unlimited', () => {
  beforeEach(async () => {
    build();
    store.put('a.ogg', await tone('a.ogg'));
    store.put('b.ogg', await tone('b.ogg'));
  });

  it('is not held to one', async () => {
    const { alice } = await room();
    markUnlimited(alice.account.id);
    expect((await ask(alice.token)).statusCode).toBe(200);
    await app.transcripts.settled();
    expect((await ask(alice.token, 'DELETE')).statusCode).toBe(200);
    expect((await ask(alice.token)).statusCode).toBe(200);
  }, 60_000);

  it('spends nothing, so the mark can be given after the fact', async () => {
    // Somebody who used their free transcript this morning and was marked
    // this afternoon is not still refused for the row they spent.
    const { bob } = await room();
    await ask(bob.token);
    await app.transcripts.settled();
    await ask(bob.token, 'DELETE');
    expect((await ask(bob.token)).statusCode).toBe(403);

    markUnlimited(bob.account.id);
    expect((await ask(bob.token)).statusCode).toBe(200);
  }, 60_000);
});

describe('the address named in the environment', () => {
  // A bootstrap for the account that used to be the only one allowed to
  // transcribe, and deprecated: the durable mark is the column above. It is
  // still honoured so that opening the feature up does not silently demote
  // whoever is named in a deployed .env to one free use.
  beforeEach(async () => {
    build(true, 'alice@example.com');
    store.put('a.ogg', await tone('a.ogg'));
    store.put('b.ogg', await tone('b.ogg'));
  });

  it('transcribes without limit', async () => {
    const { alice } = await room();
    expect((await ask(alice.token)).statusCode).toBe(200);
    await app.transcripts.settled();
    expect((await ask(alice.token, 'DELETE')).statusCode).toBe(200);
    expect((await ask(alice.token)).statusCode).toBe(200);
  }, 60_000);

  it('does not stop everybody else having their one', async () => {
    // The old meaning of this variable, and the thing that changed: it named
    // the only account that could transcribe at all.
    const { bob } = await room();
    expect((await ask(bob.token)).statusCode).toBe(200);
  }, 60_000);

  it('matches the address the way signing in does', async () => {
    // Configured in one case and signed in with another is exactly the kind of
    // thing that fails silently once, on the one account nobody can debug.
    build(true, '  ALICE@Example.COM ');
    store.put('a.ogg', await tone('a.ogg'));
    store.put('b.ogg', await tone('b.ogg'));
    const { alice } = await room();
    await ask(alice.token);
    await app.transcripts.settled();
    await ask(alice.token, 'DELETE');
    expect((await ask(alice.token)).statusCode).toBe(200);
  }, 60_000);
});

describe('when a free transcript is capped by length', () => {
  // One free use caps the count and not the bill: the provider charges per
  // audio-hour per stem, so a three-hour four-way is twenty times a
  // twenty-minute pair. The cap is in those same units.
  beforeEach(async () => {
    // The recording is five seconds long with two stems — ten seconds of
    // audio, which rounds up to one transcription minute, so a cap of one
    // lets it through and anything longer does not.
    build(true, undefined, 1);
    store.put('a.ogg', await tone('a.ogg'));
    store.put('b.ogg', await tone('b.ogg'));
  });

  it('allows one inside the cap', async () => {
    const { bob } = await room();
    expect((await ask(bob.token)).statusCode).toBe(200);
  }, 60_000);

  it('refuses one over it, and says how far over', async () => {
    const { bob } = await room();
    // Ninety minutes across two stems: three hours of transcription.
    app.db
      .prepare('UPDATE recordings SET duration_ms = ? WHERE id = ?')
      .run(90 * 60_000, RECORDING);

    const refused = await ask(bob.token);
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error).toMatch(/up to 1 transcription minutes/i);
    expect(refused.json().error).toMatch(/comes to 180/);
    expect(provider.submitted).toHaveLength(0);
  }, 60_000);

  it('does not apply to an unlimited account', async () => {
    const { alice } = await room();
    markUnlimited(alice.account.id);
    app.db
      .prepare('UPDATE recordings SET duration_ms = ? WHERE id = ?')
      .run(90 * 60_000, RECORDING);
    expect((await ask(alice.token)).statusCode).toBe(200);
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

describe('saying who the voices were', () => {
  /** A transcript whose media stem came back holding two voices. */
  async function interviewed() {
    const { alice } = await roomWithMedia();
    await ask(alice.token);
    await app.transcripts.settled();
    await completeWith({
      [alice.account.id]: [
        { text: 'so I started the recording', speaker: 'A', startMs: 0 },
        { text: 'Mm-hmm.', speaker: 'B', startMs: 5_000 },
      ],
      media: [
        { text: 'welcome to the programme', speaker: 'A', startMs: 1_000 },
        { text: 'thank you for having me', speaker: 'B', startMs: 2_000 },
      ],
    });
    return alice;
  }

  const namesIn = async (token: string) =>
    Object.fromEntries(
      (await read(token))
        .json()
        .lines.map((l: { text: string; displayName: string }) => [l.text, l.displayName])
    );

  it('lists every voice with what it said and how much of it', async () => {
    const alice = await interviewed();
    const body = (await read(alice.token)).json();

    expect(
      body.voices.map((v: { displayName: string; lines: number; sample: string }) => [
        v.displayName,
        v.lines,
        v.sample,
      ])
    ).toEqual([
      // In the order they were first heard, which is the order of the
      // transcript rather than of the stems.
      ['Alice (A)', 1, 'so I started the recording'],
      ['Played audio (A)', 1, 'welcome to the programme'],
      ['Played audio (B)', 1, 'thank you for having me'],
      ['Alice (B)', 1, 'Mm-hmm.'],
    ]);
  }, 60_000);

  it('names the voices inside the played stem', async () => {
    const alice = await interviewed();
    await declare(alice.token, {
      [key('media', 'A')]: { name: 'Host' },
      [key('media', 'B')]: { name: 'Douglas' },
    });

    const named = await namesIn(alice.token);
    expect(named['welcome to the programme']).toBe('Host');
    expect(named['thank you for having me']).toBe('Douglas');
  }, 60_000);

  it('collapses two voices onto one name, and un-letters what is left', async () => {
    const alice = await interviewed();
    await declare(alice.token, {
      [key(alice.account.id, 'A')]: { name: 'Alice' },
      [key(alice.account.id, 'B')]: { name: 'Alice' },
    });

    const named = await namesIn(alice.token);
    expect(named['so I started the recording']).toBe('Alice');
    expect(named['Mm-hmm.']).toBe('Alice');
  }, 60_000);

  it('drops a removed voice from the transcript and from an export', async () => {
    const alice = await interviewed();
    await declare(alice.token, { [key(alice.account.id, 'B')]: { removed: true } });

    const named = await namesIn(alice.token);
    expect(named['Mm-hmm.']).toBeUndefined();
    // And the stem it left holding one voice loses its letter, since the
    // evidence for showing one is what was just taken away.
    expect(named['so I started the recording']).toBe('Alice');

    const file = await read(alice.token, `/recordings/${RECORDING}/transcript/export`);
    expect(file.body).not.toContain('Mm-hmm.');
  }, 60_000);

  it('keeps a removed voice on the roster, so it can be brought back', async () => {
    const alice = await interviewed();
    await declare(alice.token, { [key(alice.account.id, 'B')]: { removed: true } });

    const body = (await read(alice.token)).json();
    const gone = body.voices.find(
      (v: { key: string }) => v.key === key(alice.account.id, 'B')
    );
    expect(gone).toBeDefined();
    expect(gone.declaration).toEqual({ removed: true });
    expect(gone.sample).toBe('Mm-hmm.');
  }, 60_000);

  it('is a view, so an empty declaration puts everything back', async () => {
    // The whole point of storing this beside the lines rather than in them:
    // getting it wrong costs a tap, never a second run of a paid job.
    const alice = await interviewed();
    await declare(alice.token, {
      [key('media', 'A')]: { name: 'Host' },
      [key(alice.account.id, 'B')]: { removed: true },
    });
    await declare(alice.token, {});

    const named = await namesIn(alice.token);
    expect(named['welcome to the programme']).toBe('Played audio (A)');
    expect(named['Mm-hmm.']).toBe('Alice (B)');
  }, 60_000);

  it('does not touch the text, so the same audio is never sent twice', async () => {
    const alice = await interviewed();
    const before = provider.submitted.length;
    await declare(alice.token, { [key('media', 'A')]: { name: 'Host' } });

    expect(provider.submitted).toHaveLength(before);
    const body = (await read(alice.token)).json();
    const line = body.lines.find(
      (l: { text: string }) => l.text === 'welcome to the programme'
    );
    // The label the provider gave it is still there underneath the name.
    expect(line.speaker).toBe('A');
  }, 60_000);

  it('keeps a removed voice out of a search, not merely off the screen', async () => {
    const alice = await interviewed();
    await declare(alice.token, { [key(alice.account.id, 'B')]: { removed: true } });

    const found = await read(
      alice.token,
      `/channels/${CHANNEL}/transcripts/search?q=Mm-hmm`
    );
    expect(found.json().hits).toEqual([]);
  }, 60_000);

  it('carries a declared name into a search result', async () => {
    const alice = await interviewed();
    await declare(alice.token, { [key('media', 'B')]: { name: 'Douglas' } });

    const found = await read(
      alice.token,
      `/channels/${CHANNEL}/transcripts/search?q=having`
    );
    expect(found.json().hits[0].displayName).toBe('Douglas');
  }, 60_000);

  it('refuses a transcript that does not exist', async () => {
    const { alice } = await roomWithMedia();
    expect((await declare(alice.token, {})).statusCode).toBe(404);
  });

  it('refuses a body that is not an object of voices', async () => {
    const alice = await interviewed();
    const answered = await app.fastify.inject({
      method: 'PUT',
      url: `/recordings/${RECORDING}/transcript/voices`,
      headers: auth(alice.token),
      payload: { voices: 'Douglas' },
    });
    expect(answered.statusCode).toBe(400);
  }, 60_000);
});

describe('naming the voices', () => {
  // The same pair of rules as deleting, for the same reason: this shapes a
  // shared artefact that costs money to make again, so it belongs to whoever
  // asked for it. Reading is not restricted, so everybody in the channel sees
  // the result.
  beforeEach(async () => {
    build();
    store.put('a.ogg', await tone('a.ogg'));
    store.put('b.ogg', await tone('b.ogg'));
  });

  it('refuses somebody who did not ask for it, without hiding the recording', async () => {
    const { alice, bob } = await roomWithMedia();
    await ask(alice.token);
    await app.transcripts.settled();
    await completeWith({
      [alice.account.id]: [{ text: 'here it is', speaker: 'A', startMs: 0 }],
      media: [
        { text: 'welcome', speaker: 'A', startMs: 1_000 },
        { text: 'thank you', speaker: 'B', startMs: 2_000 },
      ],
    });

    const refused = await declare(bob.token, { [key('media', 'A')]: { name: 'Host' } });
    expect(refused.statusCode).toBe(403);

    // And Bob still reads the transcript, names and all.
    expect((await read(bob.token)).statusCode).toBe(200);

    // Alice asked for it, so it is hers to shape — including after her free
    // use is gone, which is a different question from making a new one.
    const named = await declare(alice.token, { [key('media', 'A')]: { name: 'Host' } });
    expect(named.statusCode).toBe(200);
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

    // Bob was in the room and can read every word, but he did not ask for
    // this one and cannot make another — so unmaking it is not his.
    expect((await ask(bob.token, 'DELETE')).statusCode).toBe(403);
    const answered = await ask(alice.token, 'DELETE');

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
    // An unlimited account, since this is about what deleting leaves behind
    // rather than about the free use — which deleting does not return, and
    // which has its own tests above.
    const { alice } = await room();
    markUnlimited(alice.account.id);
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
      // Everybody may, and for Alice this would be the one free use — which
      // the confirmation says out loud, so it travels on the same field.
      mayRequest: true,
      spendsFreeUse: true,
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
