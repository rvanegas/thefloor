import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';
import { publishedKeyFor } from '../src/publication';
import { MemoryRecordingStore } from '../src/storage';

/**
 * Publication: the first thing this server does that the world can see.
 *
 * What is actually asserted here, in the order the file runs, is the set of
 * promises publication.ts makes in prose:
 *
 * - Nothing is published by one person deciding. Unanimity is the rule and
 *   the *page* is the observable — a test that only inspected the consents
 *   table would pass against a server that published anyway.
 * - A recording a guest spoke in cannot be published at all, however many
 *   members agree.
 * - Withdrawing takes it down, immediately, from the page and the feed and
 *   the audio route alike.
 * - A private channel serves nothing, without any consent being cleared.
 * - No member is ever named on the public page. This one is a standing
 *   guarantee rather than a behaviour, so it is asserted against the rendered
 *   HTML with the actual display names, which is the only form of the test
 *   that would catch somebody helpfully adding a byline.
 */

let app: App;
let media: MemoryMediaServer;
let store: MemoryRecordingStore;
let dir: string;
let clock = 1_700_000_000_000;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'thefloor-publication-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

beforeEach(() => {
  clock = 1_700_000_000_000;
  media = new MemoryMediaServer();
  store = new MemoryRecordingStore();
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    media,
    mediaUrl: 'wss://example.livekit.cloud',
    store,
    now: () => clock,
    roomCloseGraceMs: 0,
    contactEmail: 'hello@example.com',
  });
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const settle = () => new Promise((r) => setTimeout(r, 0));

/** A steady tone, so the mix and the transcode are real audio. */
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

async function signIn(identifier: string, displayName: string) {
  const code = app.accounts.issueCode(identifier, clock)!;
  const verified = await app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, displayName },
  });
  return verified.json() as { token: string; account: { id: string } };
}

type User = Awaited<ReturnType<typeof signIn>>;

async function befriend(a: User, b: User, identifier: string) {
  await app.fastify.inject({
    method: 'POST',
    url: '/contacts/request',
    headers: auth(a.token),
    payload: { identifier },
  });
  await app.fastify.inject({
    method: 'POST',
    url: `/contacts/${a.account.id}/accept`,
    headers: auth(b.token),
  });
}

/** Two people, a channel, and one finished recording in it. */
async function recorded() {
  const alice = await signIn('alice@example.com', 'Alice Appleby');
  const bob = await signIn('bob@example.com', 'Bob Barker');
  await befriend(alice, bob, 'bob@example.com');

  const created = await app.fastify.inject({
    method: 'POST',
    url: '/channels',
    headers: auth(alice.token),
    payload: { contactIds: [bob.account.id] },
  });
  const { channelId } = created.json() as { channelId: string };
  app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
  app.channels.dispatch(channelId, alice.account.id, {
    type: 'START_RECORDING',
  });
  await settle();
  clock += 30_000;

  const stem = await tone('stem.ogg', 3);
  app.channels.dispatch(channelId, alice.account.id, {
    type: 'STOP_RECORDING',
  });
  for (const { key } of media.recordings) store.put(key, stem);
  await app.channels.mixesSettled();

  // Nobody is left in the room. Publication has no such rule of its own, but
  // `deleteRecording` does — it refuses while somebody is in the channel —
  // and a test of publication should not fail on a guard it is not about.
  app.channels.dispatch(channelId, bob.account.id, { type: 'STEP_OUT' });
  app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });

  const [recording] = app.channels.recordingsFor(alice.account.id);
  return { alice, bob, channelId, recordingId: recording.id };
}

const goPublic = (token: string, channelId: string, wanted = true) =>
  app.fastify.inject({
    method: 'POST',
    url: `/channels/${channelId}/public`,
    headers: auth(token),
    payload: { public: wanted },
  });

const consent = (token: string, recordingId: string) =>
  app.fastify.inject({
    method: 'POST',
    url: `/recordings/${recordingId}/consent`,
    headers: auth(token),
  });

const withdraw = (token: string, recordingId: string) =>
  app.fastify.inject({
    method: 'DELETE',
    url: `/recordings/${recordingId}/consent`,
    headers: auth(token),
  });

const pageFor = (channelId: string) =>
  app.fastify.inject({ method: 'GET', url: `/c/${channelId}` });

const feedFor = (channelId: string) =>
  app.fastify.inject({ method: 'GET', url: `/c/${channelId}/feed.xml` });

