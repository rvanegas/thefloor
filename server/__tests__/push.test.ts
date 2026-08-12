import { createPrivateKey, createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import WebSocket from 'ws';
import { buildApp, type App } from '../src/app';
import { ANNOUNCE_INTERVAL_MS } from '../src/channels';
import { isDeadToken, MemoryPusher, mintProviderToken } from '../src/push';

/**
 * What reaches somebody whose app is not running, and — as often — what does
 * not. Most of the value here is in the negative cases: a notification that
 * duplicates what is already on screen, or that fires again every time a bad
 * connection flaps, is worse than none.
 *
 * Delivery itself is `MemoryPusher`; nothing here talks to Apple.
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

async function signIn(identifier: string, displayName?: string) {
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
  return (reply.json() as { channelId: string }).channelId;
}

/** Lets the fire-and-forget send settle before anything is asserted. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('the device registry', () => {
  it('records where an account can be reached', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    await registerDevice(alice.token, 'device-a');

    expect(app.devices.tokensFor([alice.account.id])).toEqual(['device-a']);
  });

  it('refuses an unauthenticated registration', async () => {
    const reply = await app.fastify.inject({
      method: 'POST',
      url: '/devices',
      payload: { token: 'device-a', platform: 'ios' },
    });
    expect(reply.statusCode).toBe(401);
  });

  /**
   * The defect this exists for: one phone signing in as somebody else keeps
   * the address Apple gave it, so the row has to move. Two rows would send one
   * person's conversations to another person's lock screen.
   */
  it('moves a device to the account that last registered it', async () => {
    const { alice, bob } = await twoContacts();
    await registerDevice(alice.token, 'one-phone');
    await registerDevice(bob.token, 'one-phone');

    expect(app.devices.tokensFor([alice.account.id])).toEqual([]);
    expect(app.devices.tokensFor([bob.account.id])).toEqual(['one-phone']);
    expect(app.devices.list(bob.account.id)).toHaveLength(1);
  });

  it('forgets a device on sign-out, and leaves the account’s others alone', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    await registerDevice(alice.token, 'phone');
    await registerDevice(alice.token, 'tablet');

    await app.fastify.inject({
      method: 'POST',
      url: '/auth/sign-out',
      headers: auth(alice.token),
      payload: { deviceToken: 'phone' },
    });

    expect(app.devices.tokensFor([alice.account.id])).toEqual(['tablet']);
  });
});

describe('an invite', () => {
  it('reaches the invitee', async () => {
    const { alice, bob } = await twoContacts();
    await registerDevice(bob.token, 'bob-phone');

    const channelId = await createChannel(alice.token, [bob.account.id]);
    await settle();

    expect(pusher.messagesFor('bob-phone')).toEqual([
      { title: 'Alice', body: 'Started a channel with you.', channelId },
    ]);
  });

  it('does not reach the person who sent it', async () => {
    const { alice, bob } = await twoContacts();
    await registerDevice(alice.token, 'alice-phone');
    await registerDevice(bob.token, 'bob-phone');

    await createChannel(alice.token, [bob.account.id]);
    await settle();

    expect(pusher.messagesFor('alice-phone')).toEqual([]);
  });

  it('is not sent to somebody who already has the app open', async () => {
    const { alice, bob } = await twoContacts();
    await registerDevice(bob.token, 'bob-phone');

    const socket = new WebSocket(`ws://${baseUrl}/ws?token=${bob.token}`);
    await new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });

    await createChannel(alice.token, [bob.account.id]);
    await settle();

    // The websocket has already delivered it as a banner. A notification would
    // be a second copy of what is on screen.
    expect(pusher.messagesFor('bob-phone')).toEqual([]);
    socket.close();
  });
});

