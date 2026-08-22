import WebSocket from 'ws';
import { buildApp, type App } from '../src/app';
import {
  DISCONNECT_GRACE_MS,
  HEARTBEAT_TIMEOUT_MS,
} from '../../core/constants';
import { OTP_RESEND_INTERVAL_MS } from '../src/accounts';
import type { ClientMessage, ServerMessage } from '../../core/protocol';
import { MemoryMailer } from '../src/mail';

/**
 * These drive a real socket against a listening server. The HTTP tests use
 * `inject`, which never performs an upgrade — and that blind spot hid a bug
 * where the websocket route was served as an ordinary GET.
 */

let app: App;
let baseUrl: string;
let clock = 1_700_000_000_000;

beforeEach(async () => {
  clock = 1_700_000_000_000;
  // Inviting an address with no account needs a transport — see server.test.ts.
  app = buildApp({ dbPath: ':memory:', mailer: new MemoryMailer(), now: () => clock });
  await app.fastify.listen({ port: 0, host: '127.0.0.1' });
  const address = app.fastify.server.address();
  if (typeof address === 'string' || address === null) throw new Error('no port');
  baseUrl = `127.0.0.1:${address.port}`;
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

class Client {
  private socket: WebSocket;
  readonly received: ServerMessage[] = [];

  constructor(token: string, base: string) {
    this.socket = new WebSocket(`ws://${base}/ws?token=${token}`);
    this.socket.on('message', (raw) => {
      this.received.push(JSON.parse(String(raw)) as ServerMessage);
    });
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket.readyState === WebSocket.OPEN) return resolve();
      this.socket.once('open', () => resolve());
      this.socket.once('error', reject);
    });
  }

  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  /** Waits for a message matching `predicate`, or throws on timeout. */
  async next<T extends ServerMessage['type']>(
    type: T,
    predicate: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true,
    timeoutMs = 3000
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = this.received.find(
        (m): m is Extract<ServerMessage, { type: T }> =>
          m.type === type && predicate(m as Extract<ServerMessage, { type: T }>)
      );
      if (found) return found;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(
      `timed out waiting for ${type}; saw ${JSON.stringify(
        this.received.map((m) => m.type)
      )}`
    );
  }

  close(): void {
    this.socket.close();
  }

  get closed(): Promise<number> {
    return new Promise((resolve) => this.socket.once('close', (code) => resolve(code)));
  }
}

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

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function pairInSession() {
  const alice = await signIn('user1@example.com', 'Alice');
  const bob = await signIn('user2@example.com', 'Bob');
  await app.fastify.inject({
    method: 'POST',
    url: '/contacts/request',
    headers: auth(alice.token),
    payload: { identifier: 'user2@example.com' },
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
  return { alice, bob, channelId };
}

describe('websocket', () => {
  it('completes the upgrade and greets an authenticated client', async () => {
    const { token, account } = await signIn('user1@example.com', 'Alice');
    const client = new Client(token, baseUrl);
    await client.open();
    const hello = await client.next('hello');
    expect(hello.account).toEqual({ id: account.id, displayName: 'Alice' });
    client.close();
  });

  /**
   * The diagnostic panel's gate — `accounts.debug`, which is null for
   * everybody until somebody sets it by hand.
   *
   * **Absent rather than false when off**, which is what lets this deploy
   * ahead of any client that can read it: a build that has never heard of the
   * field is unaffected, and one that has reads absent as false. The two cases
   * are asserted separately because "sent as false" would pass a test written
   * only for the true one, while quietly widening every hello on the wire.
   */
  it('says nothing about debug for an ordinary account', async () => {
    const { token } = await signIn('user1@example.com', 'Alice');
    const client = new Client(token, baseUrl);
    await client.open();
    const hello = await client.next('hello');
    expect(hello.debug).toBeUndefined();
    client.close();
  });

  it('tells an account with the column set that it has it', async () => {
    const { token, account } = await signIn('user1@example.com', 'Alice');
    // Set the way it is actually set: by hand, in the database. There is no
    // endpoint for this and there is deliberately no screen.
    app.db
      .prepare('UPDATE accounts SET debug = 1 WHERE id = ?')
      .run(account.id);
    const client = new Client(token, baseUrl);
    await client.open();
    const hello = await client.next('hello');
    expect(hello.debug).toBe(true);
    client.close();
  });

  it('rejects a bad token', async () => {
    const client = new Client('not-a-real-token', baseUrl);
    await client.open();
    expect(await client.closed).toBe(4401);
  });

  it('pushes a live invite to the other party', async () => {
    const { bob, channelId } = await pairInSession();
    const bobClient = new Client(bob.token, baseUrl);
    await bobClient.open();
    bobClient.send({ type: 'watch.home' });

    const home = await bobClient.next(
      'home',
      (m) => m.home.invites.length > 0
    );
    expect(home.home.invites[0].channelId).toBe(channelId);
    expect(home.home.invites[0].from.displayName).toBe('Alice');
    bobClient.close();
  });

  /**
   * Found by hand: leaving a channel left it on Home, and tapping the row that
   * should have gone answered "Channel gone".
   *
   * The change is pushed to the changed channel's participants, and leaving is
   * the one change that removes you from that list — so the person the change
   * was about was the only one not told about it. Nothing else would have
   * corrected it, Home having no timer.
   */
  it('pushes a fresh Home to whoever has just left the channel', async () => {
    const { bob, channelId } = await pairInSession();
    const b = new Client(bob.token, baseUrl);
    await b.open();
    b.send({ type: 'watch.home' });
    await b.next('home', (m) => m.home.invites.length > 0);

    b.send({ type: 'watch.channel', channelId });
    b.send({ type: 'channel.action', channelId, action: { type: 'ENTER' } });
    await b.next('channel', (m) => m.view.channel.present.includes(bob.account.id));

    b.send({ type: 'channel.action', channelId, action: { type: 'LEAVE_CHANNEL' } });

    // The *latest* snapshot, not any snapshot: `next` scans from the start,
    // and Bob's first Home predates the channel he is now leaving.
    const latestHome = () => {
      const homes = b.received.filter((m) => m.type === 'home');
      const last = homes[homes.length - 1];
      return last && last.type === 'home' ? last.home : undefined;
    };
    const deadline = Date.now() + 3000;
    let home = latestHome();
    while (
      Date.now() < deadline &&
      !(
        home !== undefined &&
        !home.invites.some((i) => i.channelId === channelId) &&
        !home.rejoinable.some((c) => c.channelId === channelId)
      )
    ) {
      await new Promise((r) => setTimeout(r, 20));
      home = latestHome();
    }
    expect(home?.invites.map((i) => i.channelId)).not.toContain(channelId);
    expect(home?.rejoinable.map((c) => c.channelId)).not.toContain(channelId);
    b.close();
  });

  it('pushes an incoming contact request to the recipient', async () => {
    // Found by hand on two simulators: contact changes arrive over HTTP, and
    // nothing told the recipient's socket, so a request never appeared until
    // they happened to reload.
    const alice = await signIn('user1@example.com', 'Alice');
    const bob = await signIn('user2@example.com', 'Bob');

    const bobClient = new Client(bob.token, baseUrl);
    await bobClient.open();
    bobClient.send({ type: 'watch.home' });
    await bobClient.next('home');

    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(alice.token),
      payload: { identifier: 'user2@example.com' },
    });

    const home = await bobClient.next(
      'home',
      (m) => m.home.contacts.length > 0
    );
    expect(home.home.contacts[0]).toMatchObject({
      status: 'incoming',
      account: { displayName: 'Alice' },
    });
    bobClient.close();
  });

  it('pushes an acceptance back to the requester', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    const bob = await signIn('user2@example.com', 'Bob');

    const aliceClient = new Client(alice.token, baseUrl);
    await aliceClient.open();
    aliceClient.send({ type: 'watch.home' });
    await aliceClient.next('home');

    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(alice.token),
      payload: { identifier: 'user2@example.com' },
    });
    await app.fastify.inject({
      method: 'POST',
      url: `/contacts/${alice.account.id}/accept`,
      headers: auth(bob.token),
    });

    const home = await aliceClient.next(
      'home',
      (m) => m.home.contacts[0]?.status === 'accepted'
    );
    expect(home.home.contacts[0].account.displayName).toBe('Bob');
    aliceClient.close();
  });

  it('pushes a floor claim to the silenced party', async () => {
    const { alice, bob, channelId } = await pairInSession();
    const a = new Client(alice.token, baseUrl);
    const b = new Client(bob.token, baseUrl);
    await Promise.all([a.open(), b.open()]);

    a.send({ type: 'watch.channel', channelId });
    b.send({ type: 'channel.action', channelId, action: { type: 'ENTER' } });
    await b.next('channel', (m) => m.view.channel.present.length === 2);

    a.send({ type: 'channel.action', channelId, action: { type: 'CLAIM_FLOOR' } });

    // Bob learns he is silenced without asking.
    const pushed = await b.next(
      'channel',
      (m) => m.view.channel.floor.holder === alice.account.id
    );
    expect(pushed.view.serverNow).toBeGreaterThan(0);
    a.close();
    b.close();
  });

  it('refuses an action from someone outside the channel', async () => {
    const { channelId } = await pairInSession();
    const mallory = await signIn('user9999999@example.com', 'Mallory');
    const m = new Client(mallory.token, baseUrl);
    await m.open();

    m.send({
      type: 'channel.action',
      channelId,
      action: { type: 'LEAVE_CHANNEL' },
    });
    const error = await m.next('error');
    expect(error.message).toBe('Not your channel.');
    expect(app.channels.get(channelId)!.status).toBe('active');
    m.close();
  });

  it('answers a heartbeat', async () => {
    const { token } = await signIn('user1@example.com', 'Alice');
    const client = new Client(token, baseUrl);
    await client.open();
    await client.next('hello');

    client.send({ type: 'ping' });
    const pong = await client.next('pong');
    expect(pong.serverNow).toBeGreaterThan(0);
    client.close();
  });

  it('starts the grace period for a connection that has gone silent', async () => {
    // A socket can die without either end being told: no close arrives and it
    // sits half-open until the OS gives up, which is hours. Nothing downstream
    // works in the meantime — nobody is removed, so no channel ever empties or
    // auto-ends, and a recording bills against two egresses indefinitely.
    const { alice, bob, channelId } = await pairInSession();
    const a = new Client(alice.token, baseUrl);
    const b = new Client(bob.token, baseUrl);
    await Promise.all([a.open(), b.open()]);

    a.send({ type: 'watch.channel', channelId });
    b.send({ type: 'channel.action', channelId, action: { type: 'ENTER' } });
    await b.next('channel', (m) => m.view.channel.present.length === 2);

    // Bob's socket stays open but says nothing further. The clock moves past
    // the point where that is survivable.
    clock += HEARTBEAT_TIMEOUT_MS + 1_000;
    await new Promise((r) => setTimeout(r, 6_500));

    const channel = app.channels.get(channelId)!;
    expect(channel.disconnectedAt[bob.account.id]).toBeDefined();
    // Still present: silence starts the clock, it does not remove anyone.
    expect(channel.present).toContain(bob.account.id);
    a.close();
    b.close();
  }, 15_000);

  it('keeps a dropped party in the channel, and their floor', async () => {
    // Losing a socket is not leaving. Only staying gone past the grace period
    // is, and that is a timer rather than an event.
    const { alice, bob, channelId } = await pairInSession();
    const a = new Client(alice.token, baseUrl);
    const b = new Client(bob.token, baseUrl);
    await Promise.all([a.open(), b.open()]);

    a.send({ type: 'watch.channel', channelId });
    b.send({ type: 'channel.action', channelId, action: { type: 'ENTER' } });
    await b.next('channel', (m) => m.view.channel.present.length === 2);
    b.send({ type: 'channel.action', channelId, action: { type: 'CLAIM_FLOOR' } });
    await a.next('channel', (m) => m.view.channel.floor.holder === bob.account.id);

    b.close();
    await new Promise((r) => setTimeout(r, 200));

    const channel = app.channels.get(channelId)!;
    expect(channel.present).toContain(bob.account.id);
    expect(channel.floor.holder).toBe(bob.account.id);
    expect(channel.disconnectedAt[bob.account.id]).toBeDefined();
    a.close();
  });

  it('removes them once the grace period has run out', async () => {
    const { alice, bob, channelId } = await pairInSession();
    const a = new Client(alice.token, baseUrl);
    const b = new Client(bob.token, baseUrl);
    await Promise.all([a.open(), b.open()]);

    a.send({ type: 'watch.channel', channelId });
    b.send({ type: 'channel.action', channelId, action: { type: 'ENTER' } });
    await b.next('channel', (m) => m.view.channel.present.length === 2);
    b.send({ type: 'channel.action', channelId, action: { type: 'CLAIM_FLOOR' } });
    await a.next('channel', (m) => m.view.channel.floor.holder === bob.account.id);

    b.close();
    await new Promise((r) => setTimeout(r, 200));

    clock += DISCONNECT_GRACE_MS;
    app.channels.tick();

    const channel = app.channels.get(channelId)!;
    expect(channel.present).not.toContain(bob.account.id);
    // Removed as any departure removes someone, so the claim is released and
    // the cooldown still records who held it.
    expect(channel.floor.holder).toBeNull();
    expect(channel.floor.lastClaimedAt[bob.account.id]).toBeDefined();
    a.close();
  });

  it('does not let a dying socket evict a user who has already reconnected', async () => {
    // The race that stranded a phone: iOS delivered a stale socket's close
    // *after* the replacement had connected, and the corpse got a vote. The
    // reconnected socket is a live connection, so the close reports nothing.
    const { alice, bob, channelId } = await pairInSession();
    const a = new Client(alice.token, baseUrl);
    const stale = new Client(bob.token, baseUrl);
    await Promise.all([a.open(), stale.open()]);

    a.send({ type: 'watch.channel', channelId });
    stale.send({ type: 'channel.action', channelId, action: { type: 'ENTER' } });
    await stale.next('channel', (m) => m.view.channel.present.length === 2);

    // Bob reconnects on a new socket before the old one's close arrives.
    const fresh = new Client(bob.token, baseUrl);
    await fresh.open();
    fresh.send({ type: 'watch.channel', channelId });
    await fresh.next('channel');

    stale.close();
    await new Promise((r) => setTimeout(r, 200));

    const channel = app.channels.get(channelId)!;
    expect(channel.present).toContain(bob.account.id);
    // No grace period started at all: he has a connection.
    expect(channel.disconnectedAt[bob.account.id]).toBeUndefined();

    // And he stays put once the grace period would have elapsed.
    clock += DISCONNECT_GRACE_MS;
    app.channels.tick();
    expect(app.channels.get(channelId)!.present).toContain(bob.account.id);
    a.close();
    fresh.close();
  });

  it('does not let a new process inherit a presence it knows nothing about', async () => {
    // Reinstalling the app: the old process dies inside the grace minute and
    // the new one signs in with the stored token. Merely holding a socket used
    // to assert that the user was still in the room, so the grace was
    // cancelled and the server held them present in a channel the new process
    // had never heard of — for ever, since every reconnection renewed it.
    // Presence is asserted by watching or entering, never by connecting.
    const { alice, bob, channelId } = await pairInSession();
    const a = new Client(alice.token, baseUrl);
    const b = new Client(bob.token, baseUrl);
    await Promise.all([a.open(), b.open()]);

    a.send({ type: 'watch.channel', channelId });
    b.send({ type: 'channel.action', channelId, action: { type: 'ENTER' } });
    await b.next('channel', (m) => m.view.channel.present.length === 2);

    b.close();
    await new Promise((r) => setTimeout(r, 200));

    // The reinstalled app: connected and signed in, watching Home, with no
    // idea it was ever in a channel.
    const reinstalled = new Client(bob.token, baseUrl);
    await reinstalled.open();
    reinstalled.send({ type: 'watch.home' });
    await reinstalled.next('home');

    clock += DISCONNECT_GRACE_MS;
    app.channels.tick();

    expect(app.channels.get(channelId)!.present).not.toContain(bob.account.id);
    // And it is listed for him regardless, which is the half that makes it
    // reachable rather than merely correct.
    expect(
      app.channels.rejoinableFor(bob.account.id).map((r) => r.channelId)
    ).toContain(channelId);
    a.close();
    reinstalled.close();
  });

  it('cancels the grace period when the user comes back', async () => {
    const { alice, bob, channelId } = await pairInSession();
    const a = new Client(alice.token, baseUrl);
    const b = new Client(bob.token, baseUrl);
    await Promise.all([a.open(), b.open()]);

    a.send({ type: 'watch.channel', channelId });
    b.send({ type: 'channel.action', channelId, action: { type: 'ENTER' } });
    await b.next('channel', (m) => m.view.channel.present.length === 2);

    b.close();
    await new Promise((r) => setTimeout(r, 200));
    expect(
      app.channels.get(channelId)!.disconnectedAt[bob.account.id]
    ).toBeDefined();

    const back = new Client(bob.token, baseUrl);
    await back.open();
    back.send({ type: 'watch.channel', channelId });
    await back.next('channel');

    expect(
      app.channels.get(channelId)!.disconnectedAt[bob.account.id]
    ).toBeUndefined();

    clock += DISCONNECT_GRACE_MS;
    app.channels.tick();
    expect(app.channels.get(channelId)!.present).toContain(bob.account.id);
    a.close();
    back.close();
  });



  /**
   * Signing in elsewhere revokes the token this socket was accepted on. The
   * socket has to go with it: it is not merely stale, it is a live
   * conversation with an open microphone belonging to a device the account
   * holder may no longer have.
   */
  it('closes a socket whose token was revoked by a sign-in elsewhere', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    const bob = await signIn('user2@example.com', 'Bob');

    const a = new Client(alice.token, baseUrl);
    const b = new Client(bob.token, baseUrl);
    await Promise.all([a.open(), b.open()]);
    await Promise.all([a.next('hello'), b.next('hello')]);

    const aClosed = a.closed;

    // A second device for Alice. The resend interval refuses a second code
    // this soon, so the code is issued as of a minute from now — moving the
    // shared clock instead would trip the heartbeat timeout and close both
    // sockets for staleness, which is the other sweep entirely.
    const secondCode = app.accounts.issueCode(
      'user1@example.com',
      clock + OTP_RESEND_INTERVAL_MS + 1_000
    )!;
    await app.fastify.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { identifier: 'user1@example.com', code: secondCode },
    });

    // The sweep runs on a real interval, so this waits rather than steps.
    await new Promise((r) => setTimeout(r, 6_500));

    await expect(aClosed).resolves.toBe(4401);
    // Told why before being cut off, so the app has something to show.
    expect(
      a.received.some((m) => m.type === 'error' && m.code === 'unauthorized')
    ).toBe(true);

    // Bob is untouched — revocation is per account, and so is the close.
    expect(
      b.received.some((m) => m.type === 'error' && m.code === 'unauthorized')
    ).toBe(false);
    b.send({ type: 'ping' });
    await b.next('pong');

    b.close();
  }, 20_000);

  describe('evidence that somebody is still in a channel', () => {
    /** Present in the channel, on a live socket, watching it. */
    async function present() {
      const { bob, channelId } = await pairInSession();
      const b = new Client(bob.token, baseUrl);
      await b.open();
      b.send({ type: 'watch.channel', channelId });
      await b.next('channel');
      b.send({ type: 'channel.action', channelId, action: { type: 'ENTER' } });
      await b.next('channel', (m) =>
        m.view.channel.present.includes(bob.account.id)
      );
      return { bob, channelId, b };
    }

    it('moves with every message, not only with a departure', async () => {
      // What makes `lastPresentAt` an observation rather than a claim about an
      // event. Somebody sitting in a channel saying nothing is still heard
      // from every few seconds, and this is the value a restart inherits.
      const { bob, channelId, b } = await present();

      clock += 30_000;
      b.send({ type: 'ping' });
      await b.next('pong', (m) => m.serverNow === clock);
      expect(app.channels.get(channelId)!.lastPresentAt[bob.account.id]).toBe(
        clock
      );

      clock += 30_000;
      b.send({ type: 'ping' });
      await b.next('pong', (m) => m.serverNow === clock);
      expect(app.channels.get(channelId)!.lastPresentAt[bob.account.id]).toBe(
        clock
      );
      b.close();
    });

    it('is not pushed, because nothing readable has changed', async () => {
      // The whole reason this is affordable. While somebody is present their
      // idle time is not a question with an answer, so a snapshot per
      // heartbeat per participant would redraw an identical screen — and the
      // value is fresh at the one moment it becomes readable, because every
      // route out of a channel emits on its own account.
      const { channelId, b } = await present();
      const delivered = b.received.filter((m) => m.type === 'channel').length;

      clock += 30_000;
      b.send({ type: 'ping' });
      await b.next('pong', (m) => m.serverNow === clock);
      await new Promise((r) => setTimeout(r, 100));

      expect(b.received.filter((m) => m.type === 'channel').length).toBe(
        delivered
      );
      expect(channelId).toBeTruthy();
      b.close();
    });

    it('takes nothing from a socket whose owner has stepped out', async () => {
      // The screen stays open after stepping out, and the heartbeat goes on.
      // Counting it would overwrite the departure with a stream of proof that
      // they are gone, and the idle time would never start.
      const { bob, channelId, b } = await present();
      const left = (clock += 10_000);
      b.send({ type: 'channel.action', channelId, action: { type: 'STEP_OUT' } });
      // `everPresent` in the predicate as well as `present`, so this cannot
      // match the snapshot from before he entered — which is also a channel
      // he is not present in, and arrived first.
      await b.next(
        'channel',
        (m) =>
          m.view.channel.everPresent.includes(bob.account.id) &&
          m.view.channel.present.every((id) => id !== bob.account.id)
      );
      expect(app.channels.get(channelId)!.lastPresentAt[bob.account.id]).toBe(
        left
      );

      clock += 30_000;
      b.send({ type: 'ping' });
      await b.next('pong', (m) => m.serverNow === clock);
      expect(app.channels.get(channelId)!.lastPresentAt[bob.account.id]).toBe(
        left
      );
      b.close();
    });
  });

  describe('when somebody was last in the app', () => {
    /** What a contact of Bob's is told about Alice. */
    const aliceAsSeenByBob = (bobId: string, aliceId: string) =>
      app.accounts
        .contactsFor(bobId)
        .find((entry) => entry.account.id === aliceId);

    it('is recorded as a socket opens, and kept true while it is open', async () => {
      const { alice, bob } = await pairInSession();
      expect(aliceAsSeenByBob(bob.account.id, alice.account.id)?.lastSeenAt)
        .toBeNull();

      const a = new Client(alice.token, baseUrl);
      await a.open();
      await a.next('hello');
      expect(aliceAsSeenByBob(bob.account.id, alice.account.id)?.lastSeenAt)
        .toBe(clock);

      // An hour into a connection that has stayed open. Without the write on
      // each message this would still read as the moment she connected, so
      // somebody talking right now would look an hour idle.
      clock += 3_600_000;
      a.send({ type: 'ping' });
      await a.next('pong');
      expect(aliceAsSeenByBob(bob.account.id, alice.account.id)?.lastSeenAt)
        .toBe(clock);

      a.close();
    });

    it('is what the socket last heard, not the moment it ended', async () => {
      const { alice, bob } = await pairInSession();
      const a = new Client(alice.token, baseUrl);
      await a.open();
      await a.next('hello');

      // The last thing she actually did.
      const heard = (clock += 60_000);
      a.send({ type: 'ping' });
      await a.next('pong');

      // The socket ends a good while after that, which is the ordinary case
      // rather than the strange one: a phone that freezes in a pocket is
      // closed by `sweep` some forty seconds later, and stamping the close
      // would file those forty seconds as evidence she was there.
      clock += 40_000;
      a.close();
      // The close handler runs on the server's own event loop, so this waits
      // for it rather than assuming it has already happened.
      await new Promise((r) => setTimeout(r, 200));
      expect(aliceAsSeenByBob(bob.account.id, alice.account.id)?.lastSeenAt)
        .toBe(heard);
    });

    it('is not rewound by a dead socket closing after a live one opened', async () => {
      // A flapping phone has both at once: the replacement is connected and
      // stamping the present while the corpse is still waiting on a close
      // frame it will never get. The one that dies second is the older.
      const { alice, bob } = await pairInSession();
      const dying = new Client(alice.token, baseUrl);
      await dying.open();
      await dying.next('hello');

      const replaced = (clock += 60_000);
      const live = new Client(alice.token, baseUrl);
      await live.open();
      await live.next('hello');

      // And it takes a while to die, which is the whole point of it: the close
      // frame it is waiting for is never coming. Neither of the two numbers in
      // reach here is right — what it last heard is older than the live
      // socket's stamp, and the moment it finally ends is newer than anything
      // anybody proved.
      clock += 40_000;
      dying.close();
      await new Promise((r) => setTimeout(r, 200));
      expect(aliceAsSeenByBob(bob.account.id, alice.account.id)?.lastSeenAt)
        .toBe(replaced);

      live.close();
    });

    it('is withheld from a request sent to an address', async () => {
      // An outgoing request is an address, not a person. Whether anybody is
      // behind it is exactly what that row must not disclose — a last-seen
      // time would answer it.
      const alice = await signIn('user1@example.com', 'Alice');
      await app.fastify.inject({
        method: 'POST',
        url: '/contacts/request',
        headers: auth(alice.token),
        payload: { identifier: 'user9@example.com' },
      });
      const [outgoing] = app.accounts.contactsFor(alice.account.id);
      expect(outgoing.status).toBe('outgoing');
      expect(outgoing.lastSeenAt).toBeNull();
    });
  });

  describe('whether somebody is in the app', () => {
    /** Alice's row in the most recent Home snapshot Bob's socket received. */
    const aliceOnBobsHome = (bob: Client, aliceId: string) => {
      const homes = bob.received.filter((m) => m.type === 'home');
      const latest = homes[homes.length - 1];
      if (!latest || latest.type !== 'home') return undefined;
      return latest.home.contacts.find((c) => c.account.id === aliceId);
    };

    /**
     * Waits for a snapshot whose Alice row satisfies `predicate`, and answers
     * with that row rather than with whatever is latest by the time it lands.
     *
     * The distinction is not pedantry. `Client.next` scans from the beginning,
     * and Bob's very first snapshot — taken before Alice ever connected — has
     * `inApp: false` on it quite truthfully. Waiting for "false" therefore
     * matches instantly and proves nothing, which is exactly the trap this
     * suite fell into first time.
     */
    const aliceBecomes = async (
      bob: Client,
      aliceId: string,
      predicate: (row: { inApp?: boolean; lastSeenAt?: number | null }) => boolean
    ) => {
      const message = await bob.next('home', (m) => {
        const row = m.home.contacts.find((c) => c.account.id === aliceId);
        return row !== undefined && predicate(row);
      });
      return message.home.contacts.find((c) => c.account.id === aliceId);
    };

    it('reaches a watching contact when she arrives, unprompted', async () => {
      const { alice, bob } = await pairInSession();
      const b = new Client(bob.token, baseUrl);
      await b.open();
      b.send({ type: 'watch.home' });
      await b.next('home');
      expect(aliceOnBobsHome(b, alice.account.id)?.inApp).toBe(false);

      // Bob does nothing at all from here. Before the transition push, his
      // Home learned about Alice only when something unrelated happened to
      // regenerate it, which is what made "in the app now" mean "as of
      // whenever your last snapshot was".
      const a = new Client(alice.token, baseUrl);
      await a.open();
      const arrived = await aliceBecomes(
        b,
        alice.account.id,
        (row) => row.inApp === true
      );
      expect(arrived?.inApp).toBe(true);

      a.close();
      b.close();
    });

    it('stays true across an hour of heartbeats, with nothing pushed', async () => {
      // The worked case. Alice sits in the app for an hour; Bob holds the one
      // snapshot he was sent as she arrived. A fact does not decay, so his
      // copy is still right without anything having been sent to refresh it —
      // which is the whole reason Home needs no timer.
      const { alice, bob } = await pairInSession();
      const b = new Client(bob.token, baseUrl);
      await b.open();
      b.send({ type: 'watch.home' });
      await b.next('home');

      const a = new Client(alice.token, baseUrl);
      await a.open();
      await aliceBecomes(b, alice.account.id, (row) => row.inApp === true);
      const delivered = b.received.filter((m) => m.type === 'home').length;

      clock += 3_600_000;
      a.send({ type: 'ping' });
      await a.next('pong');
      await new Promise((r) => setTimeout(r, 200));

      expect(b.received.filter((m) => m.type === 'home').length).toBe(delivered);
      expect(aliceOnBobsHome(b, alice.account.id)?.inApp).toBe(true);

      a.close();
      b.close();
    });

    it('turns false as her last socket goes, carrying the last thing it heard', async () => {
      const { alice, bob } = await pairInSession();
      const b = new Client(bob.token, baseUrl);
      await b.open();
      b.send({ type: 'watch.home' });
      await b.next('home');

      const a = new Client(alice.token, baseUrl);
      await a.open();
      await aliceBecomes(b, alice.account.id, (row) => row.inApp === true);

      const heard = (clock += 60_000);
      a.send({ type: 'ping' });
      await a.next('pong');

      clock += 40_000;
      a.close();
      const gone = await aliceBecomes(
        b,
        alice.account.id,
        (row) => row.inApp === false && row.lastSeenAt === heard
      );
      // The timestamp beside it is her last proof of life, so the count the app
      // starts from is fixed and correct and never needs refreshing again — and
      // it starts from when she was last there rather than from whenever the
      // socket got around to ending, which is what made a pocketed phone read
      // as present for a hundred seconds instead of sixty.
      expect(gone?.lastSeenAt).toBe(heard);

      b.close();
    });

    it('is not announced by a second device, or by one of two going', async () => {
      // Arrival and departure are transitions, not connections. A phone and a
      // tablet are one person being in the app once.
      const { alice, bob } = await pairInSession();
      const b = new Client(bob.token, baseUrl);
      await b.open();
      b.send({ type: 'watch.home' });
      await b.next('home');

      const phone = new Client(alice.token, baseUrl);
      await phone.open();
      await aliceBecomes(b, alice.account.id, (row) => row.inApp === true);
      const afterArrival = b.received.filter((m) => m.type === 'home').length;

      const tablet = new Client(alice.token, baseUrl);
      await tablet.open();
      await new Promise((r) => setTimeout(r, 200));
      expect(b.received.filter((m) => m.type === 'home').length)
        .toBe(afterArrival);

      tablet.close();
      await new Promise((r) => setTimeout(r, 200));
      expect(b.received.filter((m) => m.type === 'home').length)
        .toBe(afterArrival);
      expect(aliceOnBobsHome(b, alice.account.id)?.inApp).toBe(true);

      // The tablet was the more recent of the two to say anything, so its
      // stamp is the one that stands — the phone closing later does not drag
      // the column back to whenever the phone last spoke.
      const heard = clock;
      clock += 1_000;
      phone.close();
      const gone = await aliceBecomes(
        b,
        alice.account.id,
        (row) => row.inApp === false && row.lastSeenAt === heard
      );
      expect(gone?.inApp).toBe(false);

      b.close();
    });

    it('does not reach somebody with no part in a channel that changed', async () => {
      // The property the narrowing exists for. Carol is a contact of Alice's
      // and has nothing to do with the channel Alice and Bob are in, so a
      // change to it is not news she is owed. This used to push her a whole
      // fresh Home — which was, accidentally, most of what kept her contact
      // rows current, and made her view's accuracy a function of how busy
      // other people were.
      const { alice, bob, channelId } = await pairInSession();
      const carol = await signIn('user3@example.com', 'Carol');
      await app.fastify.inject({
        method: 'POST',
        url: '/contacts/request',
        headers: auth(alice.token),
        payload: { identifier: 'user3@example.com' },
      });
      await app.fastify.inject({
        method: 'POST',
        url: `/contacts/${alice.account.id}/accept`,
        headers: auth(carol.token),
      });

      const c = new Client(carol.token, baseUrl);
      await c.open();
      c.send({ type: 'watch.home' });
      await c.next('home');

      const a = new Client(alice.token, baseUrl);
      await a.open();
      // Alice arriving *is* Carol's business, and reaches her.
      await aliceBecomes(c, alice.account.id, (row) => row.inApp === true);
      const delivered = c.received.filter((m) => m.type === 'home').length;

      // Bob entering the channel is not. It has to be a real change to the
      // channel's state, or this passes for the wrong reason: Alice created
      // it and is present already, so her merely watching moves nothing and
      // emits nothing. Bob is watching, and must still be told — which is the
      // other half of what keeps the aiming honest.
      const b = new Client(bob.token, baseUrl);
      await b.open();
      b.send({ type: 'watch.channel', channelId });
      await b.next('channel');
      b.send({ type: 'channel.action', channelId, action: { type: 'ENTER' } });
      await b.next('channel', (m) => m.view.channel.present.length === 2);
      await new Promise((r) => setTimeout(r, 200));

      expect(c.received.filter((m) => m.type === 'home').length).toBe(delivered);

      a.close();
      b.close();
      c.close();
    }, 20_000);

    it('is withheld from a request sent to an address', async () => {
      // Same reason the name and the time are: that row is an address, and
      // whether anybody is behind it is what it must not answer. A boolean
      // would answer it more plainly than a timestamp does.
      const alice = await signIn('user1@example.com', 'Alice');
      await app.fastify.inject({
        method: 'POST',
        url: '/contacts/request',
        headers: auth(alice.token),
        payload: { identifier: 'user9@example.com' },
      });
      const home = await app.fastify.inject({
        method: 'GET',
        url: '/home',
        headers: auth(alice.token),
      });
      const { contacts } = home.json() as {
        contacts: Array<{ status: string; inApp?: boolean }>;
      };
      expect(contacts[0].status).toBe('outgoing');
      expect(contacts[0].inApp).toBeUndefined();
    });
  });
});
