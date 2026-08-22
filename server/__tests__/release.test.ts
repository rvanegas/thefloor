import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp, type App } from '../src/app';
import {
  BUILD_HEADER,
  claimedBuild,
  deployed,
  MIN_SUPPORTED_BUILD,
} from '../src/release';

/**
 * What the box says it is. The point of all of this is that a running server
 * can be asked which revision it is, so the tests are about the answer being
 * present and honest rather than about any particular value.
 */
describe('release identity', () => {
  let app: App;

  beforeEach(() => {
    app = buildApp();
  });

  afterEach(async () => {
    await app.fastify.close();
  });

  it('reports the compatibility floor and an unknown commit from a checkout', async () => {
    const health = await app.fastify.inject({ method: 'GET', url: '/healthz' });
    const body = health.json();

    expect(body.ok).toBe(true);
    expect(body.minBuild).toBe(MIN_SUPPORTED_BUILD);
    // Asserted as present rather than as 'unknown'. bin/deploy writes
    // deployed.json into this package on its way past and removes it again, so
    // an interrupted deploy can leave one behind and a test that demanded
    // 'unknown' would fail for a reason having nothing to do with the code.
    expect(typeof body.commit).toBe('string');
    expect(body.commit).not.toHaveLength(0);
    // Null rather than absent, so a client below the floor can tell "nowhere
    // to send you" from a field it failed to parse.
    expect(body.updateUrl).toBeNull();
  });

  it('tells an expired client where to update, when it has been told', async () => {
    // The one thing an install below the floor can still be given, since by
    // definition it cannot be given a new build. See BuildOptions.updateUrl.
    const configured = buildApp({
      updateUrl: 'https://apps.apple.com/app/id123456789',
    });
    try {
      const body = (
        await configured.fastify.inject({ method: 'GET', url: '/healthz' })
      ).json();
      expect(body.updateUrl).toBe('https://apps.apple.com/app/id123456789');
      // Unauthenticated, like the rest of this endpoint: the client that needs
      // it is one that should not be signing in.
      expect(body.minBuild).toBe(MIN_SUPPORTED_BUILD);
    } finally {
      await configured.fastify.close();
    }
  });

  it('reads what bin/deploy stamped, and survives there being nothing to read', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thefloor-release-'));
    const cwd = process.cwd();
    try {
      process.chdir(dir);
      expect(deployed()).toBeNull();

      writeFileSync(
        join(dir, 'deployed.json'),
        JSON.stringify({
          commit: 'abc1234-dirty',
          branch: 'master',
          at: '2026-08-15T00:00:00Z',
        })
      );
      expect(deployed()?.commit).toBe('abc1234-dirty');

      // Garbage is the same as absent rather than a crash on boot: this is
      // read on the startup path, and a server that will not start because a
      // provenance file is malformed has traded a real thing for a label.
      writeFileSync(join(dir, 'deployed.json'), 'not json');
      expect(deployed()).toBeNull();
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /**
   * The floor is compared against iOS build numbers, which only ever rise and
   * are integers. A float or a string would be a comparison that silently does
   * the wrong thing at exactly one value.
   */
  it('keeps the floor an integer', () => {
    expect(Number.isInteger(MIN_SUPPORTED_BUILD)).toBe(true);
  });
});

/**
 * Which build is calling — the measurement `MIN_SUPPORTED_BUILD` never had.
 *
 * The floor is a declaration: a shim may be deleted once the floor has passed
 * the build that needed it, and until now nothing could check that against the
 * installed population. These are about the reading being honest, especially
 * in the case where it is honestly *unknown*.
 */
describe('what build is calling', () => {
  let app: App;
  let clock = 1_000_000;

  beforeEach(() => {
    app = buildApp({ now: () => clock });
  });

  afterEach(async () => {
    await app.fastify.close();
  });

  async function signIn(identifier: string, build?: number) {
    const code = app.accounts.issueCode(identifier, clock)!;
    const verified = await app.fastify.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { identifier, code, displayName: identifier },
      headers: build === undefined ? {} : { [BUILD_HEADER]: String(build) },
    });
    const body = verified.json() as { token: string; account: { id: string } };
    return { token: body.token, id: body.account.id };
  }

  const health = async () =>
    (await app.fastify.inject({ method: 'GET', url: '/healthz' })).json();

  /**
   * `connect` stands in for the socket, which is what actually stamps
   * `last_seen_at` — a client from before the header holds a socket like any
   * other and is exactly the account this has to keep visible.
   */
  const connect = (id: string, build?: number) =>
    app.accounts.markSeen(id, clock, build);

  it('reports nothing known, and says how many are silent, before anyone speaks', async () => {
    const { id } = await signIn('quiet@example.com');
    connect(id);

    const body = await health();
    // Not zero, not MIN_SUPPORTED_BUILD, not a guess. Nobody has said.
    expect(body.oldestBuild).toBeNull();
    // And the count is what stops that null being read as "nobody is old".
    expect(body.silentBuilds).toBe(1);
  });

  it('records what a caller claims, over HTTP and over the socket alike', async () => {
    const { token } = await signIn('current@example.com', 41);
    await app.fastify.inject({
      url: '/home',
      headers: { authorization: `Bearer ${token}`, [BUILD_HEADER]: '41' },
    });

    const body = await health();
    expect(body.oldestBuild).toBe(41);
    expect(body.silentBuilds).toBe(0);
  });

  /**
   * The reading that matters when deciding whether a shim can go: one account
   * on something current and one that has never said is *not* a population
   * starting at 41. `silentBuilds` is what carries that, and reading
   * `oldestBuild` alone would give exactly the false confidence this replaced.
   */
  it('does not let a known build speak for an unknown one', async () => {
    const current = await signIn('new@example.com', 41);
    await app.fastify.inject({
      url: '/home',
      headers: { authorization: `Bearer ${current.token}`, [BUILD_HEADER]: '41' },
    });
    // A pre-37 client: it connects, so it is present, and says nothing.
    const old = await signIn('old@example.com');
    connect(old.id);

    const body = await health();
    expect(body.oldestBuild).toBe(41);
    expect(body.silentBuilds).toBe(1);
  });

  /**
   * A request without the header is not a claim that the build is unknown —
   * the two file transfers bypass `request()` entirely. Letting one of those
   * clear the column would erase the evidence on every upload.
   */
  it('keeps the last build claimed when a later call is silent', async () => {
    const { token } = await signIn('mixed@example.com', 41);
    const bearer = { authorization: `Bearer ${token}` };
    await app.fastify.inject({ url: '/home', headers: { ...bearer, [BUILD_HEADER]: '41' } });
    await app.fastify.inject({ url: '/home', headers: bearer });

    const body = await health();
    expect(body.oldestBuild).toBe(41);
    expect(body.silentBuilds).toBe(0);
  });

  /**
   * Never a refusal. This is metadata about a caller that has already
   * authenticated, and a field that exists to observe the population must not
   * be able to lock part of it out.
   */
  it('treats a garbled claim as no claim, and never refuses over it', async () => {
    for (const raw of ['', 'thirty-seven', '37.5', '-1', '0', 'NaN']) {
      expect(claimedBuild(raw)).toBeNull();
    }
    expect(claimedBuild(undefined)).toBeNull();
    expect(claimedBuild(['41', '42'])).toBe(41);
    expect(claimedBuild('41')).toBe(41);

    const { id, token } = await signIn('garbled@example.com');
    connect(id);
    const answered = await app.fastify.inject({
      url: '/home',
      headers: { authorization: `Bearer ${token}`, [BUILD_HEADER]: 'thirty-seven' },
    });
    expect(answered.statusCode).toBe(200);
    expect((await health()).silentBuilds).toBe(1);
  });

  /**
   * Somebody who stopped using the app months ago must not hold the floor down
   * forever, or the number can only ever fall.
   */
  /**
   * A tombstone cannot sign in — `erase` deletes its tokens and rewrites its
   * identifier — so no floor can strand it, and it was holding `oldestBuild`
   * at 51 on production while the real population started at 56.
   *
   * `erase` nulls `last_seen_at`, so this only happens when something stamps
   * it again afterwards, which a socket already open when the account was
   * deleted does on its way out. That is the case reproduced here.
   */
  it('leaves a deleted account out, even when a socket stamps it on the way out', async () => {
    const gone = await signIn('leaving@example.com', 41);
    connect(gone.id, 41);
    const staying = await signIn('staying@example.com', 56);
    connect(staying.id, 56);
    expect((await health()).oldestBuild).toBe(41);

    expect(app.accounts.erase(gone.id)).toBe(true);
    connect(gone.id, 41);

    const body = await health();
    expect(body.oldestBuild).toBe(56);
    expect(body.silentBuilds).toBe(0);
  });

  it('ignores accounts that have not been seen inside the window', async () => {
    const { token } = await signIn('lapsed@example.com', 37);
    await app.fastify.inject({
      url: '/home',
      headers: { authorization: `Bearer ${token}`, [BUILD_HEADER]: '37' },
    });
    expect((await health()).oldestBuild).toBe(37);

    clock += 31 * 24 * 60 * 60 * 1000;
    const body = await health();
    expect(body.oldestBuild).toBeNull();
    expect(body.silentBuilds).toBe(0);
  });
});

