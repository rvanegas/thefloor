import WebSocket from 'ws';
import { buildApp, type App } from '../src/app';
import { IDLE_MS } from '../src/live';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';
import { MemoryStreaming } from '../src/streaming';

/**
 * The live transcript: who may switch it on, when the server listens, what
 * it sends the provider, and what it keeps.
 *
 * The media plane and the provider are both doubles. What is worth asserting
 * here is the rules around them — that a session costs money only while
 * somebody is talking, that the floor is applied before anything leaves, and
 * that a line lands on the wall clock under the name it was said under.
 */

let clock = 1_700_000_000_000;
let app: App;
let media: MemoryMediaServer;
let streaming: MemoryStreaming;

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/** 10 ms of 16 kHz audio, loud or silent. */
const frame = (loud: boolean) => new Int16Array(160).fill(loud ? 4_000 : 0);

function boot(withStreaming = true) {
  media = new MemoryMediaServer();
  streaming = new MemoryStreaming();
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    media,
    streaming: withStreaming ? streaming : undefined,
    now: () => clock,
    roomCloseGraceMs: 0,
  });
}

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

async function signIn(identifier: string, displayName: string) {
  const code = app.accounts.issueCode(identifier, clock)!;
  const verified = await app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, displayName },
  });
  return verified.json() as { token: string; account: { id: string } };
}

/** Alice (on the house) and Bob, contacts, in a channel, both present. */
async function room() {
  const alice = await signIn('alice@example.com', 'Alice');
  const bob = await signIn('bob@example.com', 'Bob');
  app.db
    .prepare('UPDATE accounts SET transcripts_unlimited = 1 WHERE id = ?')
    .run(alice.account.id);
  await app.fastify.inject({
    method: 'POST',
    url: '/contacts/request',
    headers: auth(alice.token),
    payload: { identifier: 'bob@example.com' },
  });
  await app.fastify.inject({
    method: 'POST',
    url: `/contacts/${alice.account.id}/accept`,
    headers: auth(bob.token),
  });
  const created = app.channels.create(alice.account.id, [bob.account.id]);
  if (!created.ok) throw new Error(created.error);
  const channelId = created.channel.id;
  app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
  return { alice, bob, channelId, room: created.channel.mediaRoom };
}

const turnOn = (token: string, channelId: string, on = true) =>
  app.fastify.inject({
    method: 'PUT',
    url: `/channels/${channelId}/live-transcription`,
    headers: auth(token),
    payload: { on },
  });

const history = (token: string, channelId: string, query = '') =>
  app.fastify.inject({
    method: 'GET',
    url: `/channels/${channelId}/live-transcript${query}`,
    headers: auth(token),
  });

/** One speaker talking for `ms`, ten milliseconds at a time, on the clock. */
function talk(roomName: string, speaker: string, ms: number, loud = true) {
  const listener = media.listenerFor(roomName)!;
  for (let t = 0; t < ms; t += 10) {
    clock += 10;
    listener.speak(speaker, frame(loud));
  }
}

describe('the switch', () => {
  it('is offered only to somebody who transcribes on the house', async () => {
    boot();
    const { alice, bob, channelId } = await room();

    expect((await turnOn(bob.token, channelId)).statusCode).toBe(404);
    expect(app.channels.get(channelId)?.liveTranscription).toBe(false);

    expect((await turnOn(alice.token, channelId)).statusCode).toBe(200);
    expect(app.channels.get(channelId)?.liveTranscription).toBe(true);
  });

  it('is refused everybody on a server that cannot stream', async () => {
    boot(false);
    const { alice, channelId } = await room();
    expect((await turnOn(alice.token, channelId)).statusCode).toBe(404);
  });

  it('survives a restart', async () => {
    // A setting, not a session: written with the channel, read back with it.
    boot();
    const { alice, channelId } = await room();
    await turnOn(alice.token, channelId);
    const row = app.db.prepare('SELECT state FROM channels WHERE id = ?').get(channelId) as {
      state: string;
    };
    expect(JSON.parse(row.state).liveTranscription).toBe(true);
  });
});

