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

/**
 * Two people, a named channel, and one finished recording in it.
 *
 * **Named, because a channel cannot be made public otherwise** — see
 * `setPublic` in publication.ts. Nearly every test below goes public, so an
 * unnamed channel here would mean every one of them asserting the same
 * precondition; the two that are about the precondition itself say so in
 * their own words.
 */
async function recorded(name = 'The Tuesday call') {
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

  // After both step-outs, so `canEditChannel` is satisfied the way it is for
  // a member on the settings screen with nobody in the room.
  app.channels.dispatch(channelId, alice.account.id, {
    type: 'SET_NAME',
    name,
  } as never);

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

describe('a channel nobody has named', () => {
  /**
   * The whole of the rule, from both ends.
   *
   * It is about what a stranger reads rather than about who is deciding: an
   * unnamed channel's only name is the people in it, and the one thing a
   * public page may never say is who its members are. The directory is where
   * that bites hardest — every unnamed row would read alike.
   */
  const unname = (channelId: string, user: User) =>
    app.channels.dispatch(channelId, user.account.id, {
      type: 'SET_NAME',
      name: '   ',
    } as never);

  it('cannot be given a public page', async () => {
    const { alice, channelId } = await recorded();
    unname(channelId, alice);

    const refused = await goPublic(alice.token, channelId);
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toContain('Name this channel');
    expect((await pageFor(channelId)).statusCode).toBe(404);
    expect((await feedFor(channelId)).statusCode).toBe(404);
  }, 60_000);

  it('takes the page once it has a name', async () => {
    const { alice, channelId } = await recorded();
    unname(channelId, alice);
    expect((await goPublic(alice.token, channelId)).statusCode).toBe(409);

    app.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_NAME',
      name: 'Thursday mornings',
    } as never);
    expect((await goPublic(alice.token, channelId)).statusCode).toBe(200);
    expect((await pageFor(channelId)).payload).toContain('Thursday mornings');
  }, 60_000);
});

