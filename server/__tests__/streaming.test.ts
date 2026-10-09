import { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  AssemblyAiStreaming,
  STREAMING_MODEL,
  turnFrom,
  type LiveTurn,
} from '../src/streaming';

/** A stand-in for the provider's endpoint, on a port of its own. */
async function provider() {
  const server = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const connected = new Promise<{ socket: WebSocket; url: string; auth: string | undefined }>(
    (resolve) =>
      server.once('connection', (socket, request) =>
        resolve({ socket, url: request.url ?? '', auth: request.headers.authorization })
      )
  );
  const port = (server.address() as AddressInfo).port;
  return { server, connected, url: `ws://127.0.0.1:${port}/v3/ws` };
}

const until = async (check: () => boolean) => {
  for (let n = 0; n < 200 && !check(); n++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

describe('a finished turn', () => {
  it('is one with both flags, the formatted text and its word timings', () => {
    expect(
      turnFrom({
        type: 'Turn',
        end_of_turn: true,
        turn_is_formatted: true,
        transcript: 'Hello there.',
        words: [
          { start: 1_200, end: 1_500, confidence: 0.8 },
          { start: 1_600, end: 2_000, confidence: 1 },
        ],
      })
    ).toEqual({ startMs: 1_200, endMs: 2_000, text: 'Hello there.', confidence: 0.9 });
  });

  it('is not a partial, nor the unformatted end that comes first', () => {
    // With `format_turns` every turn ends twice, and keeping both would write
    // each sentence twice.
    expect(turnFrom({ end_of_turn: false, turn_is_formatted: false, transcript: 'hel' })).toBeNull();
    expect(turnFrom({ end_of_turn: true, turn_is_formatted: false, transcript: 'hello there' })).toBeNull();
  });

  it('is not an empty one', () => {
    expect(turnFrom({ end_of_turn: true, turn_is_formatted: true, transcript: '  ' })).toBeNull();
  });
});

describe('a streaming session', () => {
  it('asks for the pinned model at 16 kHz, with the key bare', async () => {
    const fake = await provider();
    const session = new AssemblyAiStreaming({ apiKey: 'k', url: fake.url }).open({
      onTurn: () => {},
      onClose: () => {},
    });
    const { url, auth, socket } = await fake.connected;
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('speech_model')).toBe(STREAMING_MODEL);
    expect(params.get('sample_rate')).toBe('16000');
    expect(params.get('format_turns')).toBe('true');
    // Nothing asks whose voice it is: a stream is one speaker.
    expect(params.get('speaker_labels')).toBeNull();
    expect(auth).toBe('k');
    socket.close(1000);
    await session.close();
    fake.server.close();
  });

  it('sends audio in 50 ms messages, and the remainder on close', async () => {
    const fake = await provider();
    const received: number[] = [];
    let billed: number | null | undefined;
    const session = new AssemblyAiStreaming({ apiKey: 'k', url: fake.url }).open({
      onTurn: () => {},
      onClose: (result) => {
        billed = result.billedSeconds;
      },
    });
    const { socket } = await fake.connected;
    socket.on('message', (data, binary) => {
      if (binary) {
        received.push((data as Buffer).length / 2);
        return;
      }
      if (JSON.parse(String(data)).type === 'Terminate') {
        socket.send(JSON.stringify({ type: 'Termination', session_duration_seconds: 3 }));
        socket.close(1000);
      }
    });

    // Eleven 10 ms frames: two whole 50 ms messages and a tail of one frame.
    for (let n = 0; n < 11; n++) session.send(new Int16Array(160));
    await until(() => received.length === 2);
    expect(received).toEqual([800, 800]);

    await session.close();
    expect(received).toEqual([800, 800, 160]);
    // What the provider says the session is billed on, passed through.
    expect(billed).toBe(3);
    fake.server.close();
  });

  it('hands over each finished turn, and nothing else', async () => {
    const fake = await provider();
    const turns: LiveTurn[] = [];
    const session = new AssemblyAiStreaming({ apiKey: 'k', url: fake.url }).open({
      onTurn: (turn) => turns.push(turn),
      onClose: () => {},
    });
    const { socket } = await fake.connected;
    socket.send(JSON.stringify({ type: 'Begin', id: 'x' }));
    socket.send(JSON.stringify({ type: 'Turn', end_of_turn: false, transcript: 'hel' }));
    socket.send(
      JSON.stringify({
        type: 'Turn',
        end_of_turn: true,
        turn_is_formatted: true,
        transcript: 'Hello.',
        words: [{ start: 0, end: 400, confidence: 0.9 }],
      })
    );
    await until(() => turns.length === 1);
    expect(turns.map((t) => t.text)).toEqual(['Hello.']);
    socket.close(1000);
    await session.close();
    fake.server.close();
  });

  it('reports a stream the provider ended as a failure', async () => {
    const fake = await provider();
    let error: Error | undefined;
    new AssemblyAiStreaming({ apiKey: 'bad', url: fake.url }).open({
      onTurn: () => {},
      onClose: (result) => {
        error = result.error;
      },
    });
    const { socket } = await fake.connected;
    socket.send(JSON.stringify({ type: 'Error', error_code: 3008, error: 'Session expired' }));
    socket.close(3008, 'Session expired');
    await until(() => error !== undefined);
    expect(error?.message).toContain('Session expired');
    fake.server.close();
  });
});
