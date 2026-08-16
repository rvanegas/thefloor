import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp, type App } from '../src/app';
import { mixKeyFor } from '../src/channels';
import { openDb } from '../src/db';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';
import { MemoryRecordingStore } from '../src/storage';

/**
 * Mixing when the run ends rather than when somebody asks.
 *
 * The promise this makes is not about speed in the abstract — it is that a
 * recording card on the screen is one that plays and exports *now*. That is
 * two claims, and both are tested here: a recording is shown to nobody while
 * its mix is being made, and once it is shown the audio is fetched rather than
 * encoded.
 *
 * The second is the one that could rot quietly, so it is measured by putting
 * bytes nothing could have encoded into the bucket and asking for the export.
 * Getting them back is proof it was not re-derived; an assertion about timing
 * would pass on a fast enough machine either way.
 */

let app: App;
let media: MemoryMediaServer;
let store: MemoryRecordingStore;
let dir: string;
let clock = 1_700_000_000_000;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'thefloor-mixing-'));
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
  });
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const settle = () => new Promise((r) => setTimeout(r, 0));

/** A steady tone, so the mix is real audio ffmpeg will accept. */
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
 * Records for thirty seconds and stops.
 *
 * `uploaded` decides whether the stems are in the bucket by the time the mix
 * looks for them. They are put in the same turn as the stop, which is what
 * makes the happy path deterministic: everything the mix does after reading
 * the row is asynchronous, so a synchronous write here always wins.
 */
async function record({ uploaded }: { uploaded: boolean }) {
  const alice = await signIn('alice@example.com', 'Alice');
  const bob = await signIn('bob@example.com', 'Bob');
  await befriend(alice, bob, 'bob@example.com');

  const created = await app.fastify.inject({
    method: 'POST',
    url: '/channels',
    headers: auth(alice.token),
    payload: { contactIds: [bob.account.id] },
  });
  const { channelId } = created.json() as { channelId: string };
  app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
  app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
  await settle();
  clock += 30_000;

  const stem = uploaded ? await tone('stem.ogg', 3) : null;
  app.channels.dispatch(channelId, alice.account.id, { type: 'STOP_RECORDING' });
  if (stem) for (const { key } of media.recordings) store.put(key, stem);

  return { alice, bob, channelId };
}

const stateOf = (id: string) =>
  (
    app.db.prepare('SELECT mix_state FROM recordings WHERE id = ?').get(id) as
      | { mix_state: string | null }
      | undefined
  )?.mix_state;

