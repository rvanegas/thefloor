import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CLAUDE_ID, MAX_CLIP_LENGTH } from '../../core/constants';
import type { RoomView } from '../../core/protocol';
import { buildApp, type App } from '../src/app';
import {
  composeRecord,
  FALLBACK_BETA,
  lengthRule,
  REPLY_WORD_LIMITS,
  RESPONSE_MODELS,
  systemPrompt,
  userMessage,
  type ClaudeClient,
  type RecordSources,
} from '../src/claude';
import { MemoryMailer } from '../src/mail';

/**
 * *Ask Claude* on the *Record* bar: the Record read as text, one request, and the
 * reply posted as a paste authored by Claude. The reducer's half — who may
 * ask, and that one ask is out at a time — is core's; this is the half only
 * the server has.
 */

const T0 = 1_700_000_000_000;

// ── The Record as text ───────────────────────────────────────────────────────

const room = (openedAt: number, segments: RoomView['segments']): RoomView => ({
  id: `room_${openedAt}`,
  openedAt,
  closedAt: openedAt + 3_600_000,
  recordingIds: [],
  transcribed: true,
  segments,
});

const pasted = (at: number, authorId: string, displayName: string, text: string) => ({
  id: `seg_${at}`,
  startedAt: at,
  endedAt: at,
  recordingId: null,
  text: false,
  paste: { authorId, displayName, text },
});

const spoken = (from: number, until: number) => ({
  id: `seg_${from}`,
  startedAt: from,
  endedAt: until,
  recordingId: null,
  text: true,
});

function sources(rooms: RoomView[], lines: Array<{ displayName: string; startAt: number; text: string }> = []): RecordSources {
  return {
    rooms: () => rooms,
    liveLines: (_channel, from, until) => lines.filter((l) => l.startAt >= from && l.startAt <= until),
    recording: () => null,
  };
}

describe('the Record as Claude reads it', () => {
  it('is nothing at all for a channel that has kept nothing readable', () => {
    expect(composeRecord(sources([]), 'c', T0)).toBeNull();
    expect(composeRecord(sources([room(T0, [spoken(T0, T0 + 10)])]), 'c', T0)).toBeNull();
  });

  it('lays out rooms oldest first, with what was said and what was pasted', () => {
    const record = composeRecord(
      sources(
        [room(T0, [spoken(T0, T0 + 60_000), pasted(T0 + 30_000, 'acct_a', 'Ana', 'a link')])],
        [{ displayName: 'Ben', startAt: T0 + 1_000, text: 'Hello there.' }]
      ),
      'c',
      T0 + 120_000
    )!;
    expect(record.trimmed).toBe(false);
    expect(record.text).toContain('Ben: Hello there.');
    expect(record.text).toContain('Ana (pasted): a link');
    expect(record.text.indexOf('Ben:')).toBeLessThan(record.text.indexOf('Ana (pasted)'));
  });

  it('labels Claude’s own earlier replies as Claude, so a second press continues', () => {
    const record = composeRecord(
      sources([room(T0, [pasted(T0, CLAUDE_ID, 'Claude', 'An earlier thought.')])]),
      'c',
      T0
    )!;
    expect(record.text).toContain('Claude: An earlier thought.');
    expect(record.text).not.toContain('(pasted)');
  });

  it('drops whole rooms oldest first to fit, then lines from the front, and says so', () => {
    const rooms = [
      room(T0, [pasted(T0, 'acct_a', 'Ana', 'oldest '.repeat(40))]),
      room(T0 + 7_200_000, [
        pasted(T0 + 7_200_000, 'acct_b', 'Ben', 'middle '.repeat(5)),
        pasted(T0 + 7_200_001, 'acct_b', 'Ben', 'newest'),
      ]),
    ];
    const record = composeRecord(sources(rooms), 'c', T0 + 10_000_000, 120)!;
    expect(record.trimmed).toBe(true);
    expect(record.text).not.toContain('oldest');
    expect(record.text).toContain('newest');
    expect(userMessage(record, 'medium')).toContain('It begins partway through');
  });
});

