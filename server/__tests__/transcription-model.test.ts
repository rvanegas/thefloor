import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';
import { MemoryRecordingStore } from '../src/storage';

/**
 * Who may choose a channel's transcription model.
 *
 * The reducer's half — that it is guarded like the other channel settings — is
 * in core. What is here is the half only the server can answer, since the
 * reducer knows nothing of accounts: a *Pro* account may, nobody else may —
 * `debug` included, since 2026-11-08 —
 * and nothing but the two grades gets through.
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

const choose = (channelId: string, userId: string, transcriptionModel: unknown) =>
  app.channels.dispatch(channelId, userId, {
    type: 'SET_TRANSCRIPTION_MODEL',
    transcriptionModel,
  } as never);

/** Makes an account *Pro*, with a subscription that runs to 2100. */
const makePro = (id: string, expiresAt = 4_102_444_800_000) =>
  app.db
    .prepare(
      `INSERT INTO pro_subscriptions (original_transaction_id, account_id, product_id, environment,
         expires_at, latest_transaction_id, updated_at, raw) VALUES (?, ?, 'pro', 'Sandbox', ?, ?, 0, '{}')`
    )
    .run(`t-${id}`, id, expiresAt, `t-${id}`);
describe('choosing the transcription model', () => {
  it('is standard until somebody chooses otherwise', async () => {
    const { channelId } = await channelOfTwo();
    expect(channel(channelId).transcriptionModel).toBe('standard');
  });

  it('is refused to an account without Pro, debug or not, and changes nothing', async () => {
    const { alice, channelId } = await channelOfTwo();
    app.db.prepare('UPDATE accounts SET debug = 1 WHERE id = ?').run(alice.id);
    app.channels.dispatch(channelId, alice.id, { type: 'ENTER' });

    const result = choose(channelId, alice.id, 'pro');

    expect(result).toMatchObject({ ok: false, code: 'forbidden' });
    expect(channel(channelId).transcriptionModel).toBe('standard');
  });

  it('is refused once Pro has lapsed', async () => {
    const { alice, channelId } = await channelOfTwo();
    makePro(alice.id, clock - 2 * 86_400_000);
    app.channels.dispatch(channelId, alice.id, { type: 'ENTER' });

    expect(choose(channelId, alice.id, 'pro')).toMatchObject({ ok: false, code: 'forbidden' });
    expect(channel(channelId).transcriptionModel).toBe('standard');
  });

  it('is taken from a Pro account in the room, and back again', async () => {
    const { alice, channelId } = await channelOfTwo();
    makePro(alice.id);
    app.channels.dispatch(channelId, alice.id, { type: 'ENTER' });

    expect(choose(channelId, alice.id, 'pro')).toMatchObject({ ok: true });
    expect(channel(channelId).transcriptionModel).toBe('pro');
    expect(choose(channelId, alice.id, 'standard')).toMatchObject({ ok: true });
    expect(channel(channelId).transcriptionModel).toBe('standard');
  });

  it('refuses anything but the two grades, even from Pro', async () => {
    const { alice, channelId } = await channelOfTwo();
    makePro(alice.id);
    app.channels.dispatch(channelId, alice.id, { type: 'ENTER' });

    for (const value of ['universal-3-5-pro', undefined, true]) {
      expect(choose(channelId, alice.id, value)).toMatchObject({
        ok: false,
        code: 'invalid',
      });
    }
    expect(channel(channelId).transcriptionModel).toBe('standard');
  });
});
