import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';
import { MemoryRecordingStore } from '../src/storage';

/**
 * The half of automatic recording that is not a rule.
 *
 * `core/__tests__/recording.test.ts` covers what the setting means — who may
 * change it, and who would begin a run. What is here is the part only the
 * server can answer: that the run actually starts, that it starts **once**,
 * and that stopping it is final until the room has emptied and filled again.
 * That last one is the whole reason the latch exists — without it Stop would
 * be a button with no visible effect.
 */

let app: App;
let clock = 1_700_000_000_000;

beforeEach(() => {
  clock = 1_700_000_000_000;
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    media: new MemoryMediaServer(),
    mediaUrl: 'wss://example.livekit.cloud',
    store: new MemoryRecordingStore(),
    now: () => clock,
    roomCloseGraceMs: 0,
    mixWaitMs: 0,
  });
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

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

/** Alice waiting alone in a channel Bob belongs to and has not entered. */
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
  return { alice: alice.account, bob: bob.account, channelId };
}

const channel = (channelId: string) => app.channels.get(channelId)!;

const ask = (channelId: string, userId: string, autoRecord: boolean) =>
  app.channels.dispatch(channelId, userId, {
    type: 'SET_AUTO_RECORD',
    autoRecord,
    // `as never`, like every other payload-carrying dispatch in these tests:
    // the parameter is `Omit<ChannelAction, 'userId'>`, which is not a
    // discriminated union any more and so admits no field but `type`.
  } as never);

describe('a channel that records itself', () => {
  it('starts a run the moment the second person is in the room', async () => {
    const { alice, bob, channelId } = await channelOfTwo();
    ask(channelId, alice.id, true);
    // Nothing yet: one person in a room is not a conversation, and the
    // automatic start is possible in exactly the states the Record button is.
    expect(channel(channelId).recording.status).toBe('idle');

    app.channels.dispatch(channelId, bob.id, { type: 'ENTER' });
    const { recording } = channel(channelId);
    expect(recording.status).toBe('recording');
    expect(recording.runId).not.toBeNull();

    // The row is opened now rather than when the run ends, which is what makes
    // an interrupted run survivable — an automatic start has to be a start in
    // every sense, not a state the reducer holds.
    const row = app.db
      .prepare('SELECT channel_id FROM recordings WHERE id = ?')
      .get(recording.runId) as { channel_id: string } | undefined;
    expect(row?.channel_id).toBe(channelId);
  });

  it('does nothing at all when the setting is off', async () => {
    const { bob, channelId } = await channelOfTwo();
    app.channels.dispatch(channelId, bob.id, { type: 'ENTER' });
    expect(channel(channelId).recording.status).toBe('idle');
  });

  it('does not start a second run when the first is stopped', async () => {
    const { alice, bob, channelId } = await channelOfTwo();
    ask(channelId, alice.id, true);
    app.channels.dispatch(channelId, bob.id, { type: 'ENTER' });
    clock += 5_000;
    app.channels.dispatch(channelId, alice.id, { type: 'STOP_RECORDING' });

    const stopped = channel(channelId);
    expect(stopped.recording.status).toBe('idle');
    expect(stopped.lastRecording?.durationMs).toBe(5_000);

    // The event most likely to trip a latch that keyed on arrivals rather than
    // on the room: somebody leaves and comes back while the other stays.
    app.channels.dispatch(channelId, bob.id, { type: 'STEP_OUT' });
    app.channels.dispatch(channelId, bob.id, { type: 'ENTER' });
    expect(channel(channelId).recording.status).toBe('idle');
  });

  it('records the next room, once this one has emptied', async () => {
    const { alice, bob, channelId } = await channelOfTwo();
    ask(channelId, alice.id, true);
    app.channels.dispatch(channelId, bob.id, { type: 'ENTER' });
    clock += 5_000;
    app.channels.dispatch(channelId, alice.id, { type: 'STOP_RECORDING' });
    const first = channel(channelId).lastRecording?.runId;

    app.channels.dispatch(channelId, alice.id, { type: 'STEP_OUT' });
    app.channels.dispatch(channelId, bob.id, { type: 'STEP_OUT' });
    expect(channel(channelId).present).toEqual([]);

    clock += 60_000;
    app.channels.dispatch(channelId, alice.id, { type: 'ENTER' });
    app.channels.dispatch(channelId, bob.id, { type: 'ENTER' });
    const second = channel(channelId).recording;
    expect(second.status).toBe('recording');
    expect(second.runId).not.toBe(first);
  });

  it('leaves a run somebody started by hand as the room’s recording', async () => {
    // The latch is spent by any run, not only by the automatic one: a
    // recording that was stopped on purpose must not be replaced by one
    // nobody asked for.
    const { alice, bob, channelId } = await channelOfTwo();
    app.channels.dispatch(channelId, bob.id, { type: 'ENTER' });
    app.channels.dispatch(channelId, alice.id, { type: 'START_RECORDING' });
    ask(channelId, bob.id, true);
    clock += 5_000;
    app.channels.dispatch(channelId, bob.id, { type: 'STOP_RECORDING' });
    expect(channel(channelId).recording.status).toBe('idle');
  });
});