/**
 * The demo accounts, which are a phone at Apple rather than a user.
 *
 * A reviewer signs in on whatever build is under review and the row then sits
 * there until the next submission, so it measures nothing about the installed
 * population — and the second demo account has never reported a build at all,
 * which would pin `silentBuilds` above zero for good. That is the one
 * condition under which the whole reading is not to be trusted, so it must not
 * be held there by two rows that were put on production deliberately.
 */
describe('the demo accounts are not a population', () => {
  const REVIEW = {
    identifier: 'appreview@example.com',
    code: '246813',
    contact: 'appreview2@example.com',
  };
  let app: App;
  let clock = 1_000_000;

  beforeEach(() => {
    app = buildApp({ dbPath: ':memory:', now: () => clock, review: REVIEW });
  });

  afterEach(async () => {
    await app.fastify.close();
  });

  async function seen(identifier: string, build?: number) {
    const code = app.accounts.issueCode(identifier, clock)!;
    const verified = await app.fastify.inject({
      method: 'POST',
      url: '/auth/verify',
      payload: { identifier, code, displayName: identifier },
    });
    const { account } = verified.json() as { account: { id: string } };
    app.accounts.markSeen(account.id, clock, build);
  }

  const health = async () =>
    (await app.fastify.inject({ method: 'GET', url: '/healthz' })).json();

  it('counts neither the reviewer nor its contact', async () => {
    await seen('appreview@example.com', 41);
    await seen('appreview2@example.com');
    await seen('someone@example.com', 56);

    const body = await health();
    expect(body.oldestBuild).toBe(56);
    expect(body.silentBuilds).toBe(0);
  });

  /**
   * Matched the way the database matches identifiers everywhere else, since
   * the address is typed into `.env` by hand and a capital letter there must
   * not quietly put the reviewer back into the census.
   */
  it('matches the configured address case-insensitively', async () => {
    await seen('AppReview@Example.com', 41);
    await seen('someone@example.com', 56);

    expect((await health()).oldestBuild).toBe(56);
  });

  it('excludes nobody when no demo account is configured', async () => {
    await app.fastify.close();
    app = buildApp({ dbPath: ':memory:', now: () => clock });
    await seen('appreview@example.com', 41);
    await seen('someone@example.com', 56);

    expect((await health()).oldestBuild).toBe(41);
  });
});
