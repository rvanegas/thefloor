import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';
import { MemoryRecordingStore } from '../src/storage';
import { legacyGradesOf } from '../src/ws';

/**
 * A channel's grade, since 2026-11-19: *Pro* — transcription, *Ask Claude*
 * and *Read aloud* at once, for everybody in it — while any member is *Pro
 * (the subscription)* or marked unlimited, and *Standard* otherwise. Nobody
 * chooses it any more; the three choices an older build still sends are
 * answered as done and change nothing. What each grade asks is tested where
 * it is used: claude.test.ts and claude-speech.test.ts.
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

/** Makes an account *Pro*, with a subscription that runs to 2100. */
const makePro = (id: string, expiresAt = 4_102_444_800_000) =>
  app.db
    .prepare(
      `INSERT INTO pro_subscriptions (original_transaction_id, account_id, product_id, environment,
         expires_at, latest_transaction_id, updated_at, raw) VALUES (?, ?, 'pro', 'Sandbox', ?, ?, 0, '{}')`
    )
    .run(`t-${id}`, id, expiresAt, `t-${id}`);
describe("a channel's grade", () => {
  it('is Standard while no member is Pro', async () => {
    const { channelId } = await channelOfTwo();
    expect(app.channels.isProChannel(channelId)).toBe(false);
  });

  it('is Pro while any member subscribes, whether or not they are here', async () => {
    const { bob, channelId } = await channelOfTwo();
    makePro(bob.id);
    expect(app.channels.isProChannel(channelId)).toBe(true);
  });

  it('is Pro while any member is marked unlimited', async () => {
    const { alice, channelId } = await channelOfTwo();
    app.db.prepare('UPDATE accounts SET transcripts_unlimited = 1 WHERE id = ?').run(alice.id);
    expect(app.channels.isProChannel(channelId)).toBe(true);
  });

  it('is Standard again once that Pro has lapsed', async () => {
    const { alice, channelId } = await channelOfTwo();
    makePro(alice.id, clock - 2 * 86_400_000);
    expect(app.channels.isProChannel(channelId)).toBe(false);
  });

  it('is nothing for a channel that does not exist', () => {
    expect(app.channels.isProChannel('nope')).toBe(false);
  });
});

describe('the choices an older build sends', () => {
  it('are answered as done, from anybody, and change nothing', async () => {
    const { alice, channelId } = await channelOfTwo();
    const before = app.channels.get(channelId);
    for (const action of [
      { type: 'SET_TRANSCRIPTION_MODEL', transcriptionModel: 'pro' },
      { type: 'SET_RESPONSE_MODEL', responseModel: 'max' },
      { type: 'SET_READ_ALOUD', readAloud: 'pro' },
    ]) {
      expect(app.channels.dispatch(channelId, alice.id, action as never)).toMatchObject({ ok: true });
    }
    expect(app.channels.get(channelId)).toBe(before);
    expect(app.channels.isProChannel(channelId)).toBe(false);
  });

  it('are still refused from somebody not in the channel', async () => {
    const { channelId } = await channelOfTwo();
    const carol = await signIn('carol@example.com', 'Carol');
    expect(
      app.channels.dispatch(channelId, carol.account.id, { type: 'SET_READ_ALOUD', readAloud: 'pro' } as never)
    ).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('are told the grade in the three fields they read', () => {
    expect(legacyGradesOf(true)).toEqual({ transcriptionModel: 'pro', responseModel: 'pro', readAloud: 'pro' });
    expect(legacyGradesOf(false)).toEqual({
      transcriptionModel: 'standard',
      responseModel: 'standard',
      readAloud: 'standard',
    });
  });
});
