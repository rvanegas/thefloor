import WebSocket from 'ws';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CLAUDE_ID, MAX_CLIP_LENGTH } from '../../core/constants';
import type { RoomView } from '../../core/protocol';
import { buildApp, type App } from '../src/app';
import {
  channelLibraryRule,
  CLAUDE_LIBRARY_TIMEOUT_MS,
  CLAUDE_TIMEOUT_MS,
  composeLibraryRecord,
  composeRecord,
  FALLBACK_BETA,
  LIBRARY_CONTINUATIONS,
  LIBRARY_TOOLS,
  librariesFor,
  MCP_BETA,
  replyText,
  renderWorking,
  workingSteps,
  LOOK_NOW,
  lengthRule,
  REPLY_WORD_LIMITS,
  RESPONSE_MODELS,
  systemPrompt,
  userMessage,
  type ClaudeClient,
  type LibraryOptions,
  type RecordSources,
} from '../src/claude';
import { openDb } from '../src/db';
import { noesisFilename, VOUCHED_GRANT, type NoesisOptions } from '../src/noesis';
import { MemoryMailer } from '../src/mail';
import { fakeAuth } from '../__stubs__/fakeAuth';
import { AuthClient } from '../src/auth';

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


/** Makes an account *Pro*, with a subscription that runs to 2100. */
const makePro = (id: string, expiresAt = 4_102_444_800_000) =>
  app.db
    .prepare(
      `INSERT INTO pro_subscriptions (original_transaction_id, account_id, product_id, environment,
         expires_at, latest_transaction_id, updated_at, raw) VALUES (?, ?, 'pro', 'Sandbox', ?, ?, 0, '{}')
         ON CONFLICT DO NOTHING`
    )
    .run(`t-${id}`, id, expiresAt, `t-${id}`);

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

