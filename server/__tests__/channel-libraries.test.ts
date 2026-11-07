import { buildApp, type App } from '../src/app';
import { ChannelLibraries, SETTLE_MS, segmentFilename, segmentText } from '../src/channelLibraries';
import { MemoryMailer } from '../src/mail';

/**
 * Every transcript filed into its channel's own noesis library by itself
 * (channelLibraries.ts).
 *
 * - A text segment is filed a minute after it closes, as *Share*'s text, into
 *   a library made the first time — once.
 * - Nothing is filed for a channel with nobody Pro, and what closed then is
 *   never filed later.
 * - noesis failing leaves it owed, and it is filed at the next sweep.
 * - An audio segment waits for its transcript.
 * - Segments from before the column are never owed.
 */

let app: App;
let clock = 1_700_000_000_000;
const SECRET = 'client-secret';
const BASIC = 'Basic ' + Buffer.from(`thefloor:${SECRET}`).toString('base64');

let sent: Array<{ method: string; path: string; search: string; auth: string; body: string }>;
let noesisDown: boolean;
const fakeNoesis = (async (input: unknown, init?: { method?: string; headers?: unknown; body?: unknown }) => {
  const url = new URL(String(input));
  if (url.pathname === '/names') {
    const body = JSON.parse(String(init?.body)) as { suggest: string[] };
    return Response.json({ user: body.suggest[0], account: false });
  }
  if (noesisDown) throw new Error('connect ECONNREFUSED');
  sent.push({
    method: init?.method ?? 'GET',
    path: url.pathname,
    search: url.search,
    auth: (init?.headers as Record<string, string>).Authorization,
    body: String(init?.body),
  });
  if (url.pathname === '/libraries') return Response.json({ library: 'x' }, { status: sent.length > 1 ? 409 : 201 });
  return new Response(
    'event: output\ndata: {"text": "imported"}\n\nevent: done\ndata: {"exit_code": 0, "changed": {"2026/x.chat.md": "abc"}}\n\n'
  );
}) as typeof fetch;

const NOESIS = { origin: 'https://noesis.example', clientId: 'thefloor', clientSecret: SECRET, fetch: fakeNoesis };

beforeEach(() => {
  clock = 1_700_000_000_000;
  sent = [];
  noesisDown = false;
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    now: () => clock,
    names: NOESIS,
    channelLibraries: NOESIS,
  });
});

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

/** Erta's channel of one, named. */
async function bookClub() {
  const erta = await signIn('erta@example.com', 'Erta Example');
  const created = await app.fastify.inject({
    method: 'POST',
    url: '/channels',
    headers: { authorization: `Bearer ${erta.token}` },
    payload: { contactIds: [] },
  });
  const channelId = (created.json() as { channelId: string }).channelId;
  app.channels.dispatch(channelId, erta.account.id, { type: 'SET_NAME', name: 'Book Club' } as never);
  return { channelId, ertaId: erta.account.id };
}

function makePro(accountId: string) {
  app.db
    .prepare(
      `INSERT INTO pro_subscriptions (original_transaction_id, account_id, product_id, environment,
         expires_at, latest_transaction_id, updated_at, raw) VALUES (?, ?, 'pro', 'Sandbox', ?, ?, ?, '{}')`
    )
    .run(`t-${accountId}`, accountId, START + 30 * 86_400_000, `t-${accountId}`, clock);
}

const START = Date.UTC(2026, 10, 7, 14, 5);

