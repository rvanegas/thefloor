import WebSocket from 'ws';
import { buildApp, type App } from '../src/app';
import {
  ATTENTION_WINDOW_MS,
  DISCONNECT_GRACE_MS,
  FAST_HEARTBEAT_BUILD,
  HEARTBEAT_TIMEOUT_LEGACY_MS,
  HEARTBEAT_TIMEOUT_MS,
} from '../../core/constants';
import { OTP_RESEND_INTERVAL_MS } from '../src/accounts';
import { ACCOUNT_ATTENTION_BUILD } from '../src/release';
import { REENTRY_MS } from '../src/ws';
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

/**
 * How often this server's socket sweep runs, for these tests only.
 *
 * The sweep is the one clock here that `now` does not govern: `clock` decides
 * whether a connection has been silent past its budget, and a real
 * `setInterval` decides how soon anybody asks. So a test could step a socket
 * past its timeout instantly and then had to wait out the production interval
 * — two seconds — in wall-clock time, several times over, for the sweep to
 * notice. That was thirty-one of this file's thirty-eight seconds.
 *
 * Short enough that `sweeps()` below is imperceptible, long enough that it is
 * still an interval rather than a busy loop. **The budgets are untouched**:
 * every `HEARTBEAT_TIMEOUT_MS` in this file is still the real constant, still
 * crossed by moving `clock`, so what is being tested is unchanged and only the
 * latency of noticing is compressed.
 */
const SWEEP_MS = 20;

/**
 * Waits for the sweep to have run, having already moved `clock` past whatever
 * budget the test is crossing.
 *
 * Several periods rather than one: the step and the tick are unsynchronised,
 * so a single period can be a sweep that read the clock a moment too early.
 */
const sweeps = () => new Promise((r) => setTimeout(r, SWEEP_MS * 5));

/**
 * The interval the next `buildApp` is given, so a block can opt out of the
 * short one.
 *
 * Three blocks below move `clock` past a socket's silence budget to stand in
 * for a client pinging its way through, then ping once and expect the socket
 * to still be there. Against a running sweep that is a race and not a test:
 * the jump puts the connection well past its budget, and whether it survives
 * comes down to whether the ping reaches the server before the next tick.
 *
 * **The tell is an `await` between the jump and the assertion.** The blocks
 * that jump by `DISCONNECT_GRACE_MS` and then call `app.channels.tick()` are
 * fine at any interval — nothing yields, so no sweep can interleave. It is
 * the ones that wait on a round trip that need it gone.
 */
let sweepMs: number = SWEEP_MS;

/**
 * Takes the sweep out of a block that jumps `clock` past the silence budget on
 * purpose. Paired with `resumeSweep` in `afterAll`.
 *
 * An hour, rather than the production interval it was until 2026-09-22.
 * `HEARTBEAT_INTERVAL_MS` merely made the tick unlikely to land inside a test
 * — two seconds against tests that take a few hundred milliseconds, which is
 * a coin weighted rather than a coin removed, and it came up heads often
 * enough to be reported as flake. Nothing in these blocks waits on a sweep,
 * so there is no reason for one to be able to fire at all: an interval no
 * test outlives is the same statement with no probability in it.
 */
const pauseSweep = () => {
  sweepMs = 3_600_000;
};
const resumeSweep = () => {
  sweepMs = SWEEP_MS;
};

