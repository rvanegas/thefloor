import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';
import { MemoryBadgeSetter } from '../src/push';
import { MemoryRecordingStore } from '../src/storage';

/**
 * The number on the app's icon follows what is waiting on Home — see
 * core/badge.ts — and is sent when it changes rather than when anything does.
 */

let app: App;
let media: MemoryMediaServer;
let setter: MemoryBadgeSetter;
let clock = 1_700_000_000_000;

beforeEach(() => {
  clock = 1_700_000_000_000;
  media = new MemoryMediaServer();
  setter = new MemoryBadgeSetter();
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    media,
    mediaUrl: 'wss://example.livekit.cloud',
    store: new MemoryRecordingStore(),
    badgeSetter: setter,
    badgeDelayMs: 0,
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
const settle = () => new Promise((r) => setTimeout(r, 5));

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

async function register(user: User, token: string, platform = 'ios') {
  await app.fastify.inject({
    method: 'POST',
    url: '/devices',
    headers: auth(user.token),
    payload: { token, platform },
  });
  await settle();
}

async function contacts(alice: User, bob: User) {
  await app.fastify.inject({
    method: 'POST',
    url: '/contacts/request',
    headers: auth(alice.token),
    payload: { identifier: 'bob@example.com' },
  });
  await settle();
  await app.fastify.inject({
    method: 'POST',
    url: `/contacts/${alice.account.id}/accept`,
    headers: auth(bob.token),
  });
  await settle();
  const answered = setter.countsFor('bob-phone');
  const created = await app.fastify.inject({
    method: 'POST',
    url: '/channels',
    headers: auth(alice.token),
    payload: { contactId: bob.account.id },
  });
  await settle();
  return { answered, channelId: (created.json() as { channelId: string }).channelId };
}

describe('the app icon badge', () => {
  it('is sent on registering, so a fresh install starts right', async () => {
    const bob = await signIn('bob@example.com', 'Bob');
    await register(bob, 'bob-phone');
    expect(setter.countsFor('bob-phone')).toEqual([0]);
  });

  it('counts a contact request, and falls when it is answered', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await register(bob, 'bob-phone');
    const { answered } = await contacts(alice, bob);
    expect(answered).toEqual([0, 1, 0]);
  });

  it('counts a room with somebody in it, and not one you are in', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await register(bob, 'bob-phone');
    await register(alice, 'alice-phone');
    const { channelId } = await contacts(alice, bob);

    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    await app.channels.mediaToken(channelId, alice.account.id);
    await settle();
    expect(setter.countsFor('bob-phone').at(-1)).toBe(1);
    // Alice is standing in it, so it is not waiting for her.
    expect(setter.countsFor('alice-phone').at(-1)).toBe(0);

    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    await app.channels.mediaToken(channelId, bob.account.id);
    await settle();
    expect(setter.countsFor('bob-phone').at(-1)).toBe(0);
  });

  it('is not resent when the count has not moved', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await register(bob, 'bob-phone');
    const { channelId } = await contacts(alice, bob);
    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    await app.channels.mediaToken(channelId, alice.account.id);
    await settle();
    const sent = setter.countsFor('bob-phone').length;

    // A change to the room that moves nobody's count.
    app.channels.dispatch(channelId, alice.account.id, { type: 'SET_SELF_MUTE', muted: true });
    await settle();
    expect(setter.countsFor('bob-phone')).toHaveLength(sent);
  });

  it('is never sent to an Android address', async () => {
    const bob = await signIn('bob@example.com', 'Bob');
    await register(bob, 'bob-android', 'android');
    expect(setter.countsFor('bob-android')).toEqual([]);
  });

  it('comes off when notifications are switched off, and back when on', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await register(bob, 'bob-phone');
    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(alice.token),
      payload: { identifier: 'bob@example.com' },
    });
    await settle();
    expect(setter.countsFor('bob-phone').at(-1)).toBe(1);

    const off = await app.fastify.inject({
      method: 'POST',
      url: '/me/settings',
      headers: auth(bob.token),
      payload: { pushNotificationsOff: true },
    });
    expect(off.statusCode).toBe(200);
    await settle();
    expect(setter.countsFor('bob-phone').at(-1)).toBe(0);

    await app.fastify.inject({
      method: 'POST',
      url: '/me/settings',
      headers: auth(bob.token),
      payload: { pushNotificationsOff: false },
    });
    await settle();
    expect(setter.countsFor('bob-phone').at(-1)).toBe(1);
  });
});
