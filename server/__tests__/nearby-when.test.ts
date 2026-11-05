import { isWaiting, nearbyWhenOf } from '../../core/channel';
import { ATTENTION_WINDOW_MS, WAITING_WINDOW_MS } from '../../core/constants';
import type { NearbyWhen } from '../../core/types';
import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import { MemoryPusher } from '../src/push';

/**
 * Nearby, with a *when*, as the server keeps it — 2026-11-04.
 *
 * Three things only the server can be asked: that a named time holds a wait
 * open past the attention window, that answering a ping tells the person who
 * sent it (once), and that nothing malformed reaches the reducer under the
 * name. The reducer's half is core/__tests__/nearbyWhen.test.ts. See
 * planning/decision/2026-11-04-nearby-says-when.md.
 */

let app: App;
let pusher: MemoryPusher;
let clock = 1_700_000_040_000;
const MIN = 60_000;

beforeEach(async () => {
  clock = 1_700_000_040_000;
  pusher = new MemoryPusher();
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    now: () => clock,
    pusher,
  });
  await app.fastify.listen({ port: 0, host: '127.0.0.1' });
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const settle = () => new Promise((r) => setTimeout(r, 0));

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

async function device(user: User, token: string) {
  const reply = await app.fastify.inject({
    method: 'POST',
    url: '/devices',
    headers: auth(user.token),
    payload: { token, platform: 'ios' },
  });
  expect(reply.statusCode).toBe(200);
}

/** Alice in the room she made; Bob, her contact, a member and not in it. */
async function aliceWaitingForBob() {
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
  const created = await app.fastify.inject({
    method: 'POST',
    url: '/channels',
    headers: auth(alice.token),
    payload: { contactId: bob.account.id },
  });
  const { channelId } = created.json() as { channelId: string };
  app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
  await device(alice, 'alice-phone');
  await device(bob, 'bob-phone');
  await settle();
  pusher.sent.length = 0;
  return { alice, bob, channelId };
}

const answer = (user: User, channelId: string, when: unknown) =>
  app.fastify.inject({
    method: 'POST',
    url: `/channels/${channelId}/nearby`,
    headers: auth(user.token),
    payload: { when },
  });

const ping = (from: User, to: User, channelId: string) =>
  app.fastify.inject({
    method: 'POST',
    url: `/channels/${channelId}/ping`,
    headers: auth(from.token),
    payload: { targetId: to.account.id },
  });

const channel = (id: string) => app.channels.get(id)!;

describe('a ping', () => {
  it('carries the buttons that answer it', async () => {
    const { alice, bob, channelId } = await aliceWaitingForBob();
    expect((await ping(alice, bob, channelId)).statusCode).toBe(200);
    await settle();
    expect(pusher.messagesFor('bob-phone').at(-1)?.category).toBe('ping');
  });
});

