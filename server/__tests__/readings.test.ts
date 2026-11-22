import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { initialPlaybackState } from '../../core/playback';
import type { ChannelState } from '../../core/types';
import { buildApp, type App } from '../src/app';
import { composeRecord, userContent, type ClaudeClient, type RecordSources } from '../src/claude';
import { openDb, type Db } from '../src/db';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';
import type { NoesisOptions } from '../src/noesis';
import { READING_KEPT_MS, Readings } from '../src/readings';
import { FakeSpeech, speechPieces } from '../src/speech';
import { MemoryRecordingStore } from '../src/storage';

/**
 * A library document read aloud into *Listen*, since 2026-11-20 — spoken
 * once in the presser's Pro voice and kept a month, its sentences written as
 * *Played audio* as the room hears them, and Claude given the document whole
 * with where the room is in it. See
 * planning/decision/2026-11-20-a-library-document-is-read-aloud-in-listen.md.
 */

const T0 = 1_700_000_000_000;
let dir: string;
let clock = T0;

beforeEach(() => {
  clock = T0;
  dir = mkdtempSync(join(tmpdir(), 'thefloor-readings-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const DOCUMENT = '# On Attention\n\nAttention is a kind of will. It chooses.\n\nThe end.';
const SPANISH_NAME = '2026-01-03-la-atencion.document.md';
const BOOK = '2026-01-04-tiempo-de-hormigas.source.epub';
const SPANISH =
  '# La atención\n\nLa atención es una forma de la voluntad. Elige lo que está delante y lo que no, como el ojo y también como la mano.';

function readings(db: Db, speech: FakeSpeech, heard: Array<{ channelId: string; text: string }> = []) {
  return new Readings({
    db,
    provider: speech,
    dir: join(dir, 'readings'),
    encode: async (pcm) => pcm,
    now: () => clock,
    billed: () => {},
    heard: (channelId, line) => heard.push({ channelId, text: line.text }),
  });
}

const input = {
  name: '2026-01-02-on-attention.document.md',
  library: 'alice/philosophy',
  title: 'On Attention',
  markdown: DOCUMENT,
  voice: 'aai-sara',
  language: 'en' as const,
  channelId: 'c1',
  accountId: 'alice',
};

/** A channel whose track is `readingId`, at `positionMs`, playing since `startedAt`. */
function playing(readingId: string, positionMs: number, startedAt: number | null, trackId = 'trk1'): ChannelState {
  return {
    id: 'c1',
    status: 'active',
    playback: {
      ...initialPlaybackState(),
      track: {
        id: trackId,
        title: 'On Attention',
        durationMs: 60_000,
        document: { name: input.name, library: input.library, title: 'On Attention', reading: readingId },
      },
      status: startedAt === null ? 'paused' : 'playing',
      positionMs,
      startedAt,
    },
  } as unknown as ChannelState;
}

describe('speechPieces', () => {
  it('never cuts inside a token like 3.50', () => {
    const text = `${'word '.repeat(5)}costs 3.50 today`;
    const pieces = speechPieces(text, 30);
    expect(pieces.join(' ').split(/\s+/)).toEqual(text.split(/\s+/));
    expect(pieces.every((piece) => piece.length <= 30)).toBe(true);
  });
});

describe('a reading', () => {
  it('is spoken once and kept: the same document in the same voice costs nothing again', async () => {
    const db = openDb(join(dir, 'a.db'));
    const speech = new FakeSpeech();
    const store = readings(db, speech);
    const first = await store.prepare(input);
    expect(first.spoken).toBe(true);
    expect(speech.requests).toHaveLength(1);
    expect(first.reading.sentences.map((s) => s.text)).toEqual([
      'On Attention',
      'Attention is a kind of will.',
      'It chooses.',
      'The end.',
    ]);
    expect(existsSync(first.file)).toBe(true);

    const again = await store.prepare({ ...input, channelId: 'c2' });
    expect(again.spoken).toBe(false);
    expect(again.reading.id).toBe(first.reading.id);
    expect(speech.requests).toHaveLength(1);

    // Another voice is another reading.
    await store.prepare({ ...input, voice: 'aai-peter' });
    expect(speech.requests).toHaveLength(2);
  });

  it('is gone after its month, file and text', async () => {
    const db = openDb(join(dir, 'b.db'));
    const store = readings(db, new FakeSpeech());
    const { reading, file } = await store.prepare(input);
    clock += READING_KEPT_MS + 1;
    expect(await store.sweep()).toBe(1);
    expect(existsSync(file)).toBe(false);
    expect(store.get(reading.id)).toBeNull();
    const row = db.prepare('SELECT text, deleted_at FROM readings WHERE id = ?').get(reading.id) as {
      text: string;
      deleted_at: number;
    };
    expect(row).toEqual({ text: '', deleted_at: clock });
  });

  it('refuses a document with nothing to say', async () => {
    const store = readings(openDb(join(dir, 'c.db')), new FakeSpeech());
    await expect(store.prepare({ ...input, markdown: '<!-- nothing -->' })).rejects.toThrow(/nothing to read/);
  });
});

describe('the Played audio lines', () => {
  it('are the sentences playback passes, once each, and again after a seek back', async () => {
    const heard: Array<{ channelId: string; text: string }> = [];
    const store = readings(openDb(join(dir, 'd.db')), new FakeSpeech(), heard);
    const { reading } = await store.prepare(input);
    const [, second, third] = reading.sentences;

    store.follow(playing(reading.id, 0, clock), clock);
    clock += second.endMs + 1;
    store.follow(playing(reading.id, 0, T0), clock);
    expect(heard.map((line) => line.text)).toEqual(['On Attention', 'Attention is a kind of will.']);

    // Paused: nothing more.
    const at = second.endMs + 1;
    store.follow(playing(reading.id, at, null), clock + 400);
    expect(heard).toHaveLength(2);

    // A seek back to the start, playing: the first is heard again.
    clock += 500;
    store.follow(playing(reading.id, 0, clock), clock);
    clock += reading.sentences[0].endMs + 1;
    store.follow(playing(reading.id, 0, clock - reading.sentences[0].endMs - 1), clock);
    expect(heard.map((line) => line.text).slice(2)).toEqual(['On Attention']);
    expect(third).toBeDefined();
  });

  it('writes nothing for what a seek forward jumped over', async () => {
    const heard: Array<{ channelId: string; text: string }> = [];
    const store = readings(openDb(join(dir, 'e.db')), new FakeSpeech(), heard);
    // Long enough, at the fake's millisecond a character, for a jump to the
    // end to be further than the tick could have played.
    const long = Array.from({ length: 200 }, (_, n) => `Sentence number ${n} is here.`).join(' ');
    const { reading } = await store.prepare({ ...input, markdown: long });
    store.follow(playing(reading.id, 0, clock), clock);
    clock += 100;
    const end = reading.sentences[reading.sentences.length - 1].endMs;
    expect(end).toBeGreaterThan(2_000);
    store.follow(playing(reading.id, end + 10, clock), clock);
    expect(heard).toEqual([]);
  });
});

describe('Claude, following along', () => {
  it('holds the document whole ahead of the Record and is told where the room is after it', async () => {
    const store = readings(openDb(join(dir, 'f.db')), new FakeSpeech());
    const { reading } = await store.prepare(input);
    const state = playing(reading.id, reading.sentences[1].startMs + 1, null);
    const sources: RecordSources = {
      rooms: () => [],
      liveLines: () => [],
      recording: () => null,
      reading: () => store.forClaude(state, clock),
    };
    const record = composeRecord(sources, 'c1', clock)!;
    // Nothing said yet, and still something to talk about.
    expect(record).not.toBeNull();
    expect(record.holds).toEqual([{ name: input.name, title: 'On Attention' }]);

    const blocks = userContent(record, 'brief');
    expect(blocks[0].text).toContain(`<document name="${input.name}"`);
    expect(blocks[0].text).toContain('Attention is a kind of will.');
    expect(blocks[0].text.indexOf('<document')).toBeLessThan(blocks[0].text.indexOf('<record>'));
    const tail = blocks[blocks.length - 1].text;
    expect(tail).toContain('has paused it');
    expect(tail).toContain('“Attention is a kind of will.”');
    expect(tail).toContain('50% of the way through');
  });
});

// ── The routes ───────────────────────────────────────────────────────────────

describe('the routes', () => {
  let app: App;
  const speech = new FakeSpeech();

  /** noesis, answered here, as claude.test.ts answers it. */
  const fakeNoesis = (async (input: unknown, init?: { body?: unknown; method?: string }) => {
    const url = new URL(String(input));
    const fields = Object.fromEntries(new URLSearchParams(String(init?.body ?? '')));
    if (url.pathname === '/token') {
      return Response.json({
        access_token: fields.grant_type === 'authorization_code' ? 'secret' : 'secret-2',
        refresh_token: 'refresh',
        expires_in: 3600,
        scope: 'noesis:read noesis:import',
      });
    }
    if (url.pathname === '/me') {
      return Response.json({ user: 'alice', email: 'alice@example.com', libraries: ['alice/philosophy'] });
    }
    if (url.pathname === '/mcp' && init?.method === 'POST') {
      const call = JSON.parse(String(init.body)) as {
        params: { name: string; arguments: Record<string, string | number> };
      };
      const { name, part } = call.params.arguments;
      // As noesis answers: a line naming the file before it, and a blank line.
      const read = (body: string) => `${name}, the document.\n\n${body}`;
      const text =
        call.params.name === 'list_documents'
          ? `${input_name} — On Attention\n2026-01-01-older.chat.md — Older (not yet indexed)\n` +
            `${BOOK} — Tiempo de hormigas (read in parts)`
          : name === input_name
            ? read(DOCUMENT)
            : name === SPANISH_NAME
              ? read(SPANISH)
              : name === BOOK && part === undefined
                ? `${BOOK}, the source.\n\nIt is an EPUB, read a part at a time. Its 2 parts:\n\n` +
                  '1. Prólogo — 1,234 words\n2. Uno — 5 words'
                : name === BOOK && part === 2
                  ? `${BOOK}, the source.\nPart 2 of 2: Uno — 5 words.\n\nThe ants keep time.`
                  : null;
      const result = text
        ? { content: [{ type: 'text', text }] }
        : { content: [{ type: 'text', text: 'no such document' }], isError: true };
      return new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: 1, result })}\n\n`, {
        headers: { 'content-type': 'text/event-stream' },
      });
    }
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  const input_name = input.name;

  const NOESIS: NoesisOptions = {
    url: 'https://noesis.example/mcp',
    authUrl: 'https://auth.example',
    clientId: 'thefloor',
    clientSecret: 'client-secret',
    callbackUrl: 'https://floor.example/noesis/callback',
    fetch: fakeNoesis,
  };

  afterEach(async () => {
    app.channels.stop();
    await app.fastify.close();
  });

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  async function signIn(identifier: string, displayName: string) {
    const code = app.accounts.issueCode(identifier, clock)!;
    const verified = await app.fastify.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { identifier, code, displayName },
    });
    return verified.json() as { token: string; account: { id: string } };
  }

  async function setUp(options: { pro?: boolean } = {}) {
    app = buildApp({
      dbPath: join(dir, 'thefloor.db'),
      mailer: new MemoryMailer(),
      media: new MemoryMediaServer(),
      mediaUrl: 'wss://example.livekit.cloud',
      store: new MemoryRecordingStore(),
      now: () => clock,
      roomCloseGraceMs: 0,
      claude: { messages: { create: async () => ({}) } } as unknown as ClaudeClient,
      speech,
      speechDir: join(dir, 'speech'),
      readingsDir: join(dir, 'readings'),
      trackRoot: join(dir, 'tracks'),
      library: NOESIS,
    } as Parameters<typeof buildApp>[0]);
    const alice = await signIn('alice@example.com', 'Alice');
    const bob = await signIn('bob@example.com', 'Bob');
    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(alice.token),
      payload: { identifier: 'bob@example.com' },
    });
    await app.fastify.inject({ method: 'POST', url: `/contacts/${alice.account.id}/accept`, headers: auth(bob.token) });
    const created = app.channels.create(alice.account.id, [bob.account.id]);
    if (!created.ok) throw new Error(created.error);
    const channelId = created.channel.id;
    app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
    app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
    // Connected the way the callback does, past noesis's sign-in.
    const state = new URL(app.noesis!.start(alice.account.id, 'app')).searchParams.get('state')!;
    await app.noesis!.finish(state, 'code', undefined);
    if (options.pro !== false) {
      app.db
        .prepare(
          `INSERT INTO pro_subscriptions (original_transaction_id, account_id, product_id, environment,
             expires_at, latest_transaction_id, updated_at, raw) VALUES (?, ?, 'pro', 'Sandbox', ?, ?, 0, '{}')`
        )
        .run('t-a', alice.account.id, 4_102_444_800_000, 't-a');
      app.channels.dispatch(channelId, alice.account.id, {
        type: 'SET_LIBRARY',
        library: true,
        libraries: ['alice/philosophy'],
      } as never);
    }
    return { alice, bob, channelId };
  }

  it('lists the documents of the libraries on in the channel, to any member', async () => {
    const { bob, channelId } = await setUp();
    const listed = await app.fastify.inject({
      method: 'GET',
      url: `/channels/${channelId}/documents?q=attention`,
      headers: auth(bob.token),
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual({
      libraries: ['alice/philosophy'],
      documents: [
        { name: input.name, title: 'On Attention', library: 'alice/philosophy' },
        { name: '2026-01-01-older.chat.md', title: 'Older', library: 'alice/philosophy' },
        { name: BOOK, title: 'Tiempo de hormigas', library: 'alice/philosophy', parts: true },
      ],
    });
  });

  it('reads a book a part at a time: its outline, then the part chosen', async () => {
    speech.requests.length = 0;
    const { bob, channelId } = await setUp();
    const outline = await app.fastify.inject({
      method: 'GET',
      url: `/channels/${channelId}/documents/parts?name=${BOOK}&library=alice/philosophy`,
      headers: auth(bob.token),
    });
    expect(outline.json()).toEqual({
      parts: [
        { number: 1, title: 'Prólogo', size: '1,234 words' },
        { number: 2, title: 'Uno', size: '5 words' },
      ],
    });

    const whole = await app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/reading`,
      headers: auth(bob.token),
      payload: { name: BOOK, library: 'alice/philosophy' },
    });
    expect(whole.statusCode).toBe(400);
    const parted = await app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/reading`,
      headers: auth(bob.token),
      payload: { name: input.name, library: 'alice/philosophy', part: 1 },
    });
    expect(parted.statusCode).toBe(400);

    const loaded = await app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/reading`,
      headers: auth(bob.token),
      payload: { name: BOOK, library: 'alice/philosophy', title: 'Tiempo de hormigas — Uno', part: 2 },
    });
    expect(loaded.statusCode).toBe(200);
    expect(app.channels.get(channelId)!.playback.track!.title).toBe('Tiempo de hormigas — Uno');
    const sentences = await app.fastify.inject({
      method: 'GET',
      url: `/channels/${channelId}/reading`,
      headers: auth(bob.token),
    });
    // The part alone, and nothing of noesis's lines before it.
    expect(sentences.json().sentences.map((s: { text: string }) => s.text)).toEqual(['The ants keep time.']);
  });

  it('is refused off Pro', async () => {
    const { alice, channelId } = await setUp({ pro: false });
    const listed = await app.fastify.inject({
      method: 'GET',
      url: `/channels/${channelId}/documents`,
      headers: auth(alice.token),
    });
    expect(listed.statusCode).toBe(403);
  });

  it('reads a Spanish document in Spanish, whatever the presser’s language', async () => {
    speech.requests.length = 0;
    const { bob, channelId } = await setUp();
    const loaded = await app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/reading`,
      headers: auth(bob.token),
      payload: { name: SPANISH_NAME, library: 'alice/philosophy', language: 'en' },
    });
    expect(loaded.statusCode).toBe(200);
    expect(speech.requests[0]).toMatchObject({ voice: 'aai-antonioluis', language: 'es' });
  });

  it('reads one aloud into Listen as the channel’s track, in the presser’s voice', async () => {
    speech.requests.length = 0;
    const { bob, channelId } = await setUp();
    const loaded = await app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/reading`,
      headers: auth(bob.token),
      payload: { name: input.name, library: 'alice/philosophy', title: 'On Attention' },
    });
    expect(loaded.statusCode).toBe(200);
    const track = app.channels.get(channelId)!.playback.track!;
    expect(track.title).toBe('On Attention');
    expect(track.document).toMatchObject({ name: input.name, library: 'alice/philosophy', title: 'On Attention' });
    expect(speech.requests).toEqual([expect.objectContaining({ voice: 'aai-kyla', language: 'en' })]);

    const sentences = await app.fastify.inject({
      method: 'GET',
      url: `/channels/${channelId}/reading`,
      headers: auth(bob.token),
    });
    expect(sentences.json().sentences.map((s: { text: string }) => s.text)).toEqual([
      'On Attention',
      'Attention is a kind of will.',
      'It chooses.',
      'The end.',
    ]);
    const billed = app.db.prepare('SELECT paste_id, characters FROM speech_usage').all() as Array<{
      paste_id: string;
      characters: number;
    }>;
    expect(billed).toEqual([{ paste_id: track.document!.reading, characters: expect.any(Number) }]);
  });

  it('refuses a library that is not on in the channel', async () => {
    const { alice, channelId } = await setUp();
    const refused = await app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/reading`,
      headers: auth(alice.token),
      payload: { name: input.name, library: 'alice/politics' },
    });
    expect(refused.statusCode).toBe(404);
  });
});
