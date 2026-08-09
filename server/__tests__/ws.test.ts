import WebSocket from 'ws';
import { buildApp, type App } from '../src/app';
import {
  DISCONNECT_GRACE_MS,
  HEARTBEAT_TIMEOUT_MS,
} from '../../core/constants';
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
  app.sessions.stop();
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
    url: '/sessions',
    headers: auth(alice.token),
    payload: { contactId: bob.account.id },
  });
  const { sessionId } = created.json() as { sessionId: string };
  return { alice, bob, sessionId };
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
    const { bob, sessionId } = await pairInSession();
    const bobClient = new Client(bob.token, baseUrl);
    await bobClient.open();
    bobClient.send({ type: 'watch.home' });

    const home = await bobClient.next(
      'home',
      (m) => m.home.invites.length > 0
    );
    expect(home.home.invites[0].sessionId).toBe(sessionId);
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
    const { alice, bob, sessionId } = await pairInSession();
    const a = new Client(alice.token, baseUrl);
    const b = new Client(bob.token, baseUrl);
    await Promise.all([a.open(), b.open()]);

    a.send({ type: 'watch.session', sessionId });
    b.send({ type: 'session.action', sessionId, action: { type: 'ENTER' } });
    await b.next('session', (m) => m.view.session.present.length === 2);

    a.send({ type: 'session.action', sessionId, action: { type: 'CLAIM_FLOOR' } });

    // Bob learns he is silenced without asking.
    const pushed = await b.next(
      'session',
      (m) => m.view.session.floor.holder === alice.account.id
    );
    expect(pushed.view.serverNow).toBeGreaterThan(0);
    a.close();
    b.close();
  });

  it('refuses an action from someone outside the session', async () => {
    const { sessionId } = await pairInSession();
    const mallory = await signIn('+15559999999', 'Mallory');
    const m = new Client(mallory.token, baseUrl);
    await m.open();

    m.send({ type: 'session.action', sessionId, action: { type: 'END' } });
    const error = await m.next('error');
    expect(error.message).toBe('Not your session.');
    expect(app.sessions.get(sessionId)!.status).toBe('active');
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
    // works in the meantime — nobody is removed, so no session ever empties or
    // auto-ends, and a recording bills against two egresses indefinitely.
    const { alice, bob, sessionId } = await pairInSession();
    const a = new Client(alice.token, baseUrl);
    const b = new Client(bob.token, baseUrl);
    await Promise.all([a.open(), b.open()]);

    a.send({ type: 'watch.session', sessionId });
    b.send({ type: 'session.action', sessionId, action: { type: 'ENTER' } });
    await b.next('session', (m) => m.view.session.present.length === 2);

    // Bob's socket stays open but says nothing further. The clock moves past
    // the point where that is survivable.
    clock += HEARTBEAT_TIMEOUT_MS + 1_000;
    await new Promise((r) => setTimeout(r, 6_500));

    const session = app.sessions.get(sessionId)!;
    expect(session.disconnectedAt[bob.account.id]).toBeDefined();
    // Still present: silence starts the clock, it does not remove anyone.
    expect(session.present).toContain(bob.account.id);
    a.close();
    b.close();
  }, 15_000);

  it('keeps a dropped party in the session, and their floor', async () => {
    // Losing a socket is not leaving. Only staying gone past the grace period
    // is, and that is a timer rather than an event.
    const { alice, bob, sessionId } = await pairInSession();
    const a = new Client(alice.token, baseUrl);
    const b = new Client(bob.token, baseUrl);
    await Promise.all([a.open(), b.open()]);

    a.send({ type: 'watch.session', sessionId });
    b.send({ type: 'session.action', sessionId, action: { type: 'ENTER' } });
    await b.next('session', (m) => m.view.session.present.length === 2);
    b.send({ type: 'session.action', sessionId, action: { type: 'CLAIM_FLOOR' } });
    await a.next('session', (m) => m.view.session.floor.holder === bob.account.id);

    b.close();
    await new Promise((r) => setTimeout(r, 200));

    const session = app.sessions.get(sessionId)!;
    expect(session.present).toContain(bob.account.id);
    expect(session.floor.holder).toBe(bob.account.id);
    expect(session.disconnectedAt[bob.account.id]).toBeDefined();
    a.close();
  });

  it('removes them once the grace period has run out', async () => {
    const { alice, bob, sessionId } = await pairInSession();
    const a = new Client(alice.token, baseUrl);
    const b = new Client(bob.token, baseUrl);
    await Promise.all([a.open(), b.open()]);

    a.send({ type: 'watch.session', sessionId });
    b.send({ type: 'session.action', sessionId, action: { type: 'ENTER' } });
    await b.next('session', (m) => m.view.session.present.length === 2);
    b.send({ type: 'session.action', sessionId, action: { type: 'CLAIM_FLOOR' } });
    await a.next('session', (m) => m.view.session.floor.holder === bob.account.id);

    b.close();
    await new Promise((r) => setTimeout(r, 200));

    clock += DISCONNECT_GRACE_MS;
    app.sessions.tick();

    const session = app.sessions.get(sessionId)!;
    expect(session.present).not.toContain(bob.account.id);
    // Removed as any departure removes someone, so the claim is released and
    // the cooldown still records who held it.
    expect(session.floor.holder).toBeNull();
    expect(session.floor.lastClaimedAt[bob.account.id]).toBeDefined();
    a.close();
  });

  it('does not let a dying socket evict a user who has already reconnected', async () => {
    // The race that stranded a phone: iOS delivered a stale socket's close
    // *after* the replacement had connected, and the corpse got a vote. The
    // reconnected socket is a live connection, so the close reports nothing.
    const { alice, bob, sessionId } = await pairInSession();
    const a = new Client(alice.token, baseUrl);
    const stale = new Client(bob.token, baseUrl);
    await Promise.all([a.open(), stale.open()]);

    a.send({ type: 'watch.session', sessionId });
    stale.send({ type: 'session.action', sessionId, action: { type: 'ENTER' } });
    await stale.next('session', (m) => m.view.session.present.length === 2);

    // Bob reconnects on a new socket before the old one's close arrives.
    const fresh = new Client(bob.token, baseUrl);
    await fresh.open();
    fresh.send({ type: 'watch.session', sessionId });
    await fresh.next('session');

    stale.close();
    await new Promise((r) => setTimeout(r, 200));

    const session = app.sessions.get(sessionId)!;
    expect(session.present).toContain(bob.account.id);
    // No grace period started at all: he has a connection.
    expect(session.disconnectedAt[bob.account.id]).toBeUndefined();

    // And he stays put once the grace period would have elapsed.
    clock += DISCONNECT_GRACE_MS;
    app.sessions.tick();
    expect(app.sessions.get(sessionId)!.present).toContain(bob.account.id);
    a.close();
    fresh.close();
  });

  it('cancels the grace period when the user comes back', async () => {
    const { alice, bob, sessionId } = await pairInSession();
    const a = new Client(alice.token, baseUrl);
    const b = new Client(bob.token, baseUrl);
    await Promise.all([a.open(), b.open()]);

    a.send({ type: 'watch.session', sessionId });
    b.send({ type: 'session.action', sessionId, action: { type: 'ENTER' } });
    await b.next('session', (m) => m.view.session.present.length === 2);

    b.close();
    await new Promise((r) => setTimeout(r, 200));
    expect(
      app.sessions.get(sessionId)!.disconnectedAt[bob.account.id]
    ).toBeDefined();

    const back = new Client(bob.token, baseUrl);
    await back.open();
    back.send({ type: 'watch.session', sessionId });
    await back.next('session');

    expect(
      app.sessions.get(sessionId)!.disconnectedAt[bob.account.id]
    ).toBeUndefined();

    clock += DISCONNECT_GRACE_MS;
    app.sessions.tick();
    expect(app.sessions.get(sessionId)!.present).toContain(bob.account.id);
    a.close();
    back.close();
  });


});
