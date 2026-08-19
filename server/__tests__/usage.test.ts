import { USAGE_RETENTION_MS } from '../../core/constants';
import { buildApp, type App } from '../src/app';
import { mixKeyFor } from '../src/channels';
import type { UsageSpanRow, UsageBytesRow } from '../src/db';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';
import { MemoryRecordingStore } from '../src/storage';

/**
 * The meter, which is the only thing here that measures rather than decides.
 *
 * Two of these tests are the whole reason it is built the way it is. The
 * dead-room one is why microphones are asked about rather than derived from
 * presence, and the stray one is why an interrupted span is closed at its own
 * start rather than at boot. The rest guard arithmetic.
 */

let app: App;
let media: MemoryMediaServer;
let store: MemoryRecordingStore;
let clock = 1_700_000_000_000;

const T0 = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  clock = T0;
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
    // One attempt at a stem that is never going to appear: nothing here
    // captures real audio, and a mix that waits is a test that hangs.
    mixWaitMs: 0,
  });
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const settle = () => new Promise((r) => setTimeout(r, 0));

const spans = (kind?: string): UsageSpanRow[] =>
  app.db
    .prepare(
      kind
        ? 'SELECT * FROM usage_spans WHERE kind = ? ORDER BY started_at, id'
        : 'SELECT * FROM usage_spans ORDER BY started_at, id'
    )
    .all(...(kind ? [kind] : [])) as unknown as UsageSpanRow[];

const bytes = (): UsageBytesRow[] =>
  app.db
    .prepare('SELECT * FROM usage_bytes ORDER BY at, id')
    .all() as unknown as UsageBytesRow[];

/** Total metered milliseconds of a kind, counting an open span as open. */
function minutesOf(kind: string, accountId?: string): number {
  return spans(kind)
    .filter((s) => accountId === undefined || s.account_id === accountId)
    .reduce((total, s) => total + ((s.ended_at ?? clock) - s.started_at), 0);
}

async function signIn(identifier: string, displayName: string) {
  const code = app.accounts.issueCode(identifier, clock)!;
  const verified = await app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, displayName },
  });
  return verified.json() as {
    token: string;
    account: { id: string; displayName: string };
  };
}

type User = Awaited<ReturnType<typeof signIn>>;

/** Makes two accounts contacts, the way the application would. */
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

/** Alice and Bob, contacts, in a channel Alice created and both are in. */
async function channelOfTwo() {
  const alice = await signIn('alice@example.com', 'Alice');
  const bob = await signIn('bob@example.com', 'Bob');
  await befriend(alice, bob, 'bob@example.com');
  const created = await app.fastify.inject({
    method: 'POST',
    url: '/channels',
    headers: auth(alice.token),
    payload: { contactId: bob.account.id },
  });
  const { channelId } = created.json() as { channelId: string };
  app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
  return { alice: alice.account, bob: bob.account, aliceUser: alice, channelId };
}

/**
 * Puts somebody in the room, which is what makes them publish.
 *
 * A token is what the memory media server counts as having arrived, which is
 * the same thing it means in production: presence is a websocket, and being in
 * the room is a separate fact that has to be established separately. That gap
 * is the subject of half this file.
 */
async function joinRoom(channelId: string, userId: string) {
  await app.channels.mediaToken(channelId, userId);
}

describe('microphone minutes', () => {
  it('accrue between polls for whoever is publishing', async () => {
    const { alice, bob, channelId } = await channelOfTwo();
    await joinRoom(channelId, alice.id);
    await joinRoom(channelId, bob.id);

    app.channels.pollUsage();
    await settle();
    expect(spans('mic')).toHaveLength(2);
    expect(spans('mic').every((s) => s.ended_at === null)).toBe(true);

    clock += 60_000;
    media.unpublished.add(`${channelId}/${bob.id}`);
    app.channels.pollUsage();
    await settle();

    const bobs = spans('mic').find((s) => s.account_id === bob.id)!;
    expect(bobs.ended_at! - bobs.started_at).toBe(60_000);
    // Alice never stopped, so hers is still open rather than restarted.
    expect(spans('mic').filter((s) => s.account_id === alice.id)).toHaveLength(1);
  });

  it('are attributed to the room, not to presence', async () => {
    const { alice, bob, channelId } = await channelOfTwo();
    await joinRoom(channelId, alice.id);
    await joinRoom(channelId, bob.id);
    // Bob's room dies while his socket lives: he is `present`, and publishing
    // nothing. This is the Telegram-call case in planning/STATES.md, and a
    // meter derived from presence would bill him for every minute of it.
    media.unpublished.add(`${channelId}/${bob.id}`);

    app.channels.pollUsage();
    await settle();
    clock += 5 * 60_000;
    app.channels.pollUsage();
    await settle();

    expect(app.channels.get(channelId)!.present).toContain(bob.id);
    expect(minutesOf('mic', bob.id)).toBe(0);
    expect(minutesOf('mic', alice.id)).toBe(5 * 60_000);
  });

  it('are not counted twice when a poll repeats itself', async () => {
    const { alice, channelId } = await channelOfTwo();
    await joinRoom(channelId, alice.id);

    for (let i = 0; i < 4; i += 1) {
      app.channels.pollUsage();
      await settle();
      clock += 15_000;
    }

    expect(spans('mic').filter((s) => s.account_id === alice.id)).toHaveLength(1);
  });
});

