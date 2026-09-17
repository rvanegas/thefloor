/**
 * A hidden tab putting its socket down.
 *
 * Chrome parks a hidden tab's timers within about thirteen seconds and leaves
 * its socket open, which is a state no phone produces: alive on the wire and
 * unable to prove it. The server's sweep then terminates it every twenty
 * seconds for as long as the tab is open. So the tab is made to do
 * deliberately what iOS does to a backgrounded app incidentally — and, like a
 * phone, only when it is not holding audio, which the caller decides.
 *
 * See planning/decisions/2026-09-16-a-hidden-tab-is-a-backgrounded-app.md.
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

const last = () => FakeSocket.live[FakeSocket.live.length - 1];

/** Disconnected in afterEach: a live heartbeat outlives the test otherwise. */
const opened: Array<{ disconnect: () => void }> = [];

afterEach(() => {
  for (const realtime of opened) realtime.disconnect();
  opened.length = 0;
  jest.useRealTimers();
  delete (globalThis as { WebSocket?: unknown }).WebSocket;
});

function connected(handlers: Record<string, unknown> = {}) {
  const { Realtime } = load();
  const realtime = new Realtime();
  opened.push(realtime);
  realtime.connect('token', handlers);
  const socket = FakeSocket.live[0];
  socket.onopen!();
  return { realtime, socket };
}

describe('suspending a hidden tab', () => {
  it('closes the socket and opens no other', () => {
    jest.useFakeTimers();
    const { realtime, socket } = connected();

    realtime.suspend();

    expect(socket.readyState).toBe(CLOSED);
    jest.advanceTimersByTime(60_000);
    expect(FakeSocket.live).toHaveLength(1);
  });

  it('stops the heartbeat, which is the loop that was killing it', () => {
    jest.useFakeTimers();
    const { realtime, socket } = connected();

    realtime.suspend();
    socket.sent.length = 0;
    jest.advanceTimersByTime(60_000);

    expect(socket.sent).toEqual([]);
  });

  it('does not put the wall up behind a tab nobody is looking at', () => {
    // The offline screen is a report about an outage. Nothing is wrong here,
    // and announcing it would greet the person on their return.
    jest.useFakeTimers();
    const onOffline = jest.fn();
    const { realtime } = connected({ onOffline });

    realtime.suspend();
    jest.advanceTimersByTime(60_000);

    expect(onOffline).not.toHaveBeenCalledWith(true);
  });

  it('is idempotent, because visibilitychange promises nothing about how often it fires', () => {
    const { realtime } = connected();

    realtime.suspend();
    realtime.suspend();

    expect(FakeSocket.live).toHaveLength(1);
  });

  it('comes back on resume, restoring what the tab was doing', () => {
    const { realtime, socket } = connected();
    realtime.watchHome();
    realtime.watchChannel('chan_1');
    realtime.suspend();
    expect(socket.readyState).toBe(CLOSED);

    realtime.resume();
    const replacement = last();
    replacement.onopen!();

    expect(FakeSocket.live).toHaveLength(2);
    const types = messagesOf(replacement).map((m) => m.type);
    expect(types).toContain('watch.home');
    expect(types).toContain('watch.channel');
  });

  it('reconnects normally again once it is back', () => {
    // The suspension is a state, not a mode: a socket lost to the network
    // after the tab returns is an ordinary outage and retries as one.
    jest.useFakeTimers();
    const { realtime } = connected();

    realtime.suspend();
    realtime.resume();
    last().onopen!();
    const afterResume = FakeSocket.live.length;

    last().onclose!({});
    jest.advanceTimersByTime(60_000);

    expect(FakeSocket.live.length).toBeGreaterThan(afterResume);
  });

  it('does nothing to a session that was signed out rather than hidden', () => {
    const { realtime } = connected();
    realtime.disconnect();
    const attempts = FakeSocket.live.length;

    realtime.suspend();
    realtime.resume();

    expect(FakeSocket.live.length).toBe(attempts);
  });
});