/** A closed text segment with two lines of Erta's and a paste of Claude's. */
function textSegment(channelId: string, id = 'seg_1', at = START) {
  app.db
    .prepare('INSERT INTO segments (id, channel_id, started_at, ended_at, text) VALUES (?, ?, ?, ?, 1)')
    .run(id, channelId, at, at + 45 * 60_000);
  const line = app.db.prepare(
    `INSERT INTO live_lines (id, channel_id, identity, display_name, start_at, end_at, text)
     VALUES (?, ?, 'erta', 'Erta Example', ?, ?, ?)`
  );
  line.run(`${id}_a`, channelId, at + 60_000, at + 61_000, 'Afternoon.');
  line.run(`${id}_b`, channelId, at + 62_000, at + 63_000, 'I was there.');
  app.db
    .prepare(
      `INSERT INTO pastes (id, channel_id, author_id, display_name, pasted_at, text)
       VALUES (?, ?, 'claude', 'Claude', ?, 'Bach reads Kant.')`
    )
    .run(`${id}_p`, channelId, at + 120_000);
}

const filedAt = (id: string) =>
  (app.db.prepare('SELECT filed_at FROM segments WHERE id = ?').get(id) as { filed_at: number | null }).filed_at;

describe('a channel library, filed into by itself', () => {
  it('files a text segment a minute after it closes, into a library made once', async () => {
    const { channelId, ertaId } = await bookClub();
    makePro(ertaId);
    textSegment(channelId);
    clock = START + 45 * 60_000 + SETTLE_MS - 1;
    await app.channelLibraries!.sweep();
    expect(sent).toEqual([]);

    clock += 1;
    await app.channelLibraries!.sweep();
    const handle = app.channels.handleOf(channelId)!;
    expect(handle).toMatch(/^book-club-/);
    expect(sent.map((s) => [s.method, s.path])).toEqual([
      ['POST', '/libraries'],
      ['POST', `/libraries/thefloor/${handle}/import`],
    ]);
    expect(sent.every((s) => s.auth === BASIC)).toBe(true);
    expect(JSON.parse(sent[0].body)).toEqual({ name: handle });
    expect(new URLSearchParams(sent[1].search).get('filename')).toBe('The Floor — Book Club — 2026-11-07 1405.md');
    expect(sent[1].body).toBe(
      'The Floor — Book Club\n2026-11-07 · 14:05–14:50 UTC\n\n' +
        'Erta Example · 14:06\nAfternoon.\nI was there.\n\n' +
        'Pasted by Claude · 14:07\nBach reads Kant.'
    );
    expect(filedAt('seg_1')).toBe(clock);

    textSegment(channelId, 'seg_2', START + 3_600_000);
    clock = START + 3_600_000 + 45 * 60_000 + SETTLE_MS;
    await app.channelLibraries!.sweep();
    expect(sent.map((s) => s.path)).toEqual([
      '/libraries',
      `/libraries/thefloor/${handle}/import`,
      `/libraries/thefloor/${handle}/import`,
    ]);
    await app.channelLibraries!.sweep();
    expect(sent).toHaveLength(3);
  });

  it('files nothing for a channel with nobody Pro, ever', async () => {
    const { channelId, ertaId } = await bookClub();
    textSegment(channelId);
    clock = START + 2 * 3_600_000;
    await app.channelLibraries!.sweep();
    expect(sent).toEqual([]);
    expect(filedAt('seg_1')).toBe(-1);
    expect(app.channels.handleOf(channelId)).toBeNull();

    makePro(ertaId);
    await app.channelLibraries!.sweep();
    expect(sent).toEqual([]);
  });

  it('leaves a segment owed while noesis cannot take it', async () => {
    const { channelId, ertaId } = await bookClub();
    makePro(ertaId);
    textSegment(channelId);
    clock = START + 2 * 3_600_000;
    noesisDown = true;
    await app.channelLibraries!.sweep();
    expect(filedAt('seg_1')).toBeNull();
    noesisDown = false;
    await app.channelLibraries!.sweep();
    expect(filedAt('seg_1')).toBe(clock);
  });

  it('files an audio segment once its transcript is ready', async () => {
    const { channelId, ertaId } = await bookClub();
    makePro(ertaId);
    app.db
      .prepare(
        `INSERT INTO recordings (id, channel_id, initiator_id, invitee_id, participants, started_at,
           duration_ms, s3_key, stems, ended_at, participant_names) VALUES (?, ?, ?, ?, ?, ?, 0, '', '{}', ?, ?)`
      )
      .run('rec_1', channelId, ertaId, ertaId, JSON.stringify([ertaId]), START, START + 600_000,
        JSON.stringify({ [ertaId]: 'Erta Example' }));
    app.db
      .prepare('INSERT INTO segments (id, channel_id, started_at, ended_at, recording_id, text) VALUES (?, ?, ?, ?, ?, 0)')
      .run('seg_a', channelId, START, START + 600_000, 'rec_1');
    const libraries = new ChannelLibraries(
      app.db,
      {
        handleFor: (id) => app.channels.handleFor(id),
        channel: (id) => app.channels.nameAndMembers(id),
        isPro: () => true,
        displayName: () => 'Erta Example',
        transcriptLines: () => [
          { identity: ertaId, startMs: 30_000, endMs: 31_000, text: 'Recorded.', confidence: null },
        ],
        now: () => clock,
      },
      NOESIS
    );
    clock = START + 2 * 3_600_000;
    await libraries.sweep();
    expect(sent).toEqual([]);

    app.db
      .prepare(
        `INSERT INTO transcripts (recording_id, state, requested_by, requested_at, provider, billed_ms)
         VALUES ('rec_1', 'ready', ?, ?, 'Memory', 0)`
      )
      .run(ertaId, clock);
    await libraries.sweep();
    expect(sent.at(-1)!.body).toBe(
      'The Floor — Book Club\n2026-11-07 · 14:05–14:15 UTC\n\nErta Example · 14:05\nRecorded.'
    );
  });
});

