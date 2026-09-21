/**
 * The screen declaration surviving the socket that carried it.
 *
 * `Connection.screening` dies with its socket on purpose — a screen that has
 * gone away has stopped showing anything — and nothing on this side ever said
 * it again. The role lives in `AppProvider`'s `screenFor`, the picture stays
 * mounted across a reconnect and the film resumes off the channel's clock, so
 * a device watching a film had no occasion to re-declare and no way to know it
 * needed to. From the drop onward the room's roster read *Present* at somebody
 * sitting in front of the film, which is the wrong answer to the one question
 * `ChannelView.watching` exists to answer. Seen on 2026-09-20, on two phones
 * that disagreed about who was watching.
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

const screeningIn = (socket: FakeSocket) =>
  messagesOf(socket).filter((m) => m.type === 'screens.showing');

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

/** The socket after the current one goes away, handshake finished. */
function reconnect(socket: FakeSocket): FakeSocket {
  socket.close();
  jest.advanceTimersByTime(2_000);
  const next = FakeSocket.live[FakeSocket.live.length - 1]!;
  next.finishHandshake();
  return next;
}

it('says it is showing a film again on the socket that replaces the one it said it on', () => {
  jest.useFakeTimers();
  const { realtime, socket } = connect();
  socket.finishHandshake();

  realtime.showingScreen('chan_1');
  expect(screeningIn(socket)).toHaveLength(1);

  const next = reconnect(socket);

  // Nothing on the device changed: the film is still on this screen, and the
  // person in front of it did nothing to say so twice.
  expect(screeningIn(next)).toEqual([
    { type: 'screens.showing', channelId: 'chan_1' },
  ]);
});

it('states a declaration that was made while the socket was down', () => {
  jest.useFakeTimers();
  const { realtime, socket } = connect();
  socket.finishHandshake();
  socket.close();

  // The foreground half of `AppProvider`'s retraction pair, which fires on the
  // way back from the background — exactly when the socket that went away
  // with it has not been replaced yet. `send` keeps only actions, so this
  // reached nothing at all and `onopen` had nothing to say it from.
  realtime.showingScreen('chan_1');

  jest.advanceTimersByTime(2_000);
  const next = FakeSocket.live[FakeSocket.live.length - 1]!;
  next.finishHandshake();

  expect(screeningIn(next)).toEqual([
    { type: 'screens.showing', channelId: 'chan_1' },
  ]);
});

it('does not re-state a declaration this device has given up', () => {
  jest.useFakeTimers();
  const { realtime, socket } = connect();
  socket.finishHandshake();

  realtime.showingScreen('chan_1');
  realtime.showingScreen(null);

  const next = reconnect(socket);

  // A retraction is the same kind of fact as the declaration and outlives the
  // socket the same way. Restoring one that has been withdrawn would take the
  // film back from whichever device it went to.
  expect(screeningIn(next)).toHaveLength(0);
});

it('declares the screen only after re-entering the room', () => {
  jest.useFakeTimers();
  const { realtime, socket } = connect();
  socket.finishHandshake();

  realtime.watchChannel('chan_1');
  realtime.act('chan_1', { type: 'ENTER' });
  realtime.showingScreen('chan_1');

  const next = reconnect(socket);

  // A snapshot saying somebody has the film up while saying they are not in
  // the room is a person the room cannot place.
  const types = messagesOf(next).map((m) => m.type);
  expect(types.indexOf('channel.action')).toBeLessThan(
    types.indexOf('screens.showing')
  );
  expect(types.indexOf('watch.channel')).toBeLessThan(
    types.indexOf('screens.showing')
  );
});

it('forgets the screen when the session ends', () => {
  jest.useFakeTimers();
  const { realtime, socket } = connect();
  socket.finishHandshake();
  realtime.showingScreen('chan_1');
  realtime.disconnect();

  // Signing out is not a gap to be bridged: whoever signs in next is not
  // showing this film. `connect` on the same instance is how a new session
  // starts, and it must not inherit one.
  realtime.connect('token', {});
  const next = FakeSocket.live[FakeSocket.live.length - 1]!;
  next.finishHandshake();

  expect(screeningIn(next)).toHaveLength(0);
});