describe('the instructions', () => {
  it('caps each length at 30, 90 and 270 words', () => {
    expect(REPLY_WORD_LIMITS.brief.words).toBe(30);
    expect(REPLY_WORD_LIMITS.medium.words).toBe(90);
    expect(REPLY_WORD_LIMITS.extended.words).toBe(270);
  });

  it.each(['brief', 'medium', 'extended'] as const)(
    'states the %s limit as a hard one, with its reason, twice',
    (length) => {
      const words = REPLY_WORD_LIMITS[length].words;
      expect(systemPrompt(length)).toContain(`at most ${words} words`);
      expect(systemPrompt(length)).toContain('hard limit');
      const message = userMessage({ text: 'x', trimmed: false }, length);
      expect(message.trim().endsWith(lengthRule(length))).toBe(true);
      expect(lengthRule(length)).toContain('waiting');
    }
  );

  it('asks for plain text in the language being spoken, and claims nothing untrue', () => {
    for (const length of ['brief', 'medium', 'extended'] as const) {
      expect(systemPrompt(length)).toContain('plain text');
      expect(systemPrompt(length)).toContain('language being spoken');
      // Nothing trims a reply, so nothing may say one will be cut.
      expect(systemPrompt(length)).not.toMatch(/\bcut\b|truncat/i);
    }
  });

  it('asks Standard and Pro at low effort and Max at medium, with the larger two’s fallback', () => {
    expect(RESPONSE_MODELS.standard).toEqual({
      model: 'claude-haiku-5-5',
      effort: 'low',
      maxTokens: 2048,
      fallback: false,
    });
    expect(RESPONSE_MODELS.pro).toEqual({
      model: 'claude-sonnet-5-5',
      effort: 'low',
      maxTokens: 4096,
      fallback: true,
    });
    expect(RESPONSE_MODELS.max).toEqual({
      model: 'claude-opus-5-5',
      effort: 'medium',
      maxTokens: 8192,
      fallback: true,
    });
  });
});

// ── The route ────────────────────────────────────────────────────────────────

interface Call {
  beta: boolean;
  body: Record<string, unknown>;
}

/** A client that answers with whatever the test hands it, and records asks. */
function fakeClient(answer: (call: Call) => Promise<unknown> | unknown) {
  const calls: Call[] = [];
  const create = (beta: boolean) => async (body: unknown, options?: { signal?: AbortSignal }) => {
    const call = { beta, body: body as Record<string, unknown> };
    calls.push(call);
    const result = answer(call);
    if (result instanceof Promise) {
      return new Promise((resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        result.then(resolve, reject);
      });
    }
    return result;
  };
  const client = {
    messages: { create: create(false) },
    beta: { messages: { create: create(true) } },
  } as unknown as ClaudeClient;
  return { client, calls };
}

const reply = (text: string, extra: Record<string, unknown> = {}) => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-haiku-5-5',
  content: [
    { type: 'thinking', thinking: '', signature: 's' },
    { type: 'text', text },
  ],
  stop_reason: 'end_turn',
  usage: {
    input_tokens: 1200,
    output_tokens: 80,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  },
  ...extra,
});

let app: App;
let clock = T0;
let dir: string;

beforeEach(() => {
  clock = T0;
  dir = mkdtempSync(join(tmpdir(), 'thefloor-claude-'));
});

afterEach(async () => {
  if (app) {
    app.channels.stop();
    await app.fastify.close();
  }
  rmSync(dir, { recursive: true, force: true });
});

function boot(client?: ClaudeClient, timeoutMs?: number): App {
  app = buildApp({
    dbPath: join(dir, 'thefloor.db'),
    mailer: new MemoryMailer(),
    now: () => clock,
    roomCloseGraceMs: 0,
    claude: client,
    claudeTimeoutMs: timeoutMs,
  });
  return app;
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function signIn(identifier: string, displayName: string) {
  const code = app.accounts.issueCode(identifier, clock)!;
  const verified = await app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, displayName },
  });
  return verified.json() as { token: string; account: { id: string; displayName: string } };
}