describe('listening', () => {
  it('joins the room hidden while the setting is on and the room occupied', async () => {
    boot();
    const { alice, channelId, room: roomName } = await room();
    expect(media.listenerFor(roomName)).toBeUndefined();

    await turnOn(alice.token, channelId);
    expect(media.listenerFor(roomName)?.identity).toBe('transcriber');

    await turnOn(alice.token, channelId, false);
    expect(media.listenerFor(roomName)).toBeUndefined();
  });

  it('leaves when the room empties', async () => {
    boot();
    const { alice, bob, channelId, room: roomName } = await room();
    await turnOn(alice.token, channelId);
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    app.channels.dispatch(channelId, bob.account.id, { type: 'STEP_OUT' });
    // Closed once its own opening has settled, a turn of the loop later.
    await new Promise((resolve) => setImmediate(resolve));
    expect(media.listenerFor(roomName)).toBeUndefined();
  });
});

describe('what is sent', () => {
  it('opens a session on speech, not on silence', async () => {
    // Billed by how long a session is open, so a microphone carrying a quiet
    // room costs nothing until somebody says something.
    boot();
    const { alice, channelId, room: roomName } = await room();
    await turnOn(alice.token, channelId);

    talk(roomName, alice.account.id, 2_000, false);
    expect(streaming.sessions).toHaveLength(0);

    talk(roomName, alice.account.id, 100, true);
    expect(streaming.sessions).toHaveLength(1);
    // The pre-roll went first: half a second of the silence before the word,
    // so the syllable that opened the session is not the one it cost.
    expect(streaming.sessions[0].samples.length).toBe(16 * 500 + 16 * 100);
  });

  it('opens one session per speaker', async () => {
    boot();
    const { alice, bob, channelId, room: roomName } = await room();
    await turnOn(alice.token, channelId);
    talk(roomName, alice.account.id, 100);
    talk(roomName, bob.account.id, 100);
    expect(streaming.live()).toHaveLength(2);
  });

  it('sends silence in place of a withheld speaker', async () => {
    // What the room did not hear is not written: Bob holds the floor, so
    // Alice's audio leaves as zeros, and opens nothing on its own.
    boot();
    const { alice, bob, channelId, room: roomName } = await room();
    await turnOn(alice.token, channelId);
    talk(roomName, alice.account.id, 100);
    expect(streaming.live()).toHaveLength(1);

    app.channels.dispatch(channelId, bob.account.id, { type: 'CLAIM_FLOOR' });
    const before = streaming.sessions[0].samples.length;
    talk(roomName, alice.account.id, 100);
    const after = streaming.sessions[0].samples.slice(before);
    expect(after.length).toBe(1_600);
    expect(after.every((s) => s === 0)).toBe(true);
  });

  it('closes a session after a stretch of silence, and records what it cost', async () => {
    boot();
    const { alice, channelId, room: roomName } = await room();
    await turnOn(alice.token, channelId);
    talk(roomName, alice.account.id, 100);
    expect(streaming.live()).toHaveLength(1);

    clock += IDLE_MS;
    app.channels.tick();
    expect(streaming.live()).toHaveLength(0);
    const cost = app.db.prepare('SELECT * FROM live_sessions').all() as Array<{
      identity: string;
      billed_seconds: number;
    }>;
    expect(cost).toHaveLength(1);
    expect(cost[0].identity).toBe(alice.account.id);

    // And the next word opens another.
    talk(roomName, alice.account.id, 100);
    expect(streaming.live()).toHaveLength(1);
  });
});

