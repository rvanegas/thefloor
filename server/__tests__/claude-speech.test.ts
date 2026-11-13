import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CLAUDE_ID } from '../../core/constants';
import { buildApp, type App } from '../src/app';
import { claudeVoiceIdentity } from '../src/channels';
import type { ClaudeClient } from '../src/claude';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';
import {
  AssemblyAiSpeech,
  FakeSpeech,
  SPEECH_KEPT_MS,
  SpeechError,
  SpeechStore,
} from '../src/speech';
import { MemoryRecordingStore } from '../src/storage';

/**
 * Claude's reply spoken into the room by the server, since 2026-11-13: once
 * per paste, as `claude:<channel>`, in the channel's voice and the language
 * of its first transcript — and kept an hour so anybody present can have it
 * read again. See
 * planning/task/read-claude-s-reply-aloud-with-assemblyai-s-speech-instead-of-the-phone-s.md.
 */

const T0 = 1_700_000_000_000;

let app: App;
let clock = T0;
let dir: string;
let media: MemoryMediaServer;
let speech: FakeSpeech;

beforeEach(() => {
  clock = T0;
  dir = mkdtempSync(join(tmpdir(), 'thefloor-speech-'));
  media = new MemoryMediaServer();
  speech = new FakeSpeech();
});

afterEach(async () => {
  if (app) {
    app.channels.stop();
    await app.fastify.close();
  }
  rmSync(dir, { recursive: true, force: true });
});

const answer = (text: string) => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-haiku-5-5',
  content: [{ type: 'text', text }],
  stop_reason: 'end_turn',
  usage: {
    input_tokens: 10,
    output_tokens: 10,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  },
});

function client(text = 'Call it Lantern, Bob.'): ClaudeClient {
  const create = async () => answer(text);
  return {
    messages: { create },
    beta: { messages: { create } },
  } as unknown as ClaudeClient;
}

function boot(options: { speech?: boolean } = {}): App {
  app = buildApp({
    dbPath: join(dir, 'thefloor.db'),
    mailer: new MemoryMailer(),
    media,
    mediaUrl: 'wss://example.livekit.cloud',
    store: new MemoryRecordingStore(),
    now: () => clock,
    roomCloseGraceMs: 0,
    mixWaitMs: 0,
    claude: client(),
    ...(options.speech === false ? {} : { speech, speechDir: join(dir, 'speech') }),
  });
  return app;
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const settle = () => new Promise((r) => setTimeout(r, 0));

async function signIn(identifier: string, displayName: string) {
  const code = app.accounts.issueCode(identifier, clock)!;
  const verified = await app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, displayName },
  });
  return verified.json() as { token: string; account: { id: string } };
}

/** Alice and Bob present in a channel, with something in its Record. */
async function room2() {
  const alice = await signIn('alice@example.com', 'Alice');
  const bob = await signIn('bob@example.com', 'Bob');
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
  app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
  app.channels.dispatch(channelId, bob.account.id, { type: 'ENTER' });
  clock += 1_000;
  app.channels.dispatch(channelId, bob.account.id, {
    type: 'PASTE_CLIP',
    text: 'What should we call the project?',
  } as never);
  clock += 1_000;
  return { alice, bob, channelId };
}

const press = (channelId: string, token: string, payload: Record<string, unknown> = {}) =>
  app.fastify.inject({
    method: 'POST',
    url: `/channels/${channelId}/claude`,
    headers: auth(token),
    payload,
  });

const room = (channelId: string) => app.channels.get(channelId)!.mediaRoom!;