describe('listening minutes', () => {
  it('are one span per listener, not per speaker', async () => {
    const { alice, bob, channelId } = await channelOfTwo();
    await joinRoom(channelId, alice.id);
    await joinRoom(channelId, bob.id);

    app.channels.pollUsage();
    await settle();

    expect(spans('listen').map((s) => s.account_id).sort()).toEqual(
      [alice.id, bob.id].sort()
    );
  });

  it('are not opened for somebody alone in a room', async () => {
    const { alice, bob, channelId } = await channelOfTwo();
    app.channels.dispatch(channelId, bob.id, { type: 'STEP_OUT' });
    await joinRoom(channelId, alice.id);

    app.channels.pollUsage();
    await settle();

    expect(spans('listen')).toHaveLength(0);
    // She is still publishing, which is what the box is actually carrying.
    expect(spans('mic')).toHaveLength(1);
  });
});

describe('playback minutes', () => {
  it('count time playing, not time loaded', async () => {
    const { alice, channelId } = await channelOfTwo();
    await app.channels.loadTrack(channelId, alice.id, {
      file: '/dev/null',
      dir: '/tmp',
      title: 'Something',
      durationMs: 10 * 60_000,
    });

    // Loaded and paused for a minute: the participant is open and publishing
    // silence, and none of that is playback.
    clock += 60_000;
    expect(spans('playback')).toHaveLength(0);

    app.channels.dispatch(channelId, alice.id, { type: 'PLAY' });
    clock += 30_000;
    app.channels.dispatch(channelId, alice.id, { type: 'PAUSE' });
    clock += 60_000;

    // Both of them, since both were in the room to hear it. The stream was
    // one; this is listening time and not stream time.
    expect(spans('playback')).toHaveLength(2);
    expect(minutesOf('playback', alice.id)).toBe(30_000);
    expect(minutesOf('playback')).toBe(60_000);
  });

  it('start for somebody who arrives mid-track, and stop when they leave', async () => {
    const { alice, bob, channelId } = await channelOfTwo();
    app.channels.dispatch(channelId, bob.id, { type: 'STEP_OUT' });
    await app.channels.loadTrack(channelId, alice.id, {
      file: '/dev/null',
      dir: '/tmp',
      title: 'Something',
      durationMs: 10 * 60_000,
    });
    app.channels.dispatch(channelId, alice.id, { type: 'PLAY' });

    clock += 60_000;
    app.channels.dispatch(channelId, bob.id, { type: 'ENTER' });
    clock += 30_000;
    app.channels.dispatch(channelId, bob.id, { type: 'STEP_OUT' });
    clock += 30_000;

    // Bob is charged the half he was there for, Alice the whole of it.
    expect(minutesOf('playback', bob.id)).toBe(30_000);
    expect(minutesOf('playback', alice.id)).toBe(120_000);
  });

  it('resume as a second span rather than extending the first', async () => {
    const { alice, channelId } = await channelOfTwo();
    await app.channels.loadTrack(channelId, alice.id, {
      file: '/dev/null',
      dir: '/tmp',
      title: 'Something',
      durationMs: 10 * 60_000,
    });

    for (const _ of [1, 2]) {
      app.channels.dispatch(channelId, alice.id, { type: 'PLAY' });
      clock += 20_000;
      app.channels.dispatch(channelId, alice.id, { type: 'PAUSE' });
      clock += 5_000;
    }

    // Two runs, two people in the room for both.
    expect(spans('playback')).toHaveLength(4);
    expect(minutesOf('playback', alice.id)).toBe(40_000);
  });
});

