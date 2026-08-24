/**
 * Being displaced: another of this account's devices has stepped into a
 * channel, so this one is no longer standing anywhere.
 *
 * Several sessions per account became ordinary on 2026-08-24, and the rule
 * that survived is about rooms rather than credentials — one account, one
 * voice, and the session that entered most recently is the one holding it.
 *
 * What the socket has to do with the message is small and load-bearing:
 * forget what it would re-enter. Without that, the next reconnect re-sends
 * ENTER and takes the room back from the device somebody is actually holding,
 * and a phone on patchy signal does it over and over.
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
  socket.sent.map((s) => JSON.parse(s) as Record<string, unknown>);

const opened: Array<{ disconnect: () => void }> = [];

afterEach(() => {
  for (const realtime of opened) realtime.disconnect();
  opened.length = 0;
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

const deliver = (socket: FakeSocket, message: unknown) =>
  socket.onmessage!({ data: JSON.stringify(message) });

/** What this socket re-entered when it came back, if anything. */
const reEntered = (socket: FakeSocket) =>
  messagesOf(socket).filter((m) => m.type === 'channel.action');

describe('a device that has been displaced', () => {
  it('does not re-enter the channel it was in when it reconnects', () => {
    const { realtime, socket } = connected();
    realtime.act('chan_a', { type: 'ENTER' });

    deliver(socket, { type: 'displaced' });

    socket.sent.length = 0;
    socket.onopen!();

    expect(reEntered(socket)).toEqual([]);
  });

  it('tells the app, so the audio can follow', () => {
    let told = 0;
    const { socket } = connected({ onDisplaced: () => (told += 1) });

    deliver(socket, { type: 'displaced' });

    expect(told).toBe(1);
  });

  /**
   * Taking the room back is an ordinary ENTER, which is the same gesture that
   * took it away on the other device. It restores what a reconnect would
   * restore, or the phone would give the room up again at the first blip.
   */
  it('re-enters again once this device steps back in', () => {
    const { realtime, socket } = connected();
    realtime.act('chan_a', { type: 'ENTER' });
    deliver(socket, { type: 'displaced' });

    realtime.act('chan_a', { type: 'ENTER' });

    socket.sent.length = 0;
    socket.onopen!();

    expect(reEntered(socket)).toEqual([
      { type: 'channel.action', channelId: 'chan_a', action: { type: 'ENTER' } },
    ]);
  });

  /**
   * It is not a channel ending and not a sign-out. What this socket watches is
   * untouched — the screen stays open on the channel, which is what lets it
   * offer a way back in — and nothing is sent in reply.
   */
  it('says nothing back and goes on watching', () => {
    const { realtime, socket } = connected();
    realtime.watchChannel('chan_a');
    socket.sent.length = 0;

    deliver(socket, { type: 'displaced' });

    expect(messagesOf(socket)).toEqual([]);
  });
});
