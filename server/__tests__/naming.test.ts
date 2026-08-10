import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';

/**
 * Session names over the wire: the SET_NAME action, the Home view carrying it,
 * and the ended session's row keeping it.
 */

let app: App;
let clock = 1_700_000_000_000;

beforeEach(() => {
  clock = 1_700_000_000_000;
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    now: () => clock,
  });
});

afterEach(async () => {
  app.sessions.stop();
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

async function pair() {
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
  const created = app.sessions.create(alice.account.id, [bob.account.id]);
  if (!created.ok) throw new Error(created.error);
  return { alice, bob, sessionId: created.session.id };
}

describe('naming a session', () => {
  it('any participant may set it, and it reaches the rejoinable view', async () => {
    const { alice, bob, sessionId } = await pair();
    const named = app.sessions.dispatch(sessionId, bob.account.id, {
      type: 'SET_NAME',
      name: '  Book club  ',
    } as never);
    expect(named.ok).toBe(true);
    expect(app.sessions.get(sessionId)?.name).toBe('Book club');

    // Alice leaves with Bob still there, making the session rejoinable for her.
    app.sessions.dispatch(sessionId, bob.account.id, { type: 'ENTER' });
    app.sessions.dispatch(sessionId, alice.account.id, { type: 'LEAVE' });
    const rejoinable = app.sessions.rejoinableFor(alice.account.id);
    expect(rejoinable).toHaveLength(1);
    expect(rejoinable[0].name).toBe('Book club');
  });

  it('refuses a payload whose name is not a string', async () => {
    const { alice, sessionId } = await pair();
    const result = app.sessions.dispatch(sessionId, alice.account.id, {
      type: 'SET_NAME',
      name: 42,
    } as never);
    expect(result).toEqual({
      ok: false,
      error: 'Not an action.',
      code: 'invalid',
    });
    expect(app.sessions.get(sessionId)?.name).toBeNull();
  });

  it('persists the name on the ended session row', async () => {
    const { alice, sessionId } = await pair();
    app.sessions.dispatch(sessionId, alice.account.id, {
      type: 'SET_NAME',
      name: 'Book club',
    } as never);
    app.sessions.dispatch(sessionId, alice.account.id, { type: 'END' });
    const row = app.db
      .prepare('SELECT name FROM sessions WHERE id = ?')
      .get(sessionId) as { name: string | null };
    expect(row.name).toBe('Book club');
  });
});
