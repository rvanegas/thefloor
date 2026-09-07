import { buildApp } from '../src/app';
import { MemoryPusher } from '../src/push';

/**
 * That each address reaches the service that issued it.
 *
 * Separate from `push.test.ts`, which shares one pusher across its whole suite
 * and asserts about *what* is sent — this one is about *where*, and needs two
 * pushers to have anything to say. The failure it guards is quiet in the worst
 * way: an FCM token handed to APNs is refused with a status that looks exactly
 * like a stale row, so the pruning that follows deletes the working address and
 * the person simply stops being reachable.
 */

let clock = 1_700_000_000_000;
let ios: MemoryPusher;
let android: MemoryPusher;
let app: ReturnType<typeof buildApp>;

beforeEach(async () => {
  clock = 1_700_000_000_000;
  ios = new MemoryPusher();
  android = new MemoryPusher();
  app = buildApp({
    dbPath: ':memory:',
    now: () => clock,
    pusher: ios,
    androidPusher: android,
  });
  await app.fastify.listen({ port: 0, host: '127.0.0.1' });
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

async function register(
  token: string,
  deviceToken: string,
  platform: 'ios' | 'android'
) {
  const reply = await app.fastify.inject({
    method: 'POST',
    url: '/devices',
    headers: auth(token),
    payload: { token: deviceToken, platform },
  });
  expect(reply.statusCode).toBe(200);
}

/** Alice and Bob, as contacts, with a channel Alice can invite Bob into. */
async function twoContacts() {
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
  return { alice, bob };
}

async function invite(alice: { token: string }, bobId: string) {
  const reply = await app.fastify.inject({
    method: 'POST',
    url: '/channels',
    headers: auth(alice.token),
    payload: { contactIds: [bobId] },
  });
  expect(reply.statusCode).toBe(200);
}

it('sends each address only to its own service', async () => {
  const { alice, bob } = await twoContacts();
  await register(bob.token, 'bob-iphone', 'ios');
  await register(bob.token, 'bob-pixel', 'android');

  await invite(alice, bob.account.id);
  // The send is deliberately not awaited by the notifier; let it settle.
  await new Promise((resolve) => setImmediate(resolve));

  expect(ios.sent.flatMap((entry) => entry.tokens)).toEqual(['bob-iphone']);
  expect(android.sent.flatMap((entry) => entry.tokens)).toEqual(['bob-pixel']);
});

it('still reaches one person on two platforms with one notification each', async () => {
  const { alice, bob } = await twoContacts();
  await register(bob.token, 'bob-iphone', 'ios');
  await register(bob.token, 'bob-pixel', 'android');

  await invite(alice, bob.account.id);
  await new Promise((resolve) => setImmediate(resolve));

  expect(ios.messagesFor('bob-iphone')).toHaveLength(1);
  expect(android.messagesFor('bob-pixel')).toHaveLength(1);
  // The same notification, not two different ones.
  expect(ios.messagesFor('bob-iphone')[0].kind).toBe('invited');
  expect(android.messagesFor('bob-pixel')[0].kind).toBe('invited');
});

it('groups by alert within a platform rather than across one', async () => {
  const { alice, bob } = await twoContacts();
  await register(bob.token, 'bob-pixel-a', 'android');
  await register(bob.token, 'bob-pixel-b', 'android');

  await invite(alice, bob.account.id);
  await new Promise((resolve) => setImmediate(resolve));

  // Two addresses, one answer, so one request carrying both — the grouping
  // that existed before platform was part of the key.
  expect(android.sent).toHaveLength(1);
  expect(android.sent[0].tokens.sort()).toEqual(['bob-pixel-a', 'bob-pixel-b']);
  expect(ios.sent).toHaveLength(0);
});

/**
 * A box with APNs configured and no FCM credential, which is what every
 * deployment is between shipping this and creating a Firebase project.
 *
 * **The Android address must not reach the iOS sender.** It did until
 * 2026-09-06, which meant a production server handed FCM registration tokens
 * to Apple and collected `BadDeviceToken` refusals that name the token and say
 * nothing about the service being wrong. Nothing was pruned, so the only cost
 * was a log that misdescribed its own failure — which is the expensive kind.
 */
it('does not send an Android address to the iOS sender', async () => {
  await app.fastify.close();
  app.channels.stop();
  app = buildApp({ dbPath: ':memory:', now: () => clock, pusher: ios });
  await app.fastify.listen({ port: 0, host: '127.0.0.1' });

  const { alice, bob } = await twoContacts();
  await register(bob.token, 'bob-pixel', 'android');
  await invite(alice, bob.account.id);
  await new Promise((resolve) => setImmediate(resolve));

  expect(ios.messagesFor('bob-pixel')).toHaveLength(0);
  expect(ios.sent).toHaveLength(0);
});

/** And an iOS address on the same server still goes where it always did. */
it('still reaches the iOS sender when only that is configured', async () => {
  await app.fastify.close();
  app.channels.stop();
  app = buildApp({ dbPath: ':memory:', now: () => clock, pusher: ios });
  await app.fastify.listen({ port: 0, host: '127.0.0.1' });

  const { alice, bob } = await twoContacts();
  await register(bob.token, 'bob-iphone', 'ios');
  await invite(alice, bob.account.id);
  await new Promise((resolve) => setImmediate(resolve));

  expect(ios.messagesFor('bob-iphone')).toHaveLength(1);
});
