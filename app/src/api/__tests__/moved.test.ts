/**
 * Following a conversation that changes channels.
 *
 * Somebody asked into an unnamed channel moves everybody to the unnamed
 * channel for the wider set, and the server says so rather than leaving the
 * client to infer it from an empty room. Two things have to follow here: what
 * this socket watches, and what it would re-enter if the connection dropped.
 *
 * The audio deliberately does *not* follow, because it never left — the
 * destination inherits the room, and the connection keyed on it is untouched.
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

describe('a conversation that moves', () => {
  it('switches what it watches to the destination', () => {
    const { realtime, socket } = connected();
    realtime.watchChannel('chan_old');
    socket.sent.length = 0;

    deliver(socket, { type: 'channel.moved', from: 'chan_old', to: 'chan_new' });

    expect(messagesOf(socket)).toEqual([
      { type: 'unwatch.channel', channelId: 'chan_old' },
      { type: 'watch.channel', channelId: 'chan_new' },
    ]);
  });

  it('re-enters the destination after a reconnect, not the channel left behind', () => {
    const { realtime, socket } = connected();
    realtime.act('chan_old', { type: 'ENTER' });
    deliver(socket, { type: 'channel.moved', from: 'chan_old', to: 'chan_new' });

    // The socket comes back and restores what it believes. Re-entering the old
    // channel here would walk back out of the conversation on one blip of
    // signal.
    socket.sent.length = 0;
    socket.onopen!();

    const entered = messagesOf(socket).filter((m) => m.type === 'channel.action');
    expect(entered).toEqual([
      {
        type: 'channel.action',
        channelId: 'chan_new',
        action: { type: 'ENTER' },
      },
    ]);
  });

  it('tells the app where everybody went', () => {
    const moves: Array<[string, string]> = [];
    const { socket } = connected({
      onChannelMoved: (from: string, to: string) => moves.push([from, to]),
    });

    deliver(socket, { type: 'channel.moved', from: 'chan_old', to: 'chan_new' });

    expect(moves).toEqual([['chan_old', 'chan_new']]);
  });

  it('leaves a move of some channel it is not watching alone', () => {
    // Two people can be moved out of a channel this client merely belongs to.
    // Home lists the destination like any other channel; nothing here changes.
    const { realtime, socket } = connected();
    realtime.watchChannel('chan_elsewhere');
    socket.sent.length = 0;

    deliver(socket, { type: 'channel.moved', from: 'chan_old', to: 'chan_new' });

    expect(messagesOf(socket)).toEqual([]);
  });
});