/** Alice and Bob in a channel, both present, and something said in it. */
async function room2(options: { paste?: boolean } = {}) {
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
  if (options.paste !== false) {
    clock += 1_000;
    // The wire's shape, which carries text and has the clip minted from it —
    // `as never` for clipboard.test.ts's reason.
    app.channels.dispatch(channelId, bob.account.id, {
      type: 'PASTE_CLIP',
      text: 'What should we call the project?',
    } as never);
  }
  clock += 1_000;
  return { alice, bob, channelId };
}

const press = (channelId: string, token: string, length?: unknown) =>
  app.fastify.inject({
    method: 'POST',
    url: `/channels/${channelId}/claude`,
    headers: auth(token),
    ...(length === undefined ? {} : { payload: { length } }),
  });

const claudePastes = (channelId: string) =>
  app.db
    .prepare('SELECT * FROM pastes WHERE channel_id = ? AND author_id = ?')
    .all(channelId, CLAUDE_ID) as unknown as Array<{ display_name: string; text: string }>;

const usageRows = () =>
  app.db.prepare('SELECT * FROM claude_usage ORDER BY at').all() as unknown as Array<
    Record<string, unknown>
  >;

describe('Ask Claude', () => {
  it('is not offered, and answers 503, without a key', async () => {
    boot();
    const { alice, channelId } = await room2();
    const res = await press(channelId, alice.token);
    expect(res.statusCode).toBe(503);
    expect(usageRows()).toHaveLength(0);
  });

  it('posts the reply into the Record as Claude, and writes one ledger row with no text', async () => {
    const { client, calls } = fakeClient(() => reply('Call it Lantern, Bob.'));
    boot(client);
    const { alice, channelId } = await room2();

    const res = await press(channelId, alice.token);

    expect(res.statusCode).toBe(200);
    expect(claudePastes(channelId)).toEqual([
      expect.objectContaining({ display_name: 'Claude', text: 'Call it Lantern, Bob.' }),
    ]);
    expect(app.channels.get(channelId)!.clip?.authorId).toBe(CLAUDE_ID);
    // In the Record, inside the room's segments.
    const rooms = app.channels.rooms.forChannel(channelId, clock);
    expect(
      rooms.flatMap((r) => r.segments).some((s) => s.paste?.authorId === CLAUDE_ID)
    ).toBe(true);
    // The request: Standard's model, effort and ceiling, the Record, the rule last.
    expect(calls).toHaveLength(1);
    expect(calls[0].beta).toBe(false);
    expect(calls[0].body).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: 2048,
      output_config: { effort: 'low' },
      // No length, as builds up to 387 send: Medium.
      system: systemPrompt('medium'),
    });
    const content = (calls[0].body.messages as Array<{ content: string }>)[0].content;
    expect(content).toContain('Bob (pasted): What should we call the project?');
    expect(content.trim().endsWith(lengthRule('medium'))).toBe(true);
    // The ledger.
    const rows = usageRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      channel_id: channelId,
      account_id: alice.account.id,
      grade: 'standard',
      model: 'claude-haiku-5-5',
      input_tokens: 1200,
      output_tokens: 80,
      stop_reason: 'end_turn',
      outcome: 'posted',
    });
    expect(JSON.stringify(rows[0])).not.toContain('Lantern');
    // And the bar is back to Ask Claude.
    expect(app.channels.get(channelId)!.claude).toBeNull();
  });

  it.each(['brief', 'medium', 'extended'] as const)(
    'asks for a %s reply when that button is pressed',
    async (length) => {
      const { client, calls } = fakeClient(() => reply('Fine.'));
      boot(client);
      const { alice, channelId } = await room2();
      expect((await press(channelId, alice.token, length)).statusCode).toBe(200);
      expect(calls[0].body.system).toBe(systemPrompt(length));
      const content = (calls[0].body.messages as Array<{ content: string }>)[0].content;
      expect(content.trim().endsWith(lengthRule(length))).toBe(true);
    }
  );

  it('refuses a length there is no button for, without asking anybody', async () => {
    const { client, calls } = fakeClient(() => reply('Fine.'));
    boot(client);
    const { alice, channelId } = await room2();
    for (const length of ['epic', 'toString', 30]) {
      expect((await press(channelId, alice.token, length)).statusCode).toBe(400);
    }
    expect(calls).toHaveLength(0);
    expect(usageRows()).toHaveLength(0);
  });

  it('says Responding on every screen while it is out, and refuses a second press', async () => {
    let finish: (value: unknown) => void = () => {};
    const { client } = fakeClient(() => new Promise((resolve) => (finish = resolve)));
    boot(client);
    const { alice, bob, channelId } = await room2();

    const first = press(channelId, alice.token);
    await new Promise((r) => setTimeout(r, 10));
    expect(app.channels.get(channelId)!.claude).toEqual({ askedBy: alice.account.id, since: clock });

    const second = await press(channelId, bob.token);
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toBe('Claude is already responding.');

    finish(reply('Done.'));
    expect((await first).statusCode).toBe(200);
    expect(app.channels.get(channelId)!.claude).toBeNull();
  });

  it('refuses somebody who is not in the room, and asks nobody', async () => {
    const { client, calls } = fakeClient(() => reply('x'));
    boot(client);
    const { bob, channelId } = await room2();
    app.channels.dispatch(channelId, bob.account.id, { type: 'STEP_OUT' });
    const res = await press(channelId, bob.token);
    expect(res.statusCode).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it('answers an empty Record with a sentence, and never says Responding', async () => {
    const { client, calls } = fakeClient(() => reply('x'));
    boot(client);
    const { alice, channelId } = await room2({ paste: false });
    const res = await press(channelId, alice.token);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('There is nothing in the Record yet for Claude to read.');
    expect(calls).toHaveLength(0);
    expect(usageRows()).toHaveLength(0);
  });

  it('posts nothing for a reply over the paste limit, says why, and records too_long', async () => {
    const { client } = fakeClient(() => reply('word '.repeat(MAX_CLIP_LENGTH / 4)));
    boot(client);
    const { alice, channelId } = await room2();
    const res = await press(channelId, alice.token);
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('Claude’s reply was too long to post.');
    expect(claudePastes(channelId)).toHaveLength(0);
    expect(app.channels.get(channelId)!.claude).toBeNull();
    expect(usageRows()[0]).toMatchObject({ outcome: 'too_long' });
  });

  it('posts a reply that stopped on max_tokens exactly as it came back', async () => {
    const { client } = fakeClient(() => reply('It stops mid', { stop_reason: 'max_tokens' }));
    boot(client);
    const { alice, channelId } = await room2();
    expect((await press(channelId, alice.token)).statusCode).toBe(200);
    expect(claudePastes(channelId)[0].text).toBe('It stops mid');
    expect(usageRows()[0]).toMatchObject({ stop_reason: 'max_tokens', outcome: 'posted' });
  });

  it('posts nothing for a refusal, and says so', async () => {
    const { client } = fakeClient(() =>
      reply('', { stop_reason: 'refusal', content: [] })
    );
    boot(client);
    const { alice, channelId } = await room2();
    const res = await press(channelId, alice.token);
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('Claude declined to respond to this.');
    expect(claudePastes(channelId)).toHaveLength(0);
    expect(usageRows()[0]).toMatchObject({ outcome: 'refused' });
  });

  it('turns an API error into one sentence, writes nothing, and clears the card', async () => {
    const { client } = fakeClient(() => Promise.reject(new Error('overloaded')));
    boot(client);
    const { alice, channelId } = await room2();
    const res = await press(channelId, alice.token);
    expect(res.statusCode).toBe(502);
    expect(claudePastes(channelId)).toHaveLength(0);
    expect(app.channels.get(channelId)!.claude).toBeNull();
    expect(usageRows()[0]).toMatchObject({ outcome: 'error', input_tokens: 0 });
  });

  it('gives up after the timeout, and clears the card', async () => {
    const { client } = fakeClient(() => new Promise(() => {}));
    boot(client, 30);
    const { alice, channelId } = await room2();
    const res = await press(channelId, alice.token);
    expect(res.statusCode).toBe(504);
    expect(res.json().error).toBe('Claude took too long to respond.');
    expect(app.channels.get(channelId)!.claude).toBeNull();
    expect(usageRows()[0]).toMatchObject({ outcome: 'timeout' });
  });

  it('still posts the reply when the asker leaves before it comes', async () => {
    let finish: (value: unknown) => void = () => {};
    const { client } = fakeClient(() => new Promise((resolve) => (finish = resolve)));
    boot(client);
    const { alice, channelId } = await room2();
    const pressed = press(channelId, alice.token);
    await new Promise((r) => setTimeout(r, 10));
    app.channels.dispatch(channelId, alice.account.id, { type: 'STEP_OUT' });
    finish(reply('For Bob, then.'));
    expect((await pressed).statusCode).toBe(200);
    expect(claudePastes(channelId)[0].text).toBe('For Bob, then.');
  });

  it('nulls the presser on the ledger when their account is forgotten, keeping the spend', async () => {
    const { client } = fakeClient(() => reply('Hi.'));
    boot(client);
    const { alice, channelId } = await room2();
    await press(channelId, alice.token);
    app.channels.usage.forget(alice.account.id);
    expect(usageRows()[0]).toMatchObject({ account_id: null, input_tokens: 1200 });
  });
});