describe('recording minutes', () => {
  it('are attributed to whoever started the run, not to the channel', async () => {
    const { alice, bob, channelId } = await channelOfTwo();
    // Alice created the channel, so she is its `initiator` and the legacy
    // anchor column on the recordings row. Bob starts the recording, and
    // these minutes are his.
    app.channels.dispatch(channelId, bob.id, { type: 'START_RECORDING' });
    await settle();

    const egress = spans('egress');
    expect(egress).toHaveLength(2);
    expect(egress.every((s) => s.account_id === bob.id)).toBe(true);
    // Whose voice each stem carries is the other column.
    expect(egress.map((s) => s.peer_id).sort()).toEqual([alice.id, bob.id].sort());
    expect(new Set(egress.map((s) => s.recording_id)).size).toBe(1);
  });

  it('open one span per stem and close every one when the run stops', async () => {
    const { bob, channelId } = await channelOfTwo();
    app.channels.dispatch(channelId, bob.id, { type: 'START_RECORDING' });
    await settle();
    clock += 45_000;
    app.channels.dispatch(channelId, bob.id, { type: 'STOP_RECORDING' });
    await settle();

    expect(spans('egress')).toHaveLength(2);
    expect(spans('egress').every((s) => s.ended_at !== null)).toBe(true);
    // Two stems for forty-five seconds is ninety seconds of egress, which is
    // the figure the box is actually charged in CPU.
    expect(minutesOf('egress')).toBe(90_000);
  });

  it('end a stem when its owner leaves mid-run', async () => {
    const { alice, bob, channelId } = await channelOfTwo();
    app.channels.dispatch(channelId, bob.id, { type: 'START_RECORDING' });
    await settle();
    clock += 20_000;
    app.channels.dispatch(channelId, alice.id, { type: 'STEP_OUT' });
    await settle();

    const hers = spans('egress').find((s) => s.peer_id === alice.id)!;
    expect(hers.ended_at! - hers.started_at).toBe(20_000);
    expect(spans('egress').find((s) => s.peer_id === bob.id)!.ended_at).toBeNull();
  });
});

describe('pair minutes', () => {
  it('are canonically ordered, whoever arrived first', async () => {
    const { alice, bob, channelId } = await channelOfTwo();
    const [pair] = spans('pair');
    const [first, second] = [alice.id, bob.id].sort();

    expect(spans('pair')).toHaveLength(1);
    expect(pair.account_id).toBe(first);
    expect(pair.peer_id).toBe(second);
    expect(pair.channel_id).toBe(channelId);
  });

  it('close when one of the pair steps out, and count the overlap', async () => {
    const { alice, bob, channelId } = await channelOfTwo();
    clock += 90_000;
    app.channels.dispatch(channelId, bob.id, { type: 'STEP_OUT' });

    expect(minutesOf('pair')).toBe(90_000);
    expect(spans('pair')[0].ended_at).not.toBeNull();
  });

  it('leave an existing pair alone when a third person arrives', async () => {
    const { alice, aliceUser, channelId } = await channelOfTwo();
    const carol = await signIn('carol@example.com', 'Carol');
    await befriend(aliceUser, carol, 'carol@example.com');

    clock += 60_000;
    app.channels.dispatch(channelId, alice.id, {
      type: 'INVITE',
      contactId: carol.account.id,
    } as never);
    app.channels.dispatch(channelId, carol.account.id, { type: 'ENTER' });

    // Three people present is three pairs, and the original one has been
    // running the whole minute rather than being restarted by the arrival.
    expect(spans('pair')).toHaveLength(3);
    const original = spans('pair').find(
      (s) => s.account_id !== carol.account.id && s.peer_id !== carol.account.id
    )!;
    expect(original.started_at).toBe(T0);
    expect(original.ended_at).toBeNull();
  });
});