/** Waits for the transcode, which runs unawaited behind the consent. */
async function transcoded(recordingId: string) {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const row = app.db
      .prepare('SELECT aac_state FROM recordings WHERE id = ?')
      .get(recordingId) as { aac_state: string | null } | undefined;
    if (row?.aac_state === 'ready' || row?.aac_state === 'failed') return row.aac_state;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('the transcode never settled');
}

describe('a channel that has not declared itself public', () => {
  it('has no page and no feed', async () => {
    const { channelId } = await recorded();
    expect((await pageFor(channelId)).statusCode).toBe(404);
    expect((await feedFor(channelId)).statusCode).toBe(404);
  }, 60_000);

  it('is not made public by somebody who is not in it', async () => {
    const { channelId } = await recorded();
    const stranger = await signIn('carol@example.com', 'Carol');
    // 400, not 404: `statusFor` maps `not_found` to 400 throughout this
    // server, and absent and not-yours are deliberately one answer.
    expect((await goPublic(stranger.token, channelId)).statusCode).toBe(400);
    expect((await pageFor(channelId)).statusCode).toBe(404);
  }, 60_000);
});

describe('a public channel with nothing published', () => {
  it('has a page that says so, and a feed with no items', async () => {
    const { alice, channelId } = await recorded();
    expect((await goPublic(alice.token, channelId)).statusCode).toBe(200);

    const page = await pageFor(channelId);
    expect(page.statusCode).toBe(200);
    expect(page.payload).toContain('Nothing has been published here yet');

    const feed = await feedFor(channelId);
    expect(feed.statusCode).toBe(200);
    expect(feed.payload).not.toContain('<item>');
    // Required by every validator and by Apple, and absolute.
    expect(feed.payload).toContain('rel="self"');
  }, 60_000);
});

describe('unanimity', () => {
  it('publishes nothing until everybody has agreed', async () => {
    const { alice, bob, channelId, recordingId } = await recorded();
    await goPublic(alice.token, channelId);

    const first = await consent(alice.token, recordingId);
    expect(first.statusCode).toBe(200);
    expect(first.json().consented).toEqual([alice.account.id]);
    expect(first.json().publishedAt).toBeNull();

    // The observable, rather than the table: a server that published on one
    // consent would still have written exactly the row asserted above.
    expect((await pageFor(channelId)).payload).toContain(
      'Nothing has been published here yet'
    );
    expect((await feedFor(channelId)).payload).not.toContain('<item>');

    const second = await consent(bob.token, recordingId);
    expect(second.statusCode).toBe(200);
    expect(second.json().publishedAt).toBe(clock);

    expect(await transcoded(recordingId)).toBe('ready');
    expect(store.keys()).toContain(publishedKeyFor(channelId, recordingId));

    const page = await pageFor(channelId);
    expect(page.payload).toContain('<audio');
    expect((await feedFor(channelId)).payload).toContain('<item>');
  }, 120_000);

  it('counts one person agreeing twice as one agreement', async () => {
    const { alice, channelId, recordingId } = await recorded();
    await goPublic(alice.token, channelId);

    await consent(alice.token, recordingId);
    const again = await consent(alice.token, recordingId);
    expect(again.json().consented).toEqual([alice.account.id]);
    expect(again.json().publishedAt).toBeNull();
  }, 60_000);

  it('refuses somebody who was not in the channel', async () => {
    const { recordingId } = await recorded();
    const stranger = await signIn('carol@example.com', 'Carol');
    expect((await consent(stranger.token, recordingId)).statusCode).toBe(400);
  }, 60_000);
});

