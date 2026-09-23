import WebSocket from 'ws';
import { buildApp, type App } from '../src/app';
import { ANNOUNCE_INTERVAL_MS } from '../src/channels';
import { MemoryPusher, NOTIFICATION_PAUSE_MS } from '../src/push';

/**
 * That a week of arrivals nobody comes back for stops the next one.
 *
 * The rule is a defence of the iOS toggle rather than of anybody's attention:
 * a person who has stopped answering can switch this app's notifications off
 * for ever with two taps, from a screen the server cannot see, and going quiet
 * first is the cheaper of the two silences. So most of what is asserted here
 * is the *boundaries* of it — who is not paused, what un-pauses somebody, and
 * which notifications it was never allowed to touch — because pausing the
 * wrong person is invisible from this end, which is what makes it worth a
 * suite of its own.
 *
 * **Arrivals are the whole of it, in and out.** They are the only kind that
 * lands in the volume the argument is about, and the only kind that counts
 * towards the week: a ping goes on reaching a paused person and starts no
 * clock. The last two tests are that half, and they are what would fail if
 * somebody later reached for `userIds` without reading the kind.
 *
 * Kept apart from push.test.ts for push-routing.test.ts's reason: that one is
 * about what is sent, on a clock that barely moves, and every test here is
 * about a week going by.
 */

let app: App;
let pusher: MemoryPusher;
let clock = 1_700_000_000_000;
let baseUrl: string;