describe('what is kept', () => {
  it('writes a finished turn on the wall clock, under the name it was said under', async () => {
    boot();
    const { alice, bob, channelId, room: roomName } = await room();
    await turnOn(alice.token, channelId);

    const spokeAt = clock;
    talk(roomName, alice.account.id, 1_000);
    // A turn half a second into the session's audio, which began at
    // `spokeAt` — there was no silence before it to carry as pre-roll.
    streaming.sessions[0].turn({ startMs: 500, endMs: 1_400, text: 'Hello there.', confidence: 0.9 });

    const answered = await history(bob.token, channelId);
    expect(answered.statusCode).toBe(200);
    const { lines } = answered.json() as {
      lines: Array<{ displayName: string; text: string; startAt: number; endAt: number }>;
    };
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ displayName: 'Alice', text: 'Hello there.' });
    expect(lines[0].startAt).toBe(spokeAt + 500);
    expect(lines[0].endAt).toBe(spokeAt + 1_400);
    expect(app.channels.hasLiveTranscript(channelId)).toBe(true);
  });

  it('names the shared track "Played audio"', async () => {
    boot();
    const { alice, channelId, room: roomName } = await room();
    await turnOn(alice.token, channelId);
    talk(roomName, `media:${channelId}`, 100);
    streaming.sessions[0].turn({ startMs: 0, endMs: 100, text: 'Welcome.', confidence: null });

    const { lines } = (await history(alice.token, channelId)).json() as {
      lines: Array<{ identity: string; displayName: string }>;
    };
    expect(lines[0]).toMatchObject({ identity: 'media', displayName: 'Played audio' });
  });

  it('pages backwards, oldest first within a page', async () => {
    boot();
    const { alice, channelId, room: roomName } = await room();
    await turnOn(alice.token, channelId);
    talk(roomName, alice.account.id, 100);
    for (let n = 0; n < 3; n++) {
      streaming.sessions[0].turn({ startMs: n * 10, endMs: n * 10 + 5, text: `line ${n}`, confidence: null });
    }

    const newest = (await history(alice.token, channelId, '?limit=2')).json() as {
      lines: Array<{ text: string; startAt: number }>;
      more: boolean;
    };
    expect(newest.lines.map((l) => l.text)).toEqual(['line 1', 'line 2']);
    expect(newest.more).toBe(true);

    const older = (
      await history(alice.token, channelId, `?limit=2&before=${newest.lines[0].startAt}`)
    ).json() as { lines: Array<{ text: string }> };
    expect(older.lines.map((l) => l.text)).toEqual(['line 0']);
  });

  it('is read by members only', async () => {
    boot();
    const { channelId } = await room();
    const stranger = await signIn('eve@example.com', 'Eve');
    expect((await history(stranger.token, channelId)).statusCode).toBe(404);
  });
});

describe('on the wire', () => {
  /** A socket that keeps everything it is sent, watching one channel. */
  async function watcher(base: string, token: string, channelId: string) {
    const socket = new WebSocket(`ws://${base}/ws?token=${token}`);
    const received: Array<Record<string, unknown>> = [];
    socket.on('message', (raw) => received.push(JSON.parse(String(raw))));
    await new Promise((resolve) => socket.once('open', resolve));
    socket.send(JSON.stringify({ type: 'watch.channel', channelId }));
    const next = async (match: (m: Record<string, unknown>) => boolean) => {
      for (let n = 0; n < 500; n++) {
        const found = received.find(match);
        if (found) return found;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`never arrived; saw ${received.map((m) => m.type).join(', ')}`);
    };
    return { socket, received, next };
  }

  it('tells the reader whether the switch is theirs, and sends each line as it lands', async () => {
    boot();
    await app.fastify.listen({ port: 0, host: '127.0.0.1' });
    const address = app.fastify.server.address() as { port: number };
    const base = `127.0.0.1:${address.port}`;
    const { alice, bob, channelId, room: roomName } = await room();

    const a = await watcher(base, alice.token, channelId);
    const b = await watcher(base, bob.token, channelId);
    const view = (m: Record<string, unknown>) => m.view as { mayTranscribeLive?: boolean };
    expect(view(await a.next((m) => m.type === 'channel')).mayTranscribeLive).toBe(true);
    expect(view(await b.next((m) => m.type === 'channel')).mayTranscribeLive).toBe(false);

    await turnOn(alice.token, channelId);
    talk(roomName, alice.account.id, 100);
    streaming.sessions[0].turn({ startMs: 0, endMs: 100, text: 'Hello.', confidence: null });

    const line = await b.next((m) => m.type === 'transcript.line');
    expect(line).toMatchObject({ channelId, line: { displayName: 'Alice', text: 'Hello.' } });
    a.socket.close();
    b.socket.close();
  });
});