describe('the Record beside the channel’s own library', () => {
  const HOUR = 3_600_000;
  const filed = (from: number, until: number, title: string | null = 'On Names') => ({
    ...spoken(from, until),
    filed: { file: `2023/2023-11-14-${from}.chat.md`, title },
  });
  // Three rooms an hour apart, each one filed segment of one line.
  const rooms = [0, 1, 2].map((n) => room(T0 + n * 2 * HOUR, [filed(T0 + n * 2 * HOUR, T0 + n * 2 * HOUR + 60_000)]));
  const lines = [0, 1, 2].map((n) => ({ displayName: `Speaker${n}`, startAt: T0 + n * 2 * HOUR + 1_000, text: `said ${'x'.repeat(200)} ${n}` }));
  const now = T0 + 6 * HOUR;

  it('carries the recent part in full, naming each document, and the older a line each', () => {
    // Room for the newest room's heading and its segment, not the next.
    const record = composeLibraryRecord(sources(rooms, lines), 'c', now, 300)!;
    expect(record.summarized).toBe(true);
    expect(record.trimmed).toBe(false);
    expect(record.text).toContain(`(Filed in this channel's library as 2023-11-14-${T0 + 4 * HOUR}.chat.md, titled "On Names".)`);
    expect(record.text).toContain('said');
    expect(record.text).not.toContain('Speaker0: said');
    expect(record.text).toMatch(/\[\d\d:\d\d–\d\d:\d\d\] Speaker0\. In this channel's library as 2023-11-14-\d+\.chat\.md, titled "On Names"\./);
    expect(record.text.match(/said/g)).toHaveLength(1);
    expect(userMessage(record, 'medium')).toContain('one line naming its document');
  });

  it('is the whole Record, documents named, while it all fits', () => {
    const record = composeLibraryRecord(sources(rooms, lines), 'c', now)!;
    expect(record.summarized).toBe(false);
    expect(record.text.match(/said/g)).toHaveLength(3);
    expect(record.text.match(/Filed in this channel's library/g)).toHaveLength(3);
  });

  it('keeps in full whatever the library does not hold, however old', () => {
    const older = [room(T0, [spoken(T0, T0 + 60_000)]), ...rooms.slice(1)];
    const record = composeLibraryRecord(sources(older, lines), 'c', now, 300)!;
    expect(record.text).toContain('Speaker0: said');
    expect(record.text).toContain('Speaker1. In this channel');
  });

  it('leaves out a title noesis never gave', () => {
    const untitled = [room(T0, [filed(T0, T0 + 60_000, null)])];
    const record = composeLibraryRecord(sources(untitled, lines), 'c', now)!;
    expect(record.text).toContain(`as 2023-11-14-${T0}.chat.md.)`);
  });

  it('drops the oldest past the usual budget, and says so', () => {
    const unfiled = [0, 1, 2].map((n) => room(T0 + n * 2 * HOUR, [spoken(T0 + n * 2 * HOUR, T0 + n * 2 * HOUR + 60_000)]));
    const record = composeLibraryRecord(sources(unfiled, lines), 'c', now, 100, 300)!;
    expect(record.trimmed).toBe(true);
    expect(record.text).toContain('said');
    expect(record.text).not.toContain('Speaker0');
  });
});

describe('Claude’s working, kept with its reply', () => {
  const LOOKUP = [
    'artificial cognition',
    '  Documents:',
    '    2026/2026-11-07-mem-architecture-summary.document.md — Mem Architecture Summary — 4200w',
    '      Three domains, and functional similarity is not phenomenal similarity.',
    '  Related: consciousness; functionalism',
  ].join('\n');
  const use = (id: string, name: string, input: Record<string, unknown> = {}, server = 'noesis') => ({
    type: 'mcp_tool_use',
    id,
    name,
    server_name: server,
    input,
  });
  const result = (id: string, text: string, isError = false) => ({
    type: 'mcp_tool_result',
    tool_use_id: id,
    is_error: isError,
    content: [{ type: 'text', text }],
  });
  const consulted = [
    { url: 'u', token: 't', owner: 'acct_a', libraries: ['alice/philosophy', 'alice/tech'] },
    { url: 'u', token: 't', owner: '', libraries: ['thefloor/ai'], channel: true },
  ];

  it('keeps every hit as the manifest returns it, the summary and Related terms included', () => {
    const [step] = workingSteps(
      [use('a', 'lookup_term', { term: 'artificial cognition' }, 'noesis-2'), result('a', LOOKUP)],
      consulted
    );
    expect(step).toEqual({
      tool: 'lookup_term',
      library: 'thefloor/ai',
      input: { term: 'artificial cognition' },
      kept: LOOKUP,
    });
  });

  it('keeps of a read only its length and heading, never the document', () => {
    const body = '# Mem Architecture Summary\n\nThe authors separate three domains.';
    const [step] = workingSteps(
      [use('a', 'read_document', { path: '2026/x.document.md', library: 'alice/tech' }), result('a', body)],
      consulted
    );
    expect(step.library).toBe('alice/tech');
    expect(step.kept).toBe('read in full: 9 words, headed "Mem Architecture Summary"');
    expect(JSON.stringify(step)).not.toContain('three domains');
  });

  it('keeps nothing of the guide, an error in full, and no library where the server had several', () => {
    const steps = workingSteps(
      [
        { type: 'text', text: 'Let me look.' },
        use('a', 'guide'),
        result('a', 'How the library is organized…'),
        use('b', 'read_file', { name: 'x.document.md' }),
        result('b', 'name the library: one of alice/philosophy, alice/tech — the one a search gave', true),
      ],
      consulted
    );
    expect(steps).toEqual([
      { tool: 'guide', library: null, input: {}, kept: null },
      {
        tool: 'read_file',
        library: null,
        input: { name: 'x.document.md' },
        kept: null,
        error: 'name the library: one of alice/philosophy, alice/tech — the one a search gave',
      },
    ]);
  });

  it('stands above Claude’s reply in the Record, each call with what came back', () => {
    const steps = workingSteps(
      [use('a', 'lookup_term', { term: 'artificial cognition' }, 'noesis-2'), result('a', LOOKUP)],
      consulted
    );
    const record = composeRecord(
      {
        ...sources([room(T0, [pasted(T0, CLAUDE_ID, 'Claude', 'I found it.')])]),
        working: (id) => (id === `seg_${T0}` ? steps : null),
      },
      'c',
      T0
    )!;
    expect(record.text).toContain(
      [
        'Before replying, Claude made these library calls (the server’s record):',
        '  lookup_term(term="artificial cognition") in thefloor/ai',
        '    artificial cognition',
        '      Documents:',
      ].join('\n')
    );
    expect(record.text).toContain('Related: consciousness; functionalism');
    expect(record.text.indexOf('Before replying')).toBeLessThan(record.text.indexOf('Claude: I found it.'));
    expect(renderWorking([])).toEqual([]);
  });

  it('tells every library press to look now, and every press what the record of its calls is', () => {
    for (const libraries of [
      [{ owner: 'Alice', libraries: ['alice/philosophy'] }],
      [
        { owner: 'Alice', libraries: ['alice/philosophy'] },
        { owner: 'Bob', libraries: ['bob/essays'] },
      ],
      [{ owner: null, libraries: ['thefloor/ai'], channel: true }],
    ]) {
      expect(systemPrompt('medium', libraries)).toContain(LOOK_NOW);
    }
    expect(systemPrompt('medium')).not.toContain(LOOK_NOW);
    expect(LOOK_NOW).toContain('you remember nothing else of an earlier turn');
  });
});

describe('the instructions', () => {
  it('caps each length at 50, 150 and 450 words', () => {
    expect(REPLY_WORD_LIMITS.brief.words).toBe(50);
    expect(REPLY_WORD_LIMITS.medium.words).toBe(150);
    expect(REPLY_WORD_LIMITS.extended.words).toBe(450);
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

  it('says nothing of a library unless the press consults one', () => {
    for (const length of ['brief', 'medium', 'extended'] as const) {
      expect(systemPrompt(length)).not.toMatch(/library|noesis|Related/);
      expect(systemPrompt(length, undefined)).toBe(systemPrompt(length));
    }
  });

  it('names the library’s owner, keeps citation inline against noesis’s guide, and keeps the limit', () => {
    const prompt = systemPrompt('medium', [{ owner: 'Rodrigo', libraries: ['rodrigo/notes'] }]);
    expect(prompt).toContain('Rodrigo’s own writing');
    expect(prompt).toContain('only when the conversation turns to something Rodrigo has written about');
    expect(prompt).toContain('Read the guide tool');
    expect(prompt).toContain('Related section as Rodrigo’s own recommendations');
    expect(prompt).toContain('do not write them here');
    expect(prompt).toContain('by its title in plain words');
    expect(prompt).toContain('plain text');
    expect(prompt).toContain(lengthRule('medium'));
    expect(prompt).not.toMatch(/\bcut\b|truncat/i);
    // Before anybody it names has signed in, it still makes sense.
    expect(systemPrompt('medium', [{ owner: null, libraries: ['x/y'] }])).toContain(
      'the library owner’s own writing'
    );
    expect(systemPrompt('medium', [])).toBe(systemPrompt('medium'));
  });

  it('says whose each library is when several people’s are on, and asks for whose a quote is', () => {
    const prompt = systemPrompt('medium', [
      { owner: 'Dana', libraries: ['dana/essays'] },
      { owner: 'Rodrigo', libraries: ['rodrigo/notes', 'rodrigo/philosophy'] },
    ]);
    expect(prompt).toContain(
      'Dana’s (dana/essays); Rodrigo’s (rodrigo/notes, rodrigo/philosophy)'
    );
    expect(prompt).toContain('Every result names the library it came from');
    expect(prompt).toContain('by its title and whose it is');
    expect(prompt).toContain('do not write them here');
    expect(prompt).toContain(lengthRule('medium'));
  });

  it('asks Standard and Pro at low effort and Max at medium, with the larger two’s fallback', () => {
    expect(RESPONSE_MODELS.standard).toEqual({
      model: 'claude-haiku-5-5',
      effort: 'low',
      maxTokens: 3072,
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
  noesisCalls.length = 0;
  noesisRefuses = false;
  authVouches = false;
  noesisLibraries = ['alice/philosophy'];
  noesisScope = 'noesis:read noesis:import';
  noesisNames = [];
  noesisImport = () =>
    new Response('event: output\ndata: {"text": "imported"}\n\nevent: done\ndata: {"exit_code": 0, "changed": {"2026/2026-11-02-lunch.chat.md": "abc"}, "deleted": []}\n\n');
});

/**
 * noesis, answered here: its token endpoint, `/me` and `/revoke`. A code trades
 * for `secret`, each refresh for `secret-<n>`, and `noesisRefuses` makes every
 * token request a 400, as noesis answers a grant it no longer honours.
 */
const noesisCalls: Array<{
  path: string;
  fields: Record<string, string>;
  method?: string;
  query?: Record<string, string>;
  body?: string;
}> = [];
let noesisRefuses = false;
/** What noesis's `/me` lists as the person's libraries. */
let noesisLibraries = ['alice/philosophy'];
/** The scopes noesis grants at a sign-in: `import` since 2026-11-02, nothing before. */
let noesisScope = 'noesis:read noesis:import';
/** The names noesis keeps as the person's voice, which `PUT /me/names` replaces. */
let noesisNames: string[] = [];
/** How noesis's import answers. */
let noesisImport: () => Response = () => new Response(null, { status: 500 });
/** Whether auth grants on The Floor's word for an address (`vouch`); it refuses unless a test says otherwise. */
let authVouches = false;
/** Who noesis's `/me` says signed in: the account connecting, unless a test says otherwise. */
let noesisWho: { user: string; email: string } = { user: 'alice', email: 'alice@example.com' };
const fakeNoesis = (async (input: unknown, init?: { body?: unknown; method?: string }) => {
  const url = new URL(String(input));
  const fields = Object.fromEntries(new URLSearchParams(String(init?.body ?? '')));
  noesisCalls.push({
    path: url.pathname,
    fields,
    method: init?.method,
    query: Object.fromEntries(url.searchParams),
    body: typeof init?.body === 'string' ? init.body : undefined,
  });
  if (url.pathname === '/token') {
    if (noesisRefuses) return new Response('{"error":"invalid_grant"}', { status: 400 });
    if (fields.grant_type === VOUCHED_GRANT && !authVouches) {
      return new Response('{"error":"unauthorized_client"}', { status: 400 });
    }
    const n = noesisCalls.filter((call) => call.path === '/token').length;
    return Response.json({
      access_token: fields.grant_type === 'authorization_code' ? 'secret' : `secret-${n}`,
      refresh_token: `refresh-${n}`,
      expires_in: 3600,
      ...(noesisScope ? { scope: noesisScope } : {}),
    });
  }
  if (url.pathname === '/me/names') {
    noesisNames = JSON.parse(String(init?.body)).names;
    return Response.json({ names: noesisNames });
  }
  if (url.pathname === '/me') {
    return Response.json({ ...noesisWho, libraries: noesisLibraries, names: noesisNames });
  }
  if (url.pathname.endsWith('/import')) return noesisImport();
  if (url.pathname === '/applications/token') return Response.json({ access_token: 'channel-token', expires_in: 3600 });
  return new Response(null, { status: 200 });
}) as typeof fetch;

const NOESIS: NoesisOptions = {
  url: 'https://noesis.example/mcp',
  authUrl: 'https://auth.example',
  clientId: 'thefloor',
  clientSecret: 'client-secret',
  callbackUrl: 'https://floor.example/noesis/callback',
  fetch: fakeNoesis,
};

/** Connects an account's library the way the callback does, past noesis's sign-in. */
async function connect(accountId: string, who?: { user: string; email: string }) {
  const email = app.accounts.byId(accountId)!.identifier;
  noesisWho = who ?? { user: email.split('@')[0], email };
  const state = new URL(app.noesis!.start(accountId, 'app')).searchParams.get('state')!;
  return app.noesis!.finish(state, 'code', undefined);
}

afterEach(async () => {
  if (app) {
    app.channels.stop();
    await app.fastify.close();
  }
  rmSync(dir, { recursive: true, force: true });
});

function boot(
  client?: ClaudeClient,
  timeoutMs?: number,
  library?: NoesisOptions,
  libraryTimeoutMs?: number,
  channelLibraries = false,
  authClient?: AuthClient
): App {
  app = buildApp({
    ...(channelLibraries
      ? {
          channelLibraries: {
            origin: 'https://noesis.example',
            auth: fakeAuth(),
            fetch: fakeNoesis,
          },
        }
      : {}),
    dbPath: join(dir, 'thefloor.db'),
    mailer: new MemoryMailer(),
    now: () => clock,
    roomCloseGraceMs: 0,
    claude: client,
    claudeTimeoutMs: timeoutMs,
    claudeLibraryTimeoutMs: libraryTimeoutMs,
    library,
    auth: authClient,
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
      max_tokens: 3072,
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

  it('carries the asker\u2019s voices onto the reply, for every phone to read it in', async () => {
    const { client } = fakeClient(() => reply('Fine.'));
    boot(client);
    const { alice, channelId } = await room2();
    const voices = { en: 'com.apple.voice.enhanced.en-US.Allison', es: 'com.apple.voice.premium.es-MX.Paulina' };
    const res = await app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/claude`,
      headers: auth(alice.token),
      payload: { length: 'brief', voices },
    });
    expect(res.statusCode).toBe(200);
    expect(app.channels.get(channelId)!.clip?.voices).toEqual(voices);
  });

  it('posts the reply without voices it cannot read, rather than refusing the press', async () => {
    for (const voices of ['Allison', ['en'], { english: 'x' }, { en: '' }, { en: 'x'.repeat(201) }]) {
      const { client } = fakeClient(() => reply('Fine.'));
      boot(client);
      const { alice, channelId } = await room2();
      const res = await app.fastify.inject({
        method: 'POST',
        url: `/channels/${channelId}/claude`,
        headers: auth(alice.token),
        payload: { length: 'brief', voices },
      });
      expect(res.statusCode).toBe(200);
      expect(app.channels.get(channelId)!.clip).not.toHaveProperty('voices');
    }
  });

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

describe('what a response posts', () => {
  const text = (t: string) => ({ type: 'text', text: t });
  const use = { type: 'mcp_tool_use', id: 'u', name: 'lookup_term', server_name: 'noesis', input: {} };
  const result = { type: 'mcp_tool_result', tool_use_id: 'u', is_error: false, content: [] };

  it('is all of its text when nothing was looked up, and never the thinking', () => {
    expect(replyText([{ type: 'thinking' }, text('Call it '), text('Lantern.')])).toBe(
      'Call it Lantern.'
    );
  });

  it('is only what follows the last lookup, without the working before it', () => {
    expect(
      replyText([
        text('Let me look that up.'),
        use,
        result,
        text('Checking one more.'),
        use,
        result,
        text('As you wrote in On Attention, it is a kind of will.'),
      ])
    ).toBe('As you wrote in On Attention, it is a kind of will.');
  });

  it('starts after a lookup whose result never came back', () => {
    expect(replyText([text('Looking.'), use, text('The answer.')])).toBe('The answer.');
  });

  it('drops a Related or References section the guide asked for, and keeps inline citations', () => {
    const answer = 'As James put it in 1890, and as you wrote in On Attention, it is will.';
    expect(
      replyText([
        text(`${answer}\n\n## Related\n\n| *On Attention*\n\n## References\n\n| James (1890) *Principles*`),
      ])
    ).toBe(answer);
    expect(replyText([text(`${answer}\n\nReferences:\nJames (1890) Principles`)])).toBe(answer);
    expect(replyText([text(`${answer}\n### Related\n| *On Attention*`)])).toBe(answer);
  });

  it('is nothing at all when the sections were all there was', () => {
    expect(replyText([use, result, text('## Related\n\n| *On Attention*')])).toBe('');
  });
});

describe('which presses consult the library', () => {
  const LIB: LibraryOptions = {
    url: 'https://noesis.example/mcp',
    tokenFor: async (accountId) => ({ a: 'ta', b: 'tb' })[accountId] ?? null,
  };
  const grades = ['standard', 'pro', 'max'] as const;
  const on = { library: true, libraries: { a: ['a/x', 'a/y'] }, participants: ['a', 'b'] };
  const a = { url: 'https://noesis.example/mcp?libraries=a%2Fx%2Ca%2Fy', token: 'ta', owner: 'a', libraries: ['a/x', 'a/y'] };
  const b = { url: 'https://noesis.example/mcp?libraries=b%2Fz', token: 'tb', owner: 'b', libraries: ['b/z'] };

  it('is none while the channel’s switch is off, on every grade', async () => {
    for (const grade of grades) {
      expect(await librariesFor(LIB, { ...on, library: false }, grade)).toEqual([]);
    }
  });

  it('is none on Standard even with it on, and its owner’s libraries on Pro and Max', async () => {
    expect(await librariesFor(LIB, on, 'standard')).toEqual([]);
    expect(await librariesFor(LIB, on, 'pro')).toEqual([a]);
    expect(await librariesFor(LIB, on, 'max')).toEqual([a]);
  });

  it('is every owner’s, in a stable order, each with their own token', async () => {
    const both = { ...on, libraries: { b: ['b/z'], a: ['a/x', 'a/y'] } };
    expect(await librariesFor(LIB, both, 'max')).toEqual([a, b]);
  });

  it('is none on a server without one, whatever the channel says', async () => {
    for (const grade of grades) expect(await librariesFor(undefined, on, grade)).toEqual([]);
  });

  it('reads a channel from before the switch as off', async () => {
    expect(await librariesFor(LIB, { participants: ['a'] } as never, 'max')).toEqual([]);
  });

  it('passes over an owner who has left or has no token, and keeps everybody else’s', async () => {
    const both = { ...on, libraries: { a: ['a/x', 'a/y'], b: ['b/z'] } };
    expect(await librariesFor(LIB, { ...both, participants: ['b'] }, 'max')).toEqual([b]);
    expect(await librariesFor(LIB, { ...on, libraries: { c: ['c/w'] } }, 'max')).toEqual([]);
  });
});

describe('a press with the library', () => {
  const LIBRARY = NOESIS;

  const setUp = async (
    grade: 'standard' | 'pro' | 'max',
    on = true,
    answer: (call: Call) => Promise<unknown> | unknown = () => reply('From the library.'),
    timeoutMs?: number,
    libraryTimeoutMs?: number
  ) => {
    const fake = fakeClient(answer);
    boot(fake.client, timeoutMs, LIBRARY, libraryTimeoutMs);
    const people = await room2();
    const { alice, channelId } = people;
    await connect(alice.account.id);
    makePro(alice.account.id);
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_RESPONSE_MODEL',
      responseModel: grade,
    } as never);
    if (on) {
      app.channels.dispatch(channelId, alice.account.id, {
        type: 'SET_LIBRARY',
        library: true,
        libraries: ['alice/philosophy'],
      } as never);
    }
    return { ...fake, ...people };
  };

  it('hands noesis to Claude on Pro, reading tools only, whoever presses', async () => {
    const { calls, bob, channelId } = await setUp('pro');
    // Bob owns nothing; the switch is the channel's.
    expect((await press(channelId, bob.token)).statusCode).toBe(200);
    expect(calls[0].beta).toBe(true);
    expect(calls[0].body).toMatchObject({
      model: 'claude-sonnet-5-5',
      betas: [MCP_BETA, FALLBACK_BETA],
      fallbacks: 'default',
      mcp_servers: [
        {
          type: 'url',
          url: 'https://noesis.example/mcp?libraries=alice%2Fphilosophy',
          name: 'noesis',
          authorization_token: 'secret',
        },
      ],
      tools: [{ type: 'mcp_toolset', mcp_server_name: 'noesis', default_config: { enabled: false } }],
    });
    const configs = (calls[0].body as { tools: Array<{ configs: Record<string, unknown> }> }).tools[0]
      .configs;
    expect(Object.keys(configs).sort()).toEqual([...LIBRARY_TOOLS].sort());
    expect(Object.keys(configs)).toEqual([
      'guide',
      'list_documents',
      'lookup_term',
      'read_document',
      'read_file',
    ]);
    for (const tool of LIBRARY_TOOLS) expect(configs[tool]).toEqual({ enabled: true });
  });

  it('passes over an owner whose Pro lapsed, their switch left on for when it returns', async () => {
    const { calls, alice, bob, channelId } = await setUp('pro');
    // Bob chose the grade; Alice's subscription ended a day ago.
    makePro(bob.account.id);
    app.db.prepare('UPDATE pro_subscriptions SET expires_at = ? WHERE account_id = ?').run(clock - 86_400_000, alice.account.id);
    expect((await press(channelId, bob.token)).statusCode).toBe(200);
    expect(calls[0].body).not.toHaveProperty('mcp_servers');
    expect(app.channels.get(channelId)).toMatchObject({ libraries: { [alice.account.id]: ['alice/philosophy'] } });
  });

  it('tells Claude whose library it is, whoever presses', async () => {
    const { calls, bob, channelId } = await setUp('pro');
    expect((await press(channelId, bob.token)).statusCode).toBe(200);
    expect(calls[0].body.system).toBe(
      systemPrompt('medium', [{ owner: 'Alice', libraries: ['alice/philosophy'] }])
    );
  });

  it('hands Claude a server per owner when several people’s are on, and says whose each is', async () => {
    const { calls, alice, bob, channelId } = await setUp('pro');
    noesisLibraries = ['bob/essays'];
    await connect(bob.account.id);
    makePro(bob.account.id);
    app.channels.dispatch(channelId, bob.account.id, {
      type: 'SET_LIBRARY',
      library: true,
      libraries: ['bob/essays'],
    } as never);
    expect((await press(channelId, alice.token)).statusCode).toBe(200);
    const [first, second] = [alice, bob]
      .map((who) => ({ id: who.account.id, name: who === alice ? 'Alice' : 'Bob' }))
      .sort((x, y) => (x.id < y.id ? -1 : 1));
    const url = (id: string) =>
      id === alice.account.id
        ? 'https://noesis.example/mcp?libraries=alice%2Fphilosophy'
        : 'https://noesis.example/mcp?libraries=bob%2Fessays';
    expect(calls[0].body).toMatchObject({
      mcp_servers: [
        { name: 'noesis', url: url(first.id) },
        { name: 'noesis-2', url: url(second.id) },
      ],
      tools: [
        { type: 'mcp_toolset', mcp_server_name: 'noesis' },
        { type: 'mcp_toolset', mcp_server_name: 'noesis-2' },
      ],
    });
    const libraries = (id: string) => (id === alice.account.id ? ['alice/philosophy'] : ['bob/essays']);
    expect(calls[0].body.system).toBe(
      systemPrompt('medium', [
        { owner: first.name, libraries: libraries(first.id) },
        { owner: second.name, libraries: libraries(second.id) },
      ])
    );
  });

  it('posts only the answer after the lookups, as Claude', async () => {
    const answer = 'As you wrote in On Attention, Alice, it is a kind of will.';
    const fake = fakeClient(() =>
      reply('', {
        model: 'claude-sonnet-5-5',
        content: [
          { type: 'text', text: 'Let me look that up.' },
          { type: 'mcp_tool_use', id: 'u', name: 'lookup_term', server_name: 'noesis', input: {} },
          { type: 'mcp_tool_result', tool_use_id: 'u', is_error: false, content: [] },
          { type: 'text', text: `${answer}\n\n## Related\n\n| *On Attention*` },
        ],
      })
    );
    boot(fake.client, undefined, LIBRARY);
    const { alice, bob, channelId } = await room2();
    makePro(alice.account.id);
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_RESPONSE_MODEL',
      responseModel: 'pro',
    } as never);
    app.channels.dispatch(channelId, alice.account.id, { type: 'SET_LIBRARY', library: true } as never);

    expect((await press(channelId, bob.token)).statusCode).toBe(200);
    expect(claudePastes(channelId)).toEqual([
      expect.objectContaining({ display_name: 'Claude', text: answer }),
    ]);
  });

  it('keeps the calls with the reply, and hands them to the next press in the Record', async () => {
    let n = 0;
    const { calls, bob, channelId } = await setUp('pro', true, () =>
      ++n === 1
        ? reply('', {
            model: 'claude-sonnet-5-5',
            content: [
              { type: 'mcp_tool_use', id: 'u', name: 'lookup_term', server_name: 'noesis', input: { term: 'attention' } },
              {
                type: 'mcp_tool_result',
                tool_use_id: 'u',
                is_error: false,
                content: [{ type: 'text', text: 'attention\n  Documents:\n    2026/2026-01-02-on-attention.document.md — On Attention — 900w\n      Attention as a kind of will.' }],
              },
              { type: 'text', text: 'On Attention says it is a kind of will.' },
            ],
          })
        : reply('Again.', { model: 'claude-sonnet-5-5' })
    );

    expect((await press(channelId, bob.token)).statusCode).toBe(200);
    const [kept] = claudePastes(channelId) as unknown as Array<{ working: string }>;
    expect(JSON.parse(kept.working)).toEqual([
      {
        tool: 'lookup_term',
        library: 'alice/philosophy',
        input: { term: 'attention' },
        kept: 'attention\n  Documents:\n    2026/2026-01-02-on-attention.document.md — On Attention — 900w\n      Attention as a kind of will.',
      },
    ]);

    expect((await press(channelId, bob.token)).statusCode).toBe(200);
    const next = JSON.stringify(calls[1].body.messages);
    expect(next).toContain('lookup_term(term=\\"attention\\") in alice/philosophy');
    expect(next).toContain('Attention as a kind of will.');
  });

  it('keeps nothing beside a reply that made no calls', async () => {
    const { bob, channelId } = await setUp('pro');
    expect((await press(channelId, bob.token)).statusCode).toBe(200);
    expect(claudePastes(channelId)).toEqual([expect.objectContaining({ working: null })]);
  });

  it('asks once more without noesis when a request with it fails, and posts that answer', async () => {
    const { calls, bob, channelId } = await setUp('pro', true, (call) => {
      if (call.body.mcp_servers) throw new Error('noesis unreachable');
      return reply('Without the library.', { model: 'claude-sonnet-5-5' });
    });
    expect((await press(channelId, bob.token)).statusCode).toBe(200);
    expect(calls).toHaveLength(2);
    expect(calls[0].body).toHaveProperty('mcp_servers');
    expect(calls[1].body).not.toHaveProperty('mcp_servers');
    expect(calls[1].body).not.toHaveProperty('tools');
    expect(calls[1].body).toMatchObject({ betas: [FALLBACK_BETA] });
    expect(calls[1].body.system).toBe(systemPrompt('medium'));
    expect(claudePastes(channelId)).toEqual([
      expect.objectContaining({ text: 'Without the library.' }),
    ]);
  });

  it('asks nothing again when the library was not in it', async () => {
    const { calls, alice, channelId } = await setUp('pro', false, () => {
      throw new Error('down');
    });
    expect((await press(channelId, alice.token)).statusCode).toBe(502);
    expect(calls).toHaveLength(1);
  });

  it('asks nothing again after a timeout, the time being spent', async () => {
    const { calls, alice, channelId } = await setUp('pro', true, () => new Promise(() => {}), 30, 30);
    expect((await press(channelId, alice.token)).statusCode).toBe(504);
    expect(calls).toHaveLength(1);
    expect(usageRows()[0]).toMatchObject({ outcome: 'timeout' });
  });

  it('waits two minutes rather than one, since it is several turns', () => {
    expect(CLAUDE_TIMEOUT_MS).toBe(60_000);
    expect(CLAUDE_LIBRARY_TIMEOUT_MS).toBe(120_000);
  });

  it('gives a press that consults it the library’s timeout, and every other press the plain one', async () => {
    const slow = () =>
      new Promise((resolve) =>
        setTimeout(() => resolve(reply('Slowly.', { model: 'claude-sonnet-5-5' })), 80)
      );
    const { bob, channelId } = await setUp('pro', true, slow, 30, 1_000);
    expect((await press(channelId, bob.token)).statusCode).toBe(200);

    app.channels.dispatch(channelId, bob.account.id, { type: 'SET_LIBRARY', library: false } as never);
    expect((await press(channelId, bob.token)).statusCode).toBe(504);
  });

  it('ledgers how many lookups it made, and null for a press that did not consult it', async () => {
    const withLookups = reply('', {
      model: 'claude-sonnet-5-5',
      content: [
        { type: 'mcp_tool_use', id: 'a', name: 'guide', server_name: 'noesis', input: {} },
        { type: 'mcp_tool_result', tool_use_id: 'a', is_error: false, content: [] },
        { type: 'mcp_tool_use', id: 'b', name: 'lookup_term', server_name: 'noesis', input: {} },
        { type: 'mcp_tool_result', tool_use_id: 'b', is_error: false, content: [] },
        { type: 'text', text: 'Found it.' },
      ],
    });
    let answer: unknown = withLookups;
    const { alice, bob, channelId } = await setUp('pro', true, () => answer);
    expect((await press(channelId, bob.token)).statusCode).toBe(200);
    answer = reply('Nothing to look up.', { model: 'claude-sonnet-5-5' });
    expect((await press(channelId, bob.token)).statusCode).toBe(200);
    app.channels.dispatch(channelId, alice.account.id, { type: 'SET_LIBRARY', library: false } as never);
    expect((await press(channelId, bob.token)).statusCode).toBe(200);
    expect(usageRows().map((row) => row.library_calls)).toEqual([2, 0, null]);
  });

  it('ledgers no lookups when noesis failed and the press went without it', async () => {
    const { bob, channelId } = await setUp('pro', true, (call) => {
      if (call.body.mcp_servers) throw new Error('noesis unreachable');
      return reply('Without the library.', { model: 'claude-sonnet-5-5' });
    });
    expect((await press(channelId, bob.token)).statusCode).toBe(200);
    expect(usageRows()[0]).toMatchObject({ library_calls: 0, outcome: 'posted' });
  });

  it('adds the column to a ledger from before it, null on every row', () => {
    // The table as it stood before the column, with a row in it.
    const path = join(dir, 'old.db');
    const old = new DatabaseSync(path);
    old.exec(
      `CREATE TABLE claude_usage (
         id TEXT PRIMARY KEY, at INTEGER NOT NULL, channel_id TEXT NOT NULL,
         account_id TEXT, grade TEXT NOT NULL, model TEXT NOT NULL,
         input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL,
         cache_write_tokens INTEGER NOT NULL, cache_read_tokens INTEGER NOT NULL,
         stop_reason TEXT, outcome TEXT NOT NULL);
       INSERT INTO claude_usage VALUES
         ('c1', 1, 'ch', 'a', 'pro', 'm', 1, 1, 0, 0, 'end_turn', 'posted');`
    );
    old.close();
    const db = openDb(path);
    const row = db.prepare('SELECT * FROM claude_usage').get() as Record<string, unknown>;
    expect(row).toHaveProperty('library_calls', null);
    db.close();
  });

  it('resumes a paused turn with what it returned, and ledgers both halves', async () => {
    const working = [
      { type: 'text', text: 'Let me look that up.' },
      { type: 'mcp_tool_use', id: 'u', name: 'lookup_term', server_name: 'noesis', input: {} },
      { type: 'mcp_tool_result', tool_use_id: 'u', is_error: false, content: [] },
    ];
    let n = 0;
    const { calls, bob, channelId } = await setUp('pro', true, () =>
      n++ === 0
        ? reply('', { model: 'claude-sonnet-5-5', stop_reason: 'pause_turn', content: working })
        : reply('As you wrote, it is will.', { model: 'claude-sonnet-5-5' })
    );
    expect((await press(channelId, bob.token)).statusCode).toBe(200);
    expect(calls).toHaveLength(2);
    const messages = calls[1].body.messages as Array<{ role: string; content: unknown }>;
    expect(messages).toHaveLength(2);
    expect(messages[1]).toEqual({ role: 'assistant', content: working });
    expect(calls[1].body).toHaveProperty('mcp_servers');
    expect(claudePastes(channelId)).toEqual([
      expect.objectContaining({ text: 'As you wrote, it is will.' }),
    ]);
    expect(usageRows()).toHaveLength(1);
    expect(usageRows()[0]).toMatchObject({
      input_tokens: 2400,
      output_tokens: 160,
      outcome: 'posted',
      // The one lookup was in the first half; the count spans both.
      library_calls: 1,
    });
  });

  it('stops resuming after two continuations, and says Claude had nothing to add', async () => {
    const paused = reply('', {
      model: 'claude-sonnet-5-5',
      stop_reason: 'pause_turn',
      content: [
        { type: 'mcp_tool_use', id: 'u', name: 'lookup_term', server_name: 'noesis', input: {} },
        { type: 'mcp_tool_result', tool_use_id: 'u', is_error: false, content: [] },
      ],
    });
    const { calls, bob, channelId } = await setUp('pro', true, () => paused);
    const res = await press(channelId, bob.token);
    expect(calls).toHaveLength(1 + LIBRARY_CONTINUATIONS);
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('Claude had nothing to add.');
  });

  it('tells Claude nothing of it with the switch off', async () => {
    const { calls, bob, channelId } = await setUp('pro', false);
    expect((await press(channelId, bob.token)).statusCode).toBe(200);
    expect(calls[0].body.system).toBe(systemPrompt('medium'));
  });

  it('hands it over on Max too', async () => {
    const { calls, bob, channelId } = await setUp('max');
    expect((await press(channelId, bob.token)).statusCode).toBe(200);
    expect(calls[0].body).toMatchObject({ model: 'claude-opus-5-5', betas: [MCP_BETA, FALLBACK_BETA] });
    expect(calls[0].body).toHaveProperty('mcp_servers');
  });

  it('leaves Standard the plain call even with it on', async () => {
    const { calls, alice, channelId } = await setUp('standard');
    expect((await press(channelId, alice.token)).statusCode).toBe(200);
    expect(calls[0].beta).toBe(false);
    expect(calls[0].body).not.toHaveProperty('mcp_servers');
    expect(calls[0].body).not.toHaveProperty('tools');
  });

  it('sends nothing of it with the switch off', async () => {
    const { calls, alice, channelId } = await setUp('pro', false);
    expect((await press(channelId, alice.token)).statusCode).toBe(200);
    expect(calls[0].body).toMatchObject({ betas: [FALLBACK_BETA] });
    expect(calls[0].body).not.toHaveProperty('mcp_servers');
    expect(calls[0].body).not.toHaveProperty('tools');
  });
});

describe('the library switch', () => {
  // On names whatever noesis lists for whoever switches: the fake lists one set
  // for everybody, so a test with two owners changes it between connects.
  const set = (channelId: string, userId: string, library: unknown) =>
    app.channels.dispatch(channelId, userId, {
      type: 'SET_LIBRARY',
      library,
      ...(library === true ? { libraries: app.noesis?.librariesOf(userId) ?? [] } : {}),
    } as never);

  it('is switched on as the library of whoever has one connected, and survives a restart', async () => {
    const { client } = fakeClient(() => reply('x'));
    boot(client, undefined, NOESIS);
    const { alice, channelId } = await room2();
    await connect(alice.account.id);
    makePro(alice.account.id);
    expect(set(channelId, alice.account.id, true)).toMatchObject({ ok: true });
    expect(app.channels.get(channelId)).toMatchObject({
      library: true,
      libraries: { [alice.account.id]: ['alice/philosophy'] },
    });

    app.channels.stop();
    await app.fastify.close();
    boot(client, undefined, NOESIS);
    expect(app.channels.get(channelId)).toMatchObject({
      library: true,
      libraries: { [alice.account.id]: ['alice/philosophy'] },
    });
    expect(app.noesis!.connected(alice.account.id)).toBe(true);
    expect(set(channelId, alice.account.id, false)).toMatchObject({ ok: true });
    expect(app.channels.get(channelId)!.library).toBe(false);
  });

  it('is refused on to somebody connected without Pro, noesis being read-only for them', async () => {
    const { client } = fakeClient(() => reply('x'));
    boot(client, undefined, NOESIS);
    const { alice, channelId } = await room2();
    await connect(alice.account.id);
    expect(set(channelId, alice.account.id, true)).toMatchObject({ ok: false });
    const status = await app.fastify.inject({ method: 'GET', url: '/me/noesis', headers: auth(alice.token) });
    expect(status.json()).toMatchObject({ connected: true, pro: false });
    // The mark set by hand is Pro, since 2026-11-10, here as everywhere.
    app.db.prepare('UPDATE accounts SET transcripts_unlimited = 1 WHERE id = ?').run(alice.account.id);
    expect(set(channelId, alice.account.id, true)).toMatchObject({ ok: true });
    const again = await app.fastify.inject({ method: 'GET', url: '/me/noesis', headers: auth(alice.token) });
    expect(again.json()).toMatchObject({ connected: true, pro: true });
  });

  it('is refused on, by name, to anybody without a library connected, and is anybody’s to switch off', async () => {
    boot(fakeClient(() => reply('x')).client, undefined, NOESIS);
    const { alice, bob, channelId } = await room2();
    expect(set(channelId, bob.account.id, true)).toMatchObject({
      ok: false,
      code: 'forbidden',
      error: 'Connect your noesis library on Floor Settings to offer it here.',
    });
    expect(app.channels.get(channelId)!.library).toBe(false);
    await connect(alice.account.id);
    makePro(alice.account.id);
    expect(set(channelId, alice.account.id, true)).toMatchObject({ ok: true });
    expect(set(channelId, bob.account.id, false)).toMatchObject({ ok: true });
    expect(app.channels.get(channelId)).toMatchObject({ library: false });
    expect(app.channels.get(channelId)).not.toHaveProperty('libraries');
  });

  it('refuses anything but true or false, even from somebody connected', async () => {
    boot(fakeClient(() => reply('x')).client, undefined, NOESIS);
    const { alice, channelId } = await room2();
    await connect(alice.account.id);
    makePro(alice.account.id);
    for (const value of ['yes', undefined, 1]) {
      expect(set(channelId, alice.account.id, value)).toMatchObject({ ok: false, code: 'invalid' });
    }
  });

  it('is no action at all on a server without noesis, or without Claude to consult it', async () => {
    boot(fakeClient(() => reply('x')).client);
    let { alice, channelId } = await room2();
    expect(set(channelId, alice.account.id, true)).toMatchObject({ ok: false, code: 'invalid' });

    app.channels.stop();
    await app.fastify.close();
    rmSync(dir, { recursive: true, force: true });
    dir = mkdtempSync(join(tmpdir(), 'thefloor-claude-'));
    boot(undefined, undefined, NOESIS);
    ({ alice, channelId } = await room2());
    expect(set(channelId, alice.account.id, false)).toMatchObject({ ok: false, code: 'invalid' });
    expect(app.channels.get(channelId)!.library).toBe(false);
  });

  it('tells every reader the switch is there, and whether it is theirs to turn', async () => {
    const firstView = async (token: string, channelId: string) => {
      const address = app.fastify.server.address() as { port: number };
      const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws?token=${token}`);
      const received: Array<Record<string, unknown>> = [];
      socket.on('message', (raw) => received.push(JSON.parse(String(raw))));
      await new Promise((resolve) => socket.once('open', resolve));
      socket.send(JSON.stringify({ type: 'watch.channel', channelId }));
      for (let n = 0; n < 500; n++) {
        const found = received.find((m) => m.type === 'channel');
        if (found) {
          socket.close();
          return found.view as Record<string, unknown>;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error('no channel message arrived');
    };

    boot(fakeClient(() => reply('x')).client, undefined, NOESIS);
    await app.fastify.listen({ port: 0, host: '127.0.0.1' });
    let { alice, bob, channelId } = await room2();
    await connect(alice.account.id);
    makePro(alice.account.id);
    expect(await firstView(alice.token, channelId)).toMatchObject({
      libraryAvailable: true,
      mayChangeLibrary: true,
    });
    expect(await firstView(bob.token, channelId)).toMatchObject({
      libraryAvailable: true,
      mayChangeLibrary: false,
    });
    // On, it is anybody's to switch off.
    set(channelId, alice.account.id, true);
    expect(await firstView(bob.token, channelId)).toMatchObject({ mayChangeLibrary: true });

    // Claude without noesis: neither field, as an old server sends neither.
    app.channels.stop();
    await app.fastify.close();
    rmSync(dir, { recursive: true, force: true });
    dir = mkdtempSync(join(tmpdir(), 'thefloor-claude-'));
    boot(fakeClient(() => reply('x')).client);
    await app.fastify.listen({ port: 0, host: '127.0.0.1' });
    ({ alice, channelId } = await room2());
    const plain = await firstView(alice.token, channelId);
    expect(plain.claude).toBe(true);
    expect(plain).not.toHaveProperty('libraryAvailable');
    expect(plain).not.toHaveProperty('mayChangeLibrary');
  });

  it('refuses on without naming which libraries', async () => {
    boot(fakeClient(() => reply('x')).client, undefined, NOESIS);
    const { alice, channelId } = await room2();
    await connect(alice.account.id);
    makePro(alice.account.id);
    const bare = app.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_LIBRARY',
      library: true,
    } as never);
    expect(bare).toMatchObject({ ok: false, code: 'invalid' });
    expect(app.channels.get(channelId)!.library).toBe(false);
  });

  it('takes the libraries a new build names, the owner’s own only, beside anybody else’s', async () => {
    noesisLibraries = ['alice/notes', 'alice/philosophy'];
    boot(fakeClient(() => reply('x')).client, undefined, NOESIS);
    const { alice, bob, channelId } = await room2();
    await connect(alice.account.id);
    makePro(alice.account.id);
    const choose = (userId: string, libraries: unknown) =>
      app.channels.dispatch(channelId, userId, { type: 'SET_LIBRARY', library: true, libraries } as never);
    expect(choose(alice.account.id, ['alice/notes'])).toMatchObject({ ok: true });
    expect(choose(alice.account.id, ['alice/philosophy', 'alice/notes'])).toMatchObject({ ok: true });
    expect(app.channels.get(channelId)!.libraries).toEqual({
      [alice.account.id]: ['alice/notes', 'alice/philosophy'],
    });
    expect(choose(alice.account.id, ['bob/secret'])).toMatchObject({ ok: false, code: 'invalid' });
    expect(choose(alice.account.id, 'alice/notes')).toMatchObject({ ok: false, code: 'invalid' });

    // Bob, with his own library, puts it on beside Alice's — and not hers.
    noesisLibraries = ['bob/essays'];
    await connect(bob.account.id);
    makePro(bob.account.id);
    expect(choose(bob.account.id, ['alice/notes'])).toMatchObject({ ok: false, code: 'invalid' });
    expect(choose(bob.account.id, ['bob/essays'])).toMatchObject({ ok: true });
    const both = {
      [alice.account.id]: ['alice/notes', 'alice/philosophy'],
      [bob.account.id]: ['bob/essays'],
    };
    expect(app.channels.get(channelId)!.libraries).toEqual(both);

    // And it survives a restart.
    const { client } = fakeClient(() => reply('x'));
    app.channels.stop();
    await app.fastify.close();
    boot(client, undefined, NOESIS);
    expect(app.channels.get(channelId)).toMatchObject({ library: true, libraries: both });

    // Alice may stop Bob's by name, and Alice's stays.
    expect(
      app.channels.dispatch(channelId, alice.account.id, {
        type: 'SET_LIBRARY',
        library: false,
        owner: bob.account.id,
      } as never)
    ).toMatchObject({ ok: true });
    expect(app.channels.get(channelId)!.libraries).toEqual({
      [alice.account.id]: ['alice/notes', 'alice/philosophy'],
    });
  });

  it('drops a library deleted at noesis from every channel, and goes off with none left', async () => {
    noesisLibraries = ['alice/notes', 'alice/philosophy'];
    boot(fakeClient(() => reply('x')).client, undefined, NOESIS);
    const { alice, channelId } = await room2();
    await connect(alice.account.id);
    makePro(alice.account.id);
    app.channels.dispatch(channelId, alice.account.id, {
      type: 'SET_LIBRARY',
      library: true,
      libraries: ['alice/notes', 'alice/philosophy'],
    } as never);
    const look = () => app.fastify.inject({ method: 'GET', url: '/me/noesis', headers: auth(alice.token) });

    // A channel's library, which noesis lists to its members, is not one of hers.
    noesisLibraries = ['alice/philosophy', 'alice/new', 'thefloor/book-club-k3x9'];
    expect((await look()).json()).toMatchObject({ libraries: ['alice/philosophy', 'alice/new'] });
    expect(app.channels.get(channelId)!.libraries).toEqual({ [alice.account.id]: ['alice/philosophy'] });

    noesisLibraries = ['alice/new'];
    await look();
    expect(app.channels.get(channelId)!.library).toBe(false);
    expect(app.channels.get(channelId)).not.toHaveProperty('libraries');
  });

  it('consults nothing once its owner has left the channel', async () => {
    const fake = fakeClient(() => reply('Plain.', { model: 'claude-sonnet-5-5' }));
    boot(fake.client, undefined, NOESIS);
    const { alice, bob, channelId } = await room2();
    makePro(alice.account.id);
    set(channelId, alice.account.id, false);
    app.channels.dispatch(channelId, alice.account.id, { type: 'SET_RESPONSE_MODEL', responseModel: 'pro' } as never);
    await connect(alice.account.id);
    makePro(alice.account.id);
    set(channelId, alice.account.id, true);
    // Bob stays, and Alice's library leaves with her: the state still says on.
    const raw = app.channels.get(channelId)!;
    (app.channels as unknown as { channels: Map<string, unknown> }).channels.set(channelId, {
      ...raw,
      participants: raw.participants.filter((id) => id !== alice.account.id),
    });
    expect((await press(channelId, bob.token)).statusCode).toBe(200);
    expect(fake.calls[0].body).not.toHaveProperty('mcp_servers');
  });
});

describe('connecting an noesis library', () => {
  it('reads as unavailable where the server has no noesis', async () => {
    boot(fakeClient(() => reply('x')).client);
    const { alice } = await room2();
    const status = await app.fastify.inject({ method: 'GET', url: '/me/noesis', headers: auth(alice.token) });
    expect(status.json()).toEqual({ available: false, connected: false });
    const connecting = await app.fastify.inject({
      method: 'POST',
      url: '/me/noesis/connect',
      headers: auth(alice.token),
      payload: {},
    });
    expect(connecting.statusCode).toBe(503);
  });

  it('signs in at noesis and comes back connected, into the app or onto a page', async () => {
    boot(fakeClient(() => reply('x')).client, undefined, NOESIS);
    const { alice } = await room2();
    const started = await app.fastify.inject({
      method: 'POST',
      url: '/me/noesis/connect',
      headers: auth(alice.token),
      payload: { returnTo: 'app' },
    });
    const url = new URL(started.json().url);
    expect(url.origin + url.pathname).toBe('https://auth.example/authorize');
    expect(url.searchParams.get('client_id')).toBe('thefloor');
    expect(url.searchParams.get('redirect_uri')).toBe('https://floor.example/noesis/callback');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe('noesis:read noesis:import');

    const back = await app.fastify.inject({
      method: 'GET',
      url: `/noesis/callback?state=${url.searchParams.get('state')}&code=abc`,
    });
    expect(back.statusCode).toBe(302);
    expect(back.headers.location).toBe('thefloor://noesis?result=connected');
    const exchange = noesisCalls.find((call) => call.fields.grant_type === 'authorization_code')!.fields;
    expect(exchange).toMatchObject({
      grant_type: 'authorization_code',
      code: 'abc',
      client_id: 'thefloor',
      client_secret: 'client-secret',
      redirect_uri: 'https://floor.example/noesis/callback',
    });
    // The verifier is the challenge's.
    expect(createHash('sha256').update(exchange.code_verifier).digest('base64url')).toBe(
      url.searchParams.get('code_challenge')
    );
    const status = await app.fastify.inject({ method: 'GET', url: '/me/noesis', headers: auth(alice.token) });
    expect(status.json()).toMatchObject({
      available: true,
      connected: true,
      user: 'alice',
      email: 'alice@example.com',
    });
    // The refresh token is sealed, never written as it came.
    const row = app.db.prepare('SELECT refresh_token FROM noesis_connections').get() as { refresh_token: string };
    expect(row.refresh_token).not.toContain('refresh-');

    // The same state twice is nothing: it was spent.
    const again = await app.fastify.inject({
      method: 'GET',
      url: `/noesis/callback?state=${url.searchParams.get('state')}&code=abc`,
    });
    expect(again.statusCode).toBe(200);
    expect(again.body).toContain('was not connected');

    const web = await app.fastify.inject({
      method: 'POST',
      url: '/me/noesis/connect',
      headers: auth(alice.token),
      payload: { returnTo: 'web' },
    });
    const state = new URL(web.json().url).searchParams.get('state');
    const page = await app.fastify.inject({ method: 'GET', url: `/noesis/callback?state=${state}&code=def` });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Your library is connected');
  });

  it('connects with no sign-in where auth takes The Floor’s word for the address, and old builds still finish', async () => {
    boot(fakeClient(() => reply('x')).client, undefined, NOESIS);
    const { alice } = await room2();
    authVouches = true;
    const connecting = await app.fastify.inject({
      method: 'POST',
      url: '/me/noesis/connect',
      headers: auth(alice.token),
      payload: { returnTo: 'app' },
    });
    expect(connecting.json()).toEqual({
      connected: true,
      url: 'https://floor.example/noesis/connected?returnTo=app',
    });
    expect(noesisCalls.find((call) => call.path === '/token')!.fields).toMatchObject({
      grant_type: VOUCHED_GRANT,
      email: 'alice@example.com',
      scope: 'noesis:read noesis:import',
      client_id: 'thefloor',
      client_secret: 'client-secret',
    });
    const status = await app.fastify.inject({ method: 'GET', url: '/me/noesis', headers: auth(alice.token) });
    expect(status.json()).toMatchObject({ connected: true, user: 'alice', email: 'alice@example.com' });
    // A build up to 429 opens the URL it is given, which ends at once as the callback would.
    const old = await app.fastify.inject({ method: 'GET', url: '/noesis/connected?returnTo=app' });
    expect(old.headers.location).toBe('thefloor://noesis?result=connected');
    const page = await app.fastify.inject({ method: 'GET', url: '/noesis/connected?returnTo=web' });
    expect(page.body).toContain('Your library is connected');

    // Refused by auth: the sign-in, as before.
    await app.noesis!.disconnect(alice.account.id);
    authVouches = false;
    const refused = await app.fastify.inject({
      method: 'POST',
      url: '/me/noesis/connect',
      headers: auth(alice.token),
      payload: { returnTo: 'app' },
    });
    expect(refused.json().connected).toBe(false);
    expect(refused.json().url).toMatch(/^https:\/\/auth\.example\/authorize\?/);

    // A grant for somebody else's address is given back, never kept.
    authVouches = true;
    noesisWho = { user: 'mallory', email: 'mallory@example.com' };
    const other = await app.fastify.inject({
      method: 'POST',
      url: '/me/noesis/connect',
      headers: auth(alice.token),
      payload: { returnTo: 'app' },
    });
    expect(other.json().connected).toBe(false);
    expect(app.noesis!.connected(alice.account.id)).toBe(false);
    expect(noesisCalls.at(-1)).toMatchObject({ path: '/revoke' });
  });

  it('says so, into the app, when the person declines at noesis', async () => {
    boot(fakeClient(() => reply('x')).client, undefined, NOESIS);
    const { alice } = await room2();
    const state = new URL(app.noesis!.start(alice.account.id, 'app')).searchParams.get('state');
    const back = await app.fastify.inject({ method: 'GET', url: `/noesis/callback?state=${state}&error=access_denied` });
    expect(back.headers.location).toBe('thefloor://noesis?result=failed');
    expect(app.noesis!.connected(alice.account.id)).toBe(false);
  });

  it('refreshes an expired token once for presses at the same moment, and drops a grant noesis refuses', async () => {
    boot(fakeClient(() => reply('x')).client, undefined, NOESIS);
    const { alice } = await room2();
    await connect(alice.account.id);
    makePro(alice.account.id);
    expect(await app.noesis!.accessToken(alice.account.id)).toBe('secret');
    clock += 3600 * 1000;
    const both = await Promise.all([
      app.noesis!.accessToken(alice.account.id),
      app.noesis!.accessToken(alice.account.id),
    ]);
    expect(both).toEqual(['secret-2', 'secret-2']);
    expect(noesisCalls.filter((call) => call.fields.grant_type === 'refresh_token')).toHaveLength(1);
    expect(noesisCalls.at(-1)!.fields.refresh_token).toBe('refresh-1');

    clock += 3600 * 1000;
    noesisRefuses = true;
    expect(await app.noesis!.accessToken(alice.account.id)).toBeNull();
    expect(app.noesis!.connected(alice.account.id)).toBe(false);
  });

  it('hands the sign-in to the browser that opens noesis, by the connection’s token and The Floor’s pair', async () => {
    const asked: Array<{ authorization: string; body: { token: string; next: string } }> = [];
    let refuses = false;
    const handing = new AuthClient({
      origin: 'https://auth.example',
      clientId: 'thefloor',
      clientSecret: 'client-secret',
      fetch: (async (_input: unknown, init?: { body?: unknown; headers?: Record<string, string> }) => {
        asked.push({ authorization: init!.headers!.Authorization, body: JSON.parse(String(init!.body)) });
        if (refuses) return new Response(null, { status: 403 });
        return Response.json({ url: 'https://auth.example/handoff?code=c1', expires_in: 60 });
      }) as typeof fetch,
    });
    boot(fakeClient(() => reply('x')).client, undefined, NOESIS, undefined, false, handing);
    const { alice, bob } = await room2();
    const hand = (token: string, url: unknown) =>
      app.fastify.inject({ method: 'POST', url: '/me/noesis/handoff', headers: auth(token), payload: { url } });
    const web = 'https://noesis.example/web/?library=alice%2Fphilosophy';
    // Nothing to make it from before connecting.
    expect((await hand(alice.token, web)).statusCode).toBe(409);
    await connect(alice.account.id);
    makePro(alice.account.id);
    const handed = await hand(alice.token, web);
    expect(handed.json()).toEqual({ url: 'https://auth.example/handoff?code=c1' });
    expect(asked.at(-1)).toEqual({
      authorization: `Basic ${Buffer.from('thefloor:client-secret').toString('base64')}`,
      body: { token: 'secret', next: web },
    });
    // Only to noesis's web client, and only for somebody connected.
    expect((await hand(alice.token, 'https://elsewhere.example/web/')).statusCode).toBe(400);
    expect((await hand(bob.token, web)).statusCode).toBe(409);
    refuses = true;
    expect((await hand(alice.token, web)).statusCode).toBe(502);
  });

  it('disconnecting switches off every channel consulting it, and revokes at noesis', async () => {
    boot(fakeClient(() => reply('x')).client, undefined, NOESIS);
    const { alice, channelId } = await room2();
    await connect(alice.account.id);
    makePro(alice.account.id);
    app.channels.dispatch(channelId, alice.account.id, { type: 'SET_LIBRARY', library: true } as never);
    const gone = await app.fastify.inject({
      method: 'POST',
      url: '/me/noesis/disconnect',
      headers: auth(alice.token),
    });
    expect(gone.statusCode).toBe(204);
    expect(app.channels.get(channelId)!.library).toBe(false);
    expect(app.noesis!.connected(alice.account.id)).toBe(false);
    expect(noesisCalls.at(-1)).toMatchObject({ path: '/revoke', fields: { token: 'refresh-1' } });
  });

  it('goes with the account, and the library with it from every channel', async () => {
    boot(fakeClient(() => reply('x')).client, undefined, NOESIS);
    const { alice, channelId } = await room2();
    await connect(alice.account.id);
    makePro(alice.account.id);
    app.channels.dispatch(channelId, alice.account.id, { type: 'SET_LIBRARY', library: true } as never);
    const deleted = await app.fastify.inject({ method: 'DELETE', url: '/me', headers: auth(alice.token) });
    expect(deleted.statusCode).toBe(204);
    expect(app.db.prepare('SELECT COUNT(*) AS n FROM noesis_connections').get()).toEqual({ n: 0 });
    expect(noesisCalls.at(-1)!.path).toBe('/revoke');
    expect(app.channels.get(channelId)?.library ?? false).toBe(false);
  });
});

describe('sending a room’s text to noesis', () => {
  const TEXT = 'The Floor — Lunch\n2026-11-02 · 12:00–12:30\n\nAlice · 12:00\nMine.\n\nBob · 12:01\nHis.';
  const send = (token: string, payload: object) =>
    app.fastify.inject({ method: 'POST', url: '/me/noesis/send', headers: auth(token), payload });

  it('files it in a library of yours, replacing what it filed before, your name kept as your voice', async () => {
    boot(fakeClient(() => reply('x')).client, undefined, NOESIS);
    const { alice } = await room2();
    await connect(alice.account.id);
    makePro(alice.account.id);
    const status = await app.fastify.inject({ method: 'GET', url: '/me/noesis', headers: auth(alice.token) });
    expect(status.json()).toMatchObject({ connected: true, canSend: true });
    noesisNames = ['Prompt'];
    const sent = await send(alice.token, {
      library: 'alice/philosophy',
      filename: 'The Floor — Lunch — 2026-11-02 1230',
      text: TEXT,
    });
    expect(sent.statusCode).toBe(200);
    expect(sent.json()).toEqual({ file: '2026/2026-11-02-lunch.chat.md' });
    expect(noesisNames).toEqual(['Prompt', 'Alice']);
    const filed = noesisCalls.find((call) => call.path === '/libraries/alice/philosophy/import')!;
    expect(filed.method).toBe('POST');
    expect(filed.query).toEqual({ filename: 'The Floor — Lunch — 2026-11-02 1230.md', replace: 'true' });
    expect(filed.body).toBe(TEXT);
    // A name already kept, in any case, is not added again.
    noesisNames = ['alice'];
    await send(alice.token, { library: 'alice/philosophy', filename: 'x', text: TEXT });
    expect(noesisNames).toEqual(['alice']);
  });

  it('refuses a library not yours, a grant made before sending was asked for, and says why noesis did', async () => {
    boot(fakeClient(() => reply('x')).client, undefined, NOESIS);
    const { alice, bob } = await room2();
    makePro(bob.account.id);
    expect((await send(bob.token, { library: 'alice/philosophy', text: TEXT })).statusCode).toBe(409);
    await connect(alice.account.id);
    makePro(alice.account.id);
    expect((await send(alice.token, { library: 'bob/notes', text: TEXT })).statusCode).toBe(404);
    expect((await send(alice.token, { library: 'alice/philosophy', text: ' ' })).statusCode).toBe(400);
    noesisImport = () =>
      new Response('event: output\ndata: {"text": "checking\\n✗ a title another file has\\n"}\n\nevent: done\ndata: {"exit_code": 1, "changed": {}, "deleted": []}\n\n');
    const failed = await send(alice.token, { library: 'alice/philosophy', text: TEXT });
    expect(failed.statusCode).toBe(502);
    expect(failed.json()).toEqual({ error: '✗ a title another file has', reason: 'failed' });
    noesisImport = () => Response.json({ detail: 'a run is in progress in this library' }, { status: 409 });
    expect((await send(alice.token, { library: 'alice/philosophy', text: TEXT })).json().reason).toBe('busy');

    noesisScope = '';
    await connect(alice.account.id);
    makePro(alice.account.id);
    const status = await app.fastify.inject({ method: 'GET', url: '/me/noesis', headers: auth(alice.token) });
    expect(status.json()).toMatchObject({ connected: true, canSend: false });
    const before = noesisCalls.length;
    const refused = await send(alice.token, { library: 'alice/philosophy', text: TEXT });
    expect(refused.statusCode).toBe(403);
    expect(noesisCalls.slice(before).some((call) => call.path.endsWith('/import'))).toBe(false);
  });

  it('is Pro’s alone since 2026-11-10, said as the reason builds that offer it show', async () => {
    boot(fakeClient(() => reply('x')).client, undefined, NOESIS);
    const { alice } = await room2();
    await connect(alice.account.id);
    const before = noesisCalls.length;
    const refused = await send(alice.token, { library: 'alice/philosophy', text: TEXT });
    expect(refused.statusCode).toBe(402);
    expect(refused.json()).toEqual({ error: 'Sending to noesis comes with Pro.', reason: 'not_pro' });
    expect(noesisCalls.slice(before).some((call) => call.path.endsWith('/import'))).toBe(false);
  });

  it('keeps the grant’s scopes across a refresh', async () => {
    boot(fakeClient(() => reply('x')).client, undefined, NOESIS);
    const { alice } = await room2();
    await connect(alice.account.id);
    makePro(alice.account.id);
    clock += 3600 * 1000;
    noesisScope = '';
    expect(await app.noesis!.accessToken(alice.account.id)).toBe('secret-2');
    expect(app.noesis!.status(alice.account.id).canSend).toBe(true);
  });

  it('names the file as noesis takes it', () => {
    expect(noesisFilename('The Floor — a/b — 2026-11-02 1230')).toBe('The Floor — a-b — 2026-11-02 1230.md');
    expect(noesisFilename('..hidden.txt')).toBe('hidden.md');
    expect(noesisFilename('')).toBe('The Floor.md');
  });
});

describe('the response model', () => {
  const choose = (channelId: string, userId: string, responseModel: unknown) =>
    app.channels.dispatch(channelId, userId, { type: 'SET_RESPONSE_MODEL', responseModel } as never);

  it('is refused to an account without Pro, debug or not, and changes nothing', async () => {
    boot(fakeClient(() => reply('x')).client);
    const { alice, channelId } = await room2();
    app.db.prepare('UPDATE accounts SET debug = 1 WHERE id = ?').run(alice.account.id);
    for (const grade of ['pro', 'max']) {
      expect(choose(channelId, alice.account.id, grade)).toMatchObject({
        ok: false,
        code: 'forbidden',
        error: 'Only a Pro account can choose the response model.',
      });
    }
    expect(app.channels.get(channelId)!.responseModel).toBe('standard');
  });

  it('refuses anything but the three grades, even from Pro', async () => {
    boot(fakeClient(() => reply('x')).client);
    const { alice, channelId } = await room2();
    makePro(alice.account.id);
    for (const value of ['opus', undefined, 1]) {
      expect(choose(channelId, alice.account.id, value)).toMatchObject({ ok: false, code: 'invalid' });
    }
  });

  it('on Pro, asks Sonnet with the fallback whoever presses, and survives a restart', async () => {
    const { client, calls } = fakeClient(() => reply('Pro answer.', { model: 'claude-sonnet-5-5' }));
    boot(client);
    const { alice, bob, channelId } = await room2();
    makePro(alice.account.id);
    expect(choose(channelId, alice.account.id, 'pro')).toMatchObject({ ok: true });

    // Bob is not Pro; the grade is the channel's, not the presser's.
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
    makePro(alice.account.id);
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

describe("a press with the channel's own library", () => {
  /** A channel on `grade` with a library at noesis, and nobody's own switched on. */
  async function setUp(
    grade: 'standard' | 'pro',
    withLibrary = true,
    answer: (call: Call) => unknown = () => reply('From the channel.')
  ) {
    const fake = fakeClient(answer);
    boot(fake.client, undefined, NOESIS, undefined, true);
    const people = await room2();
    const { alice, channelId } = people;
    makePro(alice.account.id);
    app.channels.dispatch(channelId, alice.account.id, { type: 'SET_RESPONSE_MODEL', responseModel: grade } as never);
    const handle = withLibrary ? app.channels.handleFor(channelId) : null;
    return { ...fake, ...people, handle };
  }

  it('hands Claude the channel library by a token confined to it, and says what it is', async () => {
    const { calls, bob, channelId, handle } = await setUp('pro');
    expect((await press(channelId, bob.token)).statusCode).toBe(200);
    expect(calls[0].body).toMatchObject({
      mcp_servers: [
        {
          type: 'url',
          url: `https://noesis.example/mcp?libraries=thefloor%2F${handle}`,
          name: 'noesis',
          authorization_token: 'channel-token',
        },
      ],
    });
    expect(calls[0].body.system).toBe(
      systemPrompt('medium', [{ owner: null, libraries: [`thefloor/${handle}`], channel: true }])
    );
    expect(calls[0].body.system).toContain(channelLibraryRule());
  });

  it('consults it on Pro and Max only, and not once switched off on its card', async () => {
    const standard = await setUp('standard');
    await press(standard.channelId, standard.bob.token);
    expect(standard.calls[0].body).not.toHaveProperty('mcp_servers');

    await app.fastify.close();
    const { calls, alice, bob, channelId } = await setUp('pro');
    const off = await app.fastify.inject({
      method: 'PUT',
      url: `/channels/${channelId}/noesis-library`,
      headers: auth(alice.token),
      payload: { consult: false },
    });
    expect(off.statusCode).toBe(200);
    const card = await app.fastify.inject({
      method: 'GET',
      url: `/channels/${channelId}/noesis-library`,
      headers: auth(bob.token),
    });
    expect(card.json()).toMatchObject({ on: true, consult: false, mayChange: true });
    await press(channelId, bob.token);
    expect(calls[0].body).not.toHaveProperty('mcp_servers');
  });

  it('names each filed segment’s document in the Record, and sends it whole without noesis', async () => {
    const { calls, bob, channelId } = await setUp('pro', true, (call) => {
      if (call.body.mcp_servers) throw new Error('noesis unreachable');
      return reply('Without the library.');
    });
    app.db
      .prepare(
        `INSERT INTO segments (id, channel_id, started_at, ended_at, text, filed_at, filed_file, filed_title)
         VALUES ('seg_f', ?, ?, ?, 1, ?, '2026/2026-11-07-on-names.chat.md', 'On Names')`
      )
      .run(channelId, clock - 1_500, clock - 1_200, clock);
    app.db
      .prepare(
        `INSERT INTO live_lines (id, channel_id, identity, display_name, start_at, end_at, text)
         VALUES ('l_f', ?, 'bob', 'Bob', ?, ?, 'What is a name?')`
      )
      .run(channelId, clock - 1_400, clock - 1_300);
    expect((await press(channelId, bob.token)).statusCode).toBe(200);
    const record = (call: Call) => JSON.stringify(call.body.messages);
    expect(record(calls[0])).toContain(
      `(Filed in this channel's library as 2026-11-07-on-names.chat.md, titled \\"On Names\\".)`
    );
    expect(record(calls[0])).toContain('What is a name?');
    expect(record(calls[1])).not.toContain('Filed in this channel');
    expect(record(calls[1])).toContain('What is a name?');
  });

  it('consults nothing for a channel with no library yet', async () => {
    const { calls, bob, channelId } = await setUp('pro', false);
    await press(channelId, bob.token);
    expect(calls[0].body).not.toHaveProperty('mcp_servers');
  });
});
