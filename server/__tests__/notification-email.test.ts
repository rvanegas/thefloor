import { buildApp } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { MemoryPusher } from '../src/push';

/**
 * The two notification switches on Floor Settings, as the send path reads
 * them: `emailNotifications` adds an email to what people aim at you, and
 * `pushNotificationsOff` withholds the push from every device. See
 * core/settings.ts for both.
 */

let clock = 1_700_000_000_000;
let pusher: MemoryPusher;
let mailer: MemoryMailer;
let app: ReturnType<typeof buildApp>;

beforeEach(async () => {
  clock = 1_700_000_000_000;
  pusher = new MemoryPusher();
  mailer = new MemoryMailer();
  app = buildApp({ dbPath: ':memory:', now: () => clock, pusher, mailer });
  await app.fastify.listen({ port: 0, host: '127.0.0.1' });
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const settle = () => new Promise((resolve) => setImmediate(resolve));

async function signIn(identifier: string, displayName: string) {
  const code = app.accounts.issueCode(identifier, clock)!;
  const verified = await app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, displayName },
  });
  return verified.json() as { token: string; account: { id: string } };
}

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
  await app.fastify.inject({
    method: 'POST',
    url: '/devices',
    headers: auth(bob.token),
    payload: { token: 'bob-iphone', platform: 'ios' },
  });
  return { alice, bob };
}

async function save(token: string, payload: Record<string, unknown>) {
  return app.fastify.inject({
    method: 'POST',
    url: '/me/settings',
    headers: auth(token),
    payload,
  });
}

async function invite(alice: { token: string }, bobId: string) {
  const reply = await app.fastify.inject({
    method: 'POST',
    url: '/channels',
    headers: auth(alice.token),
    payload: { contactIds: [bobId] },
  });
  expect(reply.statusCode).toBe(200);
  await settle();
}

it('starts with email off and push on, and keeps what is saved', async () => {
  const bob = await signIn('bob@example.com', 'Bob');
  expect(app.accounts.settings(bob.account.id)).toMatchObject({
    emailNotifications: false,
    pushNotificationsOff: false,
  });
  const saved = await save(bob.token, {
    emailNotifications: true,
    pushNotificationsOff: true,
  });
  expect(saved.statusCode).toBe(200);
  expect(saved.json()).toMatchObject({
    emailNotifications: true,
    pushNotificationsOff: true,
  });
});

it('refuses a switch that is not a boolean', async () => {
  const bob = await signIn('bob@example.com', 'Bob');
  expect((await save(bob.token, { emailNotifications: 'yes' })).statusCode).toBe(400);
  expect((await save(bob.token, { pushNotificationsOff: 1 })).statusCode).toBe(400);
});

it('sends no email to somebody who has not asked for it', async () => {
  const { alice, bob } = await twoContacts();
  await invite(alice, bob.account.id);
  expect(mailer.notified).toHaveLength(0);
  expect(pusher.messagesFor('bob-iphone')).toHaveLength(1);
});

it('emails the push notification’s own words to somebody who asked', async () => {
  const { alice, bob } = await twoContacts();
  await save(bob.token, { emailNotifications: true });
  await invite(alice, bob.account.id);

  expect(mailer.notified).toEqual([
    {
      to: 'bob@example.com',
      title: 'Alice',
      body: 'Invited you to a channel.',
      link: 'https://thefloor.rvanegas.co/app',
    },
  ]);
  // Both switches on means both.
  expect(pusher.messagesFor('bob-iphone')).toHaveLength(1);
});

it('withholds the push, on every device, from somebody who switched it off', async () => {
  const { alice, bob } = await twoContacts();
  await save(bob.token, { pushNotificationsOff: true, emailNotifications: true });
  await invite(alice, bob.account.id);

  expect(pusher.messagesFor('bob-iphone')).toHaveLength(0);
  expect(mailer.notified).toHaveLength(1);
});
