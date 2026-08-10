import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';

/**
 * A profile is the one place somebody says who they are, so the interesting
 * questions are not about storage. They are about who may read it, and about a
 * partial write not quietly erasing the half the client did not send.
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

const save = (user: User, payload: Record<string, unknown>) =>
  app.fastify.inject({
    method: 'POST',
    url: '/me',
    headers: auth(user.token),
    payload,
  });

const read = (viewer: User, id: string) =>
  app.fastify.inject({
    method: 'GET',
    url: `/profiles/${id}`,
    headers: auth(viewer.token),
  });

describe('writing your own profile', () => {
  it('takes a bio, keeping the markup exactly as typed', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const markup = 'Cellist. **Bach** mostly — [notes](https://example.com).';
    const response = await save(alice, { bio: markup });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      account: { id: alice.account.id, displayName: 'Alice' },
      bio: markup,
    });
  });

  it('leaves out what was left out', async () => {
    // The point of a partial write: saving a bio must not blank the name, and
    // saving a name must not blank the bio. A client that sends one field is
    // editing one field.
    const alice = await signIn('alice@example.com', 'Alice');
    await save(alice, { bio: 'Cellist.' });
    await save(alice, { displayName: 'Alice Nkemdirim' });

    const profile = (await read(alice, alice.account.id)).json();
    expect(profile).toEqual({
      account: { id: alice.account.id, displayName: 'Alice Nkemdirim' },
      bio: 'Cellist.',
    });
  });

  it('trims the ends of a bio but never its interior', async () => {
    // Interior whitespace is Markdown — a blank line is a paragraph break —
    // so collapsing it would rewrite what somebody wrote.
    const alice = await signIn('alice@example.com', 'Alice');
    const response = await save(alice, { bio: '  one\n\n  two  ' });
    expect((response.json() as { bio: string }).bio).toBe('one\n\n  two');
  });

  it('clears a bio when given nothing but whitespace', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    await save(alice, { bio: 'Cellist.' });
    const cleared = await save(alice, { bio: '   \n ' });
    expect((cleared.json() as { bio: string | null }).bio).toBeNull();
  });

  it('refuses an empty name rather than accepting one', async () => {
    // Somebody with no name is an empty space in every roster they appear in,
    // which is worse than the request failing.
    const alice = await signIn('alice@example.com', 'Alice');
    const response = await save(alice, { displayName: '   ' });
    expect(response.statusCode).toBe(400);
    expect(app.accounts.public(alice.account.id)?.displayName).toBe('Alice');
  });

  it('refuses fields that are not text', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    expect((await save(alice, { bio: { evil: true } })).statusCode).toBe(400);
    expect((await save(alice, { displayName: 42 })).statusCode).toBe(400);
  });

  it('refuses an unauthenticated caller', async () => {
    const response = await app.fastify.inject({
      method: 'POST',
      url: '/me',
      payload: { bio: 'hello' },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('reading somebody else’s profile', () => {
  it('is allowed for a contact', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await befriend(alice, bob, 'bob@example.com');
    await save(bob, { bio: 'Trombone.' });

    const response = await read(alice, bob.account.id);
    expect(response.statusCode).toBe(200);
    expect((response.json() as { bio: string }).bio).toBe('Trombone.');
  });

  it('is allowed for someone sharing a channel, contact or not', async () => {
    // Alice knows bob and carol; they do not know each other. Putting both in
    // one channel is exactly the situation where you want to find out who the
    // other person is.
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    const carol = await signIn('carol@example.com', 'Carol');
    await befriend(alice, bob, 'bob@example.com');
    await befriend(alice, carol, 'carol@example.com');
    await save(carol, { bio: 'Harpsichord.' });

    expect((await read(bob, carol.account.id)).statusCode).toBe(404);

    const created = app.channels.create(alice.account.id, [
      bob.account.id,
      carol.account.id,
    ]);
    expect(created.ok).toBe(true);

    const response = await read(bob, carol.account.id);
    expect(response.statusCode).toBe(200);
    expect((response.json() as { bio: string }).bio).toBe('Harpsichord.');
  });

  it('is refused for a stranger, the same way a missing one is', async () => {
    // Identical answers, so the endpoint cannot be used to discover which
    // account ids exist.
    const alice = await signIn('alice@example.com', 'Alice');
    const mallory = await signIn('mallory@example.com', 'Mallory');
    await save(alice, { bio: 'Cellist.' });

    const stranger = await read(mallory, alice.account.id);
    const missing = await read(mallory, 'acct_nobody');
    expect(stranger.statusCode).toBe(404);
    expect(missing.statusCode).toBe(404);
    expect(stranger.json()).toEqual(missing.json());
  });

  it('is always allowed for yourself', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    expect((await read(alice, alice.account.id)).statusCode).toBe(200);
  });
});

describe('a bio outlives the process', () => {
  it('is still there after the account is read back', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    await save(alice, { bio: 'Cellist.' });
    // Straight from the row rather than through the cache the route just used.
    const row = app.db
      .prepare('SELECT bio FROM accounts WHERE id = ?')
      .get(alice.account.id) as { bio: string };
    expect(row.bio).toBe('Cellist.');
  });
});