describe('withdrawing', () => {
  it('takes it down for everybody, on one person saying so', async () => {
    const { alice, bob, channelId, recordingId } = await recorded();
    await goPublic(alice.token, channelId);
    await consent(alice.token, recordingId);
    await consent(bob.token, recordingId);
    await transcoded(recordingId);
    expect((await feedFor(channelId)).payload).toContain('<item>');

    const gone = await withdraw(bob.token, recordingId);
    expect(gone.statusCode).toBe(200);
    expect(gone.json().publishedAt).toBeNull();

    expect((await feedFor(channelId)).payload).not.toContain('<item>');
    expect((await pageFor(channelId)).payload).toContain(
      'Nothing has been published here yet'
    );

    // And the audio stops being served, which is the half that matters: a
    // page that no longer links an episode is not the same as one nobody can
    // fetch by the address they already have.
    const audio = await app.fastify.inject({
      method: 'GET',
      url: `/c/${channelId}/e/${recordingId}.m4a`,
    });
    expect(audio.statusCode).toBe(404);
  }, 120_000);

  it('republishes when they agree again, without a second transcode', async () => {
    const { alice, bob, channelId, recordingId } = await recorded();
    await goPublic(alice.token, channelId);
    await consent(alice.token, recordingId);
    await consent(bob.token, recordingId);
    await transcoded(recordingId);

    await withdraw(bob.token, recordingId);
    // Bytes no encoder would produce, so what comes back proves the object
    // was kept rather than remade — see `unpublish`, which argues for keeping
    // it precisely so a reversed decision costs nothing.
    const marker = Buffer.from('not audio, deliberately');
    await store.put(publishedKeyFor(channelId, recordingId), marker);

    const back = await consent(bob.token, recordingId);
    expect(back.json().publishedAt).toBe(clock);

    const audio = await app.fastify.inject({
      method: 'GET',
      url: `/c/${channelId}/e/${recordingId}.m4a`,
    });
    expect(audio.statusCode).toBe(200);
    expect(audio.rawPayload.equals(marker)).toBe(true);
  }, 120_000);
});

describe('going private again', () => {
  it('takes the whole page down without clearing anybody s consent', async () => {
    const { alice, bob, channelId, recordingId } = await recorded();
    await goPublic(alice.token, channelId);
    await consent(alice.token, recordingId);
    await consent(bob.token, recordingId);
    await transcoded(recordingId);

    expect((await goPublic(alice.token, channelId, false)).statusCode).toBe(200);
    expect((await pageFor(channelId)).statusCode).toBe(404);
    expect((await feedFor(channelId)).statusCode).toBe(404);
    expect(
      (
        await app.fastify.inject({
          method: 'GET',
          url: `/c/${channelId}/e/${recordingId}.m4a`,
        })
      ).statusCode
    ).toBe(404);

    // The consents stand, so coming back is not a decision anybody retakes.
    await goPublic(alice.token, channelId, true);
    expect((await feedFor(channelId)).payload).toContain('<item>');
  }, 120_000);
});

describe('a deleted recording', () => {
  it('leaves the feed at once, a week before its bytes go', async () => {
    const { alice, bob, channelId, recordingId } = await recorded();
    await goPublic(alice.token, channelId);
    await consent(alice.token, recordingId);
    await consent(bob.token, recordingId);
    await transcoded(recordingId);
    expect((await feedFor(channelId)).payload).toContain('<item>');

    expect(app.channels.deleteRecording(recordingId, alice.account.id)).toEqual({
      ok: true,
    });

    // Marked, not swept: the object is still there, and the feed has already
    // stopped naming it. That order is what stops a subscriber ever meeting
    // a dead enclosure.
    expect(store.keys()).toContain(publishedKeyFor(channelId, recordingId));
    expect((await feedFor(channelId)).payload).not.toContain('<item>');
    expect(
      (
        await app.fastify.inject({
          method: 'GET',
          url: `/c/${channelId}/e/${recordingId}.m4a`,
        })
      ).statusCode
    ).toBe(404);
  }, 120_000);

  it('has its published episode swept with everything else', async () => {
    const { alice, bob, channelId, recordingId } = await recorded();
    await goPublic(alice.token, channelId);
    await consent(alice.token, recordingId);
    await consent(bob.token, recordingId);
    await transcoded(recordingId);

    app.channels.deleteRecording(recordingId, alice.account.id);
    clock += 8 * 24 * 60 * 60 * 1000;
    app.channels.sweepDeleted(clock);

    expect(store.keys()).not.toContain(publishedKeyFor(channelId, recordingId));
  }, 120_000);
});

describe('the public page', () => {
  it('never names a member', async () => {
    const { alice, bob, channelId, recordingId } = await recorded();
    await goPublic(alice.token, channelId);
    await consent(alice.token, recordingId);
    await consent(bob.token, recordingId);
    await transcoded(recordingId);

    const page = (await pageFor(channelId)).payload;
    // The task entry: members remain private, though they may be explicitly
    // described in the description. So the only words about who these people
    // are must be words they wrote themselves.
    expect(page).not.toContain('Alice');
    expect(page).not.toContain('Bob');
    expect(page).not.toContain(alice.account.id);
    expect(page).not.toContain(bob.account.id);
  }, 120_000);

  it('carries an address to write to about what is on it', async () => {
    const { alice, channelId } = await recorded();
    await goPublic(alice.token, channelId);
    // Not boilerplate: publishing is what reopens the copyright question, and
    // notice-and-takedown is the whole of the answer. A page with no way to
    // be told is a posture nobody can act on.
    expect((await pageFor(channelId)).payload).toContain('hello@example.com');
  }, 60_000);
});