describe('a public channel', () => {
  it('refuses to have its name cleared, and says where the way out is', async () => {
    const { alice, channelId } = await recorded();
    await goPublic(alice.token, channelId);

    const refused = app.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_NAME',
      name: '',
    } as never);
    expect(refused.ok).toBe(false);
    expect(refused.ok ? '' : refused.error).toContain('Turn the page off');
    expect((await pageFor(channelId)).payload).toContain('The Tuesday call');

    // And the way out works: private again, the name is the members' to drop.
    await goPublic(alice.token, channelId, false);
    expect(
      app.channels.dispatch(channelId, alice.account.id, {
        type: 'SET_NAME',
        name: '',
      } as never).ok
    ).toBe(true);
  }, 60_000);

  it('may still be renamed to something else', async () => {
    const { alice, channelId } = await recorded();
    await goPublic(alice.token, channelId);
    expect(
      app.channels.dispatch(channelId, alice.account.id, {
        type: 'SET_NAME',
        name: 'Thursday mornings',
      } as never).ok
    ).toBe(true);
    expect((await pageFor(channelId)).payload).toContain('Thursday mornings');
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

describe('telling the members there is a page', () => {
  /**
   * The notice, which is the one thing here that gates nothing.
   *
   * Whether a channel is public stays any member's decision — no assertion
   * below takes a page down or refuses a switch. What is asserted is that
   * nobody is left holding a membership in a public channel without the
   * sentence having been put in front of them once, which is what a row's
   * absence means. See db.ts § public_notices.
   */
  const owed = (channelId: string, user: User) =>
    app.publication.owesPublicNotice(channelId, user.account.id);

  const acknowledge = (token: string, channelId: string) =>
    app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/public-notice`,
      headers: auth(token),
    });

  /** Somebody added to the channel, through the path an invitation takes. */
  async function added(channelId: string, host: User, identifier: string) {
    const carol = await signIn(identifier, 'Carol Carver');
    await befriend(host, carol, identifier);
    app.channels.dispatch(channelId, host.account.id, {
      type: 'INVITE',
      contactId: carol.account.id,
    } as never);
    return carol;
  }

  it('owes nobody anything while the channel is private', async () => {
    const { alice, bob, channelId } = await recorded();
    expect(owed(channelId, alice)).toBe(false);
    expect(owed(channelId, bob)).toBe(false);
  }, 60_000);

  it('spares the member who turned it on and owes the rest', async () => {
    const { alice, bob, channelId } = await recorded();
    await goPublic(alice.token, channelId);

    // Alice answered the confirmation, which says all of it. Bob was not
    // there, and the decision was visible to him nowhere.
    expect(owed(channelId, alice)).toBe(false);
    expect(owed(channelId, bob)).toBe(true);
  }, 60_000);

  it('owes it to somebody added after the switch', async () => {
    const { alice, channelId } = await recorded();
    await goPublic(alice.token, channelId);
    const carol = await added(channelId, alice, 'carol@example.com');

    expect(owed(channelId, carol)).toBe(true);
  }, 60_000);

  it('stops owing it once the member says they have read it', async () => {
    const { alice, bob, channelId } = await recorded();
    await goPublic(alice.token, channelId);

    expect((await acknowledge(bob.token, channelId)).statusCode).toBe(200);
    expect(owed(channelId, bob)).toBe(false);
    // Twice, because the card's button is pressable twice on a slow
    // connection.
    expect((await acknowledge(bob.token, channelId)).statusCode).toBe(200);
    expect(owed(channelId, bob)).toBe(false);
  }, 60_000);

  it('changes nothing about the page either way', async () => {
    const { alice, bob, channelId } = await recorded();
    await goPublic(alice.token, channelId);

    // Bob has been told nothing and the page is up, which is the whole of the
    // design: this is a notice, not a veto.
    expect(owed(channelId, bob)).toBe(true);
    expect((await pageFor(channelId)).statusCode).toBe(200);
    expect((await feedFor(channelId)).statusCode).toBe(200);
  }, 60_000);

  it('asks everybody again after a channel comes back', async () => {
    const { alice, bob, channelId } = await recorded();
    await goPublic(alice.token, channelId);
    await acknowledge(bob.token, channelId);
    expect(owed(channelId, bob)).toBe(false);

    await goPublic(alice.token, channelId, false);
    await goPublic(alice.token, channelId);

    // Alice turned it on again and was asked again; Bob's answer was about a
    // page that has been down since, and a channel coming back is a new fact
    // about where these conversations can be read.
    expect(owed(channelId, alice)).toBe(false);
    expect(owed(channelId, bob)).toBe(true);
  }, 60_000);

  it('owes nothing to somebody who is not in the channel, and takes nothing from them', async () => {
    const { alice, channelId } = await recorded();
    await goPublic(alice.token, channelId);
    const stranger = await signIn('dave@example.com', 'Dave');

    expect(owed(channelId, stranger)).toBe(false);
    // 400 for the same reason every not-yours answer here is one: absent and
    // not-yours are one answer.
    expect((await acknowledge(stranger.token, channelId)).statusCode).toBe(400);
  }, 60_000);

  it('goes with the account, leaving nothing pointing at it', async () => {
    const { alice, bob, channelId } = await recorded();
    await goPublic(alice.token, channelId);
    await acknowledge(bob.token, channelId);

    expect(
      (
        await app.fastify.inject({
          method: 'DELETE',
          url: '/me',
          headers: auth(bob.token),
        })
      ).statusCode
    ).toBe(204);

    expect(
      app.db
        .prepare('SELECT COUNT(*) AS n FROM public_notices WHERE account_id = ?')
        .get(bob.account.id)
    ).toEqual({ n: 0 });
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

  /**
   * A member who was not in the recording. The consent set is recomputed from
   * who took part, so a row from anybody else is one `stateOf` drops — which
   * made this a write that could never be read back, and in the app a
   * checkbox that emptied itself on the next snapshot.
   */
  it('refuses a member who was not in the recording, rather than storing a consent nothing counts', async () => {
    const alice = await signIn('alice@example.com', 'Alice Appleby');
    const bob = await signIn('bob@example.com', 'Bob Barker');
    const carol = await signIn('carol@example.com', 'Carol Clay');
    await befriend(alice, bob, 'bob@example.com');
    await befriend(alice, carol, 'carol@example.com');

    const created = await app.fastify.inject({
      method: 'POST',
      url: '/channels',
      headers: auth(alice.token),
      payload: { contactIds: [bob.account.id, carol.account.id] },
    });
    const { channelId } = created.json() as { channelId: string };

    // Carol never enters, so none of her voice is in it.
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
    app.channels.dispatch(channelId, bob.account.id, { type: 'STEP_OUT' });
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });

    const [recording] = app.channels.recordingsFor(alice.account.id);
    await goPublic(alice.token, channelId);

    const refused = await consent(carol.token, recording.id);
    expect(refused.statusCode).toBe(400);
    expect(
      app.db
        .prepare('SELECT COUNT(*) AS n FROM recording_consents WHERE recording_id = ?')
        .get(recording.id)
    ).toEqual({ n: 0 });

    // And the two who were in it still settle it between them.
    await consent(alice.token, recording.id);
    const second = await consent(bob.token, recording.id);
    expect(second.json().publishedAt).toBe(clock);
  }, 120_000);
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
    await app.channels.sweepDeleted(clock);

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

describe('cover art', () => {
  /** A solid square, made by ffmpeg — see artwork.test.ts on why not a stub. */
  async function cover(side: number): Promise<Buffer> {
    const path = join(dir, `cover-${side}.png`);
    await new Promise<void>((resolve, reject) => {
      const child = spawn('ffmpeg', [
        '-v', 'error', '-f', 'lavfi', '-i', `color=c=navy:s=${side}x${side}`,
        '-frames:v', '1', '-y', path,
      ]);
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))
      );
    });
    return readFile(path);
  }

  const upload = (token: string, channelId: string, bytes: Buffer) =>
    app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/image`,
      headers: { ...auth(token), 'content-type': 'image/png' },
      payload: bytes,
    });

  it('reaches the page, the feed and its own route', async () => {
    const { alice, channelId } = await recorded();
    await goPublic(alice.token, channelId);

    const stored = await upload(alice.token, channelId, await cover(1500));
    expect(stored.statusCode).toBe(200);
    expect(stored.json()).toEqual({ width: 1500, height: 1500 });

    const art = await app.fastify.inject({
      method: 'GET',
      url: `/c/${channelId}/artwork`,
    });
    expect(art.statusCode).toBe(200);
    expect(art.headers['content-type']).toBe('image/png');

    // Both elements, because different clients read different ones.
    const feed = (await feedFor(channelId)).payload;
    expect(feed).toContain('<itunes:image');
    expect(feed).toContain('<image><url>');
    // The address carries the cover's timestamp, so replacing it is a new URL
    // rather than a cache nobody can bust.
    expect(feed).toContain('/artwork?v=');
    expect((await pageFor(channelId)).payload).toContain('class="cover"');
  }, 120_000);

  it('is refused when it breaks a rule, before anything is stored', async () => {
    const { alice, channelId } = await recorded();
    await goPublic(alice.token, channelId);

    const refused = await upload(alice.token, channelId, await cover(600));
    expect(refused.statusCode).toBe(400);
    expect(refused.json().error).toContain('1400');

    expect(
      (
        await app.fastify.inject({
          method: 'GET',
          url: `/c/${channelId}/artwork`,
        })
      ).statusCode
    ).toBe(404);
  }, 120_000);

  it('is not uploadable by somebody outside the channel', async () => {
    const { alice, channelId } = await recorded();
    await goPublic(alice.token, channelId);
    const stranger = await signIn('carol@example.com', 'Carol');
    expect(
      (await upload(stranger.token, channelId, await cover(1500))).statusCode
    ).toBe(400);
  }, 120_000);

  it('stops being served when the channel goes private', async () => {
    const { alice, channelId } = await recorded();
    await goPublic(alice.token, channelId);
    await upload(alice.token, channelId, await cover(1500));
    await goPublic(alice.token, channelId, false);

    expect(
      (
        await app.fastify.inject({
          method: 'GET',
          url: `/c/${channelId}/artwork`,
        })
      ).statusCode
    ).toBe(404);
  }, 120_000);
});

