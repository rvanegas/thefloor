import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';
import {
  ASKING_THREAD,
  MemoryPusher,
  PARTICIPATION_LIFETIME_MS,
} from '../src/push';

/**
 * That whoever sent an invitation is told when it is taken up.
 *
 * The one notification this server sends about a person rather than about a
 * room, and the only one whose recipient has had nothing to look at while they
 * waited: an invite link is handed over and then there is silence, sometimes
 * for days. So the cases worth writing down are *who* gets told — always the
 * one who asked, never the one who answered — and that each of the ways a pair
 * becomes contacts reaches this at all. Two requests crossing is the one that
 * would be missed: it accepts a request through the route for *sending* one,
 * so it looks like nothing has been accepted at all.
 *
 * Delivery is `MemoryPusher`; nothing here talks to Apple.
 */

let app: App;
let pusher: MemoryPusher;
let clock = 1_700_000_000_000;

beforeEach(async () => {
  clock = 1_700_000_000_000;
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
 * A phone to be reached at. Registered before anybody accepts anything, since
 * an address the server does not know about yet is indistinguishable here from
 * a notification that was never composed.
 */
async function registerDevice(user: User, deviceToken: string) {
  const reply = await app.fastify.inject({
    method: 'POST',
    url: '/devices',
    headers: auth(user.token),
    payload: { token: deviceToken, platform: 'ios' },
  });
  expect(reply.statusCode).toBe(200);
}

/** Somebody with a username, which is the whole of what a link needs. */
async function named(identifier: string, displayName: string, username: string) {
  const user = await signIn(identifier, displayName);
  const set = await app.fastify.inject({
    method: 'POST',
    url: '/me',
    headers: auth(user.token),
    payload: { username },
  });
  expect(set.statusCode).toBe(200);
  return user;
}

async function inviteLink(user: User): Promise<{ username: string; pin: string }> {
  const response = await app.fastify.inject({
    method: 'POST',
    url: '/contacts/invite-link',
    headers: auth(user.token),
  });
  const { url } = response.json() as { url: string | null };
  const match = /\/i\/([^/]+)\/(\d{6})$/.exec(url!);
  expect(match).not.toBeNull();
  return { username: match![1], pin: match![2] };
}

/**
 * Asking by address, which is what inviting somebody is: the same route
 * whether or not anybody holds that address yet, and the one the app offers
 * for a person who is not already in a channel with you.
 */
const request = (from: User, identifier: string) =>
  app.fastify.inject({
    method: 'POST',
    url: '/contacts/request',
    headers: auth(from.token),
    payload: { identifier },
  });

const accept = (who: User, requesterId: string) =>
  app.fastify.inject({
    method: 'POST',
    url: `/contacts/${requesterId}/accept`,
    headers: auth(who.token),
  });

/** Only the acceptances, since a pair becoming contacts sends other things. */
const acceptances = (deviceToken: string) =>
  pusher
    .messagesFor(deviceToken)
    .filter((message) => message.kind === 'accepted');

describe('an invite link taken up', () => {
  it('tells whoever minted it, and says the link was followed', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice');
    await registerDevice(alice, 'alice-phone');
    const { username, pin } = await inviteLink(alice);

    const bob = await signIn('bob@example.com', 'Bob');
    const redeemed = await app.fastify.inject({
      method: 'POST',
      url: '/contacts/invite/accept',
      headers: auth(bob.token),
      payload: { username, pin },
    });
    expect(redeemed.statusCode).toBe(200);

    const sent = acceptances('alice-phone');
    expect(sent).toHaveLength(1);
    // Titled with the person, because that is the entire content: the channel
    // it names had no name and did not exist a second ago.
    expect(sent[0].title).toBe('Bob');
    expect(sent[0].body).toBe('Followed your invite link.');
  });

  it('names the pair channel, which is where meeting them happens', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice');
    await registerDevice(alice, 'alice-phone');
    const { username, pin } = await inviteLink(alice);

    const bob = await signIn('bob@example.com', 'Bob');
    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/invite/accept',
      headers: auth(bob.token),
      payload: { username, pin },
    });

    const [message] = acceptances('alice-phone');
    // The pair's own channel, created by this acceptance: it holds the two of
    // them and nobody else, which is what makes it the right place to tap
    // through to.
    const channel = app.channels.get(message.channelId);
    expect(channel).toBeDefined();
    expect([...channel!.participants].sort()).toEqual(
      [alice.account.id, bob.account.id].sort()
    );
  });

  it('is a membership statement: the long life, the asking stack, its own key', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice');
    await registerDevice(alice, 'alice-phone');
    const { username, pin } = await inviteLink(alice);

    const bob = await signIn('bob@example.com', 'Bob');
    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/invite/accept',
      headers: auth(bob.token),
      payload: { username, pin },
    });

    const [message] = acceptances('alice-phone');
    // A month, not five minutes: that person is a contact now and will still
    // be one when a phone that was off all week comes back.
    expect(message.lifetimeMs).toBe(PARTICIPATION_LIFETIME_MS);
    expect(message.threadId).toBe(ASKING_THREAD);
    // The membership key rather than the room's, so nothing about the room's
    // comings and goings can overwrite it.
    expect(message.collapseKey).toBe(`${message.channelId}:you`);
    // The socket has already drawn the new contact and their channel.
    expect(message.reachesInApp).toBe(false);
  });

  it('tells nobody but the inviter', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice');
    const { username, pin } = await inviteLink(alice);
    const bob = await signIn('bob@example.com', 'Bob');
    await registerDevice(bob, 'bob-phone');

    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/invite/accept',
      headers: auth(bob.token),
      payload: { username, pin },
    });

    // Bob did the accepting. Telling him it happened would be the application
    // reporting his own tap back to him.
    expect(acceptances('bob-phone')).toEqual([]);
  });

  it('sends nothing when the link is refused', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice');
    await registerDevice(alice, 'alice-phone');
    const { username, pin } = await inviteLink(alice);

    const bob = await signIn('bob@example.com', 'Bob');
    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/invite/accept',
      headers: auth(bob.token),
      payload: { username, pin },
    });
    // Good once. A second redemption is refused, and a refusal is not news.
    const carol = await signIn('carol@example.com', 'Carol');
    const again = await app.fastify.inject({
      method: 'POST',
      url: '/contacts/invite/accept',
      headers: auth(carol.token),
      payload: { username, pin },
    });
    expect(again.statusCode).toBe(400);

    expect(acceptances('alice-phone')).toHaveLength(1);
  });
});

