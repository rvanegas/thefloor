/**
 * A socket that has been replaced, and a tap that will not wait for one.
 *
 * Both are about the same symptom, reported on 2026-08-24 as stepping out
 * being "so slow that one isn't sure the button was pressed". Nothing in the
 * step-out path waits on the server — the app fires the action, drops the
 * channel and navigates — so a delay there is not a slow round trip. It is the
 * socket not being open at the moment of the tap, which makes the action queue
 * until the next connection: up to ten seconds, and dropped entirely past
 * that, with nothing on screen either way.
 *
 * The two halves are the two ways that happens. A replaced socket goes on
 * delivering events, and its close used to tear down whatever had taken its
 * place — leaving an open connection nothing referenced and a reconnect on
 * every backoff. And the backoff itself, which is right for a client failing
 * on its own and wrong the moment somebody presses a button.
 */

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 3;

class FakeSocket {
  static live: FakeSocket[] = [];
  static OPEN = OPEN;
  static CONNECTING = CONNECTING;
  readyState = OPEN;
  sent: string[] = [];
  closed = false;
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
    this.closed = true;
    this.readyState = CLOSED;
    this.onclose?.({});
  }

  /** Still negotiating, which is what a handshake in flight looks like. */
  connecting() {
    this.readyState = CONNECTING;
    return this;
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

const opened: Array<{ disconnect: () => void }> = [];

afterEach(() => {
  for (const realtime of opened) realtime.disconnect();
  opened.length = 0;
  jest.useRealTimers();
  delete (globalThis as { WebSocket?: unknown }).WebSocket;
});

function realtimeFor(handlers: Record<string, unknown> = {}) {
  const { Realtime } = load();
  const realtime = new Realtime();
  opened.push(realtime);
  realtime.connect('token', handlers);
  return realtime;
}

const last = () => FakeSocket.live[FakeSocket.live.length - 1];

describe('a socket that has been replaced', () => {
  /**
   * The shape that produced the bug: `resume` opens a replacement while the
   * previous handshake is still in flight, and the loser's close arrives
   * afterwards. It has nothing to say about the connection now in use.
   */
  function replaced() {
    const realtime = realtimeFor();
    const first = last().connecting();
    realtime.resume();
    const second = last();
    second.onopen!();
    return { realtime, first, second };
  }

  it('does not report the live connection down when the old one closes', () => {
    const statuses: string[] = [];
    const realtime = realtimeFor({ onStatus: (s: string) => statuses.push(s) });
    const first = last().connecting();
    realtime.resume();
    last().onopen!();
    statuses.length = 0;

    first.onclose!({});

    expect(statuses).toEqual([]);
  });

  it('does not reconnect on the strength of it', () => {
    jest.useFakeTimers();
    const { first } = replaced();
    const sockets = FakeSocket.live.length;

    first.onclose!({});
    jest.runOnlyPendingTimers();

    expect(FakeSocket.live.length).toBe(sockets);
  });

  it('leaves the live socket carrying what is sent', () => {
    const { realtime, first, second } = replaced();
    first.onclose!({});
    second.sent.length = 0;

    realtime.act('chan_a', { type: 'STEP_OUT' });

    // Written rather than queued, which is the whole difference: the old
    // behaviour nulled the live socket here, and everything after it waited
    // for a connection that already existed.
    expect(messagesOf(second).map((m) => m.type)).toEqual(['channel.action']);
  });

  it('closes the one it replaces rather than leaving it open', () => {
    const { first } = replaced();

    // Otherwise the server carries it until the sweep and the phone until the
    // process ends, and neither end knows it is nobody's.
    expect(first.closed).toBe(true);
  });

  /**
   * A refused credential is the exception, and deliberately: every socket this
   * client opens carries the same token, so one of them being told the token
   * is dead settles it for all of them, whichever socket heard it.
   */
  it('still treats an unauthorized close as final, whichever socket heard it', () => {
    jest.useFakeTimers();
    const { first } = replaced();
    const sockets = FakeSocket.live.length;

    first.onclose!({ code: 4401 });
    jest.runOnlyPendingTimers();

    expect(FakeSocket.live.length).toBe(sockets);
  });
});

describe('an action taken while the socket is down', () => {
  /** Enough failures that the pending retry is at the ten-second cap. */
  function backedOff() {
    jest.useFakeTimers();
    const realtime = realtimeFor();
    for (let i = 0; i < 6; i += 1) {
      last().onclose!({});
      jest.runOnlyPendingTimers();
    }
    last().onclose!({});
    return realtime;
  }

  it('reconnects at once rather than waiting out the backoff', () => {
    const realtime = backedOff();
    const attempts = FakeSocket.live.length;

    realtime.act('chan_a', { type: 'STEP_OUT' });

    expect(FakeSocket.live.length).toBe(attempts + 1);
  });

  it('sends what was taken as soon as that connection opens', () => {
    const realtime = backedOff();

    realtime.act('chan_a', { type: 'STEP_OUT' });
    last().onopen!();

    expect(messagesOf(last())).toContainEqual({
      type: 'channel.action',
      channelId: 'chan_a',
      action: { type: 'STEP_OUT' },
    });
  });

  it('does not fire the retry it pre-empted as well', () => {
    const realtime = backedOff();
    realtime.act('chan_a', { type: 'STEP_OUT' });
    const attempts = FakeSocket.live.length;

    jest.runOnlyPendingTimers();

    expect(FakeSocket.live.length).toBe(attempts);
  });

  /**
   * A tap is not evidence that the network has changed, so a handshake that
   * may be about to succeed is left alone — restarting it would push the thing
   * being asked for further away, once per tap.
   */
  it('leaves a handshake already in flight alone', () => {
    const realtime = realtimeFor();
    last().connecting();
    const attempts = FakeSocket.live.length;

    realtime.act('chan_a', { type: 'STEP_OUT' });

    expect(FakeSocket.live.length).toBe(attempts);
  });

  it('stays quiet once the app has signed out', () => {
    const realtime = realtimeFor();
    realtime.disconnect();
    const attempts = FakeSocket.live.length;

    realtime.act('chan_a', { type: 'STEP_OUT' });

    expect(FakeSocket.live.length).toBe(attempts);
  });
});

describe('re-entering on a reconnect', () => {
  const reEntries = (socket: FakeSocket) =>
    messagesOf(socket).filter((m) => m.type === 'channel.action');

  /**
   * In a channel, then the socket dies, then `gone` milliseconds pass before
   * the retry gets a connection. Returns the socket that connection is on,
   * which is the one whose `onopen` decides whether to walk back in.
   */
  function backAfter(gone: number) {
    jest.useFakeTimers();
    jest.setSystemTime(1_000);
    const realtime = realtimeFor();
    const first = last();
    first.onopen!();
    realtime.act('chan_a', { type: 'ENTER' });
    first.onclose!({});

    jest.setSystemTime(1_000 + gone);
    jest.runOnlyPendingTimers();
    const second = last();
    second.onopen!();
    return { realtime, second };
  }

  it('walks back in when the gap was inside the grace period', () => {
    const { second } = backAfter(30_000);

    expect(reEntries(second)).toEqual([
      { type: 'channel.action', channelId: 'chan_a', action: { type: 'ENTER' } },
    ]);
  });

  /**
   * Past the grace period the server stepped this person out a while ago and
   * everybody in the room watched them go — and with several sessions per
   * account, the account may have entered somewhere else since. Walking back
   * in would be this client asserting a stale belief over what has happened.
   */
  it('does not, once the server has long since stepped them out', () => {
    const { second } = backAfter(61_000);

    expect(reEntries(second)).toEqual([]);
  });

  it('forgets it for good, rather than re-entering on the connection after', () => {
    const { second } = backAfter(61_000);

    second.onclose!({});
    jest.runOnlyPendingTimers();
    const third = last();
    third.onopen!();

    expect(reEntries(third)).toEqual([]);
  });

  /**
   * The clock starts when the connection is lost, not when it was made. A
   * phone that sat in a channel for an hour and dropped for five seconds has
   * been gone for five seconds.
   */
  it('measures the gap rather than how long the channel was held', () => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000);
    const realtime = realtimeFor();
    const first = last();
    first.onopen!();
    realtime.act('chan_a', { type: 'ENTER' });

    jest.setSystemTime(1_000 + 3_600_000);
    first.onclose!({});
    jest.setSystemTime(1_000 + 3_605_000);
    jest.runOnlyPendingTimers();
    const second = last();
    second.onopen!();

    expect(reEntries(second)).toHaveLength(1);
  });
});