describe("Channel Settings' card", () => {
  it('says the transcripts go in, and opens the library once there is one, for members only', async () => {
    const { channelId, ertaId } = await bookClub();
    const erta = { authorization: `Bearer ${(await signIn('erta@example.com', 'Erta Example')).token}` };
    const card = (headers: Record<string, string>) =>
      app.fastify.inject({ method: 'GET', url: `/channels/${channelId}/noesis-library`, headers });
    expect((await card(erta)).json()).toEqual({ on: true, url: null });

    makePro(ertaId);
    textSegment(channelId);
    clock = START + 2 * 3_600_000;
    await app.channelLibraries!.sweep();
    const handle = app.channels.handleOf(channelId)!;
    // Three years on, as the clock goes here: a session from then has lapsed.
    const again = { authorization: `Bearer ${(await signIn('erta@example.com', 'Erta Example')).token}` };
    expect((await card(again)).json()).toEqual({
      on: true,
      url: `https://noesis.example/web/?library=thefloor%2F${handle}`,
    });

    const zed = await signIn('zed@example.com', 'Zed Zebedee');
    expect((await card({ authorization: `Bearer ${zed.token}` })).statusCode).toBe(404);
  });
});

describe("a segment's text", () => {
  it('is what noesis reads as The Floor', () => {
    // noesis/cmd_import.py: the hours line, and each entry's `who · time`.
    const text = segmentText('Book Club', START, START + 60_000, [
      { who: 'Erta', at: START, text: 'One.' },
      { who: 'Zed', at: START + 1000, text: 'Two.' },
      { who: 'Erta', at: START + 2000, text: 'Three.' },
    ]);
    const [head, ...entries] = text.split('\n\n');
    expect(head.split('\n')[1]).toMatch(/^(?:\d{4}-\d{2}-\d{2}|[^·]+) · \S.*[–-].+$/);
    for (const entry of entries) expect(entry.split('\n')[0]).toMatch(/^.+ · \d{1,2}[:.]\d{2}$/);
    expect(entries).toHaveLength(3);
    expect(segmentFilename('Café/Olé', START)).toBe('The Floor — Café-Olé — 2026-11-07 1405.md');
  });
});