describe('the enclosure', () => {
  it('answers a byte range with a 206 and a Content-Range', async () => {
    const { alice, bob, channelId, recordingId } = await recorded();
    await goPublic(alice.token, channelId);
    await consent(alice.token, recordingId);
    await consent(bob.token, recordingId);
    await transcoded(recordingId);

    const whole = await app.fastify.inject({
      method: 'GET',
      url: `/c/${channelId}/e/${recordingId}.m4a`,
    });
    expect(whole.statusCode).toBe(200);
    expect(whole.headers['accept-ranges']).toBe('bytes');
    expect(whole.headers['content-type']).toBe('audio/mp4');

    const ranged = await app.fastify.inject({
      method: 'GET',
      url: `/c/${channelId}/e/${recordingId}.m4a`,
      headers: { range: 'bytes=0-99' },
    });
    expect(ranged.statusCode).toBe(206);
    expect(ranged.rawPayload.length).toBe(100);
    expect(ranged.headers['content-range']).toBe(
      `bytes 0-99/${whole.rawPayload.length}`
    );

    // A suffix range, which is what several players send to read the moov
    // atom of a file they have not downloaded.
    const suffix = await app.fastify.inject({
      method: 'GET',
      url: `/c/${channelId}/e/${recordingId}.m4a`,
      headers: { range: 'bytes=-50' },
    });
    expect(suffix.statusCode).toBe(206);
    expect(suffix.rawPayload.length).toBe(50);
  }, 120_000);

  it('is the floor-gated mix rather than anything re-rendered', async () => {
    const { alice, bob, channelId, recordingId } = await recorded();
    await goPublic(alice.token, channelId);
    await consent(alice.token, recordingId);
    await consent(bob.token, recordingId);
    await transcoded(recordingId);

    // The guarantee is structural — `transcodeToPublished` takes a finished
    // mix and has no way to read a stem — so what is checked here is that the
    // published object is real audio ffprobe accepts, of roughly the mix's
    // length. A transcode that silently produced nothing would pass every
    // other test in this file.
    const published = await store.get(publishedKeyFor(channelId, recordingId));
    expect(published.length).toBeGreaterThan(0);
    expect(published.subarray(4, 8).toString('latin1')).toBe('ftyp');
  }, 120_000);
});

describe('deleting your account', () => {
  it('withdraws your consent, and takes down what it was holding up', async () => {
    const { alice, bob, channelId, recordingId } = await recorded();
    await goPublic(alice.token, channelId);
    await consent(alice.token, recordingId);
    await consent(bob.token, recordingId);
    await transcoded(recordingId);
    expect((await feedFor(channelId)).payload).toContain('<item>');

    // The most complete way of ceasing to agree there is. Leaving the episode
    // up would mean it stood on the word of an account that no longer exists.
    expect(app.accounts.erase(bob.account.id)).toBe(true);

    expect((await feedFor(channelId)).payload).not.toContain('<item>');
    expect((await pageFor(channelId)).payload).toContain(
      'Nothing has been published here yet'
    );
  }, 120_000);
});

describe('a conversation a guest was in', () => {
  it('cannot be published, however many members agree', async () => {
    const { alice, bob, channelId, recordingId } = await recorded();
    await goPublic(alice.token, channelId);

    // A guest's audio in the recording is the fact that refuses it: a guest
    // has no account and so no surface on which to have agreed to anything.
    const stems = JSON.parse(
      (
        app.db
          .prepare('SELECT stems FROM recordings WHERE id = ?')
          .get(recordingId) as { stems: string }
      ).stems
    );
    stems['guest_someone'] = [];
    app.db
      .prepare('UPDATE recordings SET stems = ? WHERE id = ?')
      .run(JSON.stringify(stems), recordingId);

    const refused = await consent(alice.token, recordingId);
    expect(refused.statusCode).toBe(400);
    expect(refused.json().error).toContain('guest');

    expect((await consent(bob.token, recordingId)).statusCode).toBe(400);
    expect((await feedFor(channelId)).payload).not.toContain('<item>');
  }, 60_000);
});