describe('a channel becoming active', () => {
  /**
   * The channel is created and then emptied, because creation places the
   * initiator in it — so the transition worth announcing is the *next* arrival,
   * into a channel nobody is in.
   */
  async function emptyChannel() {
    const { alice, bob } = await twoContacts();
    const channelId = await createChannel(alice.token, [bob.account.id]);
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    await settle();
    pusher.sent.length = 0;
    return { alice, bob, channelId };
  }

  it('tells the people who are not in it', async () => {
    const { alice, bob, channelId } = await emptyChannel();
    await registerDevice(bob.token, 'bob-phone');

    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    await settle();

    expect(pusher.messagesFor('bob-phone')).toEqual([
      { title: 'Alice', body: 'Alice stepped in.', channelId },
    ]);
  });

  it('says nothing to the person who stepped in', async () => {
    const { alice, channelId } = await emptyChannel();
    await registerDevice(alice.token, 'alice-phone');

    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    await settle();

    expect(pusher.messagesFor('alice-phone')).toEqual([]);
  });

  /**
   * Only the transition out of empty is worth announcing. Somebody joining a
   * conversation already in progress has changed nothing about whether it is
   * worth walking over to your phone.
   */
  it('says nothing when somebody joins a channel that is already occupied', async () => {
    const { alice, bob, channelId } = await emptyChannel();
    const carol = await signIn('carol@example.com', 'Carol');
    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(alice.token),
      payload: { identifier: 'carol@example.com' },
    });
    await app.fastify.inject({
      method: 'POST',
      url: `/contacts/${alice.account.id}/accept`,
      headers: auth(carol.token),
    });

    // Named, because only a named channel takes a newcomer in where they were
    // invited. Inviting into an unnamed one moves the conversation elsewhere,
    // which is a different test.
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_NAME',
      name: 'Standup',
    } as never);
    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    await settle();
    await registerDevice(carol.token, 'carol-phone');
    await registerDevice(bob.token, 'bob-phone');
    pusher.sent.length = 0;

    app.channels.dispatch(channelId, alice.account.id, {
      type: 'INVITE',
      contactId: carol.account.id,
    } as never);
    // Carol is told she was invited; that is the invitation, not the arrival,
    // and this test is about the arrival.
    await settle();
    pusher.sent.length = 0;

    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    await settle();

    expect(pusher.sent).toEqual([]);
  });

  /**
   * Presence follows a websocket, so a bad connection produces a run of
   * empty-to-occupied transitions that are a network artefact rather than
   * anything happening in the room.
   */
  it('does not announce the same channel twice inside the quiet window', async () => {
    const { alice, bob, channelId } = await emptyChannel();
    await registerDevice(bob.token, 'bob-phone');

    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    clock += ANNOUNCE_INTERVAL_MS - 1;
    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    await settle();

    expect(pusher.messagesFor('bob-phone')).toHaveLength(1);
  });

  it('announces again once the window has passed', async () => {
    const { alice, bob, channelId } = await emptyChannel();
    await registerDevice(bob.token, 'bob-phone');

    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    clock += ANNOUNCE_INTERVAL_MS;
    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    await settle();

    expect(pusher.messagesFor('bob-phone')).toHaveLength(2);
  });
});

describe('a dead address', () => {
  it('is forgotten when Apple reports it', async () => {
    const { alice, bob } = await twoContacts();
    await registerDevice(bob.token, 'deleted-app');
    pusher.dead.add('deleted-app');

    await createChannel(alice.token, [bob.account.id]);
    await settle();

    expect(app.devices.tokensFor([bob.account.id])).toEqual([]);
  });

  /**
   * Only 410 Unregistered counts. Apple answers 400 BadDeviceToken both for a
   * token that never existed and for a good one presented to the wrong
   * environment — verified against the real service, where production accepted
   * a token that sandbox refused with exactly this. Pruning on it would make
   * one wrong APNS_ENV forget every device in the database.
   */
  it('survives every refusal but 410', () => {
    expect(isDeadToken(410)).toBe(true);

    // 400 is the one that matters: a good token in the wrong environment
    // produces it, and so does a token that never existed.
    expect(isDeadToken(400)).toBe(false);
    // A rejected provider token, a throttle and an outage are all about the
    // sender or the service, never about the address.
    expect(isDeadToken(403)).toBe(false);
    expect(isDeadToken(429)).toBe(false);
    expect(isDeadToken(500)).toBe(false);
    // Nothing was reached at all.
    expect(isDeadToken(0)).toBe(false);
  });
});

