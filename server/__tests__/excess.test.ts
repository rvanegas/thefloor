import { USAGE_RETENTION_MS } from '../../core/constants';
import { buildApp, type App } from '../src/app';
import { openDb, type Db } from '../src/db';
import {
  clientAddress,
  Excess,
  EXCESS_MULTIPLE,
  EXCESS_REFUSED_FLOOR,
  EXCESS_WINDOW_MS,
  type ExcessFlag,
} from '../src/excess';

/**
 * The monitor flags and never refuses, so every question here is about when it
 * writes something down — and, in the last block, about the walk that asked
 * for it: an account learning which usernames are held, one `unknown` at a
 * time. What it writes is read by `bin/usage excess` and by nothing in the
 * server, so a row in the table is the whole of the outcome.
 */

const flagCount = (db: Db) =>
  Number(
    (db.prepare('SELECT COUNT(*) AS n FROM excess_flags').get() as { n: number })
      .n
  );

// The start of an hour, so a test's requests all fall in one window unless it
// moves the clock on purpose.
const HOUR = 1_700_000_000_000 - (1_700_000_000_000 % EXCESS_WINDOW_MS);

const walker = { kind: 'account' as const, id: 'acct_walker' };
const ROUTE = '/contacts/invite/accept';

function monitor() {
  const flags: ExcessFlag[] = [];
  const db = openDb(':memory:');
  const excess = new Excess(db, (flag) => flags.push(flag));
  return { excess, flags, db };
}

function refuse(excess: Excess, times: number, at = HOUR, who = walker) {
  for (let i = 0; i < times; i++) excess.record(who, ROUTE, 400, at);
}

describe('when a flag is raised', () => {
  it('says nothing below the floor, however alone somebody is', () => {
    const { excess, flags } = monitor();
    refuse(excess, EXCESS_REFUSED_FLOOR - 1);
    expect(flags).toHaveLength(0);
  });

  it('flags the floor when nobody else is on the route, and says so once', () => {
    const { excess, flags } = monitor();
    refuse(excess, EXCESS_REFUSED_FLOOR * 3);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      subject: walker,
      route: ROUTE,
      measure: 'refused',
      count: EXCESS_REFUSED_FLOOR,
      typical: 0,
    });
  });

  it('counts successes in the total and not as refusals', () => {
    const { excess, flags } = monitor();
    for (let i = 0; i < EXCESS_REFUSED_FLOOR * 2; i++) {
      excess.record(walker, ROUTE, 200, HOUR);
    }
    expect(flags).toHaveLength(0);
  });

  it('does not count a 5xx as a refusal, which is this server failing', () => {
    const { excess, flags } = monitor();
    for (let i = 0; i < EXCESS_REFUSED_FLOOR * 2; i++) {
      excess.record(walker, ROUTE, 503, HOUR);
    }
    expect(flags).toHaveLength(0);
  });

  it('holds back while the route is busy for everybody, and flags the multiple', () => {
    const { excess, flags } = monitor();
    // Three others, each refused as often as the floor: busy, and typical.
    for (const id of ['a', 'b', 'c']) {
      refuse(excess, EXCESS_REFUSED_FLOOR, HOUR, { kind: 'account', id });
    }
    flags.length = 0; // the first of them was alone on the route when it got there

    refuse(excess, EXCESS_REFUSED_FLOOR * EXCESS_MULTIPLE - 1);
    expect(flags).toHaveLength(0);
    refuse(excess, 1);
    expect(flags).toHaveLength(1);
    expect(flags[0].typical).toBe(EXCESS_REFUSED_FLOOR);
  });

  it('starts every hour from nothing', () => {
    const { excess, flags } = monitor();
    refuse(excess, EXCESS_REFUSED_FLOOR - 1);
    refuse(excess, EXCESS_REFUSED_FLOOR - 1, HOUR + EXCESS_WINDOW_MS);
    expect(flags).toHaveLength(0);
  });

  it('flags again the next hour, as a row of its own', () => {
    const { excess, flags, db } = monitor();
    refuse(excess, EXCESS_REFUSED_FLOOR);
    refuse(excess, EXCESS_REFUSED_FLOOR, HOUR + EXCESS_WINDOW_MS);
    expect(flags).toHaveLength(2);
    expect(flagCount(db)).toBe(2);
  });
});