describe('answering a ping with when', () => {
  it('makes them nearby with it, and tells whoever asked', async () => {
    const { alice, bob, channelId } = await aliceWaitingForBob();
    await ping(alice, bob, channelId);
    await settle();

    const reply = await answer(bob, channelId, {
      kind: 'at',
      at: clock + 20 * MIN,
    });
    await settle();

    expect(reply.statusCode).toBe(200);
    expect(isWaiting(channel(channelId), bob.account.id)).toBe(true);
    expect(nearbyWhenOf(channel(channelId), bob.account.id)).toEqual({
      kind: 'at',
      at: clock + 20 * MIN,
    });
    const told = pusher.messagesFor('alice-phone');
    expect(told).toHaveLength(1);
    expect(told[0]).toMatchObject({
      kind: 'pinged',
      body: 'Bob: free in 20 min.',
      collapseKey: null,
    });
    expect(told[0]!.category).toBeUndefined();
  });

  it('tells them once per ping, however often it is changed', async () => {
    const { alice, bob, channelId } = await aliceWaitingForBob();
    await ping(alice, bob, channelId);
    await answer(bob, channelId, { kind: 'soon' });
    clock += MIN;
    await answer(bob, channelId, { kind: 'flow' });
    await settle();

    expect(pusher.messagesFor('alice-phone').map((m) => m.body)).toEqual([
      'Bob: free in a few minutes.',
    ]);
    expect(nearbyWhenOf(channel(channelId), bob.account.id)).toEqual({
      kind: 'flow',
    });
  });

  it('tells nobody when no ping is open, and is a declaration all the same', async () => {
    const { bob, channelId } = await aliceWaitingForBob();
    const reply = await answer(bob, channelId, { kind: 'flow' });
    await settle();

    expect(reply.statusCode).toBe(200);
    expect(isWaiting(channel(channelId), bob.account.id)).toBe(true);
    // Alice is in the room, so not even the arrival reaches her phone.
    expect(pusher.messagesFor('alice-phone')).toEqual([]);
  });

  it('still reaches the sender ten minutes on, past the ping\'s own window', async () => {
    const { alice, bob, channelId } = await aliceWaitingForBob();
    await ping(alice, bob, channelId);
    clock += 10 * MIN;
    await answer(bob, channelId, { kind: 'soon' });
    await settle();
    expect(pusher.messagesFor('alice-phone')).toHaveLength(1);

    // And not past the waiting window: by then the question has lapsed.
    await ping(alice, bob, channelId);
    clock += WAITING_WINDOW_MS;
    pusher.sent.length = 0;
    await answer(bob, channelId, { kind: 'flow' });
    await settle();
    expect(pusher.messagesFor('alice-phone')).toEqual([]);
  });

  /**
   * A sender who is nearby is absent, so the declaration would announce
   * *Bob is nearby, free in a few minutes* to them a beat before the answer
   * says the same thing. One notification, the one that is an answer.
   */
  it('reaches a nearby sender as the answer alone, not the arrival too', async () => {
    const { alice, bob, channelId } = await aliceWaitingForBob();
    app.channels.dispatch(channelId, alice.account.id, { type: 'DECLARE_NEARBY' });
    await ping(alice, bob, channelId);
    await settle();
    pusher.sent.length = 0;

    await answer(bob, channelId, { kind: 'soon' });
    await settle();

    expect(pusher.messagesFor('alice-phone').map((m) => m.body)).toEqual([
      'Bob: free in a few minutes.',
    ]);
  });

  it('is refused to somebody in the room, who has answered by coming', async () => {
    const { alice, channelId } = await aliceWaitingForBob();
    const reply = await answer(alice, channelId, { kind: 'soon' });
    expect(reply.statusCode).toBe(409);
    expect(channel(channelId).present).toContain(alice.account.id);
  });

  it('refuses an answer that is not one, and a stranger', async () => {
    const { bob, channelId } = await aliceWaitingForBob();
    expect((await answer(bob, channelId, { kind: 'later' })).statusCode).toBe(400);
    expect((await answer(bob, channelId, undefined)).statusCode).toBe(400);
    const carol = await signIn('carol@example.com', 'Carol');
    expect((await answer(carol, channelId, { kind: 'soon' })).statusCode).toBe(403);
  });
});

describe('a when declared over the socket', () => {
  it('refuses a malformed one rather than reading it as plain nearby', async () => {
    const { bob, channelId } = await aliceWaitingForBob();
    const result = app.channels.dispatch(channelId, bob.account.id, {
      type: 'DECLARE_NEARBY',
      when: { kind: 'at', at: 'noon' },
    } as never);
    expect(result.ok).toBe(false);
    expect(isWaiting(channel(channelId), bob.account.id)).toBe(false);
  });

  it('says when in the arrival the absent are sent', async () => {
    const { alice, bob, channelId } = await aliceWaitingForBob();
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    await settle();
    pusher.sent.length = 0;

    app.channels.dispatch(channelId, bob.account.id, {
      type: 'DECLARE_NEARBY',
      when: { kind: 'flow' } as NearbyWhen,
    } as never);
    await settle();

    expect(pusher.messagesFor('alice-phone').map((m) => m.body)).toEqual([
      'Bob is nearby, in the flow.',
    ]);
  });
});

describe('a named time', () => {
  const declareAt = (channelId: string, userId: string, at: number) =>
    app.channels.dispatch(channelId, userId, {
      type: 'DECLARE_NEARBY',
      when: { kind: 'at', at } as NearbyWhen,
    } as never);

  it('holds the wait open through inattention until it has come and gone', async () => {
    const { bob, channelId } = await aliceWaitingForBob();
    const at = clock + 40 * MIN;
    declareAt(channelId, bob.account.id, at);

    // Well past the attention window, and before the time: still nearby.
    clock += ATTENTION_WINDOW_MS + 5 * MIN;
    app.channels.tick();
    expect(isWaiting(channel(channelId), bob.account.id)).toBe(true);

    // The time, and a window after it, as a plain tap would have had.
    clock = at + WAITING_WINDOW_MS - 1;
    app.channels.tick();
    expect(isWaiting(channel(channelId), bob.account.id)).toBe(true);
    clock = at + WAITING_WINDOW_MS + 1;
    app.channels.tick();
    expect(isWaiting(channel(channelId), bob.account.id)).toBe(false);
  });

  it('holds nothing for the two that name no moment', async () => {
    const { bob, channelId } = await aliceWaitingForBob();
    app.channels.dispatch(channelId, bob.account.id, {
      type: 'DECLARE_NEARBY',
      when: { kind: 'flow' } as NearbyWhen,
    } as never);
    clock += ATTENTION_WINDOW_MS + 1;
    app.channels.tick();
    expect(isWaiting(channel(channelId), bob.account.id)).toBe(false);
  });
});