beforeEach(async () => {
  clock = 1_700_000_000_000;
  pusher = new MemoryPusher();
  app = buildApp({ dbPath: ':memory:', now: () => clock, pusher });
  await app.fastify.listen({ port: 0, host: '127.0.0.1' });
  const address = app.fastify.server.address();
  if (typeof address === 'string' || address === null) throw new Error('no port');
  baseUrl = `127.0.0.1:${address.port}`;
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/** The notifier does not await its sends; let them settle. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

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

async function befriend(
  asker: { token: string; account: { id: string } },
  identifier: string,
  target: { token: string }
) {
  await app.fastify.inject({
    method: 'POST',
    url: '/contacts/request',
    headers: auth(asker.token),
    payload: { identifier },
  });
  await app.fastify.inject({
    method: 'POST',
    url: `/contacts/${asker.account.id}/accept`,
    headers: auth(target.token),
  });
}

async function registerDevice(token: string, deviceToken: string) {
  const reply = await app.fastify.inject({
    method: 'POST',
    url: '/devices',
    headers: auth(token),
    payload: { token: deviceToken, platform: 'ios' },
  });
  expect(reply.statusCode).toBe(200);
}

async function createChannel(token: string, contactIds: string[]) {
  const reply = await app.fastify.inject({
    method: 'POST',
    url: '/channels',
    headers: auth(token),
    payload: { contactIds },
  });
  expect(reply.statusCode).toBe(200);
  return (reply.json() as { channelId: string }).channelId;
}

/** Every address anything has been sent to since the last clearing. */
const reached = () => pusher.sent.flatMap((entry) => entry.tokens);

/** Nothing has been sent since the last clearing. */
const clear = () => {
  pusher.sent.length = 0;
};

/**
 * Alice and Bob in a channel nobody is standing in, with Bob's phone
 * registered — the shape in which Alice stepping in is worth announcing.
 */
async function anEmptyRoom() {
  const alice = await signIn('alice@example.com', 'Alice');
  const bob = await signIn('bob@example.com', 'Bob');
  await befriend(alice, 'bob@example.com', bob);
  const channelId = await createChannel(alice.token, [bob.account.id]);
  app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
  await settle();
  await registerDevice(bob.token, 'bob-phone');
  clear();
  return { alice, bob, channelId };
}

/**
 * Somebody steps in and out again, which is one arrival announced to whoever
 * is absent. They leave so that the next one is a fresh arrival rather than a
 * second entry by somebody the room already holds.
 */
async function arrival(who: { account: { id: string } }, channelId: string) {
  app.channels.dispatch(channelId, who.account.id, { type: 'ENTER' });
  app.channels.dispatch(channelId, who.account.id, { type: 'STEP_OUT' });
  await settle();
}

/** Alice calls one person into the channel by hand. */
async function ping(token: string, channelId: string, targetId: string) {
  const reply = await app.fastify.inject({
    method: 'POST',
    url: `/channels/${channelId}/ping`,
    headers: auth(token),
    payload: { targetId, text: 'come along' },
  });
  expect(reply.statusCode).toBe(200);
  await settle();
}

it('stops announcing arrivals once a week of them has gone unanswered', async () => {
  const { alice, channelId } = await anEmptyRoom();

  await arrival(alice, channelId);
  expect(reached()).toEqual(['bob-phone']);

  clock += NOTIFICATION_PAUSE_MS;
  clear();
  await arrival(alice, channelId);
  expect(reached()).toEqual([]);
});

it('still announces up to the moment the week is up', async () => {
  const { alice, channelId } = await anEmptyRoom();

  await arrival(alice, channelId);
  clock += NOTIFICATION_PAUSE_MS - 1;
  clear();
  await arrival(alice, channelId);
  expect(reached()).toEqual(['bob-phone']);
});

it('measures from the oldest unanswered arrival, not the latest', async () => {
  const { alice, channelId } = await anEmptyRoom();

  // A busy week: somebody steps in every day and he opens nothing. The week
  // would never elapse if each announcement restarted it — and somebody in a
  // channel this busy is the person the pause exists for, not an edge case.
  const day = 24 * 60 * 60 * 1000;
  for (let announced = 0; announced < 7; announced += 1) {
    await arrival(alice, channelId);
    expect(reached()).toEqual(['bob-phone']);
    clear();
    clock += day;
  }
  await arrival(alice, channelId);
  expect(reached()).toEqual([]);
});

it('does not pause somebody who has simply been away', async () => {
  const { alice, channelId } = await anEmptyRoom();

  // A month in which nothing happened. He has ignored no arrival, because he
  // was sent none, and the first one after a quiet month is the one most
  // worth sending.
  clock += 30 * 24 * 60 * 60 * 1000;
  await arrival(alice, channelId);
  expect(reached()).toEqual(['bob-phone']);
});

it('does not start the clock on somebody with nowhere to be reached', async () => {
  const alice = await signIn('alice@example.com', 'Alice');
  const bob = await signIn('bob@example.com', 'Bob');
  await befriend(alice, 'bob@example.com', bob);
  const channelId = await createChannel(alice.token, [bob.account.id]);
  app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
  await settle();

  // A week of arrivals with no device registered: nothing left the building,
  // so nothing has been ignored. Granting permission afterwards must not find
  // a week already served.
  await arrival(alice, channelId);
  clock += NOTIFICATION_PAUSE_MS;
  await registerDevice(bob.token, 'bob-phone');
  clear();
  await arrival(alice, channelId);
  expect(reached()).toEqual(['bob-phone']);
});

it('resumes when the app is opened', async () => {
  const { alice, bob, channelId } = await anEmptyRoom();

  await arrival(alice, channelId);
  clock += NOTIFICATION_PAUSE_MS;
  clear();
  await arrival(alice, channelId);
  expect(reached()).toEqual([]);

  // Opening the app is a socket, and being seen is the whole of what the
  // pause waits for: `markSeen` on the way in clears the stamp with it.
  const socket = new WebSocket(`ws://${baseUrl}/ws?token=${bob.token}`);
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  await settle();
  socket.close();

  // Past the window that suppresses a second announcement to the same person,
  // which is a rule about repetition and is not this one.
  clock += ANNOUNCE_INTERVAL_MS + 1;
  clear();
  await arrival(alice, channelId);
  expect(reached()).toEqual(['bob-phone']);
});

it('pauses one person without silencing another', async () => {
  const alice = await signIn('alice@example.com', 'Alice');
  const bob = await signIn('bob@example.com', 'Bob');
  const carol = await signIn('carol@example.com', 'Carol');
  await befriend(alice, 'bob@example.com', bob);
  await befriend(alice, 'carol@example.com', carol);
  const channelId = await createChannel(alice.token, [
    bob.account.id,
    carol.account.id,
  ]);
  app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
  await settle();
  await registerDevice(bob.token, 'bob-phone');
  await registerDevice(carol.token, 'carol-phone');
  clear();

  // One announcement reaches both; then a week passes and only Carol comes
  // back. The pause is one person's, and the room they share is not it.
  await arrival(alice, channelId);
  expect(reached().sort()).toEqual(['bob-phone', 'carol-phone']);
  clock += NOTIFICATION_PAUSE_MS;
  app.accounts.markSeen(carol.account.id, clock);

  clear();
  await arrival(alice, channelId);
  expect(reached()).toEqual(['carol-phone']);
});

it('goes on calling a paused person by hand', async () => {
  const { alice, bob, channelId } = await anEmptyRoom();

  await arrival(alice, channelId);
  clock += NOTIFICATION_PAUSE_MS;
  clear();
  await arrival(alice, channelId);
  expect(reached()).toEqual([]);

  // Pinging is a thing you do from inside the room, so Alice stays this time.
  // Her entering announces nothing new: Bob is inside the window that
  // suppresses a second announcement, and paused besides.
  app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
  await settle();
  clear();

  // A ping is one person aiming a sentence at another, and is the likeliest
  // thing to bring a lapsed person back. The pause must not touch it.
  await ping(alice.token, channelId, bob.account.id);
  expect(reached()).toEqual(['bob-phone']);
});

it('does not let a ping start the week', async () => {
  const alice = await signIn('alice@example.com', 'Alice');
  const bob = await signIn('bob@example.com', 'Bob');
  await befriend(alice, 'bob@example.com', bob);
  const channelId = await createChannel(alice.token, [bob.account.id]);

  // Alice is in the room before Bob's phone is known, so that the arrival her
  // entering announces reaches nobody and stamps nothing. What follows is a
  // ping and an arrival, in that order, which is the whole of the test.
  app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
  await settle();
  await registerDevice(bob.token, 'bob-phone');
  clear();

  await ping(alice.token, channelId, bob.account.id);
  expect(reached()).toEqual(['bob-phone']);

  // Alice leaves, so that what follows is an arrival rather than a no-op by
  // somebody the room already holds.
  app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
  await settle();

  // Only arrivals count towards the pause. A ping a week ago is not a week of
  // being ignored, and the arrival after it is announced.
  clock += NOTIFICATION_PAUSE_MS;
  clear();
  await arrival(alice, channelId);
  expect(reached()).toEqual(['bob-phone']);
});
