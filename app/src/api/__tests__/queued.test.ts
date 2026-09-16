/**
 * Actions taken while the socket is not open.
 *
 * `send` dropped anything it could not write, with no queue and no way for the
 * caller to hear about it. So a tap landing between arriving in a channel and
 * the handshake completing produced nothing at all: no row on the server, no
 * state change, no error, and a button that appeared not to work. Two
 * recordings were lost that way on 2026-08-16 before anyone understood why the
 * same tap worked a minute later.
 */

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 3;

class FakeSocket {
  static live: FakeSocket[] = [];
  static OPEN = OPEN;
  /** Starts where a real one does: not yet usable. */
  readyState = CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event?: { code?: number }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.live.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = CLOSED;
    this.onclose?.({});
  }

  /** The handshake completing, which is the moment the gap closes. */
  finishHandshake() {
    this.readyState = OPEN;
    this.onopen?.();
  }
}

function load() {
  jest.resetModules();
  process.env.EXPO_PUBLIC_API_URL = 'http://test.local';
  FakeSocket.live = [];
  (globalThis as { WebSocket?: unknown }).WebSocket = FakeSocket;
  return require('../socket') as typeof import('../socket');
}

const messagesOf = (socket: FakeSocket) =>
  socket.sent.map((s) => JSON.parse(s) as Record<string, unknown>);

const opened: Array<{ disconnect: () => void }> = [];

afterEach(() => {
  for (const realtime of opened) realtime.disconnect();
  opened.length = 0;
  jest.useRealTimers();
});

function connect() {
  const { Realtime } = load();
  const realtime = new Realtime();
  opened.push(realtime);
  realtime.connect('token', {});
  return { realtime, socket: FakeSocket.live[0]! };
}

it('sends an action taken before the handshake finished', () => {
  const { realtime, socket } = connect();

  // The socket exists but is not usable yet — precisely the window a thumb
  // lands in after tapping into a channel.
  expect(socket.readyState).toBe(CONNECTING);
  realtime.act('chan_1', { type: 'START_RECORDING' });
  expect(socket.sent).toHaveLength(0);

  socket.finishHandshake();

  const actions = messagesOf(socket).filter((m) => m.type === 'channel.action');
  expect(actions).toContainEqual({
    type: 'channel.action',
    channelId: 'chan_1',
    action: { type: 'START_RECORDING' },
  });
});

it('does not replay an action that has gone stale', () => {
  jest.useFakeTimers();
  const { realtime, socket } = connect();

  realtime.act('chan_1', { type: 'CLAIM_FLOOR' });
  // Longer than any reconnect that was going to succeed. Claiming the floor a
  // minute late would take it in a conversation that has moved on.
  //
  // **Expiry is global rather than per-action since 2026-09-16**, so what
  // discards this is the app going offline rather than a filter in
  // `flushQueued` reading each entry's own age. The two are the same event on
  // purpose: the wall that goes up here is the only notice these actions ever
  // get. See planning/decisions/2026-09-16-being-offline-is-one-state.md.
  jest.advanceTimersByTime(11_000);
  socket.finishHandshake();

  const actions = messagesOf(socket).filter((m) => m.type === 'channel.action');
  expect(actions).toHaveLength(0);
});

it('reports offline once the window has run out, and back on reconnect', () => {
  jest.useFakeTimers();
  const { Realtime } = load();
  const realtime = new Realtime();
  opened.push(realtime);
  const seen: boolean[] = [];
  realtime.connect('token', { onOffline: (offline) => seen.push(offline) });
  const socket = FakeSocket.live[0]!;

  // Inside the window nothing is said: the socket drops on every foreground,
  // and an outage that resolves itself was never worth a screen.
  jest.advanceTimersByTime(9_000);
  expect(seen).toEqual([]);

  jest.advanceTimersByTime(2_000);
  expect(seen).toEqual([true]);

  socket.finishHandshake();
  expect(seen).toEqual([true, false]);
});

it('says whether an action reached the socket', () => {
  const { realtime, socket } = connect();

  // Queued, not written — the handshake has not finished. `false` is what
  // stops a screen recording this as done.
  expect(realtime.act('chan_1', { type: 'CLAIM_FLOOR' })).toBe(false);

  socket.finishHandshake();
  expect(realtime.act('chan_1', { type: 'RELEASE_FLOOR' })).toBe(true);
});

it('retries inside the window faster than the backoff would', () => {
  jest.useFakeTimers();
  const { socket } = connect();
  socket.finishHandshake();
  socket.close();

  // Every attempt fails the moment it is made, which is what a server that is
  // still restarting looks like. Stepped rather than advanced in one jump
  // because the retry loop is driven by each attempt's own close.
  for (let elapsed = 0; elapsed < 8_000; elapsed += 100) {
    jest.advanceTimersByTime(100);
    const newest = FakeSocket.live[FakeSocket.live.length - 1]!;
    if (newest.readyState === CONNECTING) newest.close();
  }

  // The old schedule reached its fourth attempt at 7.5s and its fifth at
  // 15.5s, so a server back at eight seconds was met by a client that had
  // already discarded the queue and would not knock again for another seven.
  // A fixed second inside the window — 0.75 to 1.25 with jitter — is at least
  // six attempts in the same span.
  expect(FakeSocket.live.length).toBeGreaterThanOrEqual(6);
});

it('restores what it was watching before replaying anything', () => {
  const { realtime, socket } = connect();

  realtime.watchChannel('chan_1');
  realtime.act('chan_1', { type: 'START_RECORDING' });
  socket.finishHandshake();

  const types = messagesOf(socket).map((m) => m.type);
  expect(types.indexOf('watch.channel')).toBeLessThan(
    types.indexOf('channel.action')
  );
});

it('does not queue an ENTER, which the reconnect re-sends by itself', () => {
  const { realtime, socket } = connect();

  realtime.act('chan_1', { type: 'ENTER' });
  socket.finishHandshake();

  const enters = messagesOf(socket).filter(
    (m) =>
      m.type === 'channel.action' &&
      (m.action as { type?: string } | undefined)?.type === 'ENTER'
  );
  expect(enters).toHaveLength(1);
});

it('drops what was waiting when the session ends', () => {
  const { realtime, socket } = connect();

  realtime.act('chan_1', { type: 'START_RECORDING' });
  realtime.disconnect();

  // A second session, on the same instance, must not act on the first's taps.
  realtime.connect('another-token', {});
  const next = FakeSocket.live[1]!;
  next.finishHandshake();

  const actions = messagesOf(next).filter((m) => m.type === 'channel.action');
  expect(actions).toHaveLength(0);
  expect(socket.sent).toHaveLength(0);
});