describe('the provider token', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
  });

  it('carries the key id and the team, signed with ES256', () => {
    const token = mintProviderToken(
      privateKey,
      'ABCDE12345',
      '9946JKHZUJ',
      1_700_000_000_000
    );
    const [header, claims] = token
      .split('.')
      .slice(0, 2)
      .map((part) => JSON.parse(Buffer.from(part, 'base64url').toString()));

    expect(header).toEqual({ alg: 'ES256', kid: 'ABCDE12345' });
    expect(claims).toEqual({ iss: '9946JKHZUJ', iat: 1_700_000_000 });
  });

  /**
   * The assertion this file exists for. Node's default ECDSA encoding is DER,
   * which APNs rejects with a bare InvalidProviderToken that blames the token
   * rather than the encoding — so the bug is invisible without either a round
   * trip to Apple or exactly this check. JWS requires the raw r||s form, which
   * for P-256 is 64 bytes.
   */
  it('is signed in the raw r||s form rather than DER', () => {
    const token = mintProviderToken(privateKey, 'k', 't', 1_700_000_000_000);
    const [header, claims, signature] = token.split('.');

    expect(Buffer.from(signature, 'base64url')).toHaveLength(64);
    expect(
      verify(
        'sha256',
        Buffer.from(`${header}.${claims}`),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64url')
      )
    ).toBe(true);
  });

  it('accepts a key in the .p8 form Apple hands out', () => {
    const p8 = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    expect(p8).toContain('BEGIN PRIVATE KEY');

    const reloaded = createPrivateKey(p8);
    const token = mintProviderToken(reloaded, 'k', 't', 1_700_000_000_000);
    const [header, claims, signature] = token.split('.');

    expect(
      verify(
        'sha256',
        Buffer.from(`${header}.${claims}`),
        { key: createPublicKey(reloaded), dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64url')
      )
    ).toBe(true);
  });
});

describe('a restart', () => {
  /**
   * A deploy drops every socket and revives every channel with nobody present,
   * so the clients that reconnect a second later each produce a
   * nobody-to-somebody transition. Without this, two people mid-conversation
   * would each be told the other had stepped into the channel they were
   * already in — an operational event dressed up as somebody arriving.
   */
  it('does not announce a channel that was only restored', async () => {
    const { alice, bob } = await twoContacts();
    const channelId = await createChannel(alice.token, [bob.account.id]);
    await registerDevice(bob.token, 'bob-phone');
    await settle();

    // What a restart does to this registry: every channel read back from its
    // row, with nobody present.
    pusher.sent.length = 0;
    app.channels.restore();

    // The reconnect that follows, a second later.
    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    await settle();

    expect(pusher.messagesFor('bob-phone')).toEqual([]);
  });

  it('announces normally once the quiet window has passed', async () => {
    const { alice, bob } = await twoContacts();
    const channelId = await createChannel(alice.token, [bob.account.id]);
    await registerDevice(bob.token, 'bob-phone');
    await settle();

    pusher.sent.length = 0;
    app.channels.restore();
    clock += ANNOUNCE_INTERVAL_MS;

    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    await settle();

    expect(pusher.messagesFor('bob-phone')).toHaveLength(1);
  });
});

/**
 * The lock screen is the one surface where the channel's label arrives with no
 * typography — the muted italic that marks a description on screen cannot come
 * with it. So the words themselves have to be right, and they have to be the
 * same words the app would show that same reader.
 */
describe('what an unnamed channel is called on the lock screen', () => {
  /** A channel nobody is in, so that stepping in is worth announcing. */
  async function emptyChannel() {
    const { alice, bob } = await twoContacts();
    const channelId = await createChannel(alice.token, [bob.account.id]);
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    await settle();
    pusher.sent.length = 0;
    return { alice, bob, channelId };
  }

  it('names the others rather than counting heads', async () => {
    const { alice, bob } = await twoContacts();
    const carol = await signIn('carol@example.com', 'Carol');
    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(alice.token),
      payload: { identifier: 'carol@example.com' },
    });
    await app.fastify.inject({
      method: 'POST',
      url: `/contacts/${alice.account.id}/accept`,
      headers: auth(carol.token),
    });
    // All three from the start. An unnamed channel cannot be widened by an
    // invitation — that moves the conversation to a different channel — and
    // what is under test here is what an unnamed one is *called*.
    const channelId = await createChannel(alice.token, [
      bob.account.id,
      carol.account.id,
    ]);
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    await registerDevice(bob.token, 'bob-phone');
    await settle();
    pusher.sent.length = 0;

    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    await settle();

    // Bob's side of the roster, which is the only side this notification has.
    // It used to read "3 people", counting Bob himself among strangers.
    expect(pusher.messagesFor('bob-phone')).toEqual([
      { title: 'Alice and Carol', body: 'Alice stepped in.', channelId },
    ]);
  });

  it('uses the name once the channel has one', async () => {
    const { alice, bob, channelId } = await emptyChannel();
    await registerDevice(bob.token, 'bob-phone');
    app.channels.dispatch(channelId, bob.account.id, {
      type: 'SET_NAME',
      name: 'Thursday rehearsal',
    } as never);

    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    await settle();

    expect(pusher.messagesFor('bob-phone')).toEqual([
      {
        title: 'Thursday rehearsal',
        body: 'Alice stepped in.',
        channelId,
      },
    ]);
  });
});
