import { createPrivateKey, createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import WebSocket from 'ws';
import { buildApp, type App } from '../src/app';
import { ANNOUNCE_INTERVAL_MS, PING_INTERVAL_MS } from '../src/channels';
import { MAX_PING_TEXT_LENGTH } from '../../core/constants';
import {
  isDeadToken,
  MemoryPusher,
  mintProviderToken,
  notifications,
  PARTICIPATION_LIFETIME_MS,
  PRESENCE_LIFETIME_MS,
} from '../src/push';

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

  it('forgets a device on sign-out', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    await registerDevice(alice.token, 'phone');

    await app.fastify.inject({
      method: 'POST',
      url: '/auth/sign-out',
      headers: auth(alice.token),
      payload: { deviceToken: 'phone' },
    });

    expect(app.devices.tokensFor([alice.account.id])).toEqual([]);
  });

  /**
   * One address per account, mirroring the one session per account that
   * `issueToken` enforces. An account holding two is describing a state the
   * auth layer forbids, the older of them being a phone that was signed out
   * and has no way of knowing.
   *
   * This replaced a test asserting the opposite — that registering a second
   * address left the first alone, on the reasoning that a phone signing out
   * should not silence a tablet. A tablet cannot be signed in at the same
   * time, so the case it protected could not arise.
   */
  it('keeps only the address that registered last', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    await registerDevice(alice.token, 'phone');
    await registerDevice(alice.token, 'tablet');

    expect(app.devices.tokensFor([alice.account.id])).toEqual(['tablet']);
    expect(app.devices.list(alice.account.id)).toHaveLength(1);
  });

  it('leaves a device alone when it registers again', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    await registerDevice(alice.token, 'phone');
    await registerDevice(alice.token, 'phone');

    expect(app.devices.tokensFor([alice.account.id])).toEqual(['phone']);
    expect(app.devices.list(alice.account.id)).toHaveLength(1);
  });

  /**
   * The forced sign-out, which is the case neither the sign-out route nor the
   * registry could reach on its own.
   *
   * Signing in anywhere revokes every other session, and the phone that held
   * one finds out only when some request comes back 401 — at which point it has
   * no credential left to deregister with. So the address has to be dropped
   * here, by the sign-in that ended it, or that phone goes on receiving this
   * account's notifications for the life of the database.
   *
   * Note that it goes before the new device has registered anything: the
   * account is reachable nowhere for a moment, which is the right way round.
   */
  it('stops sending to the phone that signing in elsewhere signed out', async () => {
    const first = await signIn('alice@example.com', 'Alice');
    await registerDevice(first.token, 'old-phone');

    const second = await signIn('alice@example.com', 'Alice');
    expect(app.devices.tokensFor([first.account.id])).toEqual([]);

    await registerDevice(second.token, 'new-phone');
    expect(app.devices.tokensFor([second.account.id])).toEqual(['new-phone']);
  });
});

