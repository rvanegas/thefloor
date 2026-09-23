import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { INFERRED_CREDIT_WINDOW_MS } from '../src/accounts';

/**
 * Credit inferred from the first contact somebody makes.
 *
 * The other three ways credit is earned witness an act. This one witnesses a
 * contact edge and guesses that it was an arrival, so every test here is about
 * a case where the guess should *not* be made — the conditions are the whole
 * feature, and the happy path is the least interesting line in the file.
 *
 * The case it exists for is an invite link followed to the App Store rather
 * than accepted in the browser: the pin is never redeemed, nobody wrote to the
 * address, and the most plainly invited person in the database arrives owing
 * nobody. That is reconstructed here as what the server actually sees, which
 * is a signup followed by a contact request, with no invitation anywhere.
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

/**
 * One account asks another by address, and the other accepts.
 *
 * By address rather than by id because `/contacts/:id/request` answers 404 to
 * a pair who do not already share a channel — that route is for somebody you
 * can see, and two strangers cannot see each other. Which is also the shape of
 * the real case: the arrival types the address of the person who asked them
 * here, because that is all they have.
 */
async function connect(from: User, to: User, toAddress: string) {
  await app.fastify.inject({
    method: 'POST',
    url: '/contacts/request',
    headers: auth(from.token),
    payload: { identifier: toAddress },
  });
  await app.fastify.inject({
    method: 'POST',
    url: `/contacts/${from.account.id}/accept`,
    headers: auth(to.token),
  });
}

const inviterOf = (user: User) => app.accounts.byId(user.account.id)!.invited_by;
const viaOf = (user: User) => app.accounts.byId(user.account.id)!.invited_via;

/**
 * Somebody already in the network: an account with a contact, which is the
 * whole of what the islands rule asks about.
 */
async function established() {
  const alice = await signIn('alice@example.com', 'Alice');
  const bob = await signIn('bob@example.com', 'Bob');
  await connect(alice, bob, 'bob@example.com');
  return { alice, bob };
}

it('credits the person a newcomer first connects to', async () => {
  const { alice } = await established();
  clock += 60_000;

  const carol = await signIn('carol@example.com', 'Carol');
  clock += 44_000;
  await connect(carol, alice, 'alice@example.com');

  expect(inviterOf(carol)).toBe(alice.account.id);
  expect(viaOf(carol)).toBe('inferred');
});

it('credits the same way when the established side does the asking', async () => {
  // Who sent the request is not evidence of who brought whom. Somebody who
  // arrives and is added by the person who asked them here looks identical
  // from the other end, and the rule reads the graph rather than the arrow.
  const { alice } = await established();
  clock += 60_000;

  const carol = await signIn('carol@example.com', 'Carol');
  clock += 44_000;
  await connect(alice, carol, 'carol@example.com');

  expect(inviterOf(carol)).toBe(alice.account.id);
});

it('credits nobody when both are new to the graph', async () => {
  // The two founders, who added each other in the first minutes of the
  // application's life. Both pass every other test and each is the other's
  // first contact, so without this the cycle check would refuse whichever
  // fired second and mint an inviter out of the order the rows were written.
  const first = await signIn('first@example.com', 'First');
  clock += 1000;
  const second = await signIn('second@example.com', 'Second');
  clock += 1000;
  await connect(first, second, 'second@example.com');

  expect(inviterOf(first)).toBeNull();
  expect(inviterOf(second)).toBeNull();
});

it('still credits a first contact made weeks later', async () => {
  // The window is `INVITE_TTL_MS`, so this is deliberate rather than a
  // tolerance: somebody who signed up, sat alone for three weeks and was then
  // added by an established member is credited to them. The Floor is useless
  // alone, so a first contact is an entry into the network whenever it lands.
  // This was not true while the window was an hour, and a change back to
  // anything shorter than a month fails here rather than quietly narrowing
  // what counts as an arrival.
  const { alice } = await established();
  clock += 60_000;

  const carol = await signIn('carol@example.com', 'Carol');
  clock += 21 * 24 * 60 * 60 * 1000;
  await connect(carol, alice, 'alice@example.com');

  expect(inviterOf(carol)).toBe(alice.account.id);
  expect(viaOf(carol)).toBe('inferred');
});

it('credits nobody once the window has passed', async () => {
  const { alice } = await established();
  clock += 60_000;

  const carol = await signIn('carol@example.com', 'Carol');
  clock += INFERRED_CREDIT_WINDOW_MS + 1000;
  await connect(carol, alice, 'alice@example.com');

  // A friendship struck later is not an arrival, and nothing about the edge
  // itself distinguishes the two.
  expect(inviterOf(carol)).toBeNull();
});

it('credits only the first contact, not the second', async () => {
  const { alice, bob } = await established();
  clock += 60_000;

  const carol = await signIn('carol@example.com', 'Carol');
  clock += 10_000;
  await connect(carol, alice, 'alice@example.com');
  clock += 10_000;
  await connect(carol, bob, 'bob@example.com');

  // Still Alice. Bob is somebody Carol met, not somebody who brought her.
  expect(inviterOf(carol)).toBe(alice.account.id);
});

it('leaves a recorded credit alone, and says which kind it was', async () => {
  // An invitation by address is a record of an act. The inference runs on the
  // contact rows that invitation creates and must not overwrite it — the
  // standings would otherwise be rewritten by the weakest evidence available.
  const alice = await signIn('alice@example.com', 'Alice');
  await app.fastify.inject({
    method: 'POST',
    url: '/contacts/request',
    headers: auth(alice.token),
    payload: { identifier: 'dana@example.com' },
  });
  clock += 1000;
  const dana = await signIn('dana@example.com', 'Dana');
  clock += 1000;
  await app.fastify.inject({
    method: 'POST',
    url: `/contacts/${alice.account.id}/accept`,
    headers: auth(dana.token),
  });

  expect(inviterOf(dana)).toBe(alice.account.id);
  expect(viaOf(dana)).toBe('email');
});

it('never credits an account that arrived before the person it connects to', async () => {
  // The cycle guard, reached the only way it can be: the established account
  // is itself credited to the newcomer by an earlier act, so inferring the
  // reverse would close a loop and make `invitedCount` walk for ever.
  const alice = await signIn('alice@example.com', 'Alice');
  await app.fastify.inject({
    method: 'POST',
    url: '/contacts/request',
    headers: auth(alice.token),
    payload: { identifier: 'bob@example.com' },
  });
  clock += 1000;
  const bob = await signIn('bob@example.com', 'Bob');
  clock += 1000;
  await app.fastify.inject({
    method: 'POST',
    url: `/contacts/${alice.account.id}/accept`,
    headers: auth(bob.token),
  });
  expect(inviterOf(bob)).toBe(alice.account.id);

  // Alice has no inviter and one contact; Bob now has one too. Nothing here
  // may credit Alice to Bob.
  expect(inviterOf(alice)).toBeNull();
  expect(app.accounts.invitedCount(bob.account.id)).toBe(0);
});
