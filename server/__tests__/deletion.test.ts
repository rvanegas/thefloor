import { DELETED_RETENTION_MS } from '../../core/constants';
import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';
import { MemoryRecordingStore } from '../src/storage';

/**
 * Deleting a channel, which is what happens to its recordings.
 *
 * Recordings belong to the channel they were made in: it names them, its
 * members are who may hear them, and it takes them with it when it goes. The
 * going is a mark and a sweep a week later — long enough that a mistake is
 * recoverable by hand, and late enough that the foreign key never points at
 * nothing.
 */

let app: App;
let media: MemoryMediaServer;
let store: MemoryRecordingStore;
let clock = 1_700_000_000_000;

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

/** A channel with one finished recording in it, and a third party outside. */
async function recorded() {
  const alice = await signIn('alice@example.com', 'Alice');
  const bob = await signIn('bob@example.com', 'Bob');
  const carol = await signIn('carol@example.com', 'Carol');
  await befriend(alice, bob, 'bob@example.com');
  await befriend(alice, carol, 'carol@example.com');

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
  app.channels.dispatch(channelId, alice.account.id, {
    type: 'STOP_RECORDING',
  });
  await settle();

  // The keys the run wrote, put in the store so the sweep has something to
  // empty. MemoryMediaServer records what it was asked to capture.
  const keys = media.recordings.map((r) => r.key);
  for (const key of keys) store.put(key, Buffer.from('audio'));
  return { alice, bob, carol, channelId, keys };
}

const rowsOf = (channelId: string) =>
  app.db
    .prepare(
      'SELECT id, deleted_at FROM recordings WHERE channel_id = ?'
    )
    .all(channelId) as unknown as Array<{ id: string; deleted_at: number | null }>;

describe('who can see a recording', () => {
  it('shows it to everyone in the channel, including a later arrival', async () => {
    // The rule the spec asks for, in the direction that widens: a recording
    // belongs to the place, so joining the place is enough. Carol was not in
    // the conversation and can hear it once she is a member.
    const { alice, bob, carol, channelId } = await recorded();
    expect(app.channels.recordingsFor(carol.account.id)).toEqual([]);

    // A place is what a *named* channel is, and only a named one takes
    // somebody in. Inviting into an unnamed channel moves the conversation to
    // another one, which leaves the recording behind with the place it was
    // made in — the same rule, seen from the other side.
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_NAME',
      name: 'The place',
    } as never);
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'INVITE',
      contactId: carol.account.id,
    } as never);

    for (const user of [alice, bob, carol]) {
      expect(app.channels.recordingsFor(user.account.id)).toHaveLength(1);
    }
  });

  it('takes it away from somebody who leaves the channel', async () => {
    // And in the direction that narrows, which is the same sentence: bob was
    // in the conversation and cannot reach the recording of it once he has
    // given up the channel.
    const { alice, bob, channelId } = await recorded();
    expect(app.channels.recordingsFor(bob.account.id)).toHaveLength(1);

    app.channels.dispatch(channelId, bob.account.id, { type: 'LEAVE_CHANNEL' });

    expect(app.channels.recordingsFor(bob.account.id)).toEqual([]);
    expect(app.channels.recordingsFor(alice.account.id)).toHaveLength(1);
  });

  it('refuses the export to a former member, and 404s rather than 403s', async () => {
    const { bob, channelId } = await recorded();
    const [recording] = app.channels.recordingsFor(bob.account.id);
    app.channels.dispatch(channelId, bob.account.id, { type: 'LEAVE_CHANNEL' });

    const response = await app.fastify.inject({
      method: 'GET',
      url: `/recordings/${recording.id}/export`,
      headers: auth(bob.token),
    });
    // That a recording exists is itself something only members should learn.
    expect(response.statusCode).toBe(404);
  });
});

describe('deleting a channel', () => {
  it('marks its recordings without removing anything yet', async () => {
    const { alice, bob, channelId } = await recorded();
    app.channels.dispatch(channelId, bob.account.id, { type: 'LEAVE_CHANNEL' });
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'DELETE_CHANNEL',
    });

    const rows = rowsOf(channelId);
    expect(rows).toHaveLength(1);
    expect(rows[0].deleted_at).toBe(clock);
    const channel = app.db
      .prepare('SELECT deleted_at FROM channels WHERE id = ?')
      .get(channelId) as { deleted_at: number | null };
    expect(channel.deleted_at).toBe(clock);

    // Gone from view immediately, whatever the rows say.
    expect(app.channels.recordingsFor(alice.account.id)).toEqual([]);
  });

  it('is refused to a member who is not the last', async () => {
    const { bob, channelId } = await recorded();
    const result = app.channels.dispatch(channelId, bob.account.id, {
      type: 'DELETE_CHANNEL',
    });
    expect(result.ok).toBe(false);
    expect(app.channels.get(channelId)!.status).toBe('active');
    expect(rowsOf(channelId)[0].deleted_at).toBeNull();
  });

  it('tells the last member to delete rather than silently ignoring a leave', async () => {
    // Build 20 and earlier send LEAVE_CHANNEL here, that having been how a
    // channel ended. A no-op would read as a dead button.
    const { alice, bob, channelId } = await recorded();
    app.channels.dispatch(channelId, bob.account.id, { type: 'LEAVE_CHANNEL' });

    const result = app.channels.dispatch(channelId, alice.account.id, {
      type: 'LEAVE_CHANNEL',
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('Delete it instead');
    expect(app.channels.get(channelId)!.status).toBe('active');
  });
});