describe('an invite', () => {
  it('reaches the invitee', async () => {
    const { alice, bob } = await twoContacts();
    await registerDevice(bob.token, 'bob-phone');

    const channelId = await createChannel(alice.token, [bob.account.id]);
    await settle();

    expect(pusher.messagesFor('bob-phone')).toEqual([
      {
        title: 'Alice',
        kind: 'started',
        body: 'Started a channel with you.',
        channelId,
        collapseKey: `${channelId}:you`,
        lifetimeMs: PARTICIPATION_LIFETIME_MS,
        reachesInApp: false,
      },
    ]);
  });

  /**
   * The same invitation by the other route. Every pair of contacts has a
   * standing channel from the moment they accept, so the first entry into one
   * is what used to be a creation — and it arrives as an ordinary ENTER from a
   * card on Home rather than through `create`. Announced from `commit` for
   * exactly that reason: this path never touches the route that used to say it.
   */
  it('reaches them when the standing channel is entered from Home', async () => {
    const { alice, bob } = await twoContacts();
    await registerDevice(bob.token, 'bob-phone');
    const [standing] = app.channels.rejoinableFor(alice.account.id);

    app.channels.dispatch(standing.channelId, alice.account.id, { type: 'ENTER' });
    await settle();

    expect(pusher.messagesFor('bob-phone')).toEqual([
      {
        title: 'Alice',
        kind: 'started',
        body: 'Started a channel with you.',
        channelId: standing.channelId,
        collapseKey: `${standing.channelId}:you`,
        lifetimeMs: PARTICIPATION_LIFETIME_MS,
        reachesInApp: false,
      },
    ]);
  });

  /**
   * And the second entry is not. Once somebody has been in it the channel is a
   * place they both know about, so the next arrival is an arrival — five
   * minutes' worth, in the words `announceActive` uses.
   */
  it('gives way to an ordinary arrival once the channel has been used', async () => {
    const { alice, bob } = await twoContacts();
    await registerDevice(bob.token, 'bob-phone');
    const [standing] = app.channels.rejoinableFor(alice.account.id);
    const id = standing.channelId;

    app.channels.dispatch(id, alice.account.id, { type: 'ENTER' });
    app.channels.dispatch(id, alice.account.id, { type: 'STEP_OUT' });
    await settle();
    pusher.sent.length = 0;
    clock += ANNOUNCE_INTERVAL_MS + 1;

    app.channels.dispatch(id, alice.account.id, { type: 'ENTER' });
    await settle();

    expect(pusher.messagesFor('bob-phone')).toEqual([
      {
        title: 'Alice',
        kind: 'arrived',
        body: 'Alice stepped in.',
        channelId: id,
        collapseKey: id,
        lifetimeMs: PRESENCE_LIFETIME_MS,
        reachesInApp: false,
      },
    ]);
  });

  /**
   * And `create`'s own notification is still reachable, which is worth pinning
   * now that most first taps do not get there. A channel of three has no
   * standing channel to reuse — those exist per pair — so it is made outright
   * and this is the path that says so. The two must not both fire: a channel
   * built by `createChannel` is present-from-birth and never passes through
   * the empty-to-occupied transition `announceStarted` watches for.
   */
  it('reaches everybody when the channel is a genuinely new one', async () => {
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
    await registerDevice(bob.token, 'bob-phone');
    await registerDevice(carol.token, 'carol-phone');

    const channelId = await createChannel(alice.token, [
      bob.account.id,
      carol.account.id,
    ]);
    await settle();

    for (const phone of ['bob-phone', 'carol-phone']) {
      expect(pusher.messagesFor(phone)).toEqual([
        {
          title: 'Alice',
          kind: 'started',
          body: 'Started a channel with you.',
          channelId,
          collapseKey: `${channelId}:you`,
          lifetimeMs: PARTICIPATION_LIFETIME_MS,
            reachesInApp: false,
        },
      ]);
    }
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
      {
        title: 'Alice',
        kind: 'arrived',
        body: 'Alice stepped in.',
        channelId,
        collapseKey: channelId,
        lifetimeMs: PRESENCE_LIFETIME_MS,
        reachesInApp: false,
      },
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

  /**
   * The window is there because the recipient probably still has the last
   * notification on their lock screen. Walking into the channel is evidence
   * that they do not: they answered it, and whoever arrives next is news.
   */
  it('tells somebody again once they have been in the room since', async () => {
    const { alice, bob, channelId } = await emptyChannel();
    await registerDevice(bob.token, 'bob-phone');

    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    app.channels.dispatch(channelId, bob.account.id, { type: 'STEP_OUT' });
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    clock += ANNOUNCE_INTERVAL_MS - 1;
    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    await settle();

    expect(pusher.messagesFor('bob-phone')).toHaveLength(2);
  });

  /**
   * The window used to be keyed by channel, so telling one person silenced
   * everybody else — including anybody who had been *in* the room when it
   * fired, and had therefore been told nothing at all.
   */
  it('does not let one person\u2019s notification silence another\u2019s', async () => {
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
    const channelId = await createChannel(alice.token, [
      bob.account.id,
      carol.account.id,
    ]);
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    await settle();
    await registerDevice(bob.token, 'bob-phone');
    await registerDevice(carol.token, 'carol-phone');
    pusher.sent.length = 0;

    // Alice arrives in an empty channel: both of the others are told.
    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    await settle();
    expect(pusher.messagesFor('bob-phone')).toHaveLength(1);
    expect(pusher.messagesFor('carol-phone')).toHaveLength(1);

    // Bob answers his, and they both leave. Carol never moved.
    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    app.channels.dispatch(channelId, bob.account.id, { type: 'STEP_OUT' });
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    clock += ANNOUNCE_INTERVAL_MS - 1;

    // Alice comes back. Bob spent his notice and is told; Carol is still
    // holding hers, and is not.
    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    await settle();
    expect(pusher.messagesFor('bob-phone')).toHaveLength(2);
    expect(pusher.messagesFor('carol-phone')).toHaveLength(1);
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
      {
        title: 'Alice and Carol',
        kind: 'arrived',
        body: 'Alice stepped in.',
        channelId,
        collapseKey: channelId,
        lifetimeMs: PRESENCE_LIFETIME_MS,
        reachesInApp: false,
      },
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
        kind: 'arrived',
        body: 'Alice stepped in.',
        channelId,
        collapseKey: channelId,
        lifetimeMs: PRESENCE_LIFETIME_MS,
        reachesInApp: false,
      },
    ]);
  });
});