describe("Claude's reply, spoken", () => {
  it('is synthesised once and marked on the clip, in the default voice of the asker’s language', async () => {
    boot();
    const { alice, channelId } = await room2();
    await press(channelId, alice.token, { language: 'es' });
    await settle();

    expect(speech.requests).toEqual([
      { text: 'Call it Lantern, Bob.', voice: 'aai-antonioluis', language: 'es' },
    ]);
    const clip = app.channels.get(channelId)!.clip!;
    expect(clip.authorId).toBe(CLAUDE_ID);
    expect(clip.speech).toBe(true);
    // One ledger row, the characters billed.
    const rows = app.db.prepare('SELECT * FROM speech_usage').all() as Array<Record<string, unknown>>;
    expect(rows).toEqual([
      expect.objectContaining({ channel_id: channelId, account_id: alice.account.id, characters: 21 }),
    ]);
  });

  it('is said into the room as its own participant, not the film’s', async () => {
    boot();
    const { alice, channelId } = await room2();
    await press(channelId, alice.token);
    await settle();

    const voice = media.speechFor(room(channelId))!;
    expect(voice.identity).toBe(claudeVoiceIdentity(channelId));
    expect(voice.commands).toEqual([
      { type: 'file', file: app.channels.get(channelId)!.clip!.id },
      { type: 'play', fromMs: 0 },
    ]);
    expect(media.playbackFor(room(channelId))).toBeUndefined();
  });

  it('says which reply it is saying until it has been said', async () => {
    boot();
    const { alice, channelId } = await room2();
    await press(channelId, alice.token);
    await settle();
    const pasteId = app.channels.get(channelId)!.clip!.id;
    expect(app.channels.claudeSaying(channelId)).toBe(pasteId);
    media.speechFor(room(channelId))!.onEnded();
    expect(app.channels.claudeSaying(channelId)).toBeNull();
  });

  it('keeps every native build that has not said it hears the voice off it', async () => {
    boot();
    const { alice, bob, channelId } = await room2();
    await app.channels.mediaToken(channelId, alice.account.id, true);
    await app.channels.mediaToken(channelId, bob.account.id);
    await press(channelId, alice.token);
    await settle();

    const toClaude = media.subscriptions.filter(
      (s) => s.speaker === claudeVoiceIdentity(channelId)
    );
    expect(toClaude).toEqual([
      expect.objectContaining({ listener: bob.account.id, silenced: true }),
    ]);
  });

  it('names who is present on an app that does not hear it, for the warning', async () => {
    boot();
    const { alice, bob, channelId } = await room2();
    expect(app.channels.claudeUnheard(channelId).sort()).toEqual([alice.account.id, bob.account.id].sort());
    await app.channels.mediaToken(channelId, alice.account.id, true);
    await app.channels.mediaToken(channelId, bob.account.id);
    expect(app.channels.claudeUnheard(channelId)).toEqual([bob.account.id]);
  });

  it('names nobody where the server does not speak', async () => {
    boot({ speech: false });
    const { channelId } = await room2();
    expect(app.channels.claudeUnheard(channelId)).toEqual([]);
  });

  it('is spoken in the language of the channel’s first transcript', async () => {
    boot();
    const { alice, channelId } = await room2();
    app.db
      .prepare(
        `INSERT INTO recordings (id, channel_id, initiator_id, invitee_id, started_at, duration_ms, s3_key)
         VALUES ('r1', ?, ?, ?, ?, 1000, 'k'), ('r2', ?, ?, ?, ?, 1000, 'k')`
      )
      .run(channelId, alice.account.id, alice.account.id, T0, channelId, alice.account.id, alice.account.id, T0 + 10);
    app.db
      .prepare(
        `INSERT INTO transcript_jobs (id, recording_id, identity, state, language)
         VALUES ('j2', 'r2', 'x', 'ready', 'en'), ('j1', 'r1', 'x', 'ready', 'es')`
      )
      .run();
    await press(channelId, alice.token, { language: 'en' });
    await settle();
    expect(speech.requests[0].language).toBe('es');
  });

  it('is in the channel’s chosen voice, which only Pro may choose', async () => {
    boot();
    const { alice, channelId } = await room2();
    const refused = app.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_SPEECH_VOICE',
      speechVoice: 'aai-sara',
    } as never);
    expect(refused.ok).toBe(false);

    app.db.prepare('UPDATE accounts SET transcripts_unlimited = 1 WHERE id = ?').run(alice.account.id);
    const chosen = app.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_SPEECH_VOICE',
      speechVoice: 'aai-sara',
    } as never);
    expect(chosen.ok).toBe(true);
    await press(channelId, alice.token, { language: 'es' });
    await settle();
    // The channel's voice, whatever the language.
    expect(speech.requests[0]).toMatchObject({ voice: 'aai-sara', language: 'es' });
  });

  it('is posted without speech, for the phones to read, when synthesis is refused', async () => {
    boot();
    speech.fail = new SpeechError('AssemblyAI speech 402 insufficient_funds', 402);
    const { alice, channelId } = await room2();
    const res = await press(channelId, alice.token);
    await settle();

    expect(res.statusCode).toBe(200);
    expect(app.channels.get(channelId)!.clip!.speech).toBeUndefined();
    expect(media.speechFor(room(channelId))).toBeUndefined();
  });

  it('is not spoken by a server without a provider', async () => {
    boot({ speech: false });
    const { alice, channelId } = await room2();
    await press(channelId, alice.token);
    await settle();
    expect(app.channels.get(channelId)!.clip!.speech).toBeUndefined();
  });

  it('is kept a stem of its own while a recording runs, under Claude', async () => {
    boot();
    const { alice, channelId } = await room2();
    app.channels.dispatch(channelId, alice.account.id, { type: 'START_RECORDING' });
    await settle();
    clock += 3_000;
    await press(channelId, alice.token);
    await settle();

    const voice = media.speechFor(room(channelId))!;
    expect(voice.captures).toHaveLength(1);
    expect(voice.captures[0].key).toContain(`/${CLAUDE_ID}-001.ogg`);
    expect(voice.captures[0].offsetMs).toBe(3_000);
    // Said: the stem closes.
    voice.onEnded();
    expect(voice.captures[0].stopped).toBe(true);
  });
});