beforeEach(async () => {
  clock = 1_700_000_000_000;
  // Inviting an address with no account needs a transport — see server.test.ts.
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    now: () => clock,
    heartbeatIntervalMs: sweepMs,
  });
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

  /**
   * @param build what this client claims to be, which decides the silence
   *              budget the sweep judges it against. Omitted means a client
   *              that says nothing about itself, which is every build before
   *              37 and is treated as old — see `heartbeatTimeoutFor`.
   * @param device which copy of the app this is, which decides who
   *               `displaceOtherSessions` skips. Omitted means a client too
   *               old to have an opinion, which falls back to the token — the
   *               behaviour every installed build has, and the reason most
   *               tests here pass nothing.
   */
  constructor(
    token: string,
    base: string,
    build?: number,
    device?: string,
    /** What this copy calls itself, which only its own picker ever sees. */
    deviceName?: string
  ) {
    this.socket = new WebSocket(
      `ws://${base}/ws?token=${token}` +
        (build === undefined ? '' : `&build=${build}`) +
        (device === undefined ? '' : `&device=${encodeURIComponent(device)}`) +
        (deviceName === undefined
          ? ''
          : `&deviceName=${encodeURIComponent(deviceName)}`)
    );
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

  /**
   * Waits for a message matching `predicate`, or throws on timeout.
   *
   * **The deadline is a failsafe, not an assertion about speed**, and it was
   * three seconds against a `testTimeout` of fifteen — twelve seconds of
   * headroom nothing was using. A real socket and a real server are on the
   * other end of this, so under load the reply genuinely takes longer, and
   * two full suites running at once is load: `bin/deploy` runs the tests, and
   * it overlaps anybody else running them. That produced sporadic
   * `timed out waiting for pong` in this file and nowhere else, which reads
   * like a broken heartbeat and is a busy machine.
   *
   * Ten seconds costs nothing when the message arrives — the loop returns as
   * soon as it sees it — and stays inside the suite's own timeout, so a
   * message that never comes still fails here, with the list of what *did*
   * arrive, rather than as a bare jest timeout that says nothing.
   *
   * Raised 2026-09-17 with the train directories; both were the same report.
   */
  async next<T extends ServerMessage['type']>(
    type: T,
    predicate: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true,
    timeoutMs = 10_000
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

  /**
   * Stops reading, without closing — a phone frozen or out of coverage, whose
   * TCP connection is still established and whose process will never answer
   * anything again.
   *
   * Pausing the underlying socket is what makes this a *half-open* peer rather
   * than merely a quiet one, and the distinction is the whole point: a live
   * client that has simply stopped sending pings still answers the server's
   * close frame at protocol level, so the sweep's `close` would complete
   * immediately and a test using one cannot tell `close` from `terminate`. A
   * paused socket never processes the frame and never replies, which is what
   * makes `ws`'s 30-second `closeTimeout` bite.
   *
   * Reaching through to `_socket` because that is where the read side is and
   * `ws` does not expose it; a test may know one thing the library would
   * rather it did not.
   */
  goDark(): void {
    (this.socket as unknown as { _socket: { pause(): void } })._socket.pause();
  }

  /** Ends it from this side without a handshake, for a peer that has gone dark. */
  kill(): void {
    this.socket.terminate();
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

/**
 * The next Home pushed *after* this point, given how many had arrived before.
 *
 * `Client.next` searches everything received so far, which is what is wanted
 * almost everywhere and is a trap for an assertion about absence: "a Home with
 * no such channel in it" is satisfied by the empty one from before the channel
 * existed, so a test written that way passes without the server sending
 * anything at all. Counting first is what makes the wait mean a new message.
 */
async function homeAfter(
  client: Client,
  seen: number,
  timeoutMs = 3000
): Promise<Extract<ServerMessage, { type: 'home' }>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const homes = client.received.filter(
      (m): m is Extract<ServerMessage, { type: 'home' }> => m.type === 'home'
    );
    if (homes.length > seen) return homes[homes.length - 1];
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`no Home arrived after the ${seen} already seen`);
}

/** How many Home snapshots this client has been sent so far. */
const homesSeen = (client: Client): number =>
  client.received.filter((m) => m.type === 'home').length;

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

  /**
   * The account's settings, on the one message that is about you and goes only
   * to you. Always present, unlike `debug` beside it: a setting is not a grant,
   * so there is no "absent means no" for a client to lean on — it has to be
   * able to tell "the account says light" from "this server was never asked".
   */
  it('hands a fresh connection the account’s settings', async () => {
    const { token } = await signIn('user1@example.com', 'Alice');
    const client = new Client(token, baseUrl);
    await client.open();
    expect((await client.next('hello')).settings).toEqual({
      appearance: 'system',
      language: 'system',
      hideControlCards: false,
      labs: false,
      marketingEmail: false,
      // The names builds already installed know, sent beside the current ones
      // so that a phone that has not been updated reads a hello from this
      // server as the settings it has always had. See settings-wire.ts.
      //
      // The tap pair is a constant since 2026-09-21: it is no longer anybody's
      // choice, so an old build is told the one answer there now is rather
      // than what it last stored.
      tapToLook: true,
      tapToStepIn: false,
      controlCards: true,
    });
    client.close();

    await app.fastify.inject({
      method: 'POST',
      url: '/me/settings',
      headers: auth(token),
      payload: {
        appearance: 'dark',
        language: 'es',
        hideControlCards: true,
        labs: true,
        marketingEmail: false,
      },
    });
    const later = new Client(token, baseUrl);
    await later.open();
    expect((await later.next('hello')).settings).toEqual({
      appearance: 'dark',
      language: 'es',
      hideControlCards: true,
      labs: true,
      marketingEmail: false,
      tapToLook: true,
      tapToStepIn: false,
      controlCards: false,
    });
    later.close();
  });

  /**
   * The whole point of these leaving the phone. A tap on one device has to
   * reach the other, and it has to reach it wherever it is — Home is pushed
   * only to watchers, and somebody sitting in a channel when their other phone
   * goes dark is exactly the case this exists for. Neither client watches
   * anything here, deliberately.
   */
  it('tells this account’s other devices when a setting changes', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    const bob = await signIn('user2@example.com', 'Bob');
    const phone = new Client(alice.token, baseUrl);
    const tablet = new Client(
      app.accounts.issueToken(alice.account.id, clock),
      baseUrl
    );
    const bobs = new Client(bob.token, baseUrl);
    await Promise.all([phone.open(), tablet.open(), bobs.open()]);
    await Promise.all([
      phone.next('hello'),
      tablet.next('hello'),
      bobs.next('hello'),
    ]);

    await app.fastify.inject({
      method: 'POST',
      url: '/me/settings',
      headers: auth(alice.token),
      payload: { appearance: 'dark' },
    });

    // The device that asked is told as well as the one that did not: what it
    // applied optimistically is restated by the server rather than trusted.
    for (const client of [phone, tablet]) {
      expect((await client.next('settings')).settings).toEqual({
        appearance: 'dark',
        language: 'system',
        hideControlCards: false,
        labs: false,
        marketingEmail: false,
        // The old names here too, and that is the point of putting the
        // translation in one function: a client that learnt one shape from the
        // hello and another from this event would be the same bug in a harder
        // place to find.
        tapToLook: true,
        tapToStepIn: false,
        controlCards: true,
      });
    }
    expect(bobs.received.some((m) => m.type === 'settings')).toBe(false);

    phone.close();
    tablet.close();
    bobs.close();
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

  /**
   * Found by hand: deleting a channel left its card on Home until something
   * unrelated happened to push one.
   *
   * The Home push is aimed at the channel's participants, and a departure is
   * the change that takes the actor out of that set — `DELETE_CHANNEL` empties
   * it entirely, so the audience was nobody. The server's answer was right the
   * whole time; `GET /home` said the channel was gone. Nothing delivered it.
   */
  it('pushes a fresh Home to somebody who has just deleted a channel', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    // A channel of one, which is the only kind its last member may delete.
    const created = await app.fastify.inject({
      method: 'POST',
      url: '/channels',
      headers: auth(alice.token),
      payload: {},
    });
    const { channelId } = created.json() as { channelId: string };

    const a = new Client(alice.token, baseUrl);
    await a.open();
    a.send({ type: 'watch.home' });
    await a.next('home', (m) =>
      m.home.rejoinable.some((r) => r.channelId === channelId)
    );

    const seen = homesSeen(a);
    a.send({ type: 'channel.action', channelId, action: { type: 'DELETE_CHANNEL' } });

    const home = await homeAfter(a, seen);
    expect(home.home.rejoinable).toEqual([]);
    a.close();
  });

  /**
   * The same defect seen from the other end, and the reason the fix is about
   * departures rather than about deletion: somebody leaving a channel other
   * people remain in is removed from the roster just the same, so the push
   * aimed at it reached everyone except them.
   */
  it('pushes a fresh Home to somebody who has just left a channel', async () => {
    const { bob, channelId } = await pairInSession();
    const b = new Client(bob.token, baseUrl);
    await b.open();
    b.send({ type: 'watch.home' });
    // Having been here is what makes it rejoinable rather than an invitation,
    // which are two different lists on Home — see `rejoinableFor`.
    b.send({ type: 'channel.action', channelId, action: { type: 'ENTER' } });
    b.send({ type: 'channel.action', channelId, action: { type: 'STEP_OUT' } });
    await b.next('home', (m) =>
      m.home.rejoinable.some((r) => r.channelId === channelId)
    );

    const seen = homesSeen(b);
    b.send({ type: 'channel.action', channelId, action: { type: 'LEAVE_CHANNEL' } });

    const home = await homeAfter(b, seen);
    expect(home.home.rejoinable).toEqual([]);
    b.close();
  });

  /**
   * The report a withheld speaker makes about themselves, which is the only
   * account of them anybody can have.
   *
   * Withholding is done by unsubscribing the listeners, and LiveKit scopes its
   * speaker updates to what a listener is subscribed to — so from the moment a
   * claim lands, every other device in the room stops being told anything
   * about the people it has stopped hearing. The SFU still reports a
   * participant to *themselves*, so the withheld device is the one witness,
   * and this is the road its evidence takes. See
   * `ClientMessage.channel.speaking`.
   */
  describe('speaking while withheld', () => {
    /** How many channel snapshots this client has been sent so far. */
    const seenViews = (client: Client): number =>
      client.received.filter((m) => m.type === 'channel').length;

    /**
     * The next snapshot *after* this point that matches, given how many had
     * arrived before — `homeAfter`'s reasoning, for the same trap.
     *
     * Every assertion below about a flag being *gone* is satisfied by some
     * snapshot from before it was ever set: the claim itself pushes one with
     * nobody speaking in it. Counting first is what makes the wait mean a new
     * message rather than an old one.
     */
    async function viewAfter(
      client: Client,
      seen: number,
      predicate: (m: Extract<ServerMessage, { type: 'channel' }>) => boolean,
      timeoutMs = 3000
    ): Promise<Extract<ServerMessage, { type: 'channel' }>> {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const found = client.received
          .filter(
            (m): m is Extract<ServerMessage, { type: 'channel' }> =>
              m.type === 'channel'
          )
          .slice(seen)
          .find(predicate);
        if (found) return found;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error(`no matching snapshot after the ${seen} already seen`);
    }

    /** Both present, Alice holding the floor, which withholds Bob. */
    async function underClaim() {
      const { alice, bob, channelId } = await pairInSession();
      const a = new Client(alice.token, baseUrl);
      const b = new Client(bob.token, baseUrl);
      await Promise.all([a.open(), b.open()]);
      a.send({ type: 'watch.channel', channelId });
      a.send({ type: 'channel.action', channelId, action: { type: 'ENTER' } });
      b.send({ type: 'watch.channel', channelId });
      b.send({ type: 'channel.action', channelId, action: { type: 'ENTER' } });
      await a.next('channel', (m) => m.view.channel.present.length === 2);
      a.send({ type: 'channel.action', channelId, action: { type: 'CLAIM_FLOOR' } });
      await a.next(
        'channel',
        (m) => m.view.channel.floor.holder === alice.account.id
      );
      return { alice, bob, channelId, a, b };
    }

    it('carries it to the room, and takes it back', async () => {
      const { bob, channelId, a, b } = await underClaim();
      b.send({ type: 'channel.speaking', channelId, speaking: true });
      await a.next('channel', (m) =>
        (m.view.speakingWhileWithheld ?? []).includes(bob.account.id)
      );

      const seen = seenViews(a);
      b.send({ type: 'channel.speaking', channelId, speaking: false });
      await viewAfter(
        a,
        seen,
        (m) => (m.view.speakingWhileWithheld ?? []).length === 0
      );
      a.close();
      b.close();
    });

    it('refuses one from somebody nothing is withholding', async () => {
      // The floor-holder is heard by everybody, so the media plane is already
      // reporting them and this would be a second, unfalsifiable source for
      // the same dot. Ordered against Bob's report rather than asserted into
      // the void: the snapshot that proves the server was listening is the one
      // that has to lack Alice.
      const { alice, bob, channelId, a, b } = await underClaim();
      a.send({ type: 'channel.speaking', channelId, speaking: true });
      b.send({ type: 'channel.speaking', channelId, speaking: true });
      const view = await a.next('channel', (m) =>
        (m.view.speakingWhileWithheld ?? []).includes(bob.account.id)
      );
      expect(view.view.speakingWhileWithheld).not.toContain(alice.account.id);
      a.close();
      b.close();
    });

    it('drops it when the floor is released, without being told', async () => {
      // Nothing withholds them any more, so there is nothing for the report to
      // be about. The client sends no stop here — the release is the stop —
      // and a server that kept the flag would light a dot that the media plane
      // had already taken responsibility for.
      const { bob, channelId, a, b } = await underClaim();
      b.send({ type: 'channel.speaking', channelId, speaking: true });
      await a.next('channel', (m) =>
        (m.view.speakingWhileWithheld ?? []).includes(bob.account.id)
      );
      const seen = seenViews(a);
      a.send({
        type: 'channel.action',
        channelId,
        action: { type: 'RELEASE_FLOOR' },
      });
      const view = await viewAfter(
        a,
        seen,
        (m) => m.view.channel.floor.holder === null
      );
      expect(view.view.speakingWhileWithheld ?? []).toEqual([]);
      a.close();
      b.close();
    });

    it('drops it when the reporting socket goes', async () => {
      // The one ending the report cannot announce for itself: a process that
      // dies mid-word sends no stop, and everything else about the room is
      // still true — the claim stands, and Bob is still in it for the length
      // of the grace period.
      const { bob, channelId, a, b } = await underClaim();
      b.send({ type: 'channel.speaking', channelId, speaking: true });
      await a.next('channel', (m) =>
        (m.view.speakingWhileWithheld ?? []).includes(bob.account.id)
      );
      const seen = seenViews(a);
      b.close();
      const view = await viewAfter(
        a,
        seen,
        (m) => !(m.view.speakingWhileWithheld ?? []).includes(bob.account.id)
      );
      // The claim is still standing, which is what makes this the socket's
      // doing rather than the floor's.
      expect(view.view.channel.floor.holder).not.toBeNull();
      a.close();
    });
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

  /**
   * The notification setting rides the channel snapshot, and the snapshot is
   * the one place a per-viewer fact can travel without being broadcast. Two
   * people watching the same channel see two different values here, and
   * neither can see the other's — which is the whole reason it is a scalar on
   * the view rather than a map like `pingableAt`.
   */
  it('carries each watcher their own notification level and nobody else’s', async () => {
    const { alice, bob, channelId } = await pairInSession();
    await app.fastify.inject({
      method: 'PUT',
      url: `/channels/${channelId}/notifications`,
      headers: auth(bob.token),
      payload: { level: 'low' },
    });

    const a = new Client(alice.token, baseUrl);
    const b = new Client(bob.token, baseUrl);
    await Promise.all([a.open(), b.open()]);
    a.send({ type: 'watch.channel', channelId });
    b.send({ type: 'watch.channel', channelId });

    const forAlice = await a.next('channel');
    const forBob = await b.next('channel');

    // Bob turned it down; Alice never touched it and is on the default.
    expect(forBob.view.notificationLevel).toBe('low');
    expect(forAlice.view.notificationLevel).toBe('medium');
    // And there is nowhere on the view for one to read the other's.
    expect(JSON.stringify(forAlice.view)).not.toContain('low');
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

  /**
   * **The one wire addition of the 2026-09-08 redesign**, and the one step
   * that has to reach the server before a client that sends it reaches a
   * phone. Everything else about *nearby* is backwards compatible by
   * construction: the observer side rides on `waiting`, which every existing
   * build already renders with a ping.
   */
  it('takes a declaration of nearby from inside a channel', async () => {
    const { bob, channelId } = await pairInSession();
    const b = new Client(bob.token, baseUrl);
    await b.open();
    b.send({ type: 'watch.channel', channelId });
    b.send({ type: 'channel.action', channelId, action: { type: 'ENTER' } });
    await b.next('channel', (m) => m.view.channel.present.includes(bob.account.id));

    b.send({
      type: 'channel.action',
      channelId,
      action: { type: 'DECLARE_NEARBY' },
    });
    const view = await b.next('channel', (m) =>
      m.view.channel.waiting.includes(bob.account.id)
    );

    // Out of the room and into the field every client already draws as
    // *Nearby*. Nothing new on the snapshot; that is the point.
    expect(view.view.channel.present).not.toContain(bob.account.id);
    b.close();
  });

  it('takes one from outside a channel, without putting anybody in it', async () => {
    const { alice, bob, channelId } = await pairInSession();
    const b = new Client(bob.token, baseUrl);
    await b.open();
    b.send({ type: 'watch.channel', channelId });
    await b.next('channel');

    b.send({
      type: 'channel.action',
      channelId,
      action: { type: 'DECLARE_NEARBY' },
    });
    const view = await b.next('channel', (m) =>
      m.view.channel.waiting.includes(bob.account.id)
    );

    // Stepping in nearby claims a notification and nothing else: no place in
    // the room, and therefore no microphone, no subscription and no session.
    expect(view.view.channel.present).toEqual([alice.account.id]);
    b.close();
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

  it('writes down which end ended a socket, and how long it lasted', async () => {
    // The journal records that a socket opened and, before this line, nothing
    // else about it — a websocket upgrade is hijacked before Fastify completes
    // the request, so there is no `request completed` and no `responseTime`.
    // A client reconnecting on a fixed cadence therefore looked identical
    // whether this server was killing it, its own watchdog was, or the
    // transport had died. These two cases are that distinction.
    const account = await signIn('closes@example.com', 'Cass');
    const logged: Array<Record<string, unknown>> = [];
    const info = jest
      .spyOn(app.fastify.log, 'info')
      .mockImplementation(((payload: unknown, msg?: string) => {
        if (msg === 'socket closed') logged.push(payload as Record<string, unknown>);
      }) as never);

    try {
      // One that hangs up of its own accord, answering right to the end.
      const polite = new Client(account.token, baseUrl, FAST_HEARTBEAT_BUILD);
      await polite.open();
      await polite.next('hello');
      clock += 1_500;
      polite.close();
      await polite.closed;
      // The close handler runs on the server's turn, not this one.
      await new Promise((r) => setTimeout(r, 50));

      expect(logged).toHaveLength(1);
      // The value that matters is the absence of one: nothing on this side
      // ended it, so whatever did was the client or the network.
      expect(logged[0]).toMatchObject({ endedBy: null, scope: 'session' });
      expect(logged[0].ageMs).toBe(1_500);
      // It had just spoken, which is what separates this from the sweep below.
      expect(logged[0].sinceLastSeenMs).toBeLessThan(HEARTBEAT_TIMEOUT_MS);

      logged.length = 0;

      // And one this server ends, for a silence it cannot distinguish from
      // death. `goDark` rather than merely going quiet, for the reason the
      // grace-period test sets out. Announcing a build matters here: one that
      // says nothing is judged against the legacy budget, which this jump
      // would not clear.
      const dark = new Client(account.token, baseUrl, FAST_HEARTBEAT_BUILD);
      await dark.open();
      await dark.next('hello');
      dark.goDark();
      clock += HEARTBEAT_TIMEOUT_MS + 1_000;
      await sweeps();

      expect(logged).toHaveLength(1);
      expect(logged[0]).toMatchObject({ endedBy: 'silence' });
      // Recorded rather than read off the close code, which is the whole point
      // of carrying the flag: `terminate` produces an abnormal 1006, exactly
      // as a transport dying on its own would.
      expect(logged[0].sinceLastSeenMs).toBeGreaterThan(HEARTBEAT_TIMEOUT_MS);
      dark.kill();
    } finally {
      info.mockRestore();
    }
  });

  it('starts the grace period for a connection that has gone silent', async () => {
    // A socket can die without either end being told: no close arrives and it
    // sits half-open until the OS gives up, which is hours. Nothing downstream
    // works in the meantime — nobody is removed, so no channel ever empties or
    // auto-ends, and a recording bills against two egresses indefinitely.
    const { alice, bob, channelId } = await pairInSession();
    const a = new Client(alice.token, baseUrl);
    // Declares the fast cadence, so it is judged against the current budget
    // rather than the one kept for builds that ping every five seconds.
    const b = new Client(bob.token, baseUrl, FAST_HEARTBEAT_BUILD);
    await Promise.all([a.open(), b.open()]);

    a.send({ type: 'watch.channel', channelId });
    b.send({ type: 'channel.action', channelId, action: { type: 'ENTER' } });
    await b.next('channel', (m) => m.view.channel.present.length === 2);

    // Bob's phone goes dark: the socket stays established and nothing further
    // is either sent or read. The clock moves past the point where that is
    // survivable.
    //
    // **Dark rather than merely quiet, and the assertion below rests on it.**
    // The sweep ends such a socket with `terminate`, because `close` would
    // send a close frame and then wait out `ws`'s 30-second `closeTimeout` for
    // an answer from a process that is never going to send one — and the close
    // handler is where `disconnectedAt` is written. So this test's real
    // subject is the *latency* of that write: the wait below is well under
    // thirty seconds, which is what makes it fail if the sweep ever goes back
    // to closing politely. A live-but-silent client would answer the frame at
    // protocol level and pass either way, which is what it used to do.
    b.goDark();
    clock += HEARTBEAT_TIMEOUT_MS + 1_000;
    await sweeps();

    const channel = app.channels.get(channelId)!;
    expect(channel.disconnectedAt[bob.account.id]).toBeDefined();
    // Still present: silence starts the clock, it does not remove anyone.
    expect(channel.present).toContain(bob.account.id);
    a.close();
    b.kill();
  });

  it('keeps a dropped party in the channel, and takes back their floor', async () => {
    // Losing a socket is not leaving. Only staying gone past the grace period
    // is, and that is a timer rather than an event.
    //
    // **The claim is the exception**, and the two halves of this assertion are
    // the whole of the distinction: their place is held, their lock on
    // everybody else is not. The room can speak again as soon as the transport
    // notices, rather than waiting out a minute for a turn nobody is taking.
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
    expect(channel.floor.holder).toBeNull();
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

  it('gives a client that predates the fast cadence the old budget', async () => {
    // **The whole of what stops a faster heartbeat sweeping the installed
    // population.** An old build goes on pinging every five seconds whatever
    // this server now prefers, so judged against the current budget it would be
    // a moment from exceeding it at all times — terminated, reconnecting, and
    // terminated again, for as long as it was running. The budget follows what
    // the client says it is.
    const { alice, bob, channelId } = await pairInSession();
    const a = new Client(alice.token, baseUrl);
    const old = new Client(bob.token, baseUrl, FAST_HEARTBEAT_BUILD - 1);
    await Promise.all([a.open(), old.open()]);

    a.send({ type: 'watch.channel', channelId });
    old.send({ type: 'channel.action', channelId, action: { type: 'ENTER' } });
    await old.next('channel', (m) => m.view.channel.present.length === 2);

    old.goDark();
    // Past the current budget and well short of theirs.
    clock += HEARTBEAT_TIMEOUT_MS + 1_000;
    await sweeps();
    expect(
      app.channels.get(channelId)!.disconnectedAt[bob.account.id]
    ).toBeUndefined();

    // And past their own, which is where they are finally let go.
    clock += HEARTBEAT_TIMEOUT_LEGACY_MS;
    await sweeps();
    expect(
      app.channels.get(channelId)!.disconnectedAt[bob.account.id]
    ).toBeDefined();
    a.close();
    old.kill();
  });

  it('runs the grace period from the last thing heard, not from noticing', async () => {
    // Detection costs a silence budget plus a sweep phase, and the grace period
    // runs from the stamp the close handler writes. Stamped with `now()` that
    // latency was added to the minute somebody is given, so they were stepped
    // out a timeout later than the rule says. The stamp is the last ping.
    const { alice, bob, channelId } = await pairInSession();
    const a = new Client(alice.token, baseUrl);
    const b = new Client(bob.token, baseUrl, FAST_HEARTBEAT_BUILD);
    await Promise.all([a.open(), b.open()]);

    a.send({ type: 'watch.channel', channelId });
    b.send({ type: 'channel.action', channelId, action: { type: 'ENTER' } });
    await b.next('channel', (m) => m.view.channel.present.length === 2);
    const heard = clock;

    b.goDark();
    clock += HEARTBEAT_TIMEOUT_MS + 1_000;
    await sweeps();

    const stamped = app.channels.get(channelId)!.disconnectedAt[bob.account.id];
    expect(stamped).toBeDefined();
    // The last message, not the moment of noticing — which is a whole budget
    // later and is what `clock` now reads.
    expect(stamped).toBeLessThanOrEqual(heard);
    expect(stamped).toBeLessThan(clock);
    a.close();
    b.kill();
  });

  it('counts which way each lost connection went', async () => {
    // The measurement DISCONNECT_GRACE_MS has never had. Its justification —
    // that a tunnel or a lift is survivable — is a claim about how often a
    // socket comes back inside the window, and nothing counted. These two
    // arms are that count.
    //
    // Read as deltas because the counters belong to the process and every
    // test in this file shares one; the absolute figures are whatever the
    // suite happened to do before this ran.
    const before = app.channels.connectivityCounts();
    const { alice, bob, channelId } = await pairInSession();
    const a = new Client(alice.token, baseUrl);
    const b = new Client(bob.token, baseUrl);
    await Promise.all([a.open(), b.open()]);

    a.send({ type: 'watch.channel', channelId });
    b.send({ type: 'channel.action', channelId, action: { type: 'ENTER' } });
    await b.next('channel', (m) => m.view.channel.present.length === 2);

    // Gone, and back inside the window: the arm the constant exists for.
    //
    // **The re-entry is what recovers it, not the watch**, since 2026-09-08.
    // This used to send `watch.channel` alone, which reported CONNECTED and
    // cancelled the grace — the line that let a reopened app hold a presence no
    // device was in the room for. It is also not what the client does: `onopen`
    // in app/src/api/socket.ts sends the watch *and then* re-sends ENTER from
    // `enteredChannel`, which is the pair reproduced here.
    b.close();
    await new Promise((r) => setTimeout(r, 200));
    const back = new Client(bob.token, baseUrl);
    await back.open();
    back.send({ type: 'watch.channel', channelId });
    back.send({ type: 'channel.action', channelId, action: { type: 'ENTER' } });
    await new Promise((r) => setTimeout(r, 200));

    const recovered = app.channels.connectivityCounts();
    expect(recovered.dropped - before.dropped).toBe(1);
    expect(recovered.recovered - before.recovered).toBe(1);
    expect(recovered.expired - before.expired).toBe(0);

    // Gone, and never seen again: the arm that costs somebody their place.
    back.close();
    await new Promise((r) => setTimeout(r, 200));
    clock += DISCONNECT_GRACE_MS;
    app.channels.tick();

    const expired = app.channels.connectivityCounts();
    expect(expired.dropped - recovered.dropped).toBe(1);
    expect(expired.recovered - recovered.recovered).toBe(0);
    expect(expired.expired - recovered.expired).toBe(1);
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
    //
    // **Watching was the other half of that, and went on 2026-09-08.** This
    // test passed all along because the reinstalled app watches Home and never
    // opens the channel; open it and `watch.channel` renewed the presence by
    // exactly the same mechanism, under a narrower name. Presence is asserted
    // by entering, and sustained by the media room. Nothing a socket does can
    // create one.
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

  it('does not let a reopened app hold a channel it has only opened', async () => {
    // **The reported sequence, start to finish.** Step in alone, force quit,
    // reopen, and go to the channel screen without stepping in. The new process
    // has no `enteredChannel`, so it sends `watch.channel` and no ENTER — and
    // until 2026-09-08 that reported CONNECTED and cancelled the grace, on
    // every reconnection, for ever. Nothing else could recover it: `stillHere`
    // is guarded on presence, so every heartbeat refreshed `lastPresentAt` and
    // the account never aged to *Stepped out* either.
    //
    // What makes it a ghost rather than a mistake is that the phone agreed: the
    // channel screen reads `standingIn`, knows it entered nothing, and offers
    // *Step in* — while everybody else's roster says the person is here.
    const { alice, bob, channelId } = await pairInSession();
    const a = new Client(alice.token, baseUrl);
    const b = new Client(bob.token, baseUrl);
    await Promise.all([a.open(), b.open()]);

    a.send({ type: 'watch.channel', channelId });
    b.send({ type: 'channel.action', channelId, action: { type: 'ENTER' } });
    await b.next('channel', (m) => m.view.channel.present.length === 2);

    b.kill();
    await new Promise((r) => setTimeout(r, 200));

    // Reopened, signed in on the stored token, looking at the channel.
    const reopened = new Client(bob.token, baseUrl);
    await reopened.open();
    reopened.send({ type: 'watch.channel', channelId });
    await reopened.next('channel');

    clock += DISCONNECT_GRACE_MS;
    app.channels.tick();

    expect(app.channels.get(channelId)!.present).not.toContain(bob.account.id);
    // Nearby: within reach, one notification away — which is exactly what a
    // phone with the app open and no room connection is.
    expect(app.channels.get(channelId)!.waiting).toContain(bob.account.id);
    a.close();
    reopened.close();
  });

  it('cancels the grace period when the user re-enters', async () => {
    // **Re-entering is what cancels it, and watching is not**, since
    // 2026-09-08. The two were the same thing here until `watch.channel`
    // stopped reporting CONNECTED, and the difference is the whole of the ghost
    // it produced: a reopened app watching a channel it has not entered is
    // looking, not standing. The client sends both, in this order — see
    // `onopen` in app/src/api/socket.ts — so what this asserts is unchanged
    // about the case it was written for.
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

    // The watch alone leaves the grace running. This is the assertion the
    // reported bug turns on, and it is the one this file did not have.
    expect(
      app.channels.get(channelId)!.disconnectedAt[bob.account.id]
    ).toBeDefined();

    back.send({ type: 'channel.action', channelId, action: { type: 'ENTER' } });
    // Waited on the clock rather than on the next snapshot: several are already
    // queued from the drop, so `next('channel')` resolves on one of those and
    // asserts ahead of the action it is meant to be waiting for.
    await new Promise((r) => setTimeout(r, 200));

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
   * Being signed out from another device revokes the token this socket was
   * accepted on. The socket has to go with it: it is not merely stale, it is a
   * live conversation with an open microphone belonging to a device the
   * account holder may no longer have.
   *
   * The trigger used to be a second sign-in, which revoked every other session
   * by itself. Since 2026-08-24 it does not — see tokens.test.ts — so the
   * thing being exercised is the lever that replaced it. The sweep is
   * unchanged and does not care which of them emptied the row.
   */
  it('closes a socket whose token was revoked from another device', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    const bob = await signIn('user2@example.com', 'Bob');

    const a = new Client(alice.token, baseUrl);
    const b = new Client(bob.token, baseUrl);
    await Promise.all([a.open(), b.open()]);
    await Promise.all([a.next('hello'), b.next('hello')]);

    const aClosed = a.closed;

    // A second device for Alice, which now leaves the first alone — and then
    // signs it out on purpose. The resend interval refuses a second code this
    // soon, so the code is issued as of a minute from now; moving the shared
    // clock instead would trip the heartbeat timeout and close both sockets
    // for staleness, which is the other sweep entirely.
    const secondCode = app.accounts.issueCode(
      'user1@example.com',
      clock + OTP_RESEND_INTERVAL_MS + 1_000
    )!;
    const second = await app.fastify.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { identifier: 'user1@example.com', code: secondCode },
    });

    // The lifted rule, asserted where it used to bite: a full sweep passes and
    // the first device is still connected and still answered. This is the
    // whole of what a second sign-in now costs.
    await sweeps();
    a.send({ type: 'ping' });
    await a.next('pong');

    await app.fastify.inject({
      method: 'POST',
      url: '/auth/sign-out-others',
      headers: { authorization: `Bearer ${second.json().token}` },
      payload: {},
    });

    // The sweep runs on an interval rather than off `clock`, so this waits
    // rather than steps — for `SWEEP_MS` now, not the production two seconds.
    await sweeps();

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
  });

  /**
   * Several sessions for one account, which is what 2026-08-24 allowed. The
   * rule that survived is about rooms rather than credentials: an account may
   * be signed in anywhere and is still standing in at most one channel, and
   * the session that entered most recently is the one standing there.
   *
   * The same-channel case is what these are mostly about, because it is the
   * one no snapshot can express — the account is present either way and
   * nothing about the channel changes, so a message is the only way to say it.
   */
  describe('several devices for one account', () => {
    /**
     * A second session for an account that already has one.
     *
     * Minted directly rather than by signing in again: the OTP resend
     * interval makes a second sign-in a two-step dance with the clock, and
     * none of what is being tested here is about codes.
     */
    const secondSession = (accountId: string) =>
      app.accounts.issueToken(accountId, clock);

    /** Bob's channel, with Alice on two devices, neither in it yet. */
    async function twoDevices() {
      const { alice, bob, channelId } = await pairInSession();
      const phone = new Client(alice.token, baseUrl);
      const tablet = new Client(secondSession(alice.account.id), baseUrl);
      await Promise.all([phone.open(), tablet.open()]);
      await Promise.all([phone.next('hello'), tablet.next('hello')]);
      return { alice, bob, channelId, phone, tablet };
    }

    const enter = async (client: Client, channelId: string, who: string) => {
      client.send({ type: 'channel.action', channelId, action: { type: 'ENTER' } });
      await client.next('channel', (m) => m.view.channel.present.includes(who));
    };

    const sawDisplaced = (client: Client) =>
      client.received.some((m) => m.type === 'displaced');

    /**
     * **Which of this account's devices is standing in a room**, which is the
     * one fact about somebody's own hardware that no snapshot can carry: a
     * channel's `present` names accounts, so both of Alice's devices are told
     * the same thing by the same snapshot and neither can tell from it which
     * of them is holding the room.
     *
     * Home's pinned tier fell into that gap — the room was pinned on the
     * device holding it and drawn nowhere at all on the other one. See
     * `pushStanding`.
     */
    describe('which device is standing in a room', () => {
      /** Alice on two devices, neither of them in the channel yet. */
      async function twoDevices() {
        const { alice, bob, channelId } = await pairInSession();
        const phone = new Client(alice.token, baseUrl, 80, 'dev-phone', 'iPhone');
        const laptop = new Client(
          secondSession(alice.account.id),
          baseUrl,
          80,
          'dev-laptop',
          'Chrome on macOS'
        );
        await Promise.all([phone.open(), laptop.open()]);
        await Promise.all([phone.next('hello'), laptop.next('hello')]);
        return { alice, bob, channelId, phone, laptop };
      }

      it('tells the other device where the account is standing', async () => {
        const { channelId, phone, laptop, alice } = await twoDevices();
        await enter(laptop, channelId, alice.account.id);

        const { channelIds } = await phone.next(
          'standingElsewhere',
          (m) => m.channelIds.includes(channelId)
        );
        expect(channelIds).toEqual([channelId]);

        phone.close();
        laptop.close();
      });

      it('never reports a device to itself', async () => {
        // What makes the answer mean *another device of mine* on every device
        // at once. Without it the laptop would pin the room twice — once from
        // its own live bar and once from this.
        const { channelId, phone, laptop, alice } = await twoDevices();
        await enter(laptop, channelId, alice.account.id);
        await phone.next('standingElsewhere', (m) =>
          m.channelIds.includes(channelId)
        );

        const mine = await laptop.next(
          'standingElsewhere',
          (m) => m.channelIds.length === 0
        );
        expect(mine.channelIds).toEqual([]);

        phone.close();
        laptop.close();
      });

      it('takes it back when the device holding the room goes away', async () => {
        // The one sentence this bar must never be wrong about: it names
        // hardware the reader can go and look at, and a phone still saying
        // *on the laptop* after the laptop is shut is pointing at nothing.
        const { channelId, phone, laptop, alice } = await twoDevices();
        await enter(laptop, channelId, alice.account.id);
        await phone.next('standingElsewhere', (m) =>
          m.channelIds.includes(channelId)
        );

        laptop.close();
        const { channelIds } = await phone.next(
          'standingElsewhere',
          (m) => m.channelIds.length === 0
        );
        expect(channelIds).toEqual([]);

        phone.close();
      });

      it('empties it when the room is stepped out of', async () => {
        const { channelId, phone, laptop, alice } = await twoDevices();
        await enter(laptop, channelId, alice.account.id);
        await phone.next('standingElsewhere', (m) =>
          m.channelIds.includes(channelId)
        );

        laptop.send({
          type: 'channel.action',
          channelId,
          action: { type: 'STEP_OUT' },
        });
        const { channelIds } = await phone.next(
          'standingElsewhere',
          (m) => m.channelIds.length === 0
        );
        expect(channelIds).toEqual([]);

        phone.close();
        laptop.close();
      });

      it('moves to the device that takes the room', async () => {
        // An `ENTER` from the second device displaces the first, which is how
        // somebody moves a conversation from the laptop to the phone. Both
        // halves are told: the laptop is displaced, and the laptop's own
        // answer to *where am I standing elsewhere* becomes the phone.
        const { channelId, phone, laptop, alice } = await twoDevices();
        await enter(laptop, channelId, alice.account.id);
        await phone.next('standingElsewhere', (m) =>
          m.channelIds.includes(channelId)
        );

        await enter(phone, channelId, alice.account.id);
        const { channelIds } = await laptop.next(
          'standingElsewhere',
          (m) => m.channelIds.includes(channelId)
        );
        expect(channelIds).toEqual([channelId]);
        expect(sawDisplaced(laptop)).toBe(true);

        // And the phone, which is now the one holding it, is told about
        // nobody.
        const mine = await phone.next(
          'standingElsewhere',
          (m) => m.channelIds.length === 0
        );
        expect(mine.channelIds).toEqual([]);

        phone.close();
        laptop.close();
      });
    });

    describe('choosing which device shows a film', () => {
      /** Alice on two named devices, the phone in the channel. */
      async function withScreens() {
        const { alice, bob, channelId } = await pairInSession();
        const phone = new Client(
          alice.token,
          baseUrl,
          80,
          'dev-phone',
          'iPhone 15 Pro'
        );
        const laptop = new Client(
          secondSession(alice.account.id),
          baseUrl,
          80,
          'dev-laptop',
          'Chrome on macOS'
        );
        await Promise.all([phone.open(), laptop.open()]);
        await Promise.all([phone.next('hello'), laptop.next('hello')]);
        return { alice, bob, channelId, phone, laptop };
      }

      it('lists this account\'s own live instances, and marks which is asking', async () => {
        const { phone, laptop } = await withScreens();
        phone.send({ type: 'screens.list' });
        const { screens } = await phone.next('screens');

        expect(screens).toHaveLength(2);
        const self = screens.find((s) => s.self);
        expect(self?.name).toBe('iPhone 15 Pro');
        const other = screens.find((s) => !s.self);
        expect(other?.name).toBe('Chrome on macOS');
        expect(other?.device).toBe('dev-laptop');

        phone.close();
        laptop.close();
      });

      it('says which instances are actually showing something', async () => {
        const { channelId, phone, laptop } = await withScreens();
        laptop.send({ type: 'screens.showing', channelId });
        // Waited out rather than raced. The report does push a `screening`
        // now — see below — but this test is about the picker's own list,
        // which is still asked for and still answers only when asked.
        await new Promise((r) => setTimeout(r, 50));

        phone.send({ type: 'screens.list' });
        const { screens } = await phone.next('screens');
        expect(screens.find((s) => !s.self)?.watching).toBe(true);
        expect(screens.find((s) => s.self)?.watching).toBe(false);

        phone.close();
        laptop.close();
      });

      /**
       * The fact the *Watch on* switch reads, which is pushed rather than
       * asked for — see `pushScreening`. The picker's list is deliberately
       * frozen at the moment of choosing; this has to arrive by itself,
       * because the device that hands a film away is the one that would
       * otherwise show no selection at all.
       */
      it('tells the account when one of its devices starts showing something', async () => {
        const { channelId, phone, laptop } = await withScreens();
        laptop.send({ type: 'screens.showing', channelId });

        const { channelIds } = await phone.next('screening', (m) =>
          m.channelIds.includes(channelId)
        );
        expect(channelIds).toEqual([channelId]);

        // And never about itself: what the switch asks is whether a
        // *separate* device is showing this, so the laptop's own answer is
        // empty while it is the one showing.
        const mine = await laptop.next('screening', (m) => m.channelIds.length === 0);
        expect(mine.channelIds).toEqual([]);

        phone.close();
        laptop.close();
      });

      it('takes it back when that device goes away', async () => {
        const { channelId, phone, laptop } = await withScreens();
        laptop.send({ type: 'screens.showing', channelId });
        await phone.next('screening', (m) => m.channelIds.includes(channelId));

        // **A screen that has gone away has stopped showing anything**, which
        // is the lifetime `Connection.screening` was given deliberately. Left
        // unsaid, a laptop that was closed goes on being the answer to *is it
        // on somewhere else* until something unrelated pushes the fact again.
        laptop.close();
        const { channelIds } = await phone.next(
          'screening',
          (m) => m.channelIds.length === 0
        );
        expect(channelIds).toEqual([]);

        phone.close();
      });

      /**
       * **A film shows on one device at a time.** Handing one over moves the
       * video and not merely the controls, so an instance declaring itself
       * the screen is every other instance of that account ceasing to be
       * one — and the server is the only thing that can see all of somebody's
       * devices at once.
       */
      it('takes the film off every other device of the account', async () => {
        const { channelId, phone, laptop } = await withScreens();
        phone.send({ type: 'screens.showing', channelId });
        await laptop.next('screening', (m) => m.channelIds.includes(channelId));

        // The laptop now takes it, which is the phone losing it.
        laptop.send({ type: 'screens.showing', channelId });
        const { channelId: told } = await phone.next('screen');
        expect(told).toBeNull();

        // And the server's own copy went with it, so the picker does not go
        // on offering a phone that has stopped showing anything as busy.
        phone.send({ type: 'screens.list' });
        const { screens } = await phone.next('screens');
        expect(screens.find((s) => s.self)?.watching).toBe(false);
        expect(screens.find((s) => !s.self)?.watching).toBe(true);

        phone.close();
        laptop.close();
      });

      /**
       * **The room, rather than the account**, which is the other audience a
       * declaration has and the one the roster reads. `watchingHere` cannot
       * answer this: it is the microphone's list and names somebody only when
       * one device holds both the room and the picture, so the *second
       * device* case — the film on a laptop, the voice on a phone — is a
       * person plainly watching whom that list does not mention.
       */
      it('tells the room who has the film up, on whichever device', async () => {
        const { alice, bob, channelId, phone, laptop } = await withScreens();
        await enter(phone, channelId, alice.account.id);
        const watcher = new Client(bob.token, baseUrl);
        await watcher.open();
        await watcher.next('hello');
        watcher.send({ type: 'watch.channel', channelId });
        const before = await watcher.next('channel');
        expect(before.view.watching ?? []).toEqual([]);

        laptop.send({ type: 'screens.showing', channelId });
        const during = await watcher.next('channel', (m) =>
          (m.view.watching ?? []).includes(alice.account.id)
        );
        // The account and never the device: which of Alice's two instances is
        // showing it is her business, and the room is told one thing.
        expect(during.view.watching).toEqual([alice.account.id]);
        // And the narrower list is untouched, the picture being on a device
        // that is not in the room.
        expect(during.view.channel.watchingHere).toEqual([]);

        // A screen that has gone away has stopped showing anything, and the
        // room hears about that too — nothing else would say so.
        laptop.close();
        const after = await watcher.next(
          'channel',
          (m) => (m.view.watching ?? []).length === 0
        );
        expect(after.view.watching).toEqual([]);

        watcher.close();
        phone.close();
      });

      it('asks nothing of a device that was showing nothing', async () => {
        const { channelId, phone, laptop } = await withScreens();
        laptop.send({ type: 'screens.showing', channelId });
        await phone.next('screening', (m) => m.channelIds.includes(channelId));

        // The eviction reaches every instance — see below — so the phone does
        // hear about this. What it must never hear is a channel: a non-null
        // `screen` opens one on a device whose owner never asked it to.
        expect(
          phone.received.some((m) => m.type === 'screen' && m.channelId !== null)
        ).toBe(false);

        phone.close();
        laptop.close();
      });

      /**
       * **The invariant, and the half of it that was being enforced against
       * the obedient.** Exactly one instance of an account shows a film, and
       * the eviction used to be filtered on `Connection.screening` — a record
       * of what a device last managed to *say*, which a socket takes with it
       * when it goes.
       *
       * So the devices that were skipped were precisely the ones that had
       * stopped agreeing with the server: a deploy, a tunnel or a lift, or a
       * client below build 263, which had nothing that outlived the socket to
       * restate the declaration with. A film playing on a second device, the
       * app updated on the first, and the fresh process defaults itself to the
       * screen and displaces nothing — two soundtracks in one room, and stable.
       */
      it('takes the film off every instance, whatever it was last told', async () => {
        const { channelId, phone, laptop } = await withScreens();
        laptop.send({ type: 'screens.showing', channelId });
        await phone.next('screening', (m) => m.channelIds.includes(channelId));
        // The record going, with the film still on the glass: this is what a
        // socket dying does to it, said in one message rather than by killing
        // a connection the test would then have to replace.
        laptop.send({ type: 'screens.showing', channelId: null });
        await phone.next('screening', (m) => m.channelIds.length === 0);

        // The phone now believes nobody has the picture, which is exactly what
        // a freshly launched app is told, and takes it.
        phone.send({ type: 'screens.showing', channelId });

        const told = await laptop.next('screen');
        expect(told.channelId).toBeNull();

        phone.close();
        laptop.close();
      });

      it('hands a film to the chosen instance without moving anybody', async () => {
        const { alice, channelId, phone, laptop } = await withScreens();
        await enter(phone, channelId, alice.account.id);

        phone.send({ type: 'screens.use', channelId, device: 'dev-laptop' });
        const told = await laptop.next('screen');
        expect(told.channelId).toBe(channelId);

        // **The whole point**: being a screen is not being in the room. The
        // laptop was never displaced, the phone still holds the presence, and
        // nothing about the channel changed.
        expect(sawDisplaced(phone)).toBe(false);
        expect(app.channels.get(channelId)!.present).toContain(
          alice.account.id
        );
        expect(app.channels.get(channelId)!.watchingHere).toEqual([]);

        phone.close();
        laptop.close();
      });

      it('hands a film back to whichever device is standing in the channel', async () => {
        /*
          **The television's way of giving the picture back.** It has a list of
          the account's instances and no way to tell which of them the person
          is holding — that fact is here, on the connection that entered — so
          it asks by description: a null device is *the one standing in this
          channel*. See `Connection.standing`.
        */
        const { alice, channelId, phone, laptop } = await withScreens();
        await enter(phone, channelId, alice.account.id);

        // The laptop is the television, and it declines.
        laptop.send({ type: 'screens.showing', channelId });
        laptop.send({ type: 'screens.showing', channelId: null });
        laptop.send({ type: 'screens.use', channelId, device: null });

        // The grant rather than the first `screen` to arrive: the laptop's
        // own declaration evicted every other instance a moment earlier, so
        // the phone — which was showing nothing, and does nothing about it —
        // has a null in front of this.
        const told = await phone.next('screen', (m) => m.channelId !== null);
        expect(told.channelId).toBe(channelId);
        // Nothing about the room moved: this is a screen role and not a place
        // to be.
        expect(sawDisplaced(phone)).toBe(false);
        expect(app.channels.get(channelId)!.present).toContain(
          alice.account.id
        );

        phone.close();
        laptop.close();
      });

      it('follows the room to the device that took it', async () => {
        /*
          One voice, one place: entering on the tablet takes the room off the
          phone, so a film handed back afterwards has to land on the tablet.
          A `standing` left behind on the displaced device would send the
          picture to a phone somebody had put down in another room.
        */
        const { alice, channelId, phone, laptop } = await withScreens();
        await enter(phone, channelId, alice.account.id);
        const tablet = new Client(
          secondSession(alice.account.id),
          baseUrl,
          80,
          'dev-tablet',
          'iPad mini'
        );
        await tablet.open();
        await tablet.next('hello');
        await enter(tablet, channelId, alice.account.id);

        laptop.send({ type: 'screens.use', channelId, device: null });
        const told = await tablet.next('screen');
        expect(told.channelId).toBe(channelId);
        expect(phone.received.some((m) => m.type === 'screen')).toBe(false);

        phone.close();
        laptop.close();
        tablet.close();
      });

      it('says so when nobody is standing in the channel at all', async () => {
        // The account can be present while the socket that entered has gone —
        // a grace period is exactly that state. A refusal names it rather than
        // the message going quiet, which is indistinguishable from a device
        // that simply never drew anything.
        const { channelId, phone, laptop } = await withScreens();
        laptop.send({ type: 'screens.use', channelId, device: null });
        const refusal = await laptop.next('error');
        expect(refusal.code).toBe('no-such-device');

        phone.close();
        laptop.close();
      });

      it('stops answering for a device that stepped out', async () => {
        const { alice, channelId, phone, laptop } = await withScreens();
        await enter(phone, channelId, alice.account.id);
        phone.send({
          type: 'channel.action',
          channelId,
          action: { type: 'STEP_OUT' },
        });
        await phone.next(
          'channel',
          (m) => !m.view.channel.present.includes(alice.account.id)
        );

        laptop.send({ type: 'screens.use', channelId, device: null });
        const refusal = await laptop.next('error');
        expect(refusal.code).toBe('no-such-device');

        phone.close();
        laptop.close();
      });

      it('refuses a device that is not signed in, rather than going quiet', async () => {
        const { channelId, phone, laptop } = await withScreens();
        phone.send({ type: 'screens.use', channelId, device: 'dev-television' });
        const refusal = await phone.next('error');
        expect(refusal.code).toBe('no-such-device');

        phone.close();
        laptop.close();
      });

      it('counts a device once while it is reconnecting', async () => {
        const { alice, phone, laptop } = await withScreens();
        // The same device id on a second socket, which is what a reconnection
        // looks like for the moment before the old one closes.
        const again = new Client(
          alice.token,
          baseUrl,
          80,
          'dev-phone',
          'iPhone 15 Pro'
        );
        await again.open();
        await again.next('hello');

        phone.send({ type: 'screens.list' });
        const { screens } = await phone.next('screens');
        expect(screens.filter((s) => s.device === 'dev-phone')).toHaveLength(1);

        phone.close();
        laptop.close();
        again.close();
      });
    });

    it('tells the phone when the tablet steps into the same channel', async () => {
      const { alice, channelId, phone, tablet } = await twoDevices();
      await enter(phone, channelId, alice.account.id);
      expect(sawDisplaced(phone)).toBe(false);

      await enter(tablet, channelId, alice.account.id);
      await tablet.next('channel');

      // Waited for rather than asserted immediately: it is pushed on the same
      // turn as the dispatch, but this socket is a different one.
      await phone.next('displaced');
      // And the account is still present, which is the whole reason the
      // message has to exist — there is no snapshot here that says anything.
      expect(app.channels.get(channelId)!.present).toContain(alice.account.id);

      phone.close();
      tablet.close();
    });

    /**
     * Only the tablet enters, so that the one device which is *not* told is
     * the one that did it. Entering on the phone first would displace the
     * tablet on its way past and leave nothing to assert.
     */
    it('says nothing to the device that entered', async () => {
      const { alice, channelId, phone, tablet } = await twoDevices();
      await enter(tablet, channelId, alice.account.id);
      await phone.next('displaced');

      expect(sawDisplaced(tablet)).toBe(false);

      phone.close();
      tablet.close();
    });

    it('says nothing to anybody else', async () => {
      const { alice, bob, channelId, phone, tablet } = await twoDevices();
      const bobs = new Client(bob.token, baseUrl);
      await bobs.open();
      await bobs.next('hello');

      await enter(phone, channelId, alice.account.id);
      await enter(tablet, channelId, alice.account.id);
      await phone.next('displaced');

      expect(sawDisplaced(bobs)).toBe(false);

      phone.close();
      tablet.close();
      bobs.close();
    });

    /**
     * The trap this is keyed on a token to avoid. A device reconnecting holds
     * two sockets for a moment — the old one not yet closed — and the client
     * re-sends ENTER on the new one. Displacing by socket would have that
     * ENTER take the room away from the device it is being sent from, and a
     * phone on patchy signal would do it every few seconds.
     */
    it('does not displace another socket on the same session', async () => {
      const { alice, channelId, phone } = await twoDevices();
      const flapped = new Client(alice.token, baseUrl);
      await flapped.open();
      await flapped.next('hello');

      await enter(flapped, channelId, alice.account.id);
      await flapped.next('channel');

      expect(sawDisplaced(phone)).toBe(false);
      expect(sawDisplaced(flapped)).toBe(false);

      phone.close();
      flapped.close();
    });

    /**
     * Signing in on a tablet is not stepping into anything, so the phone is
     * left holding whatever it was holding. Presence follows entering a
     * channel, never connecting a socket — the connect path asserts nothing
     * about presence, deliberately, and this is the same rule seen from the
     * other end.
     */
    it('leaves the phone alone until the tablet actually enters', async () => {
      const { alice, channelId, phone, tablet } = await twoDevices();
      await enter(phone, channelId, alice.account.id);

      tablet.send({ type: 'watch.channel', channelId });
      await tablet.next('channel');

      expect(sawDisplaced(phone)).toBe(false);
      expect(app.channels.get(channelId)!.present).toContain(alice.account.id);

      phone.close();
      tablet.close();
    });

    /**
     * Leaving is told the same way as arriving, and the reason is not
     * symmetry: what every other session holds is a belief about where this
     * account is standing, and stepping out makes that belief wrong in exactly
     * the way entering does.
     *
     * The belief is not inert. The app re-sends ENTER from it on every
     * connection, so a tablet that was never told goes on re-entering a
     * channel its owner left on the phone — once per reconnect, which for a
     * device that cannot hold a connection is every few seconds.
     */
    it('tells the tablet when the phone steps out', async () => {
      const { alice, channelId, phone, tablet } = await twoDevices();
      await enter(tablet, channelId, alice.account.id);
      await phone.next('displaced');
      phone.received.length = 0;
      tablet.received.length = 0;

      // The tablet is the one standing there, so it is the one that leaves;
      // the phone is displaced already and has nothing to give up.
      tablet.send({
        type: 'channel.action',
        channelId,
        action: { type: 'STEP_OUT' },
      });
      await tablet.next('channel', (m) => !m.view.channel.present.includes(alice.account.id));

      await phone.next('displaced');
      expect(sawDisplaced(tablet)).toBe(false);

      phone.close();
      tablet.close();
    });

    /**
     * **A declaration is not a departure**, and since 2026-09-09 it is
     * something anybody can make rather than a Labs experiment — so the case
     * that used to be unreachable is now an ordinary tap.
     *
     * Displacement corrects one belief and one only: that this account is
     * standing in a room. A phone making itself reachable in a channel it is
     * not in withdraws nothing, and the tablet holding a different room is
     * entitled to go on holding it. Told otherwise, it drops the room and goes
     * quiet because somebody tapped *Be nearby* somewhere else entirely.
     */
    it('says nothing to other devices when nearby is declared from outside', async () => {
      const { alice, channelId, phone, tablet } = await twoDevices();
      // A second channel, and the tablet standing in *that* one — which is the
      // whole of the case. The phone is about to make itself reachable
      // somewhere the account is not, and nothing about where the tablet is
      // standing has changed.
      const created = await app.fastify.inject({
        method: 'POST',
        url: '/channels',
        headers: auth(alice.token),
        payload: {},
      });
      const elsewhere = (created.json() as { channelId: string }).channelId;
      await enter(tablet, elsewhere, alice.account.id);
      tablet.received.length = 0;

      phone.send({
        type: 'channel.action',
        channelId,
        action: { type: 'DECLARE_NEARBY' },
      });
      await phone.next('channel', (m) =>
        m.view.channel.waiting.includes(alice.account.id)
      );
      // And stepping out of *Nearby* again is the same: it is a departure from
      // a rung nobody else can be standing on.
      phone.send({
        type: 'channel.action',
        channelId,
        action: { type: 'STEP_OUT' },
      });
      await phone.next('channel', (m) =>
        !m.view.channel.waiting.includes(alice.account.id)
      );

      expect(sawDisplaced(tablet)).toBe(false);
      expect(app.channels.get(elsewhere)!.present).toContain(alice.account.id);

      phone.close();
      tablet.close();
    });

    /**
     * The same for leaving the channel outright, which gives up presence on
     * the way past. Keyed on the action rather than on a change of presence
     * for the reason ENTER is: a session's belief is about what it would do
     * next, and it is made wrong whether or not the roster moved.
     */
    /**
     * **Two tabs, one token, and the case the token key could not see.**
     *
     * A browser shares `localStorage` across tabs of an origin, so a second
     * tab is a second session holding the *same* credential — which the skip
     * above reads as the same device and leaves alone. Both then sit in the
     * room under one identity, the media plane admits one of them, and the
     * pair trade the conversation back and forth. See
     * planning/TWO-DEVICES-WALK.md.
     *
     * Both tabs are Alice's own token deliberately. Minting a second session
     * would test something that already worked.
     */
    it('displaces a second tab sharing one token', async () => {
      const { alice, channelId } = await pairInSession();
      const first = new Client(alice.token, baseUrl, undefined, 'tab-one');
      const second = new Client(alice.token, baseUrl, undefined, 'tab-two');
      await Promise.all([first.open(), second.open()]);
      await Promise.all([first.next('hello'), second.next('hello')]);

      await enter(first, channelId, alice.account.id);
      expect(sawDisplaced(first)).toBe(false);
      // The first tab entering displaced the second, which is the same rule
      // running the other way and is exactly what used not to happen. Cleared
      // so that what is asserted below is the second tab's own turn.
      await second.next('displaced');
      first.received.length = 0;
      second.received.length = 0;

      await enter(second, channelId, alice.account.id);
      await first.next('displaced');
      expect(sawDisplaced(second)).toBe(false);
      // The account never left, which is the half that must not move: one
      // person's second tab is nobody else's event.
      expect(app.channels.get(channelId)!.present).toContain(alice.account.id);

      first.close();
      second.close();
    });

    /**
     * The flap guard, now that the key is the device rather than the token.
     * The same trap the token test above describes — a reconnecting client
     * holding two sockets for a moment and re-sending ENTER on the new one —
     * except that what has to survive the reconnection is the device name.
     */
    it('does not displace another socket naming the same device', async () => {
      const { alice, channelId } = await pairInSession();
      const stale = new Client(alice.token, baseUrl, undefined, 'one-phone');
      await stale.open();
      await stale.next('hello');
      const fresh = new Client(alice.token, baseUrl, undefined, 'one-phone');
      await fresh.open();
      await fresh.next('hello');

      await enter(fresh, channelId, alice.account.id);
      await fresh.next('channel');

      expect(sawDisplaced(stale)).toBe(false);
      expect(sawDisplaced(fresh)).toBe(false);

      stale.close();
      fresh.close();
    });

    /**
     * A device name is compared, never parsed, so there is no such thing as a
     * malformed one — but there is such a thing as an unbounded one, and the
     * bound is what this holds. Over the limit is read as no claim at all,
     * which puts the socket back on the token and so back on exactly the
     * behaviour of a build that predates the field.
     */
    it('ignores a device name too long to keep', async () => {
      const { alice, channelId } = await pairInSession();
      const huge = 'd'.repeat(200);
      const phone = new Client(alice.token, baseUrl, undefined, huge);
      const other = new Client(alice.token, baseUrl, undefined, huge);
      await Promise.all([phone.open(), other.open()]);
      await Promise.all([phone.next('hello'), other.next('hello')]);

      await enter(other, channelId, alice.account.id);
      await other.next('channel');

      // Neither named a device the server would keep, so both fell back to
      // the token they share and neither displaced the other.
      expect(sawDisplaced(phone)).toBe(false);

      phone.close();
      other.close();
    });

    /**
     * A device-naming client and a silent one on one token are two copies of
     * the app, and the newer one saying so is not a reason to treat them as
     * one. This is the mixed-build case: a phone updated to name itself and a
     * tab that has not been reloaded since.
     */
    it('separates a device-naming session from a silent one on the same token', async () => {
      const { alice, channelId } = await pairInSession();
      const silent = new Client(alice.token, baseUrl);
      const named = new Client(alice.token, baseUrl, undefined, 'new-tab');
      await Promise.all([silent.open(), named.open()]);
      await Promise.all([silent.next('hello'), named.next('hello')]);

      await enter(named, channelId, alice.account.id);
      await silent.next('displaced');
      expect(sawDisplaced(named)).toBe(false);

      silent.close();
      named.close();
    });

    it('tells the tablet when the phone leaves the channel', async () => {
      const { alice, channelId, phone, tablet } = await twoDevices();
      await enter(tablet, channelId, alice.account.id);
      await phone.next('displaced');
      tablet.received.length = 0;
      phone.received.length = 0;

      tablet.send({
        type: 'channel.action',
        channelId,
        action: { type: 'LEAVE_CHANNEL' },
      });

      await phone.next('displaced');

      phone.close();
      tablet.close();
    });
  });

  describe('evidence that somebody is still in a channel', () => {
    // See `sweepMs`: these step `clock` by thirty seconds to stand in for
    // half a minute of heartbeats and then wait on a pong, and the client
    // they use names no build — so the sweep judges it against
    // `HEARTBEAT_TIMEOUT_LEGACY_MS`, twelve, and terminates it mid-wait
    // unless the sweep is out of the way. That was `timed out waiting for
    // pong` in this block, roughly one run in three.
    beforeAll(pauseSweep);
    afterAll(resumeSweep);

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
    // See `sweepMs`: these jump the clock past the budget and expect the
    // socket to live, which only the long interval makes deterministic.
    beforeAll(pauseSweep);
    afterAll(resumeSweep);

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
    // See `sweepMs`: these jump the clock past the budget and expect the
    // socket to live, which only the long interval makes deterministic.
    beforeAll(pauseSweep);
    afterAll(resumeSweep);

    /**
     * **Most of these clients name no build, and that is load-bearing here.**
     * A socket claiming nothing is an install too old to report attention, so
     * it vouches for its owner by existing — which is what every device did
     * before 2026-09-25 and is the fallback `ACCOUNT_ATTENTION_BUILD` gates.
     * So the transition tests below go on describing the old rule, correctly,
     * about the population that still lives under it. The ones that claim a
     * build are the new rule.
     */

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
    });

    it('counts attention rather than the socket, for a build that reports', async () => {
      // The defect this whole mechanism is for. Alice's client stays connected
      // and stops being attended; before 2026-09-25 her row said *In the app
      // now* for as long as the machine was awake, which is what it said about
      // a desktop client nobody was sitting at for hours.
      const { alice, bob } = await pairInSession();
      const a = new Client(alice.token, baseUrl, ACCOUNT_ATTENTION_BUILD);
      await a.open();

      const attended = clock;
      a.send({ type: 'attentive', channelIds: [] });
      const b = new Client(bob.token, baseUrl);
      await b.open();
      b.send({ type: 'watch.home' });
      await aliceBecomes(b, alice.account.id, (row) => row.inApp === true);

      // Past the window, with the socket alive and heartbeating. Read over
      // HTTP rather than waited for, so that what is being asserted is the
      // predicate rather than the sweep — that is the test below.
      clock += ATTENTION_WINDOW_MS;
      a.send({ type: 'ping' });
      await a.next('pong');
      const home = await app.fastify.inject({
        method: 'GET',
        url: '/home',
        headers: auth(bob.token),
      });
      const { contacts } = home.json() as {
        contacts: Array<{
          account: { id: string };
          inApp?: boolean;
          lastSeenAt?: number | null;
        }>;
      };
      const row = contacts.find((c) => c.account.id === alice.account.id);
      expect(row?.inApp).toBe(false);
      // And the sentence under it counts from the same clock. The heartbeat a
      // moment ago must not be what it dates from: `agoOrNull`'s floor would
      // read that as being here and put the words back on the screen.
      expect(row?.lastSeenAt).toBe(attended);

      a.close();
      b.close();
    });

    it('is vouched for by a device too old to report', async () => {
      // The shim, and the population it is for: every install in the field
      // when this shipped either never sends attention or sends none while its
      // owner is on Home. Those go on being described by the socket.
      const { alice, bob } = await pairInSession();
      const a = new Client(alice.token, baseUrl, ACCOUNT_ATTENTION_BUILD - 1);
      await a.open();
      const b = new Client(bob.token, baseUrl);
      await b.open();
      b.send({ type: 'watch.home' });
      await aliceBecomes(b, alice.account.id, (row) => row.inApp === true);

      clock += ATTENTION_WINDOW_MS;
      a.send({ type: 'ping' });
      await a.next('pong');
      const home = await app.fastify.inject({
        method: 'GET',
        url: '/home',
        headers: auth(bob.token),
      });
      const { contacts } = home.json() as {
        contacts: Array<{ account: { id: string }; inApp?: boolean }>;
      };
      expect(
        contacts.find((c) => c.account.id === alice.account.id)?.inApp
      ).toBe(true);

      a.close();
      b.close();
    });

    it('is not asserted by a socket that has reported nothing', async () => {
      // A reporting build that has not reported: a phone in a pocket whose
      // socket came back after a deploy. Connecting is no longer an arrival,
      // so nothing is pushed and the row stays where it was.
      const { alice, bob } = await pairInSession();
      const b = new Client(bob.token, baseUrl);
      await b.open();
      b.send({ type: 'watch.home' });
      await b.next('home');

      const a = new Client(alice.token, baseUrl, ACCOUNT_ATTENTION_BUILD);
      await a.open();
      await a.next('hello');
      await sweeps();
      // Every snapshot, rather than a count of them: a connection seeds the
      // *channel* attention of the rooms it is standing in, which emits and
      // regenerates the Home of everybody in them. So Bob may well be sent
      // one; what he must never be sent is one saying Alice is here.
      const said = b.received.flatMap((m) =>
        m.type === 'home'
          ? m.home.contacts.filter((c) => c.account.id === alice.account.id)
          : []
      );
      expect(said.length).toBeGreaterThan(0);
      expect(said.some((row) => row.inApp === true)).toBe(false);

      // And the report is what makes her news — naming no room at all, which
      // is the message the client used to drop.
      a.send({ type: 'attentive', channelIds: [] });
      const arrived = await aliceBecomes(
        b,
        alice.account.id,
        (row) => row.inApp === true
      );
      expect(arrived?.inApp).toBe(true);

      a.close();
      b.close();
    });

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

  /**
   * The window running out, which is the one change to this fact that nothing
   * announces on its own.
   *
   * **Its own block, because it needs the sweep** — the block above pauses it,
   * and this is the only thing in the file that waits on one doing work rather
   * than on it staying out of the way.
   */
  describe('attention running out under a live socket', () => {
    /** How many pongs this client has been sent. */
    const pongs = (c: Client) =>
      c.received.filter((m) => m.type === 'pong').length;

    /** Sends a ping and waits for the answer, so `lastSeen` has moved. */
    const beat = async (clients: Client[]) => {
      const before = clients.map(pongs);
      for (const c of clients) c.send({ type: 'ping' });
      for (const [i, c] of clients.entries()) {
        while (pongs(c) <= before[i]) {
          await new Promise((r) => setImmediate(r));
        }
      }
    };

    /**
     * Carries these clients through `ms` of fake time, alive and never
     * attending.
     *
     * **In steps inside the silence budget, which is the whole of why this is a
     * loop.** One jump of fifteen minutes is a socket that has stopped
     * heartbeating, and the sweep terminates it — so the test would pass
     * through the close handler and prove nothing about the window. Stepping by
     * less than the *shortest* budget on the list means no socket is ever once
     * overdue, and there is no race to lose: `lastSeen` is at most one step
     * behind `clock` at every point a sweep can fire.
     *
     * **Every client on the list, the watcher included.** The first version of
     * this beat only the person being described, and the sweep duly terminated
     * the contact who was watching her — so the snapshot this is waiting for
     * was composed and sent to a socket that had gone.
     *
     * A ping is deliberately not attention. It is the heartbeat of a machine,
     * which is exactly the evidence that stopped being enough.
     */
    const aliveButAway = async (clients: Client[], ms: number) => {
      const step = HEARTBEAT_TIMEOUT_MS - 1_000;
      for (let spent = 0; spent < ms; spent += step) {
        clock += step;
        await beat(clients);
      }
    };

    it('tells her contacts, with nobody having asked', async () => {
      const { alice, bob } = await pairInSession();
      const a = new Client(alice.token, baseUrl, ACCOUNT_ATTENTION_BUILD);
      await a.open();
      a.send({ type: 'attentive', channelIds: [] });

      const b = new Client(bob.token, baseUrl);
      await b.open();
      b.send({ type: 'watch.home' });
      await b.next('home', (m) => {
        const row = m.home.contacts.find((c) => c.account.id === alice.account.id);
        return row?.inApp === true;
      });

      // Bob does nothing at all from here, and neither does Alice's client
      // beyond staying alive. Before this the two of them could sit like that
      // for hours with Bob's screen saying she was here.
      await aliveButAway([a, b], ATTENTION_WINDOW_MS + HEARTBEAT_TIMEOUT_MS);
      const gone = await b.next('home', (m) => {
        const row = m.home.contacts.find((c) => c.account.id === alice.account.id);
        return row !== undefined && row.inApp === false;
      });
      expect(
        gone.home.contacts.find((c) => c.account.id === alice.account.id)?.inApp
      ).toBe(false);

      // And her socket is still there, which is what makes this the window
      // rather than the sweep's other job.
      await beat([a]);

      // Said once, not once per sweep. The ledger is what makes the fact cost
      // one snapshot however long somebody stays away.
      const falses = b.received.filter(
        (m) =>
          m.type === 'home' &&
          m.home.contacts.find((c) => c.account.id === alice.account.id)
            ?.inApp === false
      ).length;
      expect(falses).toBe(1);

      a.close();
      b.close();
    });

    it('starts again from the next report', async () => {
      const { alice, bob } = await pairInSession();
      const a = new Client(alice.token, baseUrl, ACCOUNT_ATTENTION_BUILD);
      await a.open();
      a.send({ type: 'attentive', channelIds: [] });
      const b = new Client(bob.token, baseUrl);
      await b.open();
      b.send({ type: 'watch.home' });
      await b.next('home', (m) => {
        const row = m.home.contacts.find((c) => c.account.id === alice.account.id);
        return row?.inApp === true;
      });

      await aliveButAway([a, b], ATTENTION_WINDOW_MS + HEARTBEAT_TIMEOUT_MS);
      await b.next('home', (m) => {
        const row = m.home.contacts.find((c) => c.account.id === alice.account.id);
        return row?.inApp === false;
      });

      // Somebody picking their phone back up. The stamp moves, and the second
      // edge costs a snapshot exactly as the first did.
      const falses = b.received.filter(
        (m) =>
          m.type === 'home' &&
          m.home.contacts.find((c) => c.account.id === alice.account.id)
            ?.inApp === false
      ).length;
      a.send({ type: 'attentive', channelIds: [] });
      const back = await b.next('home', (m) => {
        const row = m.home.contacts.find((c) => c.account.id === alice.account.id);
        return row?.inApp === true;
      });
      expect(
        back.home.contacts.find((c) => c.account.id === alice.account.id)?.inApp
      ).toBe(true);
      expect(falses).toBe(1);

      a.close();
      b.close();
    });
  });
});

/**
 * **A new session says where it is standing, or it is not standing anywhere.**
 *
 * The grace period waits out a timeout because a quiet socket is ambiguous —
 * the connection may be coming back, and the ordinary reconnect re-asserts
 * `ENTER` inside the minute and keeps the place. A *fresh* process is not
 * ambiguous: it is the thing the grace was waiting for, and if it claims
 * nothing in `REENTRY_MS` the answer to where its owner is standing is
 * *nowhere*.
 *
 * **What the unclaimed minute was costing.** `isPresent` is the account's, and
 * every guard over the shared features reads it, while the screen's own rung
 * is the account's *and* this device's. So a phone that had force-quit and
 * reopened could play, pause, seek and stop the film the room was watching
 * from a screen whose footer read *Out* — reported from a phone, and the
 * reason this window exists. The consequence is asserted in `presence.test.ts`
 * § *a grace a new session did not claim*; what is asserted here is the socket
 * that ends it.
 */
describe('a session that claims nothing', () => {
  it('ends the grace its account was still standing on', async () => {
    const { alice, bob, channelId } = await pairInSession();
    const a = new Client(alice.token, baseUrl);
    const b = new Client(bob.token, baseUrl);
    await Promise.all([a.open(), b.open()]);

    a.send({ type: 'watch.channel', channelId });
    b.send({ type: 'channel.action', channelId, action: { type: 'ENTER' } });
    await b.next('channel', (m) => m.view.channel.present.length === 2);

    // The force quit. The socket goes, the grace starts, and the account is
    // still in the room — which is the state the whole of this is about.
    b.close();
    await new Promise((r) => setTimeout(r, 200));
    expect(app.channels.get(channelId)!.disconnectedAt[bob.account.id]).toBeDefined();
    expect(app.channels.get(channelId)!.present).toContain(bob.account.id);

    // The app reopened. A new process has no `enteredChannel` to re-assert, so
    // it watches the channel and says nothing about standing in it.
    const again = new Client(bob.token, baseUrl);
    await again.open();
    again.send({ type: 'watch.channel', channelId });
    await again.next('channel');

    // Inside the window, nothing has been judged: a claim may still arrive.
    expect(app.channels.get(channelId)!.present).toContain(bob.account.id);

    clock += REENTRY_MS;
    await sweeps();

    // *Nearby*, which is the ordinary way out of a dropped connection. Well
    // short of DISCONNECT_GRACE_MS, which is the point.
    const channel = app.channels.get(channelId)!;
    expect(channel.present).not.toContain(bob.account.id);
    expect(channel.waiting).toContain(bob.account.id);
    a.close();
    again.close();
  });

  it('leaves a session that does claim its room alone', async () => {
    // The reconnect the grace was written for: the same client comes back and
    // re-asserts `ENTER` from what it believed before the drop. Nothing here
    // may touch that, or every blip becomes a departure.
    const { alice, bob, channelId } = await pairInSession();
    const a = new Client(alice.token, baseUrl);
    const b = new Client(bob.token, baseUrl);
    await Promise.all([a.open(), b.open()]);

    a.send({ type: 'watch.channel', channelId });
    b.send({ type: 'channel.action', channelId, action: { type: 'ENTER' } });
    await b.next('channel', (m) => m.view.channel.present.length === 2);

    b.close();
    await new Promise((r) => setTimeout(r, 200));

    const again = new Client(bob.token, baseUrl);
    await again.open();
    again.send({ type: 'channel.action', channelId, action: { type: 'ENTER' } });
    await again.next('channel', (m) => m.view.channel.present.length === 2);

    clock += REENTRY_MS;
    await sweeps();

    expect(app.channels.get(channelId)!.present).toContain(bob.account.id);
    a.close();
    again.close();
  });

  it('leaves a room another device of the account is standing in', async () => {
    // Two devices, one voice: the laptop connecting says nothing about the
    // phone that is genuinely in the room. The judgement is per account, so
    // the phone's `standing` is what answers for the channel.
    const { alice, bob, channelId } = await pairInSession();
    const a = new Client(alice.token, baseUrl);
    const phone = new Client(bob.token, baseUrl);
    await Promise.all([a.open(), phone.open()]);

    a.send({ type: 'watch.channel', channelId });
    phone.send({ type: 'channel.action', channelId, action: { type: 'ENTER' } });
    await phone.next('channel', (m) => m.view.channel.present.length === 2);

    const laptop = new Client(bob.token, baseUrl);
    await laptop.open();
    laptop.send({ type: 'watch.channel', channelId });
    await laptop.next('channel');

    clock += REENTRY_MS;
    await sweeps();

    expect(app.channels.get(channelId)!.present).toContain(bob.account.id);
    a.close();
    phone.close();
    laptop.close();
  });
});