describe('the response model', () => {
  const makeDebug = (id: string) =>
    app.db.prepare('UPDATE accounts SET debug = 1 WHERE id = ?').run(id);

  const choose = (channelId: string, userId: string, responseModel: unknown) =>
    app.channels.dispatch(channelId, userId, { type: 'SET_RESPONSE_MODEL', responseModel } as never);

  it('is refused to an account without debug, and changes nothing', async () => {
    boot(fakeClient(() => reply('x')).client);
    const { alice, channelId } = await room2();
    for (const grade of ['pro', 'max']) {
      expect(choose(channelId, alice.account.id, grade)).toMatchObject({
        ok: false,
        code: 'forbidden',
        error: 'Only a debug account can choose the response model.',
      });
    }
    expect(app.channels.get(channelId)!.responseModel).toBe('standard');
  });

  it('refuses anything but the three grades, even from debug', async () => {
    boot(fakeClient(() => reply('x')).client);
    const { alice, channelId } = await room2();
    makeDebug(alice.account.id);
    for (const value of ['opus', undefined, 1]) {
      expect(choose(channelId, alice.account.id, value)).toMatchObject({ ok: false, code: 'invalid' });
    }
  });

  it('on Pro, asks Sonnet with the fallback whoever presses, and survives a restart', async () => {
    const { client, calls } = fakeClient(() => reply('Pro answer.', { model: 'claude-sonnet-5-5' }));
    boot(client);
    const { alice, bob, channelId } = await room2();
    makeDebug(alice.account.id);
    expect(choose(channelId, alice.account.id, 'pro')).toMatchObject({ ok: true });

    // Bob has no debug; the grade is the channel's, not the presser's.
    expect((await press(channelId, bob.token)).statusCode).toBe(200);
    expect(calls[0].beta).toBe(true);
    expect(calls[0].body).toMatchObject({
      model: 'claude-sonnet-5-5',
      max_tokens: 4096,
      output_config: { effort: 'low' },
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
    });
    expect(usageRows()[0]).toMatchObject({ grade: 'pro', model: 'claude-sonnet-5-5' });

    // A restart keeps the setting, and comes back with nobody being asked.
    app.channels.stop();
    await app.fastify.close();
    boot(client);
    expect(app.channels.get(channelId)!.responseModel).toBe('pro');
    expect(app.channels.get(channelId)!.claude).toBeNull();
  });

  it('on Max, asks Opus at medium effort with the fallback, and ledgers the grade', async () => {
    const { client, calls } = fakeClient(() => reply('Max answer.', { model: 'claude-opus-5-5' }));
    boot(client);
    const { alice, bob, channelId } = await room2();
    makeDebug(alice.account.id);
    expect(choose(channelId, alice.account.id, 'max')).toMatchObject({ ok: true });

    expect((await press(channelId, bob.token, 'extended')).statusCode).toBe(200);
    expect(calls[0].beta).toBe(true);
    expect(calls[0].body).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 8192,
      output_config: { effort: 'medium' },
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
    });
    expect(usageRows()[0]).toMatchObject({ grade: 'max', model: 'claude-opus-5-5' });
  });
});