/**
 * The one notification a person decides to send, which is why almost all of
 * this is about refusing it. The other three answer to the channel; this one
 * answers to somebody with a button, and the person on the receiving end has no
 * way to reply to it and no way to turn it off.
 */
describe('a ping', () => {
  /** Alice and Bob in a channel, with Bob stepped out and reachable. */
  async function bobStepsOut() {
    const { alice, bob } = await twoContacts();
    const channelId = await createChannel(alice.token, [bob.account.id]);
    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    app.channels.dispatch(channelId, bob.account.id, { type: 'STEP_OUT' });
    await settle();
    await registerDevice(bob.token, 'bob-phone');
    pusher.sent.length = 0;
    return { alice, bob, channelId };
  }

  const ping = (token: string, channelId: string, body: unknown) =>
    app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/ping`,
      headers: auth(token),
      payload: body as Record<string, unknown>,
    });

  it('reaches the person it names, in the sender’s words', async () => {
    const { alice, bob, channelId } = await bobStepsOut();

    const reply = await ping(alice.token, channelId, {
      targetId: bob.account.id,
      text: 'we are starting',
    });
    await settle();

    expect(reply.statusCode).toBe(200);
    expect(pusher.messagesFor('bob-phone')).toEqual([
      {
        title: 'Alice',
        kind: 'pinged',
        body: 'Alice: we are starting',
        channelId,
        // Nothing. Every ping carries words somebody chose, so no later one
        // is entitled to throw an earlier one away.
        collapseKey: null,
        lifetimeMs: PRESENCE_LIFETIME_MS,
        reachesInApp: true,
      },
    ]);
  });

  it('says something worth saying with no words at all', async () => {
    const { alice, bob, channelId } = await bobStepsOut();

    await ping(alice.token, channelId, { targetId: bob.account.id });
    await settle();

    expect(pusher.messagesFor('bob-phone')[0].body).toBe(
      'Alice is asking for you.'
    );
  });

  /** Whitespace is not words: it must not produce a body ending in a colon. */
  it('treats a composer full of spaces as no words', async () => {
    const { alice, bob, channelId } = await bobStepsOut();

    await ping(alice.token, channelId, { targetId: bob.account.id, text: '   ' });
    await settle();

    expect(pusher.messagesFor('bob-phone')[0].body).toBe(
      'Alice is asking for you.'
    );
  });

  it('refuses to ping somebody standing in the room', async () => {
    const { alice, bob, channelId } = await bobStepsOut();
    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    await settle();
    pusher.sent.length = 0;

    const reply = await ping(alice.token, channelId, {
      targetId: bob.account.id,
    });
    await settle();

    expect(reply.statusCode).toBe(409);
    expect(pusher.messagesFor('bob-phone')).toEqual([]);
  });

  it('refuses somebody who is not in the channel', async () => {
    const { alice, channelId } = await bobStepsOut();
    const carol = await signIn('carol@example.com', 'Carol');
    await registerDevice(carol.token, 'carol-phone');

    const reply = await ping(alice.token, channelId, {
      targetId: carol.account.id,
    });
    await settle();

    expect(reply.statusCode).toBe(403);
    expect(pusher.messagesFor('carol-phone')).toEqual([]);
  });

  it('refuses a sender who is not in the channel', async () => {
    const { bob, channelId } = await bobStepsOut();
    const carol = await signIn('carol@example.com', 'Carol');

    const reply = await ping(carol.token, channelId, {
      targetId: bob.account.id,
    });
    await settle();

    expect(reply.statusCode).toBe(403);
    expect(pusher.messagesFor('bob-phone')).toEqual([]);
  });

  it('refuses more words than a lock screen will hold', async () => {
    const { alice, bob, channelId } = await bobStepsOut();

    const reply = await ping(alice.token, channelId, {
      targetId: bob.account.id,
      text: 'x'.repeat(MAX_PING_TEXT_LENGTH + 1),
    });
    await settle();

    expect(reply.statusCode).toBe(400);
    expect(pusher.messagesFor('bob-phone')).toEqual([]);
  });

  /**
   * The limit is per target, not per sender: two people taking turns must not
   * add up to twice what one of them could send, the point being to protect
   * whoever is being pinged rather than to ration the senders.
   */
  it('will not let one person be pinged twice in a few minutes', async () => {
    const { alice, bob, channelId } = await bobStepsOut();
    await ping(alice.token, channelId, { targetId: bob.account.id });
    await settle();

    const again = await ping(alice.token, channelId, {
      targetId: bob.account.id,
    });
    await settle();

    expect(again.statusCode).toBe(409);
    expect(pusher.messagesFor('bob-phone')).toHaveLength(1);
  });

  it('reports when somebody may next be pinged, so the composer can say', async () => {
    const { alice, bob, channelId } = await bobStepsOut();
    // Nobody has been pinged, so there is nothing to report. Absent means
    // pingable, which is what lets a client read a missing entry as "go
    // ahead" without being told the interval.
    expect(app.channels.pingWindows(channelId)).toEqual({});

    const at = clock;
    await ping(alice.token, channelId, { targetId: bob.account.id });
    await settle();
    expect(app.channels.pingWindows(channelId)).toEqual({
      [bob.account.id]: at + PING_INTERVAL_MS,
    });

    // And it drops out again the moment the window closes, rather than sitting
    // there as a deadline in the past for a client to have to compare.
    clock += PING_INTERVAL_MS;
    expect(app.channels.pingWindows(channelId)).toEqual({});
  });

  it('lets the same person be pinged again once the window has passed', async () => {
    const { alice, bob, channelId } = await bobStepsOut();
    await ping(alice.token, channelId, { targetId: bob.account.id });
    await settle();

    clock += PING_INTERVAL_MS;
    const again = await ping(alice.token, channelId, {
      targetId: bob.account.id,
    });
    await settle();

    expect(again.statusCode).toBe(200);
    expect(pusher.messagesFor('bob-phone')).toHaveLength(2);
  });

  /**
   * The one case this whole feature was failing at, and the reason the flag
   * exists. Stepping out of a channel without leaving the app is the ordinary
   * way to be pingable — that is what being absent looks like from the inside —
   * so the notification was withheld from exactly the person it was aimed at,
   * every time, while the sender was told it had worked.
   */
  it('reaches somebody who has the app open but has stepped out', async () => {
    const { alice, bob, channelId } = await bobStepsOut();
    const socket = new WebSocket(`ws://${baseUrl}/ws?token=${bob.token}`);
    await new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });

    const reply = await ping(alice.token, channelId, {
      targetId: bob.account.id,
    });
    await settle();

    expect(reply.statusCode).toBe(200);
    expect(pusher.messagesFor('bob-phone')).toHaveLength(1);
    socket.close();
  });

  /**
   * The window bounds *sending*, and now that a ping is always delivered those
   * are the same thing — which is what makes a refusal honest. It used to be
   * possible to spend the window on a notification nobody received and then be
   * refused for five minutes on the strength of it.
   */
  it('spends the window only on a ping that was actually sent', async () => {
    const { alice, bob, channelId } = await bobStepsOut();
    const socket = new WebSocket(`ws://${baseUrl}/ws?token=${bob.token}`);
    await new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });

    await ping(alice.token, channelId, { targetId: bob.account.id });
    await settle();
    const again = await ping(alice.token, channelId, {
      targetId: bob.account.id,
    });
    await settle();

    expect(again.statusCode).toBe(409);
    expect(pusher.messagesFor('bob-phone')).toHaveLength(1);
    socket.close();
  });
});