describe('deleting one recording', () => {
  it('marks it, leaving the channel and everything else in it alone', async () => {
    const { alice, channelId, keys } = await recorded();
    const [recording] = rowsOf(channelId);
    expect(recording.deleted_at).toBeNull();

    const response = await app.fastify.inject({
      method: 'DELETE',
      url: `/recordings/${recording.id}`,
      headers: auth(alice.token),
    });
    expect(response.statusCode).toBe(200);

    // Marked, not removed: the row and the audio both survive the week, which
    // is the whole of the recovery story.
    expect(rowsOf(channelId)[0].deleted_at).toBe(clock);
    for (const key of keys) expect(store.keys()).toContain(key);
    // And the channel it was made in is untouched.
    expect(app.channels.get(channelId)!.status).toBe('active');
  });

  it('takes it out of every list at once', async () => {
    const { alice, bob, channelId } = await recorded();
    const [recording] = rowsOf(channelId);

    await app.fastify.inject({
      method: 'DELETE',
      url: `/recordings/${recording.id}`,
      headers: auth(alice.token),
    });

    // Gone for the person who deleted it and for everybody else in the
    // channel — a recording belongs to the channel, not to whoever pressed
    // record or whoever pressed delete.
    expect(app.channels.recordingsInChannel(channelId, alice.account.id)).toEqual([]);
    expect(app.channels.recordingsFor(bob.account.id)).toEqual([]);
  });

  it('is swept a week later, exactly as a deleted channel’s recordings are', async () => {
    const { alice, channelId, keys } = await recorded();
    const [recording] = rowsOf(channelId);
    await app.fastify.inject({
      method: 'DELETE',
      url: `/recordings/${recording.id}`,
      headers: auth(alice.token),
    });

    clock += DELETED_RETENTION_MS - 1;
    expect(app.channels.sweepDeleted(clock).recordings).toBe(0);
    for (const key of keys) expect(store.keys()).toContain(key);

    clock += 1;
    expect(app.channels.sweepDeleted(clock).recordings).toBe(1);
    expect(rowsOf(channelId)).toEqual([]);
    for (const key of keys) expect(store.keys()).not.toContain(key);
    // The channel outlives it: only the recording was deleted.
    expect(
      app.db.prepare('SELECT id FROM channels WHERE id = ?').get(channelId)
    ).toBeDefined();
  });

  it('refuses somebody who is not in the channel, without admitting it exists', async () => {
    const { carol, channelId } = await recorded();
    const [recording] = rowsOf(channelId);

    const response = await app.fastify.inject({
      method: 'DELETE',
      url: `/recordings/${recording.id}`,
      headers: auth(carol.token),
    });
    // The same answer as asking for one that is not there, which is the rule
    // export and play already follow: knowing a recording exists is itself
    // something only the channel's members should learn.
    expect(response.statusCode).toBe(404);
    expect(rowsOf(channelId)[0].deleted_at).toBeNull();
  });
});

describe('the sweep', () => {
  async function deleted() {
    const context = await recorded();
    app.channels.dispatch(context.channelId, context.bob.account.id, {
      type: 'LEAVE_CHANNEL',
    });
    app.channels.dispatch(context.channelId, context.alice.account.id, {
      type: 'DELETE_CHANNEL',
    });
    return context;
  }

  it('leaves everything alone until the week is up', async () => {
    const { channelId, keys } = await deleted();

    clock += DELETED_RETENTION_MS - 1;
    expect(app.channels.sweepDeleted(clock)).toEqual({
      recordings: 0,
      channels: 0,
    });
    expect(rowsOf(channelId)).toHaveLength(1);
    for (const key of keys) expect(store.keys()).toContain(key);
  });

  it('removes the audio, then the rows, once it is', async () => {
    const { channelId, keys } = await deleted();
    expect(keys.length).toBeGreaterThan(0);

    clock += DELETED_RETENTION_MS;
    const swept = app.channels.sweepDeleted(clock);

    expect(swept.recordings).toBe(1);
    expect(swept.channels).toBe(1);
    expect(rowsOf(channelId)).toEqual([]);
    expect(
      app.db.prepare('SELECT id FROM channels WHERE id = ?').get(channelId)
    ).toBeUndefined();
    for (const key of keys) expect(store.keys()).not.toContain(key);
  });

  it('takes nothing that was merely ended rather than deleted', async () => {
    // The distinction the `deleted_at` column exists for. Ending and deleting
    // are the same event now — the last member cannot leave — but rows written
    // before that was true are ended and *not* deleted, and a sweep reading
    // `ended_at` would destroy them. There is no way to reach this state from
    // the app; it is reached here the only way it exists, by writing the row.
    const { channelId } = await recorded();
    app.db
      .prepare('UPDATE channels SET ended_at = ? WHERE id = ?')
      .run(clock, channelId);

    clock += DELETED_RETENTION_MS * 10;
    expect(app.channels.sweepDeleted(clock)).toEqual({
      recordings: 0,
      channels: 0,
    });
    expect(rowsOf(channelId)).toHaveLength(1);
  });
});
