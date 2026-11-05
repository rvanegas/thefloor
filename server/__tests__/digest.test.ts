import { buildApp, type App } from '../src/app';
import type { ClaudeClient } from '../src/claude';
import { newId } from '../src/db';
import { DIGEST_AFTER_MS, DIGEST_MODEL, DIGEST_SYSTEM, clip } from '../src/digest';
import { MemoryMailer } from '../src/mail';
import { MemoryMediaServer } from '../src/media';
import { MemoryPusher } from '../src/push';
import { MemoryStreaming } from '../src/streaming';

/**
 * The digest: once a room has been transcribed for five minutes from its
 * beginning, the members not in it are sent what Claude makes of it — once
 * per room. The transcript is written straight into `live_lines`; how it gets
 * there is live-transcript.test.ts's business, and what is asserted here is
 * when a digest is sent, to whom, and when it is not.
 */

let clock = 1_700_000_000_000;
let app: App;
let pusher: MemoryPusher;
let calls: Array<Record<string, unknown>>;
let answer: () => Promise<unknown>;

const reply = (text: string, stop_reason = 'end_turn') => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: DIGEST_MODEL,
  content: [{ type: 'text', text }],
  stop_reason,
  usage: { input_tokens: 400, output_tokens: 60 },
});

beforeEach(() => {
  clock = 1_700_000_000_000;
  calls = [];
  answer = async () => reply('Alice and Bob are planning the trip to Lisbon.');
  const client = {
    messages: {
      create: async (body: Record<string, unknown>) => {
        calls.push(body);
        return answer();
      },
    },
    beta: { messages: { create: async () => { throw new Error('not used'); } } },
  } as unknown as ClaudeClient;
  pusher = new MemoryPusher();
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    media: new MemoryMediaServer(),
    streaming: new MemoryStreaming(),
    claude: client,
    pusher,
    now: () => clock,
    roomCloseGraceMs: 0,
  });
});

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

/**
 * Alice (on the house) present, switching the transcript on `textAfterMs`
 * after the room opens; Bob a member, absent, with a phone.
 */
async function room(textAfterMs = 0) {
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
  await app.fastify.inject({
    method: 'POST',
    url: '/devices',
    headers: auth(bob.token),
    payload: { token: 'bob-phone', platform: 'ios' },
  });
  const created = app.channels.create(alice.account.id, [bob.account.id]);
  if (!created.ok) throw new Error(created.error);
  const channelId = created.channel.id;
  app.channels.dispatch(channelId, alice.account.id, { type: 'ENTER' });
  clock += textAfterMs;
  expect((await turnOn(alice.token, channelId)).statusCode).toBe(200);
  return { alice, bob, channelId };
}

const turnOn = (token: string, channelId: string, on = true) =>
  app.fastify.inject({
    method: 'PUT',
    url: `/channels/${channelId}/live-transcription`,
    headers: auth(token),
    payload: { on },
  });

function said(channelId: string, name: string, text: string) {
  app.db
    .prepare(
      `INSERT INTO live_lines (id, channel_id, identity, display_name, start_at, end_at, text)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(newId('line'), channelId, name, name, clock, clock + 1_000, text);
}

/** Moves the clock on and ticks, then lets the digest's request settle. */
async function wait(ms: number) {
  clock += ms;
  app.channels.tick();
  await new Promise((resolve) => setImmediate(resolve));
}

const digestsTo = (token: string) =>
  pusher.messagesFor(token).filter((message) => message.kind === 'digest');

describe('the digest', () => {
  it('is sent to the absent five minutes in, once, in Claude’s words', async () => {
    const { channelId } = await room();
    said(channelId, 'Alice', 'So, Lisbon in March?');
    await wait(DIGEST_AFTER_MS - 1_000);
    expect(calls).toHaveLength(0);
    await wait(1_000);
    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBe(DIGEST_MODEL);
    expect(calls[0].system).toBe(DIGEST_SYSTEM);
    expect(JSON.stringify(calls[0].messages)).toContain('Alice: So, Lisbon in March?');
    const sent = digestsTo('bob-phone');
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toBe('Alice and Bob are planning the trip to Lisbon.');
    expect(sent[0].collapseKey).toBe(`${channelId}:digest`);
    // Once per room, however long it goes on.
    await wait(DIGEST_AFTER_MS);
    expect(calls).toHaveLength(1);
    expect(digestsTo('bob-phone')).toHaveLength(1);
    const ledger = app.db
      .prepare("SELECT account_id, outcome FROM claude_usage WHERE grade = 'digest'")
      .all();
    expect(ledger).toEqual([{ account_id: null, outcome: 'sent' }]);
  });

  it('counts the five minutes from the first line, however late the transcript began', async () => {
    const { channelId } = await room(3 * 60_000);
    await wait(2 * 60_000);
    said(channelId, 'Alice', 'Anyway.');
    await wait(DIGEST_AFTER_MS - 1_000);
    expect(calls).toHaveLength(0);
    await wait(1_000);
    expect(calls).toHaveLength(1);
    expect(digestsTo('bob-phone')).toHaveLength(1);
  });

  it('does not count a stop before anything was said', async () => {
    const { alice, channelId } = await room();
    await wait(60_000);
    expect((await turnOn(alice.token, channelId, false)).statusCode).toBe(200);
    expect((await turnOn(alice.token, channelId)).statusCode).toBe(200);
    await wait(1_000);
    said(channelId, 'Alice', 'Hello.');
    await wait(DIGEST_AFTER_MS);
    expect(calls).toHaveLength(1);
  });

  it('is not sent for a room whose transcript stopped within the five minutes', async () => {
    const { alice, channelId } = await room();
    said(channelId, 'Alice', 'Hello.');
    await wait(60_000);
    expect((await turnOn(alice.token, channelId, false)).statusCode).toBe(200);
    expect((await turnOn(alice.token, channelId)).statusCode).toBe(200);
    await wait(DIGEST_AFTER_MS);
    expect(calls).toHaveLength(0);
  });

  it('counts a stop that came before the first line was written but after it began', async () => {
    const { alice, channelId } = await room();
    const began = clock;
    clock += 1_000;
    expect((await turnOn(alice.token, channelId, false)).statusCode).toBe(200);
    expect((await turnOn(alice.token, channelId)).statusCode).toBe(200);
    // The turn lands afterwards, dated from when it began.
    app.db
      .prepare(
        `INSERT INTO live_lines (id, channel_id, identity, display_name, start_at, end_at, text)
         VALUES (?, ?, 'Alice', 'Alice', ?, ?, 'Hello.')`
      )
      .run(newId('line'), channelId, began, began + 500);
    await wait(DIGEST_AFTER_MS);
    expect(calls).toHaveLength(0);
  });

  it('asks nobody about a room in which nothing was said', async () => {
    await room();
    await wait(DIGEST_AFTER_MS);
    expect(calls).toHaveLength(0);
  });

  it('sends nothing Claude refused', async () => {
    answer = async () => reply('', 'refusal');
    const { channelId } = await room();
    said(channelId, 'Alice', 'Hello.');
    await wait(DIGEST_AFTER_MS);
    expect(calls).toHaveLength(1);
    expect(digestsTo('bob-phone')).toHaveLength(0);
  });
});

describe('clip', () => {
  it('leaves a short digest alone and cuts a long one at a word', () => {
    expect(clip('Short.')).toBe('Short.');
    const long = clip('word '.repeat(200));
    expect(long.length).toBeLessThanOrEqual(600);
    expect(long.endsWith('word…')).toBe(true);
  });
});