/**
 * The setting somebody can actually reach: how loudly one channel may
 * interrupt one person. The rule itself is `alertFor` in core and is tested
 * there; what these cover is that the rule reaches a phone — that the level is
 * read per recipient at the moment of sending, and that two people in one
 * channel can be told the same thing at different volumes.
 */
describe('how loudly a channel may interrupt', () => {
  async function channelWithBothReachable() {
    const { alice, bob } = await twoContacts();
    const channelId = await createChannel(alice.token, [bob.account.id]);
    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    app.channels.dispatch(channelId, bob.account.id, { type: 'STEP_OUT' });
    await settle();
    await registerDevice(alice.token, 'alice-phone');
    await registerDevice(bob.token, 'bob-phone');
    pusher.sent.length = 0;
    return { alice, bob, channelId };
  }

  const setLevel = (token: string, channelId: string, level: unknown) =>
    app.fastify.inject({
      method: 'PUT',
      url: `/channels/${channelId}/notifications`,
      headers: auth(token),
      payload: { level } as Record<string, unknown>,
    });

  const ping = (token: string, channelId: string, targetId: string) =>
    app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/ping`,
      headers: auth(token),
      payload: { targetId },
    });

  it('leaves somebody who has never touched it on the default', async () => {
    const { alice, bob, channelId } = await channelWithBothReachable();

    await ping(alice.token, channelId, bob.account.id);
    await settle();

    expect(pusher.alertsFor('bob-phone')).toEqual(['audible']);
  });

  it('files a ping quietly for somebody who turned the channel down', async () => {
    const { alice, bob, channelId } = await channelWithBothReachable();
    expect((await setLevel(bob.token, channelId, 'low')).statusCode).toBe(200);

    await ping(alice.token, channelId, bob.account.id);
    await settle();

    // Delivered, and deliberately so: `low` is quiet rather than off, and the
    // notification is there to be found when they look.
    expect(pusher.messagesFor('bob-phone')).toHaveLength(1);
    expect(pusher.alertsFor('bob-phone')).toEqual(['passive']);
  });

  it('lets somebody ask to hear an arrival, which is otherwise silent', async () => {
    const { alice, bob, channelId } = await channelWithBothReachable();
    await setLevel(bob.token, channelId, 'high');

    // Alice walks into the room Bob is not in.
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    await settle();

    expect(pusher.alertsFor('bob-phone')).toEqual(['audible']);
  });

  /**
   * The reason the level is resolved per recipient rather than per send. One
   * arrival, one call into `notify`, two people who have asked for different
   * things — and the notification each of them gets has to be the one they
   * asked for, not the one the other did.
   */
  it('tells two people about one event at two volumes', async () => {
    const { alice, bob, channelId } = await channelWithBothReachable();
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
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'INVITE',
      contactId: carol.account.id,
    } as never);
    await settle();
    await registerDevice(carol.token, 'carol-phone');
    await setLevel(bob.token, channelId, 'high');
    await setLevel(carol.token, channelId, 'low');
    pusher.sent.length = 0;

    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    await settle();

    expect(pusher.alertsFor('bob-phone')).toEqual(['audible']);
    expect(pusher.alertsFor('carol-phone')).toEqual(['passive']);
  });

  it('refuses a level it has never heard of', async () => {
    const { bob, channelId } = await channelWithBothReachable();

    expect((await setLevel(bob.token, channelId, 'silent')).statusCode).toBe(400);
    expect((await setLevel(bob.token, channelId, 3)).statusCode).toBe(400);
    expect((await setLevel(bob.token, channelId, undefined)).statusCode).toBe(400);
  });

  it('refuses somebody who is not in the channel', async () => {
    const { channelId } = await channelWithBothReachable();
    const carol = await signIn('carol@example.com', 'Carol');

    const reply = await setLevel(carol.token, channelId, 'low');
    // 404 rather than 403: a channel Carol cannot see is one she is not owed
    // the existence of, which is the rule every other read here follows.
    expect(reply.statusCode).toBe(404);
  });

  /**
   * Choosing the default stores nothing, which is what keeps a row meaning
   * "somebody decided this" rather than "somebody once opened the screen".
   * The reply is read back from storage for exactly this reason.
   */
  it('forgets the row when somebody goes back to the default', async () => {
    const { bob, channelId } = await channelWithBothReachable();

    await setLevel(bob.token, channelId, 'high');
    const back = await setLevel(bob.token, channelId, 'medium');

    expect(back.json()).toEqual({ level: 'medium' });
    const rows = app.db
      .prepare(
        'SELECT count(*) AS n FROM channel_notification_levels WHERE account_id = ?'
      )
      .get(bob.account.id) as { n: number };
    expect(rows.n).toBe(0);
  });
});

/**
 * Two of the three report who belongs to a channel and one reports who is
 * standing in it, and they are given different lifetimes on that basis. The
 * cases above already prove each kind carries its own as far as the pusher;
 * these state the distinction itself, which is what a later change could
 * quietly flatten by giving everything one window again.
 */
describe('how long a notification stays worth delivering', () => {
  it('keeps an invitation alive long after an arrival would have lapsed', () => {
    const started = notifications.started('Alice', 'chan_1');
    const invited = notifications.invited('Alice', 'Standup', 'chan_1');
    const arrived = notifications.arrived('Standup', 'Alice', 'chan_1');

    expect(started.lifetimeMs).toBe(PARTICIPATION_LIFETIME_MS);
    expect(invited.lifetimeMs).toBe(PARTICIPATION_LIFETIME_MS);
    expect(arrived.lifetimeMs).toBe(PRESENCE_LIFETIME_MS);
    expect(arrived.lifetimeMs).toBeLessThan(started.lifetimeMs);
  });

  /**
   * Zero is not "no expiry" — APNs reads it as attempt once and store nothing,
   * which is the opposite of what the long window is for. A lifetime that
   * reached zero by arithmetic or by some later default would fail silently,
   * reaching only the phones that happened to be awake.
   */
  /**
   * Stated on the constructors rather than through a channel, because this is
   * a property of each kind of notification and not of any particular send.
   * The partition is the same one the collapse key draws, which is worth
   * fixing in a test: a fifth notification added later has to choose a side
   * deliberately, and the cheap default — copying the line above it — is the
   * right one for anything the channel says about itself.
   */
  /**
   * The quiet three are what buy the loud one its credibility: a phone that
   * chimes every time a room fills and empties gets its notifications turned
   * off, and the ping goes with them. So this is a statement about the three
   * as much as about the one.
   */
  /**
   * The collapse keys follow the *lifetimes*, not the seam the rest of push.ts
   * is organised around, and this is the test that says so. They shared one key
   * per channel until an arrival was found overwriting an invitation on the
   * lock screen — the only notification telling somebody they had been added to
   * a channel, replaced by one that expires in five minutes and says something
   * else.
   */
  it('keeps membership news out of the reach of the room', () => {
    const started = notifications.started('Alice', 'chan_1');
    const invited = notifications.invited('Alice', 'Standup', 'chan_1');
    const arrived = notifications.arrived('Standup', 'Alice', 'chan_1');

    // The two that stay true share a key, which is safe: being invited to a
    // channel you were just started into does not happen.
    expect(started.collapseKey).toBe(invited.collapseKey);
    // And the one that does not stay true cannot touch them.
    expect(arrived.collapseKey).not.toBe(started.collapseKey);
    // The pair that shares a key is the pair that shares a lifetime.
    expect(started.lifetimeMs).toBe(invited.lifetimeMs);
    expect(arrived.lifetimeMs).not.toBe(started.lifetimeMs);
  });

  it('says which of the four it is, so a level can be applied to it', () => {
    expect(notifications.started('Alice', 'chan_1').kind).toBe('started');
    expect(notifications.invited('Alice', null, 'chan_1').kind).toBe('invited');
    expect(notifications.arrived('Standup', 'Alice', 'chan_1').kind).toBe(
      'arrived'
    );
    expect(
      notifications.pinged('Standup', 'Alice', 'come back', 'chan_1').kind
    ).toBe('pinged');
  });

  it('delivers only a ping to somebody who is already in the app', () => {
    expect(notifications.started('Alice', 'chan_1').reachesInApp).toBe(false);
    expect(notifications.invited('Alice', null, 'chan_1').reachesInApp).toBe(
      false
    );
    expect(notifications.arrived('Standup', 'Alice', 'chan_1').reachesInApp).toBe(
      false
    );
    expect(
      notifications.pinged('Standup', 'Alice', 'come back', 'chan_1')
        .reachesInApp
    ).toBe(true);
  });

  it('never asks APNs to store nothing', () => {
    for (const message of [
      notifications.started('Alice', 'chan_1'),
      notifications.invited('Alice', null, 'chan_1'),
      notifications.arrived('Standup', 'Alice', 'chan_1'),
    ]) {
      expect(message.lifetimeMs).toBeGreaterThan(0);
    }
  });
});
