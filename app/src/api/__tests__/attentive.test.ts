/**
 * What an attention report is allowed to be about.
 *
 * It used to be about rooms and nothing else, and dropped itself when there
 * were none — so somebody on Home, standing nowhere, told the server nothing
 * whatsoever about being there. That is the population whose contact row said
 * *In the app now* on the strength of a socket, which said it about a desktop
 * client nobody was sitting at. See `SocketClient.attentive` and
 * `ACCOUNT_ATTENTION_BUILD`.
 */

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 3;

class FakeSocket {
  static live: FakeSocket[] = [];
  static OPEN = OPEN;
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
});

function connected() {
  const { Realtime } = load();
  const realtime = new Realtime();
  opened.push(realtime);
  realtime.connect('token', {});
  const socket = FakeSocket.live[0]!;
  socket.finishHandshake();
  return { realtime, socket };
}

it('sends a report that names no room at all', () => {
  const { realtime, socket } = connected();

  expect(realtime.attentive([])).toBe(true);
  expect(messagesOf(socket)).toContainEqual({
    type: 'attentive',
    channelIds: [],
  });
});

it('sends the rooms when there are some', () => {
  const { realtime, socket } = connected();

  expect(realtime.attentive(['chan_1', 'chan_2'])).toBe(true);
  expect(messagesOf(socket)).toContainEqual({
    type: 'attentive',
    channelIds: ['chan_1', 'chan_2'],
  });
});

it('drops it when there is no socket, and says so', () => {
  // Evidence about a moment that has passed, unlike an action: there is
  // nothing worth replaying, and the answer is what stops the caller's
  // rate-limit gate advancing on a message nobody received.
  const { Realtime } = load();
  const realtime = new Realtime();
  opened.push(realtime);
  realtime.connect('token', {});
  const socket = FakeSocket.live[0]!;

  expect(socket.readyState).toBe(CONNECTING);
  expect(realtime.attentive([])).toBe(false);
  expect(messagesOf(socket)).toEqual([]);
});