describe('the declarations a directory requires', () => {
  const declare = (token: string, channelId: string, body: unknown) =>
    app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/declarations`,
      headers: auth(token),
      payload: body as Record<string, unknown>,
    });

  it('reaches the feed', async () => {
    const { alice, channelId } = await recorded();
    await goPublic(alice.token, channelId);
    expect(
      (
        await declare(alice.token, channelId, {
          language: 'fr',
          explicit: true,
          category: 'Society & Culture',
        })
      ).statusCode
    ).toBe(200);

    const feed = (await feedFor(channelId)).payload;
    expect(feed).toContain('<language>fr</language>');
    expect(feed).toContain('<itunes:explicit>true</itunes:explicit>');
    expect(feed).toContain('Society &amp; Culture');
  }, 60_000);

  /**
   * Refused rather than stored: the directory matches these literally, so
   * something near one would fail at submission instead of here.
   */
  it('refuses a category Apple does not have', async () => {
    const { alice, channelId } = await recorded();
    await goPublic(alice.token, channelId);
    const refused = await declare(alice.token, channelId, {
      category: 'Podcasts About Podcasts',
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json().error).toContain('categories');
  }, 60_000);

  /** The author is the channel, never a member — the page names nobody. */
  it('bylines the channel rather than anybody in it', async () => {
    const { alice, channelId } = await recorded();
    await goPublic(alice.token, channelId);
    const feed = (await feedFor(channelId)).payload;
    expect(feed).toContain('<itunes:author>');
    expect(feed).not.toContain('Alice');
    expect(feed).not.toContain('Bob');
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

  it('counts a start once, and the reads around it not at all', async () => {
    const { alice, bob, channelId, recordingId } = await recorded();
    await goPublic(alice.token, channelId);
    await consent(alice.token, recordingId);
    await consent(bob.token, recordingId);
    await transcoded(recordingId);

    const started = () =>
      (
        app.db
          .prepare(
            'SELECT count FROM episode_listens WHERE recording_id = ?'
          )
          .get(recordingId) as { count: number } | undefined
      )?.count ?? 0;

    // Nothing is counted by publishing, or by anybody reading the page: the
    // tally is of the audio being fetched and of nothing else.
    expect(started()).toBe(0);
    await pageFor(channelId);
    await feedFor(channelId);
    expect(started()).toBe(0);

    const get = (headers?: Record<string, string>) =>
      app.fastify.inject({
        method: 'GET',
        url: `/c/${channelId}/e/${recordingId}.m4a`,
        ...(headers ? { headers } : {}),
      });

    // A download: no range at all, and the least ambiguous start there is.
    // Its length is kept rather than asked for again, because asking again
    // would itself be a start — which is the whole point of the rule.
    const downloaded = await get();
    expect(downloaded.statusCode).toBe(200);
    expect(started()).toBe(1);
    const whole = downloaded.rawPayload.length;

    // The three reads a player makes around one play, none of which is a
    // second play. The probe that asks whether ranges work at all, the moov
    // atom at the end, and a chunk from the middle of a stream already
    // running — see startsAnEpisode, which is where the rule is argued.
    expect((await get({ range: 'bytes=0-1' })).statusCode).toBe(206);
    expect((await get({ range: 'bytes=-50' })).statusCode).toBe(206);
    expect(
      (await get({ range: `bytes=${Math.floor(whole / 2)}-` })).statusCode
    ).toBe(206);
    expect(started()).toBe(1);

    // And a second play does count, on the same row rather than a new one:
    // the table holds one row per episode per day whatever the traffic.
    expect((await get({ range: 'bytes=0-' })).statusCode).toBe(206);
    expect(started()).toBe(2);
    expect(
      app.db
        .prepare('SELECT COUNT(*) AS rows FROM episode_listens')
        .get() as { rows: number }
    ).toEqual({ rows: 1 });
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

describe('a guest', () => {
  /** Puts a guest identity into the recording, with or without audio. */
  function addGuest(
    recordingId: string,
    identity: string,
    { spoke }: { spoke: boolean }
  ) {
    const row = app.db
      .prepare('SELECT stems, participants FROM recordings WHERE id = ?')
      .get(recordingId) as { stems: string; participants: string };
    const stems = JSON.parse(row.stems);
    const participants = JSON.parse(row.participants);
    // Present either way: a run's audience unions presence with stems, so a
    // guest who never spoke is still on the roster. That is the case this
    // whole distinction is about.
    participants.push(identity);
    if (spoke) stems[identity] = [{ key: `${identity}/0.ogg`, startMs: 0 }];
    app.db
      .prepare('UPDATE recordings SET stems = ?, participants = ? WHERE id = ?')
      .run(JSON.stringify(stems), JSON.stringify(participants), recordingId);
  }

  /**
   * A seat, optionally belonging to somebody with an account here.
   *
   * `admitted_by` is a real foreign key onto accounts, so a member has to
   * have let them in — which is true of every seat there has ever been.
   */
  function seat(
    identity: string,
    channelId: string,
    admittedBy: string,
    accountId: string | null
  ) {
    app.db
      .prepare(
        `INSERT INTO guest_sessions
           (id, channel_id, link_token, secret_hash, display_name, account_id,
            admitted_at, admitted_by, may_speak, last_seen_at, expires_at)
         VALUES (?, ?, 'tok', 'hash', 'A guest', ?, ?, ?, 1, ?, ?)`
      )
      .run(
        identity,
        channelId,
        accountId,
        clock,
        admittedBy,
        clock,
        clock + 1_000_000
      );
  }

  /**
   * What the guest page's checkbox does, without a live room and a socket in
   * the way: the seat is written and publication is told, which is exactly
   * the pair `dispatchGuest` performs for a `SET_PUBLISH_CONSENT`.
   */
  function agree(identity: string, channelId: string, consented: boolean) {
    app.db
      .prepare('UPDATE guest_sessions SET publish_consent_at = ? WHERE id = ?')
      .run(consented ? clock : null, identity);
    app.publication.guestConsentChanged(channelId, identity, consented);
  }

  it('who spoke without an account cannot be published around', async () => {
    const { alice, bob, channelId, recordingId } = await recorded();
    await goPublic(alice.token, channelId);
    addGuest(recordingId, 'guest_stranger', { spoke: true });
    seat('guest_stranger', channelId, alice.account.id, null);

    const refused = await consent(alice.token, recordingId);
    expect(refused.statusCode).toBe(400);
    expect(refused.json().error).toContain('nobody to ask');

    expect((await consent(bob.token, recordingId)).statusCode).toBe(400);
    expect((await feedFor(channelId)).payload).not.toContain('<item>');
  }, 60_000);

  /**
   * The defect this replaced. A recording's audience unions presence with
   * stems, so somebody who sat in the room and never opened their microphone
   * is on the roster — and the first version of this rule let them veto a
   * conversation they contributed no audio to, permanently and with nobody
   * able to undo it.
   */
  it('who only listened blocks nothing, being in none of the audio', async () => {
    const { alice, bob, channelId, recordingId } = await recorded();
    await goPublic(alice.token, channelId);
    addGuest(recordingId, 'guest_quiet', { spoke: false });
    seat('guest_quiet', channelId, alice.account.id, null);

    await consent(alice.token, recordingId);
    const done = await consent(bob.token, recordingId);
    expect(done.statusCode).toBe(200);
    expect(done.json().publishedAt).toBe(clock);
    // And they are not in the set of people who had to agree: there is
    // nothing of theirs to agree about.
    expect(done.json().required).toHaveLength(2);
  }, 120_000);

  /**
   * A guest is somebody holding a seat in a channel they are not a member of
   * — with or without an account here. One who signed in before knocking is
   * reachable, so they are asked rather than treated as an obstacle.
   */
  /**
   * The answer to the one case that used to be unpublishable outright. A seat
   * cannot be asked per recording — it expires, so there is nobody to come
   * back to — but it can be asked at the microphone, which is the moment
   * somebody chooses to become part of the audio.
   */
  it('who agreed at the microphone no longer blocks it', async () => {
    const { alice, bob, channelId, recordingId } = await recorded();
    await goPublic(alice.token, channelId);
    addGuest(recordingId, 'guest_willing', { spoke: true });
    seat('guest_willing', channelId, alice.account.id, null);

    // Not asked yet: refused, exactly as before.
    expect((await consent(alice.token, recordingId)).statusCode).toBe(400);

    agree('guest_willing', channelId, true);

    await consent(alice.token, recordingId);
    const done = await consent(bob.token, recordingId);
    expect(done.statusCode).toBe(200);
    expect(done.json().publishedAt).toBe(clock);
    // They are not an outstanding agreement anybody is waiting on: they have
    // answered once, for this seat, and there is no account to ask again.
    expect(done.json().required).toHaveLength(2);
    await transcoded(recordingId);
    expect((await feedFor(channelId)).payload).toContain('<item>');
  }, 120_000);

  it('who takes it back at the microphone takes the episode down', async () => {
    const { alice, bob, channelId, recordingId } = await recorded();
    await goPublic(alice.token, channelId);
    addGuest(recordingId, 'guest_willing', { spoke: true });
    seat('guest_willing', channelId, alice.account.id, null);
    agree('guest_willing', channelId, true);
    await consent(alice.token, recordingId);
    await consent(bob.token, recordingId);
    await transcoded(recordingId);
    expect((await feedFor(channelId)).payload).toContain('<item>');

    // The same standing a member has over their own voice, for as long as
    // the seat lives.
    agree('guest_willing', channelId, false);
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

  it('who spoke and has an account is asked like anybody else', async () => {
    const { alice, bob, channelId, recordingId } = await recorded();
    const carol = await signIn('carol@example.com', 'Carol');
    await goPublic(alice.token, channelId);
    addGuest(recordingId, 'guest_carol', { spoke: true });
    seat('guest_carol', channelId, alice.account.id, carol.account.id);

    await consent(alice.token, recordingId);
    const stillWaiting = await consent(bob.token, recordingId);
    expect(stillWaiting.statusCode).toBe(200);
    // Three required, not two: the guest's account is one of them, so the
    // members alone cannot publish somebody else's voice.
    expect(stillWaiting.json().required).toHaveLength(3);
    expect(stillWaiting.json().publishedAt).toBeNull();
    expect((await feedFor(channelId)).payload).not.toContain('<item>');

    const published = await consent(carol.token, recordingId);
    expect(published.json().publishedAt).toBe(clock);
    await transcoded(recordingId);
    expect((await feedFor(channelId)).payload).toContain('<item>');

    // And they can take it back, exactly as any other participant can.
    await withdraw(carol.token, recordingId);
    expect((await feedFor(channelId)).payload).not.toContain('<item>');
  }, 120_000);
});

/**
 * The directory, which is the page that made a public channel *findable*
 * rather than merely reachable.
 *
 * The distinction is the whole reason these tests exist: a channel is on this
 * list because it is public, so the list going wrong is a privacy failure
 * rather than a broken page. What is asserted is therefore the boundary in
 * both directions — a private channel is absent, a channel that goes private
 * leaves at once — and the standing guarantee that no member is named, which
 * is checked against the rendered HTML with the real display names in the
 * database, as it is for the channel page.
 */
describe('the directory at /podcasts', () => {
  const directory = () =>
    app.fastify.inject({ method: 'GET', url: '/podcasts' });

  /**
   * Renames a channel, `recorded()` having given it a name of its own.
   *
   * The step in and out is not ceremony: `SET_NAME` is refused to somebody
   * who does not have the room, which after `recorded()` is everybody. The
   * settings screen tells a member the same thing.
   */
  const rename = (channelId: string, user: User, name: string) => {
    app.channels.dispatch(channelId, user.account.id, { type: 'ENTER' });
    app.channels.dispatch(channelId, user.account.id, {
      type: 'SET_NAME',
      name,
    } as never);
    app.channels.dispatch(channelId, user.account.id, { type: 'STEP_OUT' });
  };

  const describeChannelAs = (channelId: string, user: User, text: string) => {
    app.channels.dispatch(channelId, user.account.id, { type: 'ENTER' });
    app.channels.dispatch(channelId, user.account.id, {
      type: 'SET_DESCRIPTION',
      description: text,
    } as never);
    app.channels.dispatch(channelId, user.account.id, { type: 'STEP_OUT' });
  };

  it('lists nothing while no channel is public', async () => {
    const { channelId } = await recorded();
    const listing = await directory();
    expect(listing.statusCode).toBe(200);
    expect(listing.payload).toContain('No channel has a public page yet');
    expect(listing.payload).not.toContain(`/c/${channelId}`);
  }, 60_000);

  it('lists a public channel that has published nothing, and says so', async () => {
    const { alice, channelId } = await recorded();
    rename(channelId, alice, 'Thursday mornings');
    await goPublic(alice.token, channelId);

    const listing = await directory();
    expect(listing.payload).toContain(`/c/${channelId}`);
    expect(listing.payload).toContain('Thursday mornings');
    // The row is honest about leading nowhere yet, which is why an empty
    // channel is listed at all rather than hidden: see directory-page.ts.
    expect(listing.payload).toContain('Nothing published yet');
  }, 60_000);

  it('counts a recording once everybody has agreed to it', async () => {
    const { alice, bob, channelId, recordingId } = await recorded();
    await goPublic(alice.token, channelId);
    expect((await directory()).payload).toContain('Nothing published yet');

    await consent(alice.token, recordingId);
    // One agreement is not publication, here as everywhere else.
    expect((await directory()).payload).toContain('Nothing published yet');

    await consent(bob.token, recordingId);
    await transcoded(recordingId);
    const listing = await directory();
    expect(listing.payload).toContain('1 recording');
    expect(listing.payload).not.toContain('Nothing published yet');

    // And withdrawing empties the row again, on one person saying so.
    await withdraw(bob.token, recordingId);
    expect((await directory()).payload).toContain('Nothing published yet');
  }, 120_000);

  it('drops a channel the moment it stops being public', async () => {
    const { alice, channelId } = await recorded();
    rename(channelId, alice, 'Thursday mornings');
    await goPublic(alice.token, channelId);
    expect((await directory()).payload).toContain('Thursday mornings');

    expect((await goPublic(alice.token, channelId, false)).statusCode).toBe(200);
    const listing = await directory();
    expect(listing.payload).not.toContain('Thursday mornings');
    expect(listing.payload).not.toContain(`/c/${channelId}`);
  }, 60_000);

  it('names no member, whatever is in the channel', async () => {
    const { alice, bob, channelId, recordingId } = await recorded();
    await goPublic(alice.token, channelId);
    await consent(alice.token, recordingId);
    await consent(bob.token, recordingId);
    await transcoded(recordingId);

    const listing = await directory();
    expect(listing.statusCode).toBe(200);
    // The channel has a name, but its recording does not: a run nobody
    // renamed is filed under the participants' names, which is exactly the
    // string that must not reach a page a stranger reads. The row's count
    // comes from that recording, so this is the live path and not a hollow
    // assertion.
    expect(listing.payload).toContain('1 recording');
    expect(listing.payload).not.toContain('Alice');
    expect(listing.payload).not.toContain('Bob');
  }, 120_000);

  it('escapes what members wrote, since a stranger’s browser parses it', async () => {
    const { alice, channelId } = await recorded();
    rename(channelId, alice, '<script>alert(1)</script>');
    describeChannelAs(channelId, alice, 'Nick & "friends" <b>talk</b>');
    await goPublic(alice.token, channelId);

    const listing = await directory();
    expect(listing.payload).not.toContain('<script>alert(1)</script>');
    expect(listing.payload).toContain('&lt;script&gt;');
    expect(listing.payload).toContain('Nick &amp; &quot;friends&quot;');
  }, 60_000);

  it('puts the channel with the most recent conversation first', async () => {
    const older = await recorded();
    await goPublic(older.alice.token, older.channelId);
    rename(older.channelId, older.alice, 'The older one');
    await consent(older.alice.token, older.recordingId);
    await consent(older.bob.token, older.recordingId);
    await transcoded(older.recordingId);

    clock += 86_400_000;
    const newer = await recorded();
    await goPublic(newer.alice.token, newer.channelId);
    rename(newer.channelId, newer.alice, 'The newer one');
    await consent(newer.alice.token, newer.recordingId);
    await consent(newer.bob.token, newer.recordingId);
    await transcoded(newer.recordingId);

    const payload = (await directory()).payload;
    expect(payload.indexOf('The newer one')).toBeLessThan(
      payload.indexOf('The older one')
    );
  }, 180_000);
});