describe('what is kept', () => {
  it('writes a flag and nothing about anybody who tripped nothing', () => {
    const db = openDb(':memory:');
    const excess = new Excess(db);
    excess.record({ kind: 'account', id: 'quiet' }, ROUTE, 400, HOUR);
    refuse(excess, EXCESS_REFUSED_FLOOR);
    const rows = db.prepare('SELECT subject FROM excess_flags').all();
    expect(rows).toEqual([{ subject: walker.id }]);
  });

  it('forgets an account, its flags and its count this hour', () => {
    const { excess, flags, db } = monitor();
    refuse(excess, EXCESS_REFUSED_FLOOR);
    excess.forget(walker.id);
    expect(flagCount(db)).toBe(0);
    refuse(excess, EXCESS_REFUSED_FLOOR - 1);
    expect(flags).toHaveLength(1);
  });

  it('sweeps a flag on the usage tables’ horizon', () => {
    const { excess } = monitor();
    refuse(excess, EXCESS_REFUSED_FLOOR);
    expect(excess.sweep(HOUR + USAGE_RETENTION_MS - 1)).toBe(0);
    expect(excess.sweep(HOUR + USAGE_RETENTION_MS + 1)).toBe(1);
  });
});

describe('the address a request came from', () => {
  it('believes Caddy, and takes the hop Caddy saw', () => {
    expect(clientAddress('127.0.0.1', '203.0.113.9')).toBe('203.0.113.9');
    expect(clientAddress('::ffff:127.0.0.1', '1.2.3.4, 203.0.113.9')).toBe(
      '203.0.113.9'
    );
  });

  it('believes nobody else', () => {
    expect(clientAddress('198.51.100.7', '203.0.113.9')).toBe('198.51.100.7');
  });

  it('falls back to the socket when Caddy said nothing', () => {
    expect(clientAddress('127.0.0.1', undefined)).toBe('127.0.0.1');
  });
});

describe('the walk that asked for this', () => {
  let app: App;
  const clock = HOUR;

  beforeEach(() => {
    app = buildApp({ dbPath: ':memory:', now: () => clock });
  });

  afterEach(async () => {
    app.channels.stop();
    await app.fastify.close();
  });

  async function signIn(identifier: string) {
    const code = app.accounts.issueCode(identifier, clock)!;
    const verified = await app.fastify.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { identifier, code, displayName: 'Walker' },
    });
    return verified.json() as { token: string; account: { id: string } };
  }

  const accept = (username: string, token?: string) =>
    app.fastify.inject({
      method: 'POST',
      url: ROUTE,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload: { username },
    });

  it('flags an account walking unknown usernames, and says so nowhere else', async () => {
    const me = await signIn('walker@example.com');
    for (let i = 0; i < EXCESS_REFUSED_FLOOR * 2; i++) {
      const response = await accept(`nobody${i}`, me.token);
      // Refused exactly as before: the monitor changes no answer.
      expect(response.json()).toMatchObject({ code: 'unknown' });
    }

    const row = app.db
      .prepare('SELECT subject, route, measure FROM excess_flags')
      .get();
    expect(row).toEqual({ subject: me.account.id, route: ROUTE, measure: 'refused' });

    // The meter's rule: nothing on the wire says a flag exists.
    const health = await app.fastify.inject({ method: 'GET', url: '/healthz' });
    expect(health.body).not.toMatch(/excess/i);
  });

  it('counts a signed-out caller by the address Caddy forwarded', async () => {
    for (let i = 0; i < EXCESS_REFUSED_FLOOR; i++) {
      await app.fastify.inject({
        method: 'POST',
        url: ROUTE,
        headers: { 'x-forwarded-for': '203.0.113.9' },
        payload: { username: 'anybody' },
      });
    }
    const row = app.db
      .prepare('SELECT subject_kind, subject FROM excess_flags')
      .get();
    expect(row).toEqual({ subject_kind: 'address', subject: '203.0.113.9' });
  });

  it('ignores addresses that match no route', async () => {
    for (let i = 0; i < EXCESS_REFUSED_FLOOR * 2; i++) {
      await app.fastify.inject({ method: 'GET', url: `/wp-login.php?${i}` });
    }
    expect(flagCount(app.db)).toBe(0);
  });

  it('forgets a deleted account’s flags', async () => {
    const me = await signIn('walker@example.com');
    for (let i = 0; i < EXCESS_REFUSED_FLOOR; i++) {
      await accept(`nobody${i}`, me.token);
    }
    expect(flagCount(app.db)).toBe(1);
    await app.fastify.inject({
      method: 'DELETE',
      url: '/me',
      headers: { authorization: `Bearer ${me.token}` },
    });
    expect(flagCount(app.db)).toBe(0);
  });
});
