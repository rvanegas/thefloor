import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';

/**
 * Channel names over the wire: the SET_NAME action, the Home view carrying it,
 * and the ended channel's row keeping it.
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
  app.channels.stop();
  await app.fastify.close();
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/**
 * The only way a channel ends now: every member gives up membership. Tests
 * that used to dispatch END are asserting what happens at the end of a
 * channel's life, and this is how a channel's life ends.
 */
function endChannel(channelId: string): void {
  const members = [...(app.channels.get(channelId)?.participants ?? [])];
  for (const id of members) {
    app.channels.dispatch(channelId, id, { type: 'LEAVE_CHANNEL' });
  }
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
  const created = app.channels.create(alice.account.id, [bob.account.id]);
  if (!created.ok) throw new Error(created.error);
  return { alice, bob, channelId: created.channel.id };
}

describe('naming a channel', () => {
  it('any participant may set it, and it reaches the rejoinable view', async () => {
    const { alice, bob, channelId } = await pair();
    const named = app.channels.dispatch(channelId, bob.account.id, {
      type: 'SET_NAME',
      name: '  Book club  ',
    } as never);
    expect(named.ok).toBe(true);
    expect(app.channels.get(channelId)?.name).toBe('Book club');

    // Alice leaves with Bob still there, making the channel rejoinable for her.
    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    const rejoinable = app.channels.rejoinableFor(alice.account.id);
    expect(rejoinable).toHaveLength(1);
    expect(rejoinable[0].name).toBe('Book club');
  });

  it('refuses a payload whose name is not a string', async () => {
    const { alice, channelId } = await pair();
    const result = app.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_NAME',
      name: 42,
    } as never);
    expect(result).toEqual({
      ok: false,
      error: 'Not an action.',
      code: 'invalid',
    });
    expect(app.channels.get(channelId)?.name).toBeNull();
  });

  it('takes a description, and refuses a payload that is not a string', async () => {
    const { alice, channelId } = await pair();
    const ok = app.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_DESCRIPTION',
      description: '  Reading **Dune**, see [notes](https://example.com)  ',
    } as never);
    expect(ok.ok).toBe(true);
    // Trimmed at the ends, and the markup kept exactly as typed.
    expect(app.channels.get(channelId)?.description).toBe(
      'Reading **Dune**, see [notes](https://example.com)'
    );

    const bad = app.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_DESCRIPTION',
      description: { evil: true },
    } as never);
    expect(bad).toEqual({
      ok: false,
      error: 'Not an action.',
      code: 'invalid',
    });
  });

  it('persists the description on the ended channel row', async () => {
    const { alice, bob, channelId } = await pair();
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_DESCRIPTION',
      description: 'Tuesdays at eight',
    } as never);
    app.channels.dispatch(channelId, alice.account.id, { type: 'LEAVE_CHANNEL' });
    app.channels.dispatch(channelId, bob.account.id, { type: 'LEAVE_CHANNEL' });

    const row = app.db
      .prepare('SELECT description FROM channels WHERE id = ?')
      .get(channelId) as { description: string | null };
    expect(row.description).toBe('Tuesdays at eight');
  });

  it('persists the name on the ended channel row', async () => {
    const { alice, channelId } = await pair();
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_NAME',
      name: 'Book club',
    } as never);
    endChannel(channelId);
    const row = app.db
      .prepare('SELECT name FROM channels WHERE id = ?')
      .get(channelId) as { name: string | null };
    expect(row.name).toBe('Book club');
  });
});