describe('Read again', () => {
  it('says a kept reply into the room again, for anybody present', async () => {
    boot();
    const { alice, bob, channelId } = await room2();
    await press(channelId, alice.token);
    await settle();
    const pasteId = app.channels.get(channelId)!.clip!.id;
    const voice = media.speechFor(room(channelId))!;
    voice.onEnded();
    expect(app.channels.speechKept(channelId)).toEqual([pasteId]);

    const res = await app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/pastes/${pasteId}/read-again`,
      headers: auth(bob.token),
    });
    await settle();
    expect(res.statusCode).toBe(200);
    expect(voice.commands.filter((c) => c.type === 'play')).toHaveLength(2);
    // Played back, not synthesised again: nothing more is billed.
    expect(speech.requests).toHaveLength(1);
  });

  it('is gone once its hour is', async () => {
    boot();
    const { alice, channelId } = await room2();
    await press(channelId, alice.token);
    await settle();
    const pasteId = app.channels.get(channelId)!.clip!.id;
    clock += SPEECH_KEPT_MS + 1;
    app.channels.tick();
    expect(app.channels.speechKept(channelId)).toEqual([]);
    const res = await app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/pastes/${pasteId}/read-again`,
      headers: auth(alice.token),
    });
    // `statusFor` answers every refusal of a thing that is not there 400.
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('That reply can no longer be read again.');
  });
});

describe('SpeechStore', () => {
  it('reads what has arrived, waits for the rest, and ends with the reply', async () => {
    const store = new SpeechStore(join(dir, 'store'), () => clock);
    store.begin('p1', 'c1');
    store.append('p1', Buffer.from([1, 0, 2, 0]));
    const decoder = store.decoder('p1');
    expect(Array.from((await decoder.read(2))!)).toEqual([1, 2]);
    // Behind: a frame of silence rather than a wait.
    expect(Array.from((await decoder.read(2))!)).toEqual([0, 0]);
    store.append('p1', Buffer.from([3, 0]));
    store.finish('p1');
    await settle();
    expect(Array.from((await decoder.read(2))!)).toEqual([3, 0]);
    expect(await decoder.read(2)).toBeNull();
  });

  it('starts empty, whatever a previous process left', () => {
    const path = join(dir, 'store');
    const first = new SpeechStore(path, () => clock);
    first.begin('p1', 'c1');
    first.append('p1', Buffer.from([1, 0]));
    first.finish('p1');
    const second = new SpeechStore(path, () => clock);
    expect(second.has('p1', 'c1')).toBe(false);
  });
});

describe('AssemblyAiSpeech', () => {
  it('asks for raw PCM at 48 kHz in the named language, and keeps whole samples', async () => {
    const asked: Array<Record<string, unknown>> = [];
    const fetch = (async (_url: string, init: RequestInit) => {
      asked.push(JSON.parse(String(init.body)));
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 0, 2]));
          controller.enqueue(new Uint8Array([0]));
          controller.close();
        },
      });
      return new Response(body, { headers: { 'x-tts-billed-characters': '5' } });
    }) as unknown as typeof globalThis.fetch;
    const tts = new AssemblyAiSpeech({ apiKey: 'k', fetch });
    const chunks: number[] = [];
    const result = await tts.synthesize({ text: 'Hola.', voice: 'aai-oriol', language: 'es' }, (pcm) =>
      chunks.push(pcm.length)
    );
    expect(asked[0]).toEqual({
      text: 'Hola.',
      voice_id: 'aai-oriol',
      language: 'spanish',
      encoding: 'pcm_s16le',
      sample_rate: 48_000,
    });
    expect(chunks).toEqual([2, 2]);
    expect(result.billedCharacters).toBe(5);
  });

  it('waits out one 503 before any audio, and gives up on a second', async () => {
    let calls = 0;
    const fetch = (async () => {
      calls += 1;
      return new Response('{"code":"at_capacity"}', { status: 503, headers: { 'retry-after': '2' } });
    }) as unknown as typeof globalThis.fetch;
    const waited: number[] = [];
    const tts = new AssemblyAiSpeech({
      apiKey: 'k',
      fetch,
      sleep: async (ms) => {
        waited.push(ms);
      },
    });
    await expect(
      tts.synthesize({ text: 'Hi.', voice: 'aai-kyla', language: 'en' }, () => {})
    ).rejects.toThrow('503');
    expect(calls).toBe(2);
    expect(waited).toEqual([2_000]);
  });
});

describe('a voice sample', () => {
  it('is synthesised once in the voice’s own language and served again from memory', async () => {
    boot();
    const alice = await signIn('alice@example.com', 'Alice');
    const get = () =>
      app.fastify.inject({
        method: 'GET',
        url: '/speech/voices/aai-oriol/sample',
        headers: auth(alice.token),
      });
    const first = await get();
    const second = await get();
    expect(first.statusCode).toBe(200);
    expect(first.headers['x-sample-rate']).toBe('48000');
    expect(second.rawPayload.equals(first.rawPayload)).toBe(true);
    expect(speech.requests).toEqual([
      expect.objectContaining({ voice: 'aai-oriol', language: 'es' }),
    ]);
  });

  it('is refused for a voice outside the catalogue', async () => {
    boot();
    const alice = await signIn('alice@example.com', 'Alice');
    const res = await app.fastify.inject({
      method: 'GET',
      url: '/speech/voices/aai-nobody/sample',
      headers: auth(alice.token),
    });
    expect(res.statusCode).toBe(404);
  });
});
