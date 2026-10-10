import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';
import { ROOM_DEPARTURE_MS } from '../src/rooms';

/**
 * Rooms: a channel's sittings, from the first member stepping in to the last
 * stepping out. What is worth asserting is where one begins and ends, that a
 * restart does not split one, and that only a sitting that kept something is
 * listed.
 */

let clock = 1_700_000_000_000;
let app: App;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

beforeEach(() => {
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    media: new MemoryMediaServer(),
    now: () => clock,
    roomCloseGraceMs: 0,
  });
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

async function signIn(identifier: string, displayName: string) {
  const code = app.accounts.issueCode(identifier, clock)!;
  const verified = await app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, displayName },
  });
  return verified.json() as { token: string; account: { id: string } };
}

/** Alice and Bob, contacts, in a channel nobody has stepped in to yet. */
async function channel() {
  const alice = await signIn('alice@example.com', 'Alice');
  const bob = await signIn('bob@example.com', 'Bob');
  await app.fastify.inject({
    method: 'POST',
    url: '/contacts/request',
    headers: auth(alice.token),
    payload: { identifier: 'bob@example.com' },
  });
  await app.fastify.inject({
    method: 'POST',
    url: `/contacts/${alice.account.id}/accept`,
    headers: auth(bob.token),
  });
  const created = app.channels.create(alice.account.id, [bob.account.id]);
  if (!created.ok) throw new Error(created.error);
  const channelId = created.channel.id;
  // Whatever creating leaves present, start from an empty channel.
  for (const id of [alice.account.id, bob.account.id]) {
    app.channels.dispatch(channelId, id, { type: 'STEP_OUT' });
  }
  // And past the departure window, so the next step in is a new room.
  clock += ROOM_DEPARTURE_MS + 1;
  return { alice, bob, channelId };
}

function rows(channelId: string) {
  return app.db
    .prepare('SELECT * FROM rooms WHERE channel_id = ? ORDER BY opened_at')
    .all(channelId) as Array<{ id: string; opened_at: number; closed_at: number | null }>;
}

function line(channelId: string, at: number) {
  app.db
    .prepare(
      `INSERT INTO live_lines (id, channel_id, identity, display_name, start_at, end_at, text)
       VALUES (?, ?, 'x', 'X', ?, ?, 'hello')`
    )
    .run(`line_${at}`, channelId, at, at + 1_000);
}

function recording(channelId: string, initiator: string, at: number) {
  app.db
    .prepare(
      `INSERT INTO recordings (id, channel_id, initiator_id, invitee_id, started_at, duration_ms, s3_key, ended_at)
       VALUES (?, ?, ?, ?, ?, 60000, 'k', ?)`
    )
    .run(`rec_${at}`, channelId, initiator, initiator, at, at + 60_000);
}

describe('rooms', () => {
  it('open on the first step in and close on the last step out', async () => {
    const { alice, bob, channelId } = await channel();
    for (const room of rows(channelId)) expect(room.closed_at).not.toBeNull();
    const before = rows(channelId).length;

    clock += 1_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    const opened = clock;
    clock += 1_000;
    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    clock += 1_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    expect(rows(channelId)).toHaveLength(before + 1);
    expect(rows(channelId).at(-1)).toMatchObject({ opened_at: opened, closed_at: null });

    clock += 1_000;
    app.channels.dispatch(channelId, bob.account.id, { type: 'STEP_OUT' });
    expect(rows(channelId).at(-1)).toMatchObject({ opened_at: opened, closed_at: clock });
  });

  it('lists only the sittings that kept something', async () => {
    const { alice, channelId } = await channel();
    const sit = () => {
      clock += 60_000;
      app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
      const from = clock;
      clock += 60_000;
      app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
      return from;
    };
    sit();
    const transcribed = sit();
    line(channelId, transcribed + 1_000);
    const recorded = sit();
    recording(channelId, alice.account.id, recorded + 1_000);

    const listed = await app.fastify.inject({
      method: 'GET',
      url: `/channels/${channelId}/rooms`,
      headers: auth(alice.token),
    });
    expect(listed.statusCode).toBe(200);
    const { rooms } = listed.json() as {
      rooms: Array<{ openedAt: number; recordingIds: string[]; transcribed: boolean }>;
    };
    expect(rooms.map((r) => r.openedAt)).toEqual([transcribed, recorded]);
    expect(rooms[0]).toMatchObject({ transcribed: true, recordingIds: [] });
    expect(rooms[1]).toMatchObject({
      transcribed: false,
      recordingIds: [`rec_${recorded + 1_000}`],
    });
  });

  it('carry on through a step out and back inside the departure window, as LiveKit does', async () => {
    const { alice, channelId } = await channel();
    clock += 1_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    const sitting = rows(channelId).at(-1)!;
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    clock += ROOM_DEPARTURE_MS;
    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    expect(rows(channelId).at(-1)).toMatchObject({ id: sitting.id, closed_at: null });

    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    clock += ROOM_DEPARTURE_MS + 1;
    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    expect(rows(channelId).at(-1)!.id).not.toBe(sitting.id);
  });

  it('list a recording that fell in no sitting as a room of its own, first', async () => {
    const { alice, channelId } = await channel();
    const old = clock - 86_400_000;
    recording(channelId, alice.account.id, old);
    clock += 1_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    const sitting = clock;
    line(channelId, sitting + 1);
    clock += 1_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });

    const { rooms } = (
      await app.fastify.inject({
        method: 'GET',
        url: `/channels/${channelId}/rooms`,
        headers: auth(alice.token),
      })
    ).json() as { rooms: Array<Record<string, unknown>> };
    expect(rooms).toHaveLength(2);
    expect(rooms[0]).toEqual({
      id: `standin_rec_${old}`,
      openedAt: old,
      closedAt: old + 60_000,
      recordingIds: [`rec_${old}`],
      transcribed: false,
      standIn: true,
    });
    expect(rooms[1]).toMatchObject({ openedAt: sitting, transcribed: true });
  });

  it('end at a restart, which deletes the LiveKit room, however soon people return', async () => {
    const { alice, channelId } = await channel();
    clock += 1_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    const sitting = rows(channelId).at(-1)!;

    clock += 1_000;
    const boot = clock;
    app.channels.rooms.restore(boot);
    // Presence does not survive a restart; the reconnect is a fresh step in.
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    clock += 1_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });

    const latest = rows(channelId);
    expect(latest.at(-2)).toMatchObject({ id: sitting.id, closed_at: boot });
    expect(latest.at(-1)).toMatchObject({ closed_at: null });
    expect(latest.at(-1)!.id).not.toBe(sitting.id);
  });

  it('answer a stranger as they would a channel that does not exist', async () => {
    const { channelId } = await channel();
    const carol = await signIn('carol@example.com', 'Carol');
    const listed = await app.fastify.inject({
      method: 'GET',
      url: `/channels/${channelId}/rooms`,
      headers: auth(carol.token),
    });
    expect(listed.statusCode).toBe(404);
  });

  it('refuse to export a room nothing was recorded in', async () => {
    const { alice, channelId } = await channel();
    clock += 1_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    line(channelId, clock + 1);
    clock += 1_000;
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    const room = rows(channelId).at(-1)!;
    const exported = await app.fastify.inject({
      method: 'GET',
      url: `/channels/${channelId}/rooms/${room.id}/export`,
      headers: auth(alice.token),
    });
    expect(exported.statusCode).toBe(404);
    expect(exported.json()).toEqual({ error: 'Nothing was recorded in this room.' });
  });
});
