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
