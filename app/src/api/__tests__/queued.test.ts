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
  jest.advanceTimersByTime(11_000);
  socket.finishHandshake();

  const actions = messagesOf(socket).filter((m) => m.type === 'channel.action');
  expect(actions).toHaveLength(0);
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
