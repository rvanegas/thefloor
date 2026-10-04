import { DIAGNOSTICS_RETENTION_MS } from '../../core/constants';
import { buildApp, type App } from '../src/app';
import { MemoryMailer } from '../src/mail';

/**
 * The audio log's landing place, and the server's silence notices beside it.
 *
 * Pinned: that this cannot become an open sink for a signed-in stranger or be
 * used to write unbounded text to disk — and, since 2026-10-03, that what it
 * keeps goes. The lines went to the journal until then, which never deleted
 * them; a week by the sweep and at once with the account are what replaced
 * it. See diagnostics.ts.
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

function kept(accountId: string) {
  return app.db
    .prepare(
      'SELECT at, build, text FROM diagnostic_lines WHERE account_id = ? ORDER BY at'
    )
    .all(accountId) as Array<{ at: number; build: number | null; text: string }>;
}

function notices() {
  return app.db
    .prepare('SELECT kind, channel_id, body FROM silence_notices ORDER BY at')
    .all() as Array<{ kind: string; channel_id: string; body: string }>;
}

it('keeps each line with the phone\'s stamp, or arrival when it sent none', async () => {
  const alice = await signIn();
  enableDebug(alice.account.id);

  await ship(alice.token, {
    build: 92,
    lines: [{ at: clock - 5_000, text: 'engine stop' }, { text: 'no stamp' }],
  });

  expect(kept(alice.account.id)).toEqual([
    { at: clock - 5_000, build: 92, text: 'engine stop' },
    { at: clock, build: 92, text: 'no stamp' },
  ]);
});

it('keeps the newest five hundred, each cut to three hundred characters', async () => {
  const alice = await signIn();
  enableDebug(alice.account.id);

  await ship(alice.token, {
    lines: Array.from({ length: 900 }, (_, i) => ({
      at: clock + i,
      text: `${i} ${'x'.repeat(400)}`,
    })),
  });

  const rows = kept(alice.account.id);
  expect(rows).toHaveLength(500);
  expect(rows[0].text.startsWith('400 ')).toBe(true);
  expect(Math.max(...rows.map((r) => r.text.length))).toBe(300);
});

it('expires a line a week after it arrived, by the sweep and not by the phone\'s stamp', async () => {
  const alice = await signIn();
  enableDebug(alice.account.id);
  // Stamped a month back: a phone's clock is not what decides the horizon.
  await ship(alice.token, { lines: [{ at: clock - 30 * 86_400_000, text: 'old stamp' }] });
  clock += 60_000;
  await ship(alice.token, { lines: [{ at: clock, text: 'later' }] });

  clock += DIAGNOSTICS_RETENTION_MS;
  app.diagnostics.sweep(clock);

  // The first arrived a minute before the second, so exactly it has crossed.
  expect(kept(alice.account.id).map((r) => r.text)).toEqual(['later']);

  clock += 60_000;
  app.diagnostics.sweep(clock);
  expect(kept(alice.account.id)).toEqual([]);
});

it('sweeps on its own, with no phone shipping anything to set it off', () => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  try {
    const timed = buildApp({
      dbPath: ':memory:',
      mailer: new MemoryMailer(),
      now: () => clock,
    });
    timed.diagnostics.notice(
      { kind: 'unrestored', channelId: 'chan_x', forMs: 10_000, pairs: [] },
      clock
    );
    clock += DIAGNOSTICS_RETENTION_MS + 1;
    jest.advanceTimersByTime(60 * 60 * 1000);

    const left = timed.db.prepare('SELECT COUNT(*) AS n FROM silence_notices').get() as {
      n: number;
    };
    expect(left.n).toBe(0);
    timed.channels.stop();
    void timed.fastify.close();
  } finally {
    jest.useRealTimers();
  }
});

it('keeps a silence notice whole, and tells the journal nothing that names anybody', () => {
  const logged: unknown[] = [];
  const warn = jest
    .spyOn(app.fastify.log, 'warn')
    .mockImplementation((...args: unknown[]) => void logged.push(args[0]));

  app.channels.onSilenceNotice!({
    kind: 'unheard',
    channelId: 'chan_x',
    listener: 'acct_listener0000',
    speaker: 'acct_speaker00000',
    forMs: 4_000,
  });
  warn.mockRestore();

  expect(notices()).toHaveLength(1);
  expect(JSON.parse(notices()[0].body)).toMatchObject({
    kind: 'unheard',
    listener: 'acct_listener0000',
    speaker: 'acct_speaker00000',
  });
  expect(logged).toEqual([{ kind: 'unheard', channelId: 'chan_x' }]);
});

it('goes with the account: its lines, and every notice that names it', async () => {
  const alice = await signIn();
  const bob = await signIn('bob@example.com');
  enableDebug(alice.account.id);
  enableDebug(bob.account.id);
  await ship(alice.token, { lines: [{ at: clock, text: 'alice line' }] });
  await ship(bob.token, { lines: [{ at: clock, text: 'bob line' }] });

  const a = alice.account.id;
  const b = bob.account.id;
  app.diagnostics.notice(
    { kind: 'restoring', channelId: 'chan_1', listener: a, speaker: b },
    clock
  );
  app.diagnostics.notice(
    { kind: 'unrestored', channelId: 'chan_2', forMs: 10_000, pairs: [`${b}<-${a}`] },
    clock
  );
  app.diagnostics.notice(
    { kind: 'unheard', channelId: 'chan_3', listener: b, speaker: b, forMs: 4_000 },
    clock
  );

  const deleted = await app.fastify.inject({
    method: 'DELETE',
    url: '/me',
    headers: { authorization: `Bearer ${alice.token}` },
  });
  expect(deleted.statusCode).toBe(204);

  expect(kept(a)).toEqual([]);
  expect(kept(b).map((r) => r.text)).toEqual(['bob line']);
  // Named as a listener, and inside a pair: both go. The one naming only Bob
  // stays, since it is not Alice's to take.
  expect(notices().map((n) => n.channel_id)).toEqual(['chan_3']);
});