describe('bytes', () => {
  it('are recorded against whoever asked for the export', async () => {
    const { alice, bob, channelId } = await channelOfTwo();
    // A finished recording with a mix already in the bucket. Written straight
    // to the table rather than captured: what is under test is who the bytes
    // are charged to, and the encoder has its own tests.
    const audio = Buffer.alloc(4096, 7);
    const id = 'rec_metered';
    app.db
      .prepare(
        `INSERT INTO recordings
           (id, channel_id, initiator_id, invitee_id, participants, started_at,
            duration_ms, s3_key, mix_state, ended_at)
         VALUES (?, ?, ?, ?, ?, ?, 5000, '', 'ready', ?)`
      )
      .run(
        id,
        channelId,
        alice.id,
        bob.id,
        JSON.stringify([alice.id, bob.id]),
        clock,
        clock + 5_000
      );
    await store.put(mixKeyFor(channelId, id), audio);

    const before = bytes().length;
    const token = (await signIn('alice@example.com', 'Alice')).token;
    const exported = await app.fastify.inject({
      method: 'GET',
      url: `/recordings/${id}/export`,
      headers: auth(token),
    });
    expect(exported.statusCode).toBe(200);

    const row = bytes()
      .slice(before)
      .find((b) => b.kind === 'export')!;
    expect(row.account_id).toBe(alice.id);
    expect(row.recording_id).toBe(id);
    expect(row.bytes).toBe(audio.length);
  });
});

describe('a restart', () => {
  it('closes a stray span at its own start, not at boot', async () => {
    const { channelId } = await channelOfTwo();
    expect(spans('pair')[0].ended_at).toBeNull();

    // A weekend of downtime. Crediting the span any of it would report a
    // weekend of conversation nobody had.
    clock += 2 * DAY;
    expect(app.channels.usage.closeStrays()).toBe(1);

    const [pair] = spans('pair');
    expect(pair.ended_at).toBe(pair.started_at);
    expect(minutesOf('pair')).toBe(0);
  });
});

describe('the sweep', () => {
  it('removes closed spans past the horizon and keeps the rest', async () => {
    const { bob, channelId } = await channelOfTwo();
    clock += 60_000;
    app.channels.dispatch(channelId, bob.id, { type: 'STEP_OUT' });
    expect(spans('pair')[0].ended_at).not.toBeNull();

    app.channels.dispatch(channelId, bob.id, { type: 'ENTER' });
    expect(spans('pair')).toHaveLength(2);

    const swept = app.channels.usage.sweep(clock + USAGE_RETENTION_MS + 1);
    expect(swept.spans).toBe(1);
    // The open one survives: a span open past the horizon is a leak, and
    // sweeping it would hide the leak rather than the row.
    expect(spans('pair')).toHaveLength(1);
    expect(spans('pair')[0].ended_at).toBeNull();
  });

  it('removes byte rows past the horizon', async () => {
    app.channels.usage.recordBytes({ kind: 'export', bytes: 1024 });
    expect(bytes()).toHaveLength(1);

    expect(app.channels.usage.sweep(clock + USAGE_RETENTION_MS - 1).bytes).toBe(0);
    expect(app.channels.usage.sweep(clock + USAGE_RETENTION_MS + 1).bytes).toBe(1);
    expect(bytes()).toHaveLength(0);
  });
});

describe('deleting an account', () => {
  it('leaves no row naming it, on either side of a pair', async () => {
    const { alice, bob, channelId } = await channelOfTwo();
    app.channels.dispatch(channelId, bob.id, { type: 'START_RECORDING' });
    await settle();
    app.channels.usage.recordBytes({
      kind: 'export',
      bytes: 10,
      accountId: bob.id,
    });
    // Alice's own, naming nobody else — every *span* in this scenario names
    // Bob one way or the other, so without this there is nothing of hers left
    // to be collateral damage and the last assertion would prove nothing.
    app.channels.usage.recordBytes({
      kind: 'export',
      bytes: 11,
      accountId: alice.id,
    });
    expect(spans().length).toBeGreaterThan(0);

    // Bob is the `peer_id` of the pair span whenever his id sorts second,
    // which is the case a delete keyed on account_id alone would miss.
    const token = (await signIn('bob@example.com', 'Bob')).token;
    const deleted = await app.fastify.inject({
      method: 'DELETE',
      url: '/me',
      headers: auth(token),
    });
    expect(deleted.statusCode).toBe(204);

    const naming = spans().filter(
      (s) => s.account_id === bob.id || s.peer_id === bob.id
    );
    expect(naming).toEqual([]);
    expect(bytes().filter((b) => b.account_id === bob.id)).toEqual([]);
    // Alice's own rows are not collateral.
    expect(bytes().filter((b) => b.account_id === alice.id)).toHaveLength(1);
  });
});
