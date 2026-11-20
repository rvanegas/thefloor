import { buildApp, type App } from '../src/app';
import { ChannelLibraries, SETTLE_MS, segmentFilename, segmentText } from '../src/channelLibraries';
import type { RoomView } from '../../core/protocol';
import { DELETED_RETENTION_MS, TRANSCRIPT_DELETED_RETENTION_MS } from '../../core/constants';
import { MemoryMailer } from '../src/mail';
import { finished } from '../src/noesis';
import { AUTH_ORIGIN, OWN_TOKEN, fakeAuth } from '../__stubs__/fakeAuth';

/**
 * Every transcript filed into its channel's own noesis library by itself
 * (channelLibraries.ts).
 *
 * - A text segment is filed a minute after it closes, as *Share*'s text, into
 *   a library made the first time — once.
 * - Nothing is filed for a channel with nobody Pro and connected to their own
 *   noesis library, and what closed then is never filed later.
 * - noesis failing leaves it owed, and it is filed at the next sweep.
 * - An audio segment waits for its transcript.
 * - Segments from before the column are never owed.
 */

let app: App;
let clock = 1_700_000_000_000;
const SECRET = 'client-secret';
// The Floor's own token from auth, with which it is the libraries' owner at noesis.
const OWNER = `Bearer ${OWN_TOKEN}`;

let sent: Array<{ method: string; path: string; search: string; auth: string; body: string }>;
let noesisDown: boolean;
const fakeNoesis = (async (input: unknown, init?: { method?: string; headers?: unknown; body?: unknown }) => {
  const url = new URL(String(input));
  if (url.pathname === '/names') {
    const body = JSON.parse(String(init?.body)) as { suggest: string[] };
    return Response.json({ user: body.suggest[0], account: false });
  }
  // A signup's display name, given to auth (names.ts): the register's, not a library's.
  if (url.pathname === '/names/display') return Response.json({ display_name: 'x' });
  if (noesisDown) throw new Error('connect ECONNREFUSED');
  sent.push({
    method: init?.method ?? 'GET',
    path: url.pathname,
    search: url.search,
    auth: (init?.headers as Record<string, string>).Authorization,
    body: String(init?.body),
  });
  if (url.pathname === '/libraries') return Response.json({ library: 'x' }, { status: sent.length > 1 ? 409 : 201 });
  if (init?.method === 'DELETE') return new Response(null, { status: 204 });
  if (url.pathname.endsWith('/files')) return Response.json({ files: { '2026/x.chat.md': 'abc', '2026/old.chat.md': 'def' } });
  return new Response(
    'event: output\ndata: {"text": "imported"}\n\nevent: done\ndata: {"exit_code": 0, "changed": {"2026/x.chat.md": "abc"}, "titles": {"2026/x.chat.md": "Bach Reads Kant"}}\n\n'
  );
}) as typeof fetch;

const NOESIS = { origin: 'https://noesis.example', auth: fakeAuth(), fetch: fakeNoesis };
const NAMES = { origin: AUTH_ORIGIN, clientId: 'thefloor', clientSecret: SECRET, fetch: fakeNoesis };

