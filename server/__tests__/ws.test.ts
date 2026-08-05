import WebSocket from 'ws';
import { buildApp, type App } from '../src/app';
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

  it('treats a dropped connection as a leave, releasing the floor', async () => {
    const { alice, bob, sessionId } = await pairInSession();
    const a = new Client(alice.token, baseUrl);
    const b = new Client(bob.token, baseUrl);
    await Promise.all([a.open(), b.open()]);

    a.send({ type: 'watch.session', sessionId });
    b.send({ type: 'session.action', sessionId, action: { type: 'ENTER' } });
    await b.next('session', (m) => m.view.session.present.length === 2);

    b.send({ type: 'session.action', sessionId, action: { type: 'CLAIM_FLOOR' } });
    await a.next('session', (m) => m.view.session.floor.holder === bob.account.id);

    // Bob's connection drops while he holds the floor. Per the spec this is
    // identical to a deliberate leave, so the claim is force-released.
    b.close();
    await a.next(
      'session',
      (m) =>
        m.view.session.floor.holder === null &&
        !m.view.session.present.includes(bob.account.id)
    );
    expect(app.sessions.get(sessionId)!.floor.lastClaimant).toBe(bob.account.id);
    a.close();
  });
});