describe('a recording that has just been made', () => {
  it('is shown to nobody until its mix exists, then to everybody', async () => {
    const { alice, bob, channelId } = await record({ uploaded: true });

    // The run is filed and the row is there — it is the *card* that waits.
    expect(app.channels.recordingsFor(alice.account.id)).toHaveLength(0);
    expect(app.channels.recordingsInChannel(channelId, bob.account.id)).toHaveLength(0);

    await app.channels.mixesSettled();

    const [recording] = app.channels.recordingsFor(alice.account.id);
    expect(recording).toBeDefined();
    expect(stateOf(recording.id)).toBe('ready');
    expect(store.keys()).toContain(mixKeyFor(channelId, recording.id));
    expect(app.channels.recordingsInChannel(channelId, bob.account.id)).toHaveLength(1);
  }, 60_000);

  it('exports the stored mix rather than encoding one again', async () => {
    const { alice, channelId } = await record({ uploaded: true });
    await app.channels.mixesSettled();
    const [recording] = app.channels.recordingsFor(alice.account.id);

    // Bytes no encoder would produce. What comes back is what was stored.
    const sentinel = Buffer.from('the mix that was made when the run ended');
    store.put(mixKeyFor(channelId, recording.id), sentinel);

    const response = await app.fastify.inject({
      method: 'GET',
      url: `/recordings/${recording.id}/export`,
      headers: auth(alice.token),
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('audio/ogg');
    expect(Buffer.from(response.rawPayload)).toEqual(sentinel);
  }, 60_000);
});

describe('a mix that could not be made', () => {
  it('leaves the recording visible and exportable, at the old cost', async () => {
    // No stems in the bucket and no waiting for them, which is the shape of
    // every real failure: the mix cannot be made from what is there.
    app.channels.stop();
    await app.fastify.close();
    media = new MemoryMediaServer();
    store = new MemoryRecordingStore();
    app = buildApp({
      dbPath: ':memory:',
      mailer: new MemoryMailer(),
      media,
      mediaUrl: 'wss://example.livekit.cloud',
      store,
      mixWaitMs: 0,
      now: () => clock,
      roomCloseGraceMs: 0,
    });

    const { alice } = await record({ uploaded: false });
    await app.channels.mixesSettled();

    const [recording] = app.channels.recordingsFor(alice.account.id);
    expect(recording).toBeDefined();
    expect(stateOf(recording.id)).toBe('unmixed');

    // The stems arrive later — a failure that was transient after all. The
    // export encodes on demand, exactly as every export used to, and keeps
    // what it made so it is only ever slow once.
    const stem = await tone('late.ogg', 3);
    for (const { key } of media.recordings) store.put(key, stem);

    const response = await app.fastify.inject({
      method: 'GET',
      url: `/recordings/${recording.id}/export`,
      headers: auth(alice.token),
    });
    expect(response.statusCode).toBe(200);
    expect(response.rawPayload.length).toBeGreaterThan(1000);
    expect(stateOf(recording.id)).toBe('ready');
  }, 60_000);
});

describe('recordings made before mixes existed', () => {
  it('are shown, and mix themselves the first time they are asked for', async () => {
    // A row whose mix_state is null is what every recording in the database
    // looked like before this column. The backfill runs at open, so this is
    // the state such a row is actually in when the new server first sees it.
    const path = join(dir, 'legacy.db');
    const first = openDb(path);
    const accounts = `INSERT INTO accounts (id, identifier, display_name, created_at)
                      VALUES ('acct_a', 'a@example.com', 'A', 1),
                             ('acct_b', 'b@example.com', 'B', 1)`;
    first.exec(accounts);
    first.exec(`INSERT INTO channels (id, initiator_id, invitee_id, created_at)
                VALUES ('chan_1', 'acct_a', 'acct_b', 1)`);
    first.exec(`INSERT INTO recordings
                  (id, channel_id, initiator_id, invitee_id, started_at,
                   duration_ms, s3_key, ended_at, mix_state)
                VALUES ('rec_1', 'chan_1', 'acct_a', 'acct_b', 1, 5000, '',
                        6000, NULL)`);
    first.close();

    const reopened = openDb(path);
    const row = reopened
      .prepare('SELECT mix_state FROM recordings WHERE id = ?')
      .get('rec_1') as { mix_state: string | null };
    // 'unmixed', not 'pending': a backfill that hid the whole history behind a
    // queue nobody asked for would be the worse mistake by a distance.
    expect(row.mix_state).toBe('unmixed');
    reopened.close();
    await rm(path, { force: true });
  });
});

describe('a mix interrupted by a restart', () => {
  it('is made again when the server comes back, rather than staying hidden', async () => {
    const path = join(dir, 'restart.db');
    await rm(path, { force: true });
    const accountsSql = `INSERT INTO accounts (id, identifier, display_name, created_at)
                         VALUES ('acct_a', 'a@example.com', 'A', 1),
                                ('acct_b', 'b@example.com', 'B', 1)`;

    const before = buildApp({
      dbPath: path,
      mailer: new MemoryMailer(),
      store,
      now: () => clock,
    });
    before.db.exec(accountsSql);
    before.db.exec(`INSERT INTO channels (id, initiator_id, invitee_id, created_at, participants)
                    VALUES ('chan_1', 'acct_a', 'acct_b', 1, '["acct_a","acct_b"]')`);
    before.db
      .prepare(
        `INSERT INTO recordings
           (id, channel_id, initiator_id, invitee_id, participants, started_at,
            duration_ms, s3_key, stems, floor_timeline, ended_at, mix_state)
         VALUES ('rec_1', 'chan_1', 'acct_a', 'acct_b', '["acct_a","acct_b"]',
                 1, 3000, '', ?, '[]', 4000, 'pending')`
      )
      .run(JSON.stringify({ acct_a: [{ key: 'a.ogg', startMs: 0 }] }));
    store.put('a.ogg', await tone('restart.ogg', 3));
    before.channels.stop();
    await before.fastify.close();

    // Pending is invisible, so a process that died mid-mix would otherwise
    // have hidden this recording permanently.
    const after = buildApp({
      dbPath: path,
      mailer: new MemoryMailer(),
      store,
      now: () => clock,
    });
    await after.channels.mixesSettled();
    const state = (
      after.db.prepare('SELECT mix_state FROM recordings WHERE id = ?').get('rec_1') as {
        mix_state: string;
      }
    ).mix_state;
    expect(state).toBe('ready');
    expect(store.keys()).toContain(mixKeyFor('chan_1', 'rec_1'));

    after.channels.stop();
    await after.fastify.close();
    await rm(path, { force: true });
  }, 60_000);
});

describe('the sweep', () => {
  it('takes the mix with the stems it was made from', async () => {
    const { alice, channelId } = await record({ uploaded: true });
    await app.channels.mixesSettled();
    const [recording] = app.channels.recordingsFor(alice.account.id);
    expect(store.keys()).toContain(mixKeyFor(channelId, recording.id));

    await app.fastify.inject({
      method: 'DELETE',
      url: `/recordings/${recording.id}`,
      headers: auth(alice.token),
    });
    app.channels.sweepDeleted(clock + 8 * 24 * 60 * 60 * 1000);

    expect(store.keys()).not.toContain(mixKeyFor(channelId, recording.id));
    expect(store.keys()).toHaveLength(0);
  }, 60_000);
});
