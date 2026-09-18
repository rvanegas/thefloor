import { USAGE_RETENTION_MS } from '../../core/constants';
import { NAV_ACTIONS } from '../../core/navigation';
import { buildApp, type App } from '../src/app';
import type { NavCountRow } from '../src/db';
import { MemoryMailer } from '../src/mail';

/**
 * The four ways between Home and the channel you are standing in, counted.
 *
 * **What is tested here is mostly what is *not* recorded.** The counter is a
 * departure from every other table in the meter — no account, no timestamp
 * finer than a day, no sweep — and each of those is a promise rather than an
 * omission: /privacy says there is no record of what an individual tapped, and
 * the only thing keeping that true is the shape of this table. A column added
 * here in good faith a year from now would falsify a published sentence, so
 * the shape is asserted rather than left to the schema comment.
 *
 * The client half — which control calls which name — is in
 * `app/__tests__/session.test.tsx` and `app/src/ui/__tests__`.
 */

let app: App;
let clock = 1_700_000_000_000;

const T0 = 1_700_000_000_000;

beforeEach(() => {
  clock = T0;
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    now: () => clock,
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

const nav = (
  token: string,
  payload: Record<string, unknown>,
  headers: Record<string, string> = {}
) =>
  app.fastify.inject({
    method: 'POST',
    url: '/nav',
    headers: { ...auth(token), ...headers },
    payload,
  });

const counts = (): NavCountRow[] =>
  app.db
    .prepare('SELECT * FROM nav_counts ORDER BY kind, build, client, day')
    .all() as unknown as NavCountRow[];

describe('counting the four ways in and out', () => {
  it('counts one, and says nothing back', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    const response = await nav(alice.token, { id: 'home' });
    expect(response.statusCode).toBe(204);
    expect(counts()).toEqual([
      { kind: 'home', build: 0, client: 'native', day: '2023-11-14', count: 1 },
    ]);
  });

  it('adds to the same row rather than writing another', async () => {
    // The ordinary case: the same control, the same build, the same day. A
    // row per press is the shape this table exists to avoid — see the schema.
    const alice = await signIn('user1@example.com', 'Alice');
    for (let i = 0; i < 5; i++) await nav(alice.token, { id: 'swipeOut' });
    expect(counts()).toHaveLength(1);
    expect(counts()[0]!.count).toBe(5);
  });

  it('keeps the four apart, which is the entire question', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    for (const id of NAV_ACTIONS) await nav(alice.token, { id });
    expect(counts().map((row) => row.kind).sort()).toEqual(
      [...NAV_ACTIONS].sort()
    );
  });

  it('keeps builds apart, so an old one cannot flatter a new one', async () => {
    // The whole of what makes *as of this build* answerable. Two builds of the
    // same client on the same day are two rows, never one.
    const alice = await signIn('user1@example.com', 'Alice');
    await nav(alice.token, { id: 'home' }, { 'x-thefloor-build': '239' });
    await nav(alice.token, { id: 'home' }, { 'x-thefloor-build': '240' });
    expect(counts().map((row) => [row.build, row.count])).toEqual([
      [239, 1],
      [240, 1],
    ]);
  });

  it('files a client that will not say its build under 0, and still counts', async () => {
    // Null would be a fresh row on every press: SQLite treats two nulls as
    // distinct in a unique index, so the upsert would never match. See
    // `recordNav`.
    const alice = await signIn('user1@example.com', 'Alice');
    await nav(alice.token, { id: 'home' });
    await nav(alice.token, { id: 'home' });
    expect(counts()).toHaveLength(1);
    expect(counts()[0]).toMatchObject({ build: 0, count: 2 });
  });

  it('keeps the web apart from the phone, which has no swipes at all', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    await nav(alice.token, { id: 'home' }, { 'x-thefloor-client': 'web' });
    await nav(alice.token, { id: 'home' });
    expect(counts().map((row) => row.client)).toEqual(['native', 'web']);
  });

  it('puts a later day in its own row', async () => {
    const alice = await signIn('user1@example.com', 'Alice');
    await nav(alice.token, { id: 'home' });
    clock = T0 + 24 * 60 * 60 * 1000;
    await nav(alice.token, { id: 'home' });
    expect(counts().map((row) => row.day)).toEqual([
      '2023-11-14',
      '2023-11-15',
    ]);
  });

  it('refuses a name it does not know', async () => {
    // A fifth name is a client bug. Filing it would leave a report that looks
    // like it is working and is quietly counting two different things.
    const alice = await signIn('user1@example.com', 'Alice');
    expect((await nav(alice.token, { id: 'sideways' })).statusCode).toBe(400);
    expect((await nav(alice.token, {})).statusCode).toBe(400);
    expect(counts()).toEqual([]);
  });

  it('refuses a caller with no session', async () => {
    // Authenticated so that this is not a counter anybody on the internet can
    // move — and the account goes no further than the gate.
    const response = await app.fastify.inject({
      method: 'POST',
      url: '/nav',
      payload: { id: 'home' },
    });
    expect(response.statusCode).toBe(401);
    expect(counts()).toEqual([]);
  });

  it('holds nothing that says who did it', async () => {
    // The promise /privacy makes, asserted against the row rather than against
    // the comment above it.
    const alice = await signIn('user1@example.com', 'Alice');
    await nav(alice.token, { id: 'liveCard' });
    const row = counts()[0] as unknown as Record<string, unknown>;
    expect(Object.keys(row).sort()).toEqual([
      'build',
      'client',
      'count',
      'day',
      'kind',
    ]);
    expect(JSON.stringify(row)).not.toContain(alice.account.id);
  });

  it('survives the sweep, and the erasure of the account that did it', async () => {
    // Both deliberate, and both the opposite of every other table here. There
    // is nobody in these rows to have a thirty-day window or a right to be
    // forgotten, and the question they answer — did the gesture that shipped
    // in build N get used — is asked over the life of a build.
    const alice = await signIn('user1@example.com', 'Alice');
    await nav(alice.token, { id: 'swipeIn' });

    app.channels.usage.sweep(T0 + USAGE_RETENTION_MS * 2);
    expect(counts()).toHaveLength(1);

    app.channels.usage.forget(alice.account.id);
    expect(counts()).toHaveLength(1);
  });
});
