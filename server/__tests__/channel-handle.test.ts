import { buildApp, type App } from '../src/app';
import { mintHandle } from '../src/channels';
import { MemoryMailer } from '../src/mail';

/**
 * A channel's *handle*: what names it to noesis, minted only when asked for,
 * and the two questions noesis asks The Floor about the library it names.
 *
 * - None until something asks, and the same one every time after.
 * - A slug of the name and a suffix, which is a noesis library name; an
 *   unnamed channel is `channel-…`.
 * - Two channels of one name have two handles.
 * - A rename leaves it alone.
 * - noesis, and only noesis, is told who the members are, who of them is
 *   Pro, and the channel's current name; and which channels' libraries
 *   somebody may read, by the name they hold now.
 */

let app: App;
const clock = 1_700_000_000_000;
const SECRET = 'client-secret';
const NOESIS = { authorization: 'Basic ' + Buffer.from(`thefloor:${SECRET}`).toString('base64') };

/** noesis's register, as far as a signup sees it: the suggested stem, numbered when taken. */
let names: Set<string>;
const fakeNoesis = (async (_input: unknown, init?: { body?: unknown }) => {
  const body = JSON.parse(String(init?.body)) as { suggest: string[] };
  const stem = body.suggest[0];
  let name = stem;
  for (let n = 2; names.has(name); n++) name = `${stem}${n}`;
  names.add(name);
  return Response.json({ user: name, account: false });
}) as typeof fetch;

