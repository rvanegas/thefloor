import WebSocket from 'ws';
import { buildApp, type App } from '../src/app';
import {
  DISCONNECT_GRACE_MS,
  HEARTBEAT_TIMEOUT_MS,
} from '../../core/constants';
import { OTP_RESEND_INTERVAL_MS } from '../src/accounts';
import type { ClientMessage, ServerMessage } from '../../core/protocol';

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
  app = buildApp({ dbPath: ':memory:', now: () => clock });
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
  const alice = await signIn('+15550000001', 'Alice');
  const bob = await signIn('+15550000002', 'Bob');
  await app.fastify.inject({
    method: 'POST',
    url: '/contacts/request',
    headers: auth(alice.token),
    payload: { identifier: '+15550000002' },
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
    const { token, account } = await signIn('+15550000001', 'Alice');
    const client = new Client(token, baseUrl);
    await client.open();
    const hello = await client.next('hello');
    expect(hello.account).toEqual({ id: account.id, displayName: 'Alice' });
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

  it('pushes an incoming contact request to the recipient', async () => {
    // Found by hand on two simulators: contact changes arrive over HTTP, and
    // nothing told the recipient's socket, so a request never appeared until
    // they happened to reload.
    const alice = await signIn('+15550000001', 'Alice');
    const bob = await signIn('+15550000002', 'Bob');

    const bobClient = new Client(bob.token, baseUrl);
    await bobClient.open();
    bobClient.send({ type: 'watch.home' });
    await bobClient.next('home');

    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(alice.token),
      payload: { identifier: '+15550000002' },
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
    const alice = await signIn('+15550000001', 'Alice');
    const bob = await signIn('+15550000002', 'Bob');

    const aliceClient = new Client(alice.token, baseUrl);
    await aliceClient.open();
    aliceClient.send({ type: 'watch.home' });
    await aliceClient.next('home');

    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(alice.token),
      payload: { identifier: '+15550000002' },
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
    const mallory = await signIn('+15559999999', 'Mallory');
    const m = new Client(mallory.token, baseUrl);
    await m.open();

    m.send({ type: 'channel.action', channelId, action: { type: 'END' } });
    const error = await m.next('error');
    expect(error.message).toBe('Not your channel.');
    expect(app.channels.get(channelId)!.status).toBe('active');
    m.close();
  });

  it('answers a heartbeat', async () => {
    const { token } = await signIn('+15550000001', 'Alice');
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
    const alice = await signIn('+15550000001', 'Alice');
    const bob = await signIn('+15550000002', 'Bob');

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
      '+15550000001',
      clock + OTP_RESEND_INTERVAL_MS + 1_000
    )!;
    await app.fastify.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { identifier: '+15550000001', code: secondCode },
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

});
