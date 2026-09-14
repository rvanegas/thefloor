import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { NOTHING_TRIED } from '../../core/tried';

/**
 * The four introduction rungs that are a fact about the account.
 *
 * They were kept on the phone until 2026-09-13, which meant a second device
 * started all four hollow for somebody who had done all four — see
 * `core/tried.ts`. What is tested here is the half that makes that untrue: the
 * server records them, the Home snapshot carries them, and the write is
 * idempotent because it is called from a control somebody presses for the
 * rest of their life.
 *
 * The client half — the ladder these draw, and the one-time hand-up of what
 * the keychain held — is `app/src/state/__tests__`.
 */

let app: App;
const clock = 1_700_000_000_000;

beforeEach(() => {
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    now: () => clock,
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

const mark = (token: string, payload: Record<string, unknown>) =>
  app.fastify.inject({
    method: 'POST',
    url: '/me/tried',
    headers: auth(token),
    payload,
  });

describe('the four things somebody has tried', () => {
  it('starts with none of them, for an account that is brand new', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    expect(app.accounts.tried(alice.account.id)).toEqual(NOTHING_TRIED);
  });

  it('records one, and answers with all four as they now stand', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    const response = await mark(alice.token, { id: 'floor' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ...NOTHING_TRIED, floor: true });
  });

  it('takes several at once, which is what the hand-up sends', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    const response = await mark(alice.token, { ids: ['floor', 'player'] });
    expect(response.json()).toEqual({
      ...NOTHING_TRIED,
      floor: true,
      player: true,
    });
  });

  it('keeps the first stamp when the same rung is claimed again', async () => {
    // Called from the *Claim* slot, so an established account sends this
    // hundreds of times. The stamp is when somebody first did the thing.
    const alice = await signIn('user1@example.com', 'Alice');
    expect(app.accounts.markTried(alice.account.id, 'floor', 1000)).toBe(true);
    expect(app.accounts.markTried(alice.account.id, 'floor', 2000)).toBe(false);
    const row = app.db
      .prepare('SELECT tried_floor FROM accounts WHERE id = ?')
      .get(alice.account.id) as { tried_floor: number };
    expect(row.tried_floor).toBe(1000);
  });

  it('refuses a name it does not know rather than ignoring it', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    expect((await mark(alice.token, { id: 'dancing' })).statusCode).toBe(400);
    expect((await mark(alice.token, {})).statusCode).toBe(400);
  });

  it('is nobody else’s business, and is on the asker’s own snapshot', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    const bob = await signIn('user2@example.com', 'Bob');
    await mark(alice.token, { id: 'guest' });

    const home = async (token: string) => {
      const response = await app.fastify.inject({
        url: '/home',
        headers: auth(token),
      });
      return response.json() as { tried: Record<string, boolean> };
    };
    expect((await home(alice.token)).tried).toEqual({
      ...NOTHING_TRIED,
      guest: true,
    });
    expect((await home(bob.token)).tried).toEqual(NOTHING_TRIED);
  });

  it('is forgotten only for an account that has the debug panel', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    await mark(alice.token, { id: 'nearby' });

    const forget = () =>
      app.fastify.inject({
        method: 'DELETE',
        url: '/me/tried',
        headers: auth(alice.token),
      });
    expect((await forget()).statusCode).toBe(403);
    expect(app.accounts.tried(alice.account.id).nearby).toBe(true);

    app.db
      .prepare('UPDATE accounts SET debug = 1 WHERE id = ?')
      .run(alice.account.id);
    expect((await forget()).json()).toEqual(NOTHING_TRIED);
  });

  it('goes when the account does', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    await mark(alice.token, { ids: ['floor', 'nearby', 'guest', 'player'] });
    app.accounts.erase(alice.account.id);
    expect(app.accounts.tried(alice.account.id)).toEqual(NOTHING_TRIED);
  });
});
