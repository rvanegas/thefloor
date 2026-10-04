/**
 * A refused channel action, routed to the channel it was taken in.
 *
 * The `error` frame carries a `channelId` when what was refused was a channel
 * action, since 2026-10-03. The socket's whole part is the split: a frame
 * naming a channel goes to `onRefused`, which the channel screen renders, and
 * one that does not goes to `onError` as before — which only the sign-in screen
 * renders, and is the wrong place for a refusal somebody needs to read.
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

const opened: Array<{ disconnect: () => void }> = [];

afterEach(() => {
  for (const realtime of opened) realtime.disconnect();
  opened.length = 0;
  delete (globalThis as { WebSocket?: unknown }).WebSocket;
});

function connected(handlers: Record<string, unknown>) {
  const { Realtime } = load();
  const realtime = new Realtime();
  opened.push(realtime);
  realtime.connect('token', handlers);
  const socket = FakeSocket.live[0];
  socket.onopen!();
  return socket;
}

const deliver = (socket: FakeSocket, message: unknown) =>
  socket.onmessage!({ data: JSON.stringify(message) });

describe('an error frame', () => {
  it('goes to the channel it names when it names one', () => {
    const onError = jest.fn();
    const onRefused = jest.fn();
    const socket = connected({ onError, onRefused });

    deliver(socket, {
      type: 'error',
      message: 'Channels hold up to 8 people.',
      channelId: 'chan_1',
    });

    expect(onRefused).toHaveBeenCalledWith(
      'chan_1',
      'Channels hold up to 8 people.'
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it('goes where it always went when it names none', () => {
    const onError = jest.fn();
    const onRefused = jest.fn();
    const socket = connected({ onError, onRefused });

    // What every server before 2026-10-03 sends, and what one sends today
    // for anything that is not a channel action.
    deliver(socket, { type: 'error', message: 'Malformed message.' });

    expect(onError).toHaveBeenCalledWith('Malformed message.');
    expect(onRefused).not.toHaveBeenCalled();
  });
});
