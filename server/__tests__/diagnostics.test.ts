import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';

/**
 * The audio log's landing place.
 *
 * What matters here is the gate and the bounds, not the storage: the lines go
 * to the journal, which is not something a test can read and is not something
 * worth a table — see the route's own note. So what is pinned is that this
 * cannot become an open sink for a signed-in stranger, and cannot be used to
 * write unbounded text into a system log.
 */

let app: App;
let clock = 1_700_000_000_000;

beforeEach(() => {
  clock = 1_700_000_000_000;
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

async function signIn(identifier = 'alice@example.com') {
  const code = app.accounts.issueCode(identifier, clock)!;
  const verified = await app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, displayName: 'Alice' },
  });
  return verified.json() as { token: string; account: { id: string } };
}

const ship = (
  token: string,
  payload: { build?: number; lines: Array<{ at?: number; text?: string }> }
) =>
  app.fastify.inject({
    method: 'POST',
    url: '/diagnostics',
    headers: { authorization: `Bearer ${token}` },
    payload,
  });

function enableDebug(accountId: string) {
  app.db.prepare('UPDATE accounts SET debug = 1 WHERE id = ?').run(accountId);
}

it('refuses an account that was never given the diagnostic panel', async () => {
  const alice = await signIn();

  const refused = await ship(alice.token, {
    build: 92,
    lines: [{ at: clock, text: 'engine stop' }],
  });

  // 403 rather than 401: the credential is good and the answer is still no.
  // Any signed-in account could otherwise write into this box's journal, and
  // the same column already gates the panel that produces these lines, so
  // nothing is lost by refusing everybody else.
  expect(refused.statusCode).toBe(403);
});

it('refuses anybody with no credential at all', async () => {
  const refused = await app.fastify.inject({
    method: 'POST',
    url: '/diagnostics',
    payload: { lines: [{ text: 'engine stop' }] },
  });

  expect(refused.statusCode).toBe(401);
});

it('takes the lines from the account that has the column', async () => {
  const alice = await signIn();
  enableDebug(alice.account.id);

  const stored = await ship(alice.token, {
    build: 92,
    lines: [
      { at: clock, text: 'sub + media:chan_x (1)' },
      { at: clock + 10, text: 'playout frozen 5s' },
    ],
  });

  expect(stored.statusCode).toBe(200);
  expect(stored.json()).toEqual({ ok: true, stored: 2 });
});

it('is bounded in both directions, a client being free text on the wire', async () => {
  const alice = await signIn();
  enableDebug(alice.account.id);

  const flooded = await ship(alice.token, {
    lines: Array.from({ length: 900 }, (_, i) => ({ at: clock, text: `l${i}` })),
  });

  // The newest are kept, for the same reason the app's own ring drops the
  // oldest: what explains a fault is next to it, not at the start of the day.
  expect(flooded.json()).toEqual({ ok: true, stored: 500 });
});

it('accepts a batch with nothing usable in it without storing anything', async () => {
  const alice = await signIn();
  enableDebug(alice.account.id);

  const empty = await ship(alice.token, { lines: [{ at: clock }, {}] });

  // Not an error: a client that sent something malformed should drop it and
  // carry on, and a rejection here would have it retry the same batch for
  // ever.
  expect(empty.statusCode).toBe(200);
  expect(empty.json()).toEqual({ ok: true, stored: 0 });
});