describe('a contact request accepted', () => {
  it('tells whoever asked, and says a request was accepted', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await registerDevice(alice, 'alice-phone');
    expect((await request(alice, 'bob@example.com')).statusCode).toBe(200);
    expect((await accept(bob, alice.account.id)).statusCode).toBe(200);

    const sent = acceptances('alice-phone');
    expect(sent).toHaveLength(1);
    expect(sent[0].title).toBe('Bob');
    // Not the link's sentence: there was a request here, and saying somebody
    // followed a link they were never sent would be false.
    expect(sent[0].body).toBe('Accepted your contact request.');
  });

  it('tells nobody when the request is declined', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await registerDevice(alice, 'alice-phone');
    await request(alice, 'bob@example.com');
    const declined = await app.fastify.inject({
      method: 'POST',
      url: `/contacts/${alice.account.id}/decline`,
      headers: auth(bob.token),
    });
    expect(declined.statusCode).toBe(200);

    expect(acceptances('alice-phone')).toEqual([]);
  });

  it('tells the one who asked first when two requests cross', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await registerDevice(alice, 'alice-phone');
    await registerDevice(bob, 'bob-phone');
    await request(alice, 'bob@example.com');
    // Bob asks back rather than tapping accept, which accepts hers. The route
    // is the request one and not the accept one, which is why this case is the
    // one that goes missing.
    const crossed = await request(bob, 'alice@example.com');
    expect((crossed.json() as { accepted: boolean }).accepted).toBe(true);

    expect(acceptances('alice-phone')).toHaveLength(1);
    expect(acceptances('alice-phone')[0].title).toBe('Bob');
    expect(acceptances('bob-phone')).toEqual([]);
  });

  it('says nothing for a request that is merely sent', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await registerDevice(bob, 'bob-phone');
    await request(alice, 'bob@example.com');

    // Being asked is not somebody accepting; Bob has a request on Home and
    // this notification is about the other half of that exchange.
    expect(acceptances('bob-phone')).toEqual([]);
  });

  it('names the pair channel in the reply, so the app can go there', async () => {
    // The channel has always been made here — becoming contacts is what
    // creates the place the two of you talk — and was named nowhere, which
    // left the app to find it in the next snapshot by matching participants.
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await request(alice, 'bob@example.com');

    const reply = await accept(bob, alice.account.id);
    expect(reply.statusCode).toBe(200);
    const { channelId } = reply.json() as { channelId: string | null };
    expect(typeof channelId).toBe('string');

    // And it is a channel Bob is actually in, rather than an id: the whole
    // point is that accepting lands somebody somewhere they may speak.
    const home = await app.fastify.inject({
      method: 'GET',
      url: '/home',
      headers: auth(bob.token),
    });
    const { rejoinable } = home.json() as {
      rejoinable: Array<{ channelId: string }>;
    };
    expect(rejoinable.map((c) => c.channelId)).toContain(channelId);
  });

  it('names the same channel when the pair already have one', async () => {
    // `ensurePairChannel` is idempotent, and a second acceptance must not
    // mint a second room for the same two people.
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await request(alice, 'bob@example.com');
    const first = (await accept(bob, alice.account.id)).json() as {
      channelId: string;
    };

    await request(alice, 'bob@example.com');
    const again = await accept(bob, alice.account.id);
    // Already contacts, so there is no pending request to answer — what
    // matters is that nothing here invented a second channel.
    const home = await app.fastify.inject({
      method: 'GET',
      url: '/home',
      headers: auth(bob.token),
    });
    const { rejoinable } = home.json() as {
      rejoinable: Array<{ channelId: string }>;
    };
    expect(rejoinable.map((c) => c.channelId)).toEqual([first.channelId]);
    expect([200, 400]).toContain(again.statusCode);
  });
});
