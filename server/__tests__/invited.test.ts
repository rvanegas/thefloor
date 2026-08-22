import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';

/**
 * The invited count is a claim about why people are here, so the questions
 * worth asking are about attribution rather than arithmetic: who gets the
 * credit when two people invited the same address, what happens to a chain
 * when somebody in the middle of it leaves, and what a plain contact request
 * between two accounts that already existed is worth. Nothing.
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

const invite = (from: User, identifier: string) =>
  app.fastify.inject({
    method: 'POST',
    url: '/contacts/request',
    headers: auth(from.token),
    payload: { identifier },
  });

/** Invited, then signed up: the whole of what earns a credit. */
async function invited(from: User, identifier: string, displayName: string) {
  await invite(from, identifier);
  clock += 1000;
  return signIn(identifier, displayName);
}

const countFor = (user: User) => app.accounts.invitedCount(user.account.id);

describe('crediting an invitation', () => {
  it('counts somebody who signed up after being invited', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    await invited(alice, 'bob@example.com', 'Bob');

    expect(countFor(alice)).toBe(1);
  });

  it('counts nobody for an account that arrived on its own', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    await signIn('bob@example.com', 'Bob');

    expect(countFor(alice)).toBe(0);
  });

  it('credits the invitation up the chain, as far as it goes', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await invited(alice, 'bob@example.com', 'Bob');
    const carol = await invited(bob, 'carol@example.com', 'Carol');
    await invited(carol, 'dan@example.com', 'Dan');

    expect(countFor(alice)).toBe(3);
    expect(countFor(bob)).toBe(2);
    expect(countFor(carol)).toBe(1);
  });

  it('credits the earliest invitation when several reached one address', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');

    await invite(alice, 'carol@example.com');
    clock += 1000;
    await invite(bob, 'carol@example.com');
    clock += 1000;
    await signIn('carol@example.com', 'Carol');

    expect(countFor(alice)).toBe(1);
    expect(countFor(bob)).toBe(0);
  });

  it('credits nobody when the invitation had expired before they came', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    await invite(alice, 'bob@example.com');

    clock += 31 * 24 * 60 * 60 * 1000;
    app.accounts.sweepExpired(clock);
    await signIn('bob@example.com', 'Bob');

    expect(countFor(alice)).toBe(0);
  });

  it('credits nobody for a request between two accounts that already existed', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    await signIn('bob@example.com', 'Bob');
    await invite(alice, 'bob@example.com');

    expect(countFor(alice)).toBe(0);
  });
});

describe('when somebody leaves', () => {
  /**
   * The two halves of one decision: the person who left stops being counted,
   * and the chain they were the middle of does not break, because their
   * inviter's total is not theirs to change on the way out.
   */
  it('stops counting a deleted account but keeps counting through it', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await invited(alice, 'bob@example.com', 'Bob');
    await invited(bob, 'carol@example.com', 'Carol');
    expect(countFor(alice)).toBe(2);

    const deleted = await app.fastify.inject({
      method: 'DELETE',
      url: '/me',
      headers: auth(bob.token),
    });
    expect(deleted.statusCode).toBe(204);

    expect(countFor(alice)).toBe(1);
  });
});

describe('what a profile says', () => {
  it('carries your own count, and one you are entitled to read', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await invited(alice, 'bob@example.com', 'Bob');
    // An invitation leaves a *pending* request; a profile is readable by a
    // contact, so Bob has to accept before he is entitled to read hers.
    await app.fastify.inject({
      method: 'POST',
      url: `/contacts/${alice.account.id}/accept`,
      headers: auth(bob.token),
    });

    const mine = await app.fastify.inject({
      method: 'GET',
      url: `/profiles/${alice.account.id}`,
      headers: auth(alice.token),
    });
    expect(mine.json().invited).toBe(1);

    const theirs = await app.fastify.inject({
      method: 'GET',
      url: `/profiles/${alice.account.id}`,
      headers: auth(bob.token),
    });
    expect(theirs.statusCode).toBe(200);
    expect(theirs.json().invited).toBe(1);
  });

  it('says nought rather than nothing for somebody who has invited nobody', async () => {
    const alice = await signIn('alice@example.com', 'Alice');

    const response = await app.fastify.inject({
      method: 'GET',
      url: `/profiles/${alice.account.id}`,
      headers: auth(alice.token),
    });
    expect(response.json().invited).toBe(0);
  });
});