beforeEach(() => {
  names = new Set();
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    now: () => clock,
    names: { origin: 'https://noesis.example', clientId: 'thefloor', clientSecret: SECRET, fetch: fakeNoesis },
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

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function channel(name: string | null) {
  const erta = await signIn('erta@example.com', 'Erta Example');
  const created = await app.fastify.inject({
    method: 'POST',
    url: '/channels',
    headers: auth(erta.token),
    payload: { contactIds: [] },
  });
  const channelId = (created.json() as { channelId: string }).channelId;
  if (name !== null) rename(channelId, erta.account.id, name);
  return { channelId, ertaId: erta.account.id };
}

function rename(channelId: string, userId: string, name: string) {
  const renamed = app.channels.dispatch(channelId, userId, { type: 'SET_NAME', name } as never);
  expect(renamed.ok).toBe(true);
}

// The rule noesis holds a library's name to (`noesis/service.py`, NAME_RE).
const NOESIS_NAME = /^[a-z0-9][a-z0-9_-]*$/;

describe('a channel handle', () => {
  it('is minted on first asking and the same ever after', async () => {
    const { channelId } = await channel('Book Club');
    expect(app.channels.handleOf(channelId)).toBeNull();
    const handle = app.channels.handleFor(channelId)!;
    expect(handle).toMatch(/^book-club-[a-z2-9]{4}$/);
    expect(app.channels.handleFor(channelId)).toBe(handle);
    expect(app.channels.handleOf(channelId)).toBe(handle);
  });

  it('is channel-… for an unnamed channel, and null for none', async () => {
    const { channelId } = await channel(null);
    expect(app.channels.handleFor(channelId)).toMatch(/^channel-[a-z2-9]{4}$/);
    expect(app.channels.handleFor('chan_nothing')).toBeNull();
  });

  it('is a noesis library name, whatever the channel is called', () => {
    for (const name of ['Café Olé', '¡¡!!', '  Book   Club  ', 'x'.repeat(80), '日本語']) {
      expect(mintHandle(name)).toMatch(NOESIS_NAME);
    }
  });

  it('differs between two channels of one name', async () => {
    const one = await channel('Book Club');
    const two = await channel('Book Club');
    expect(app.channels.handleFor(one.channelId)).not.toBe(app.channels.handleFor(two.channelId));
  });

  it('is refused to a second channel by the database', async () => {
    const one = await channel('Book Club');
    const two = await channel('Book Club');
    const handle = app.channels.handleFor(one.channelId);
    expect(() =>
      app.db.prepare('UPDATE channels SET handle = ? WHERE id = ?').run(handle, two.channelId)
    ).toThrow(/UNIQUE/);
  });

  it('survives a rename', async () => {
    const { channelId, ertaId } = await channel('Book Club');
    const handle = app.channels.handleFor(channelId);
    rename(channelId, ertaId, 'Reading Group');
    expect(app.channels.handleFor(channelId)).toBe(handle);
  });
});

describe('what noesis asks about a channel library', () => {
  /** A community of three — Erta its owner, Zed and Anna joined — with a handle. */
  async function bookClub() {
    const erta = await signIn('erta@example.com', 'Erta Example');
    const created = await app.fastify.inject({
      method: 'POST',
      url: '/channels',
      headers: auth(erta.token),
      payload: { contactIds: [] },
    });
    const channelId = (created.json() as { channelId: string }).channelId;
    const made = await app.fastify.inject({
      method: 'POST',
      url: `/channels/${channelId}/community`,
      headers: auth(erta.token),
      payload: { name: 'Book Club' },
    });
    const { joinCode } = made.json() as { joinCode: string };
    const zed = await signIn('zed@example.com', 'Zed Zebedee');
    const anna = await signIn('anna@example.com', 'Anna Kowalski');
    for (const user of [zed, anna]) {
      const joined = await app.fastify.inject({
        method: 'POST',
        url: '/channels/join',
        headers: auth(user.token),
        payload: { code: joinCode },
      });
      expect(joined.statusCode).toBe(200);
    }
    return { channelId, erta, zed, anna, handle: app.channels.handleFor(channelId)! };
  }

  function makePro(accountId: string) {
    app.db
      .prepare(
        `INSERT INTO pro_subscriptions (original_transaction_id, account_id, product_id, environment,
           expires_at, latest_transaction_id, updated_at, raw) VALUES (?, ?, 'pro', 'Sandbox', ?, ?, ?, '{}')`
      )
      .run(`t-${accountId}`, accountId, clock + 86_400_000, `t-${accountId}`, clock);
  }

  const members = (handle: string, headers: Record<string, string> = NOESIS) =>
    app.fastify.inject({ method: 'GET', url: `/noesis/libraries/${handle}`, headers });
  const libraries = (user: string, headers: Record<string, string> = NOESIS) =>
    app.fastify.inject({ method: 'GET', url: `/noesis/users/${user}/libraries`, headers });

  it('names the members by username and display name, who of them is Pro, and the channel', async () => {
    const { anna, handle } = await bookClub();
    makePro(anna.account.id);
    const answer = await members(handle);
    expect(answer.statusCode).toBe(200);
    expect(answer.json()).toEqual({
      handle,
      name: 'Book Club',
      members: [
        { user: 'erta_example', pro: false, name: 'Erta Example' },
        { user: 'zed_zebedee', pro: false, name: 'Zed Zebedee' },
        { user: 'anna_kowalski', pro: true, name: 'Anna Kowalski' },
      ],
    });
  });

  it('carries the name a rename gave it, under the same handle', async () => {
    const { channelId, erta, handle } = await bookClub();
    rename(channelId, erta.account.id, 'Reading Group');
    expect((await members(handle)).json().name).toBe('Reading Group');
  });

  it('drops somebody who leaves', async () => {
    const { channelId, zed, handle } = await bookClub();
    app.channels.dispatch(channelId, zed.account.id, { type: 'LEAVE_CHANNEL' } as never);
    const users = (await members(handle)).json().members.map((m: { user: string }) => m.user);
    expect(users).toEqual(['erta_example', 'anna_kowalski']);
    expect((await libraries('zed_zebedee')).json()).toEqual({ libraries: [] });
  });

  it('lists the channel libraries somebody may read, whatever the case asked in', async () => {
    const { handle } = await bookClub();
    expect((await libraries('ZED_zebedee')).json()).toEqual({ libraries: [{ handle, name: 'Book Club' }] });
    expect((await libraries('nobody_here')).json()).toEqual({ libraries: [] });
  });

  it('lists no channel that has never needed a handle', async () => {
    await signIn('erta@example.com', 'Erta Example');
    await channel('Book Club');
    expect((await libraries('erta_example')).json()).toEqual({ libraries: [] });
  });

  it('answers nobody but noesis', async () => {
    const { handle, erta } = await bookClub();
    const wrong = { authorization: 'Basic ' + Buffer.from('thefloor:guess').toString('base64') };
    expect((await members(handle, wrong)).statusCode).toBe(401);
    expect((await members(handle, auth(erta.token))).statusCode).toBe(401);
    expect((await members(handle, {})).statusCode).toBe(401);
    expect((await libraries('erta_example', wrong)).statusCode).toBe(401);
  });

  it('knows no handle that names nothing', async () => {
    expect((await members('book-club-zzzz')).statusCode).toBe(404);
  });
});
