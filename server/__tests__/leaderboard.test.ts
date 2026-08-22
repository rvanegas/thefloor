import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';

/**
 * The page is a table, so what is worth testing is not the table. It is the
 * gate: this is the only thing this server serves that names real people, and
 * the two documents beside it promise there is no directory here. A box that
 * has not been configured must not have this route at all, and one that has
 * must not hand it over to somebody who guessed the path.
 */

const KEY = 'a-long-enough-operator-password';

let app: App;
let clock = 1_700_000_000_000;

function build(leaderboardKey?: string) {
  clock = 1_700_000_000_000;
  return buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    now: () => clock,
    leaderboardKey,
  });
}

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

const basic = (password: string, user = 'operator') => ({
  authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`,
});

const get = (headers: Record<string, string> = {}) =>
  app.fastify.inject({ method: 'GET', url: '/leaderboard', headers });

async function signIn(identifier: string, displayName: string) {
  const code = app.accounts.issueCode(identifier, clock)!;
  const verified = await app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, displayName },
  });
  return verified.json() as { token: string; account: { id: string } };
}

type User = Awaited<ReturnType<typeof signIn>>;

async function invited(from: User, identifier: string, displayName: string) {
  await app.fastify.inject({
    method: 'POST',
    url: '/contacts/request',
    headers: { authorization: `Bearer ${from.token}` },
    payload: { identifier },
  });
  clock += 1000;
  return signIn(identifier, displayName);
}

describe('the gate', () => {
  it('does not exist on a server with no password configured', async () => {
    app = build();

    const response = await get(basic(KEY));

    // A 404 and not a 401: an unconfigured box gives the same answer here as
    // for any path it has never heard of, so the page cannot be found by
    // asking whether it is protected.
    expect(response.statusCode).toBe(404);
  });

  it('asks for a password when none was offered', async () => {
    app = build(KEY);

    const response = await get();

    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toMatch(/^Basic /);
  });

  it('refuses a wrong password, and any header that is not Basic', async () => {
    app = build(KEY);

    expect((await get(basic('not-it'))).statusCode).toBe(401);
    expect((await get({ authorization: `Bearer ${KEY}` })).statusCode).toBe(401);
    expect((await get({ authorization: 'Basic not-base64-at-all!!' })).statusCode).toBe(401);
  });

  it('lets the right password through, whatever the username', async () => {
    app = build(KEY);

    const response = await get(basic(KEY, 'anybody-at-all'));

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/html/);
  });
});

describe('what the page says', () => {
  it('ranks by the transitive count, deepest chain first', async () => {
    app = build(KEY);
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await invited(alice, 'bob@example.com', 'Bob');
    await invited(bob, 'carol@example.com', 'Carol');

    const solo = await signIn('dave@example.com', 'Dave');
    await invited(solo, 'erin@example.com', 'Erin');

    expect(app.accounts.leaderboard()).toEqual([
      { id: alice.account.id, displayName: 'Alice', invited: 2 },
      { id: bob.account.id, displayName: 'Bob', invited: 1 },
      { id: solo.account.id, displayName: 'Dave', invited: 1 },
    ]);

    const body = (await get(basic(KEY))).body;
    expect(body.indexOf('Alice')).toBeLessThan(body.indexOf('Bob'));
  });

  it('leaves out everybody who has brought nobody', async () => {
    app = build(KEY);
    await signIn('alice@example.com', 'Alice');

    expect(app.accounts.leaderboard()).toEqual([]);
    expect((await get(basic(KEY))).body).not.toContain('Alice');
  });

  it('escapes a display name rather than letting it be markup', async () => {
    app = build(KEY);
    const alice = await signIn('alice@example.com', '<script>x</script>');
    await invited(alice, 'bob@example.com', 'Bob');

    const body = (await get(basic(KEY))).body;
    expect(body).toContain('&lt;script&gt;');
    expect(body).not.toContain('<script>x</script>');
  });
});