beforeEach(() => {
  clock = 1_700_000_000_000;
  sent = [];
  noesisDown = false;
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    now: () => clock,
    names: NAMES,
    channelLibraries: NOESIS,
    // Each account's own library, which a channel needs a Pro member to have
    // connected before it files anything (`connect`).
    library: {
      url: 'https://noesis.example/mcp',
      authUrl: AUTH_ORIGIN,
      clientId: 'thefloor',
      clientSecret: SECRET,
      callbackUrl: 'https://floor.example/noesis/callback',
      fetch: fakeNoesis,
    },
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

/**
 * The account's own noesis library, connected: the row the callback writes,
 * which is all that being connected is asked of here.
 */
function connect(accountId: string) {
  app.db
    .prepare(
      `INSERT INTO noesis_connections (account_id, noesis_user, refresh_token, connected_at)
       VALUES (?, 'erta', 'sealed', ?)`
    )
    .run(accountId, clock);
}

/** Pro, and connected: what a channel needs one member to be to file. */
function makeFiling(accountId: string) {
  makePro(accountId);
  connect(accountId);
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
      `INSERT INTO pastes (id, channel_id, author_id, display_name, pasted_at, text, segment_id)
       VALUES (?, ?, 'claude', 'Claude', ?, 'Bach reads Kant.', ?)`
    )
    .run(`${id}_p`, channelId, at + 120_000, id);
}

const filedAt = (id: string) =>
  (app.db.prepare('SELECT filed_at FROM segments WHERE id = ?').get(id) as { filed_at: number | null }).filed_at;

describe('a channel library, filed into by itself', () => {
  it('files a text segment a minute after it closes, into a library made once', async () => {
    const { channelId, ertaId } = await bookClub();
    makeFiling(ertaId);
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
    expect(sent.every((s) => s.auth === OWNER)).toBe(true);
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

  it('files a paste with the segment it is part of, and not with the one it borders', async () => {
    const { channelId, ertaId } = await bookClub();
    makeFiling(ertaId);
    textSegment(channelId);
    // Pasted at the instant seg_1 ended and seg_2 began, so part of seg_2.
    const end = START + 45 * 60_000;
    app.db
      .prepare('INSERT INTO segments (id, channel_id, started_at, ended_at, text) VALUES (?, ?, ?, ?, 1)')
      .run('seg_2', channelId, end, end + 10 * 60_000);
    app.db
      .prepare(
        `INSERT INTO live_lines (id, channel_id, identity, display_name, start_at, end_at, text)
         VALUES ('seg_2_a', ?, 'erta', 'Erta Example', ?, ?, 'Resumed.')`
      )
      .run(channelId, end + 60_000, end + 61_000);
    app.db
      .prepare(
        `INSERT INTO pastes (id, channel_id, author_id, display_name, pasted_at, text, segment_id)
         VALUES ('edge', ?, ?, 'Erta Example', ?, 'At the seam.', 'seg_2')`
      )
      .run(channelId, ertaId, end);
    clock = end + 10 * 60_000 + SETTLE_MS;
    await app.channelLibraries!.sweep();
    const bodies = sent.filter((s) => s.path.endsWith('/import')).map((s) => s.body);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).not.toContain('At the seam.');
    expect(bodies[1]).toContain('Pasted by Erta Example · 14:50\nAt the seam.');
  });

  it("files a separated voice's letter on its name, as the Record shows it", async () => {
    const { channelId, ertaId } = await bookClub();
    makeFiling(ertaId);
    app.db
      .prepare('INSERT INTO segments (id, channel_id, started_at, ended_at, text) VALUES (?, ?, ?, ?, 1)')
      .run('seg_1', channelId, START, START + 45 * 60_000);
    const line = app.db.prepare(
      `INSERT INTO live_lines (id, channel_id, identity, display_name, start_at, end_at, text, speaker)
       VALUES (?, ?, 'erta', 'Erta Example', ?, ?, ?, ?)`
    );
    line.run('l_a', channelId, START + 60_000, START + 61_000, 'Afternoon.', 'A');
    line.run('l_b', channelId, START + 62_000, START + 63_000, 'Hello.', 'B');
    clock = START + 45 * 60_000 + SETTLE_MS;
    await app.channelLibraries!.sweep();
    expect(sent[1].body).toBe(
      'The Floor — Book Club\n2026-11-07 · 14:05–14:50 UTC\n\n' +
        'Erta Example (A) · 14:06\nAfternoon.\n\n' +
        'Erta Example (B) · 14:06\nHello.'
    );

    // A voice named since is filed again under its name.
    const imports = sent.filter((s) => s.path.endsWith('/import')).length;
    app.channels.segmentLog.nameVoices('seg_1', [{ identity: 'erta', speaker: 'B', name: 'Ana' }], clock);
    await app.channelLibraries!.sweep();
    expect(sent.filter((s) => s.path.endsWith('/import'))).toHaveLength(imports + 1);
    expect(sent.filter((s) => s.path.endsWith('/import')).at(-1)?.body).toBe(
      'The Floor — Book Club\n2026-11-07 · 14:05–14:50 UTC\n\n' +
        'Erta Example (A) · 14:06\nAfternoon.\n\n' +
        'Ana · 14:06\nHello.'
    );
  });

  it('deletes the document a segment was filed as before, once it is filed again', async () => {
    const { channelId, ertaId } = await bookClub();
    makeFiling(ertaId);
    textSegment(channelId);
    app.db.prepare("UPDATE segments SET filed_file = '2026/old.chat.md' WHERE id = 'seg_1'").run();
    clock = START + 45 * 60_000 + SETTLE_MS;
    await app.channelLibraries!.sweep();
    const handle = app.channels.handleOf(channelId)!;
    expect(sent.map((s) => [s.method, s.path])).toEqual([
      ['POST', '/libraries'],
      ['POST', `/libraries/thefloor/${handle}/import`],
      ['GET', `/libraries/thefloor/${handle}/files`],
      ['DELETE', `/libraries/thefloor/${handle}/files/2026/old.chat.md`],
    ]);
    expect(app.db.prepare("SELECT filed_file FROM segments WHERE id = 'seg_1'").get()).toEqual({ filed_file: '2026/x.chat.md' });
  });

  it('files nothing for a channel with nobody Pro, ever', async () => {
    const { channelId, ertaId } = await bookClub();
    textSegment(channelId);
    clock = START + 2 * 3_600_000;
    await app.channelLibraries!.sweep();
    expect(sent).toEqual([]);
    expect(filedAt('seg_1')).toBe(-1);
    expect(app.channels.handleOf(channelId)).toBeNull();

    makeFiling(ertaId);
    await app.channelLibraries!.sweep();
    expect(sent).toEqual([]);
  });

  it('files nothing for a channel whose Pro member has not connected their library', async () => {
    const { channelId, ertaId } = await bookClub();
    makePro(ertaId);
    textSegment(channelId);
    clock = START + 2 * 3_600_000;
    await app.channelLibraries!.sweep();
    expect(sent).toEqual([]);
    expect(filedAt('seg_1')).toBe(-1);
    expect(app.channels.handleOf(channelId)).toBeNull();
  });

  it('leaves a segment owed while noesis cannot take it', async () => {
    const { channelId, ertaId } = await bookClub();
    makeFiling(ertaId);
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
    makeFiling(ertaId);
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
        connected: () => true,
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

describe('deleting what a channel library holds, thirty days on', () => {
  const WINDOW = DELETED_RETENTION_MS;

  async function filed() {
    const { channelId, ertaId } = await bookClub();
    makeFiling(ertaId);
    textSegment(channelId);
    clock = START + 2 * 3_600_000;
    await app.channelLibraries!.sweep();
    sent = [];
    return { channelId, ertaId, handle: app.channels.handleOf(channelId)! };
  }

  const channelRow = (id: string) => app.db.prepare('SELECT library_cleared_at FROM channels WHERE id = ?').get(id);

  it("deletes a deleted channel's library thirty days after, and only then the row", async () => {
    const { channelId, handle } = await filed();
    app.db.prepare('UPDATE channels SET deleted_at = ? WHERE id = ?').run(clock, channelId);
    await app.channels.sweepDeleted(clock + WINDOW - 1);
    expect(sent).toEqual([]);

    noesisDown = true;
    await app.channels.sweepDeleted(clock + WINDOW);
    expect(channelRow(channelId)).toEqual({ library_cleared_at: null });

    noesisDown = false;
    await app.channels.sweepDeleted(clock + WINDOW);
    expect(sent.map((s) => [s.method, s.path])).toEqual([['DELETE', `/libraries/thefloor/${handle}`]]);
    expect(sent[0].auth).toBe(OWNER);
    expect(channelRow(channelId)).toBeUndefined();
  });

  // Asked at once since 2026-11-18 (`deleteRecording`); the sweep is the retry,
  // and still goes before the recording's row.
  it("deletes a deleted recording's marked document before the recording", async () => {
    const { channelId, ertaId, handle } = await filed();
    app.db
      .prepare(
        `INSERT INTO recordings (id, channel_id, initiator_id, invitee_id, participants, started_at,
           duration_ms, s3_key, stems, ended_at, deleted_at, objects_cleared_at)
         VALUES ('rec_1', ?, ?, ?, '[]', ?, 0, '', '{}', ?, ?, ?)`
      )
      .run(channelId, ertaId, ertaId, START, START + 1, clock, clock);
    app.db
      .prepare(
        `INSERT INTO segments (id, channel_id, started_at, ended_at, recording_id, text, filed_at, filed_file,
           document_deleted_at)
         VALUES ('seg_r', ?, ?, ?, 'rec_1', 0, ?, '2026/x.chat.md', ?)`
      )
      .run(channelId, START, START + 1, clock, clock);
    await app.channels.sweepDeleted(clock + WINDOW);
    expect(sent.map((s) => [s.method, s.path])).toEqual([
      ['GET', `/libraries/thefloor/${handle}/files`],
      ['DELETE', `/libraries/thefloor/${handle}/files/2026/x.chat.md`],
    ]);
    expect(app.db.prepare("SELECT 1 FROM recordings WHERE id = 'rec_1'").get()).toBeUndefined();
    expect(app.db.prepare("SELECT filed_file FROM segments WHERE id = 'seg_r'").get()).toEqual({ filed_file: null });
  });

  // Not thirty days on: a copy elsewhere, which members can still open there, goes
  // when the text is deleted, as the transcription provider's does.
  const settle = async () => {
    for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
  };
  const deletes = (handle: string) => [
    ['GET', `/libraries/thefloor/${handle}/files`],
    ['DELETE', `/libraries/thefloor/${handle}/files/2026/x.chat.md`],
  ];

  it("deletes the document of a segment's live text at once, and again at a sweep if noesis was down", async () => {
    const { channelId, ertaId, handle } = await filed();
    noesisDown = true;
    expect(app.channels.deleteSegmentText(channelId, 'seg_1', ertaId)).toEqual({ ok: true });
    await settle();
    expect(app.db.prepare("SELECT filed_file FROM segments WHERE id = 'seg_1'").get()).toEqual({
      filed_file: '2026/x.chat.md',
    });

    noesisDown = false;
    await app.channels.sweepDeleted(clock);
    expect(sent.map((s) => [s.method, s.path])).toEqual(deletes(handle));
    expect(app.db.prepare("SELECT filed_file FROM segments WHERE id = 'seg_1'").get()).toEqual({ filed_file: null });
  });

  it("deletes the document of a recording's transcript at once when the transcript is deleted", async () => {
    const { channelId, ertaId, handle } = await filed();
    app.db
      .prepare(
        `INSERT INTO recordings (id, channel_id, initiator_id, invitee_id, participants, started_at,
           duration_ms, s3_key, stems, ended_at)
         VALUES ('rec_1', ?, ?, ?, ?, ?, 0, '', '{}', ?)`
      )
      .run(channelId, ertaId, ertaId, JSON.stringify([ertaId]), START, START + 1);
    app.db
      .prepare(
        `INSERT INTO transcripts (recording_id, state, requested_by, requested_at, provider, billed_ms)
         VALUES ('rec_1', 'ready', ?, ?, 'Memory', 0)`
      )
      .run(ertaId, clock);
    app.db
      .prepare(
        `INSERT INTO segments (id, channel_id, started_at, ended_at, recording_id, text, filed_at, filed_file)
         VALUES ('seg_r', ?, ?, ?, 'rec_1', 0, ?, '2026/x.chat.md')`
      )
      .run(channelId, START, START + 1, clock);
    const erta = await signIn('erta@example.com', 'Erta Example');
    const removed = await app.fastify.inject({
      method: 'DELETE',
      url: '/recordings/rec_1/transcript',
      headers: { authorization: `Bearer ${erta.token}` },
    });
    expect(removed.statusCode).toBe(200);
    await settle();
    expect(sent.map((s) => [s.method, s.path])).toEqual(deletes(handle));
    expect(app.db.prepare("SELECT filed_file FROM segments WHERE id = 'seg_r'").get()).toEqual({ filed_file: null });
    // The recording stays, and so does the segment, keeping its audio.
    expect(app.db.prepare("SELECT deleted_at FROM recordings WHERE id = 'rec_1'").get()).toEqual({ deleted_at: null });
  });

  // *Delete* on a segment, since 2026-11-18: each of the three asked of
  // separately, the document no longer going with the text.
  const deleteSegment = async (channelId: string, segmentId: string, query: string) => {
    const erta = await signIn('erta@example.com', 'Erta Example');
    return app.fastify.inject({
      method: 'DELETE',
      url: `/channels/${channelId}/segments/${segmentId}?${query}`,
      headers: { authorization: `Bearer ${erta.token}` },
    });
  };
  const liveLeft = (channelId: string) =>
    app.db.prepare('SELECT COUNT(*) AS n FROM live_lines WHERE channel_id = ? AND deleted_at IS NULL').get(channelId);
  const recordedSegment = (channelId: string, ertaId: string) => {
    app.db
      .prepare(
        `INSERT INTO recordings (id, channel_id, initiator_id, invitee_id, participants, started_at,
           duration_ms, s3_key, stems, ended_at)
         VALUES ('rec_1', ?, ?, ?, ?, ?, 0, '', '{}', ?)`
      )
      .run(channelId, ertaId, ertaId, JSON.stringify([ertaId]), START + 3_600_000, START + 3_600_001);
    app.db
      .prepare(
        `INSERT INTO transcripts (recording_id, state, requested_by, requested_at, provider, billed_ms)
         VALUES ('rec_1', 'ready', ?, ?, 'Memory', 0)`
      )
      .run(ertaId, clock);
    app.db
      .prepare(
        `INSERT INTO segments (id, channel_id, started_at, ended_at, recording_id, text, filed_at, filed_file)
         VALUES ('seg_r', ?, ?, ?, 'rec_1', 0, ?, '2026/x.chat.md')`
      )
      .run(channelId, START + 3_600_000, START + 3_600_001, clock);
  };

  it('deletes only the text when only the text is ticked, and leaves its document', async () => {
    const { channelId } = await filed();
    const response = await deleteSegment(channelId, 'seg_1', 'text=1');
    expect(response.statusCode).toBe(200);
    await settle();
    expect(liveLeft(channelId)).toEqual({ n: 0 });
    expect(sent).toEqual([]);
    expect(app.db.prepare("SELECT filed_file, document_deleted_at FROM segments WHERE id = 'seg_1'").get()).toEqual({
      filed_file: '2026/x.chat.md',
      document_deleted_at: null,
    });
  });

  it('deletes only the document when only the document is ticked, and never files it again', async () => {
    const { channelId, handle } = await filed();
    expect((await deleteSegment(channelId, 'seg_1', 'document=1')).statusCode).toBe(200);
    await settle();
    expect(sent.map((s) => [s.method, s.path])).toEqual(deletes(handle));
    expect(liveLeft(channelId)).toEqual({ n: 2 });
    // Owed again, as naming a voice makes it.
    app.db.prepare("UPDATE segments SET filed_at = NULL WHERE id = 'seg_1'").run();
    sent = [];
    await app.channelLibraries!.sweep();
    expect(sent).toEqual([]);
  });

  it('deletes audio, transcript and document together, each at once for everybody', async () => {
    const { channelId, ertaId, handle } = await filed();
    recordedSegment(channelId, ertaId);
    const response = await deleteSegment(channelId, 'seg_r', 'audio=1&text=1&document=1');
    expect(response.statusCode).toBe(200);
    await settle();
    expect(sent.map((s) => [s.method, s.path])).toEqual(deletes(handle));
    expect(app.db.prepare("SELECT deleted_at FROM recordings WHERE id = 'rec_1'").get()).toEqual({ deleted_at: clock });
  });

  it("keeps a recording's document when only its audio is deleted, through the recording's sweep", async () => {
    const { channelId, ertaId } = await filed();
    recordedSegment(channelId, ertaId);
    expect((await deleteSegment(channelId, 'seg_r', 'audio=1')).statusCode).toBe(200);
    app.db.prepare("UPDATE recordings SET objects_cleared_at = ? WHERE id = 'rec_1'").run(clock);
    await app.channels.sweepDeleted(clock + WINDOW);
    expect(sent).toEqual([]);
    expect(app.db.prepare("SELECT filed_file FROM segments WHERE id = 'seg_r'").get()).toEqual({
      filed_file: '2026/x.chat.md',
    });
  });

  it('deletes a transcript alone, leaving the audio and the document', async () => {
    const { channelId, ertaId } = await filed();
    recordedSegment(channelId, ertaId);
    expect((await deleteSegment(channelId, 'seg_r', 'text=1')).statusCode).toBe(200);
    await settle();
    expect(sent).toEqual([]);
    expect(app.db.prepare("SELECT deleted_at FROM recordings WHERE id = 'rec_1'").get()).toEqual({ deleted_at: null });
    expect(app.db.prepare("SELECT deleted_at IS NOT NULL AS gone FROM transcripts WHERE recording_id = 'rec_1'").get()).toEqual({
      gone: 1,
    });
  });

  it('refuses to delete nothing, or what the segment never kept, and deletes nothing then', async () => {
    const { channelId } = await filed();
    expect((await deleteSegment(channelId, 'seg_1', '')).statusCode).toBe(400);
    expect((await deleteSegment(channelId, 'seg_1', 'text=1&audio=1')).statusCode).toBe(404);
    expect(liveLeft(channelId)).toEqual({ n: 2 });
  });

  // Pastes, since 2026-11-18: one made while a segment was kept is part of
  // it and goes with its text; one outside every segment is deleted alone.
  const pastesLeft = (channelId: string) =>
    app.db.prepare('SELECT id FROM pastes WHERE channel_id = ? AND deleted_at IS NULL ORDER BY id').all(channelId);
  const standalonePaste = (channelId: string) =>
    app.db
      .prepare(
        `INSERT INTO pastes (id, channel_id, author_id, display_name, pasted_at, text)
         VALUES ('paste_out', ?, 'claude', 'Claude', ?, 'Afterwards.')`
      )
      .run(channelId, START + 50 * 60_000);

  it("deletes what was pasted during a segment with its text, Claude's reply included", async () => {
    const { channelId } = await filed();
    standalonePaste(channelId);
    expect(pastesLeft(channelId)).toHaveLength(2);
    expect((await deleteSegment(channelId, 'seg_1', 'text=1')).statusCode).toBe(200);
    expect(pastesLeft(channelId)).toEqual([{ id: 'paste_out' }]);
    // And swept with deleted text, a month on.
    await app.channels.sweepDeletedText(clock + TRANSCRIPT_DELETED_RETENTION_MS);
    expect(app.db.prepare('SELECT COUNT(*) AS n FROM pastes WHERE channel_id = ?').get(channelId)).toEqual({ n: 1 });
  });

  it('deletes a paste outside every segment on its own, and refuses one inside a segment', async () => {
    const { channelId } = await filed();
    standalonePaste(channelId);
    const erta = await signIn('erta@example.com', 'Erta Example');
    const remove = (pasteId: string) =>
      app.fastify.inject({
        method: 'DELETE',
        url: `/channels/${channelId}/pastes/${pasteId}`,
        headers: { authorization: `Bearer ${erta.token}` },
      });
    const inside = (pastesLeft(channelId) as Array<{ id: string }>).find((row) => row.id !== 'paste_out')!.id;
    expect((await remove(inside)).statusCode).toBe(409);
    expect((await remove('paste_out')).statusCode).toBe(200);
    expect(pastesLeft(channelId)).toEqual([{ id: inside }]);
    expect((await remove('paste_out')).statusCode).toBe(404);
    expect(app.channels.lastFiledAt(channelId)).toBe(clock);
  });

  it("still takes the document with a recording deleted by a build up to 437, at once", async () => {
    const { channelId, ertaId, handle } = await filed();
    recordedSegment(channelId, ertaId);
    expect(app.channels.deleteRecording('rec_1', ertaId)).toEqual({ ok: true });
    await settle();
    expect(sent.map((s) => [s.method, s.path])).toEqual(deletes(handle));
  });

  it('keeps the file each segment was filed as, and the title noesis gave it', async () => {
    await filed();
    expect(app.db.prepare("SELECT filed_file, filed_title FROM segments WHERE id = 'seg_1'").get()).toEqual({
      filed_file: '2026/x.chat.md',
      filed_title: 'Bach Reads Kant',
    });
  });

  it("tells the channel when a segment is filed, so the Record fetches again for its title", async () => {
    const { channelId, ertaId } = await bookClub();
    makeFiling(ertaId);
    textSegment(channelId);
    expect(app.channels.lastFiledAt(channelId)).toBeNull();
    const told: string[][] = [];
    const off = app.channels.onChange((ids) => told.push(ids));
    clock = START + 2 * 3_600_000;
    await app.channelLibraries!.sweep();
    off();
    expect(told).toContainEqual([channelId]);
    expect(app.channels.lastFiledAt(channelId)).toBe(clock);
  });

  it('names it on the Record, with where noesis opens it', async () => {
    const { channelId, handle } = await filed();
    // Signed in again: the clock has moved past the first session.
    const { token } = await signIn('erta@example.com', 'Erta Example');
    app.db
      .prepare('INSERT INTO rooms (id, channel_id, opened_at, closed_at) VALUES (?, ?, ?, ?)')
      .run('room_1', channelId, START, START + 3_600_000);
    const response = await app.fastify.inject({
      method: 'GET',
      url: `/channels/${channelId}/rooms`,
      headers: { authorization: `Bearer ${token}` },
    });
    const segment = (response.json() as { rooms: RoomView[] }).rooms[0].segments.find((s) => s.id === 'seg_1')!;
    expect(segment.filed).toEqual({
      file: '2026/x.chat.md',
      title: 'Bach Reads Kant',
      url: `https://noesis.example/web/?library=thefloor%2F${handle}&file=2026%2Fx.chat.md`,
    });
  });

  it('reaches the Record, a read opening where noesis keeps it and no document’s text', async () => {
    const { channelId, handle } = await filed();
    app.db
      .prepare("UPDATE pastes SET working = ?, documents = ? WHERE id = 'seg_1_p'")
      .run(keptWorking(`thefloor/${handle}`), JSON.stringify([{ name: 'x', library: 'l', text: 'SECRET BODY', readAt: 0 }]));
    const { token } = await signIn('erta@example.com', 'Erta Example');
    app.db
      .prepare('INSERT INTO rooms (id, channel_id, opened_at, closed_at) VALUES (?, ?, ?, ?)')
      .run('room_1', channelId, START, START + 3_600_000);
    const response = await app.fastify.inject({
      method: 'GET',
      url: `/channels/${channelId}/rooms`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.body).not.toContain('SECRET BODY');
    const paste = (response.json() as { rooms: RoomView[] }).rooms[0].segments.find((s) => s.id === 'seg_1_p')!.paste!;
    expect(paste.working?.map((step) => step.kind)).toEqual(['search', 'read', 'failed']);
    expect(paste.working?.[1]).toMatchObject({
      name: '2026/2026-11-01-bach.chat.md',
      title: 'Bach Reads Kant',
      url: `https://noesis.example/web/?library=thefloor%2F${handle}&file=2026%2F2026-11-01-bach.chat.md`,
    });
  });
});

/** A reply's kept working: a lookup, a read, and a read that failed. */
const WORKING_LOOKUP = [
  'bach',
  '  Documents:',
  '    2026/2026-11-01-bach.chat.md — Bach Reads Kant — 900w',
  '      What Bach made of the first Critique.',
].join('\n');
const keptWorking = (library: string) =>
  JSON.stringify([
    { tool: 'lookup_term', library, input: { term: 'bach' }, kept: WORKING_LOOKUP },
    { tool: 'read_file', library, input: { name: '2026-11-01-bach.chat.md' }, kept: 'read in full: 900 words' },
    { tool: 'read_file', library, input: { name: 'gone.chat.md' }, kept: null, error: 'No such file: gone.chat.md' },
  ]);

describe("Claude's working, with its reply", () => {
  it('is filed with it, as the room sees it', async () => {
    const { channelId, ertaId } = await bookClub();
    makeFiling(ertaId);
    textSegment(channelId);
    app.db.prepare("UPDATE pastes SET working = ? WHERE id = 'seg_1_p'").run(keptWorking('thefloor/x'));
    clock = START + 2 * 3_600_000;
    await app.channelLibraries!.sweep();
    const body = sent.find((s) => s.path.endsWith('/import'))!.body;
    expect(body).toContain(
      [
        'Bach reads Kant.',
        '',
        "Claude's working: Searched 1 term · Read 1 document · 1 failed",
        '- Searched "bach": Bach Reads Kant',
        '- Read Bach Reads Kant',
        '- Couldn\'t open "gone.chat.md": No such file: gone.chat.md',
      ].join('\n')
    );
  });

});

describe("Channel Settings' card", () => {
  it('says the transcripts go in, and opens the library once there is one, for members only', async () => {
    const { channelId, ertaId } = await bookClub();
    const erta = { authorization: `Bearer ${(await signIn('erta@example.com', 'Erta Example')).token}` };
    const card = (headers: Record<string, string>) =>
      app.fastify.inject({ method: 'GET', url: `/channels/${channelId}/noesis-library`, headers });
    expect((await card(erta)).json()).toMatchObject({ on: true, url: null });

    makeFiling(ertaId);
    textSegment(channelId);
    clock = START + 2 * 3_600_000;
    await app.channelLibraries!.sweep();
    const handle = app.channels.handleOf(channelId)!;
    // Three years on, as the clock goes here: a session from then has lapsed.
    const again = { authorization: `Bearer ${(await signIn('erta@example.com', 'Erta Example')).token}` };
    expect((await card(again)).json()).toMatchObject({
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

describe("what noesis's import came to", () => {
  const done = (payload: object) => `event: done\ndata: ${JSON.stringify(payload)}\n\n`;

  it('is the file written and its title', () => {
    expect(finished(done({ exit_code: 0, changed: { '2026/a.chat.md': 'x' }, titles: { '2026/a.chat.md': 'On Names' } })))
      .toEqual({ ok: true, file: '2026/a.chat.md', title: 'On Names' });
  });

  it('has no title from a noesis that does not say', () => {
    expect(finished(done({ exit_code: 0, changed: { '2026/a.chat.md': 'x' } }))).toEqual({
      ok: true,
      file: '2026/a.chat.md',
      title: null,
    });
  });
});
