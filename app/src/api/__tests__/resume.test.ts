/**
 * Coming back to the foreground.
 *
 * iOS suspends the process without telling anyone: the socket does not
 * survive, the timers that would notice were themselves suspended, and
 * `onclose` may not arrive until the process runs again. Nothing in the app
 * listened for the return, so the first sign of trouble was a heartbeat
 * failing up to twelve seconds later — stale channels shown as live until
 * then, and the warning arriving just as the user came back.
 */

const OPEN = 1;
const CLOSED = 3;

class FakeSocket {
  static live: FakeSocket[] = [];
  static OPEN = OPEN;
  readyState = OPEN;
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

  /** What iOS does: the socket stops working, nobody is told. */
  die() {
    this.readyState = CLOSED;
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
  socket.sent.map((s) => JSON.parse(s) as { type: string });

/** Disconnected in afterEach: a live heartbeat outlives the test otherwise. */
const opened: Array<{ disconnect: () => void }> = [];

afterEach(() => {
  for (const realtime of opened) realtime.disconnect();
  opened.length = 0;
  jest.useRealTimers();
  delete (globalThis as { WebSocket?: unknown }).WebSocket;
});

function realtimeFor(token = 'token') {
  const { Realtime } = load();
  const realtime = new Realtime();
  opened.push(realtime);
  realtime.connect(token, {});
  return realtime;
}

function connected() {
  const realtime = realtimeFor();
  const socket = FakeSocket.live[0];
  socket.onopen!();
  return { realtime, socket };
}

describe('resuming', () => {
  it('replaces a socket that died while the app was suspended', () => {
    const { realtime, socket } = connected();
    socket.die();

    realtime.resume();

    expect(FakeSocket.live).toHaveLength(2);
    expect(FakeSocket.live[1].url).toContain('token');
  });

  it('probes one that still looks open rather than trusting it', () => {
    // Cheap, and the alternative is believing a corpse. If nothing answers,
    // the heartbeat closes it as it would any other silence.
    const { realtime, socket } = connected();
    socket.sent.length = 0;

    realtime.resume();

    expect(FakeSocket.live).toHaveLength(1);
    expect(messagesOf(socket)).toEqual([{ type: 'ping' }]);
  });

  it('does not wait out a backoff earned on another network', () => {
    jest.useFakeTimers();
    const realtime = realtimeFor();

    // Several failures, so the pending retry is some way off — a delay earned
    // in a network condition the phone may no longer be in.
    for (let i = 0; i < 3; i += 1) {
      FakeSocket.live[FakeSocket.live.length - 1].onclose!({});
      jest.runOnlyPendingTimers();
    }
    FakeSocket.live[FakeSocket.live.length - 1].onclose!({});
    const attempts = FakeSocket.live.length;

    realtime.resume();

    // Reconnected now, and the retry it pre-empted does not fire a second one.
    expect(FakeSocket.live.length).toBe(attempts + 1);
    jest.runOnlyPendingTimers();
    expect(FakeSocket.live.length).toBe(attempts + 1);
  });

  it('stays quiet when the app was signed out rather than backgrounded', () => {
    const { realtime } = connected();
    realtime.disconnect();
    const attempts = FakeSocket.live.length;

    realtime.resume();

    expect(FakeSocket.live.length).toBe(attempts);
  });

  it('restores what it was watching, as any reconnect does', () => {
    const { realtime, socket } = connected();
    realtime.watchHome();
    realtime.act('chan_1', { type: 'ENTER' });
    socket.die();

    realtime.resume();
    const replacement = FakeSocket.live[1];
    replacement.onopen!();

    const types = messagesOf(replacement).map((m) => m.type);
    expect(types).toContain('watch.home');
    expect(types).toContain('channel.action');
  });
});
