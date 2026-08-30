import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp, type App } from '../src/app';
import {
  BUILD_HEADER,
  CLIENT_HEADER,
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
   *
   * Both rows, because the socket writes both: the account's, which a contact
   * list renders, and the *session's*, which is what the census counts since
   * it moved off `accounts` on 2026-08-24. Stamping only the account would
   * leave every one of these outside the window. See `heard` in ws.ts.
   */
  const connect = (who: { id: string; token: string }, build?: number) => {
    app.accounts.markSeen(who.id, clock, build);
    app.accounts.markSession(who.token, clock, build);
  };

  it('reports nothing known, and says how many are silent, before anyone speaks', async () => {
    const quiet = await signIn('quiet@example.com');
    connect(quiet);

    const body = await health();
    // Not zero, not MIN_SUPPORTED_BUILD, not a guess. Nobody has said.
    expect(body.oldestBuild).toBeNull();
    // And the count is what stops that null being read as "nobody is old".
    expect(body.silentBuilds).toBe(1);
  });

  /**
   * The measurement one column could not make, and the reason it moved to
   * sessions on 2026-08-24. `accounts.last_build` holds whichever device spoke
   * last, so a phone on a current build masked a tablet below the floor — in
   * exactly the census that exists to notice the tablet.
   *
   * The phone speaks *second* here on purpose: it is the ordering under which
   * the old shape gave the wrong answer.
   */
  it('sees the older of one person’s two devices', async () => {
    const tablet = await signIn('two@example.com', 41);
    const phone = { id: tablet.id, token: app.accounts.issueToken(tablet.id, clock) };
    connect(tablet, 41);
    connect(phone, 56);

    expect((await health()).oldestBuild).toBe(41);
  });

  /**
   * The mirror of the above, and it would have passed against the old shape
   * too — the tablet speaking last left 41 in the account's column by luck.
   * That is why it is not the only one of the pair: which device spoke last is
   * exactly what the census must stop depending on, so both orders are stated.
   */
  it('sees it in the other order too', async () => {
    const phone = await signIn('two@example.com', 56);
    const tablet = { id: phone.id, token: app.accounts.issueToken(phone.id, clock) };
    connect(phone, 56);
    connect(tablet, 41);

    expect((await health()).oldestBuild).toBe(41);
  });

  /**
   * `silent` counts sign-ins rather than accounts, which is what changed about
   * the number on `/healthz` when the census moved. One person with a current
   * phone and a pre-header tablet is one silent session, not zero — the
   * account-level count said zero, because the phone had written a build over
   * the tablet's silence.
   */
  it('counts a silent session even when the same person reported a build', async () => {
    const phone = await signIn('mixed-devices@example.com', 56);
    const tablet = { id: phone.id, token: app.accounts.issueToken(phone.id, clock) };
    connect(phone, 56);
    connect(tablet);

    const body = await health();
    expect(body.oldestBuild).toBe(56);
    expect(body.silentBuilds).toBe(1);
  });

  /**
   * Signing out takes the session out of the census with it, which is the
   * cleaning the account-level shape had to do by hand. A device that has
   * stopped calling stops being counted.
   */
  it('forgets a session that was signed out', async () => {
    const stays = await signIn('stays@example.com', 56);
    const goes = { id: stays.id, token: app.accounts.issueToken(stays.id, clock) };
    connect(stays, 56);
    connect(goes, 41);
    expect((await health()).oldestBuild).toBe(41);

    app.accounts.revokeToken(goes.token);

    expect((await health()).oldestBuild).toBe(56);
  });

  /**
   * The census measures an *installed population*, and the web app has none —
   * there is one live version and everybody gets it on load, so it can neither
   * be stranded by a raised floor nor tell you anything about what has been.
   * See planning/WEB.md § *The census counts native only*.
   *
   * It reports a real build rather than staying silent, which is what makes
   * this test necessary: left in, a browser would drag `oldestBuild` down to
   * whatever the stable train was cut from and look exactly like an old phone.
   */
  it('leaves the web client out of the census', async () => {
    const phone = await signIn('two-ways@example.com', 56);
    const browser = {
      id: phone.id,
      token: app.accounts.issueToken(phone.id, clock),
    };
    connect(phone, 56);
    // A build well below the phone's, and below the floor — the reading that
    // would be alarming if this were an install.
    app.accounts.markSession(browser.token, clock, 41, 'web');

    const body = await health();
    expect(body.oldestBuild).toBe(56);
    expect(body.silentBuilds).toBe(0);
  });

  /**
   * The account-level column, which `bin/people` prints as a person's build
   * with an expired flag against the floor.
   *
   * A browser must not write it. It is whichever device spoke last, so a web
   * call would put a number that is *not an install* over one that is — and
   * somebody whose phone is below the floor would read as current because they
   * once opened a browser. That is the masking failure that moved the census
   * off this column, made worse: a second phone at least represents something
   * installed.
   */
  it('does not let a browser speak for the account’s build', async () => {
    const { id, token } = await signIn('has-a-phone@example.com', 41);
    connect({ id, token }, 41);
    expect(app.accounts.byId(id)?.last_build).toBe(41);

    const browser = app.accounts.issueToken(id, clock);
    await app.fastify.inject({
      url: '/home',
      headers: {
        authorization: `Bearer ${browser}`,
        [BUILD_HEADER]: '114',
        [CLIENT_HEADER]: 'web',
      },
    });

    // The phone's build, not the web train's.
    expect(app.accounts.byId(id)?.last_build).toBe(41);
  });

  /**
   * But a browser is still somebody being about, which is the other thing that
   * column's row carries and what a contact list renders.
   */
  it('still stamps that the person is about', async () => {
    const { id } = await signIn('browsing@example.com');
    const before = app.accounts.byId(id)?.last_seen_at ?? 0;

    clock += 60_000;
    const browser = app.accounts.issueToken(id, clock);
    await app.fastify.inject({
      url: '/home',
      headers: {
        authorization: `Bearer ${browser}`,
        [BUILD_HEADER]: '114',
        [CLIENT_HEADER]: 'web',
      },
    });

    expect(app.accounts.byId(id)?.last_seen_at).toBeGreaterThan(before);
  });

  /**
   * The half that protects every client already out there. A field none of
   * them can send must default to the population that exists, or adding it
   * silently reclassifies all of them at once.
   */
  it('counts a session that says nothing about its client as native', async () => {
    const old = await signIn('unsaying@example.com', 41);
    app.accounts.markSession(old.token, clock, 41);

    expect((await health()).oldestBuild).toBe(41);
  });

  /**
   * And the same over the wire, since the header is the only way a real client
   * says it. Absent is native; `web` is not counted.
   */
  it('reads the client kind from the header', async () => {
    const { id, token } = await signIn('header-web@example.com', 56);
    connect({ id, token }, 56);

    const browser = app.accounts.issueToken(id, clock);
    await app.fastify.inject({
      url: '/home',
      headers: {
        authorization: `Bearer ${browser}`,
        [BUILD_HEADER]: '41',
        [CLIENT_HEADER]: 'web',
      },
    });

    expect((await health()).oldestBuild).toBe(56);
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
    connect(old);

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

    const garbled = await signIn('garbled@example.com');
    const { token } = garbled;
    connect(garbled);
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
   *
   * Since the census moved to sessions it is doubly excluded, and the second
   * reason is the stronger one: `erase` deletes the account's tokens, so the
   * stamp on the way out finds no row to write and the tombstone is not in
   * the count at all. The identifier clause is now belt to that brace. This
   * test does not care which of them is doing the work, which is the point of
   * keeping both.
   */
  it('leaves a deleted account out, even when a socket stamps it on the way out', async () => {
    const gone = await signIn('leaving@example.com', 41);
    connect(gone, 41);
    const staying = await signIn('staying@example.com', 56);
    connect(staying, 56);
    expect((await health()).oldestBuild).toBe(41);

    expect(app.accounts.erase(gone.id)).toBe(true);
    connect(gone, 41);

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
    const { account, token } = verified.json() as {
      account: { id: string };
      token: string;
    };
    // Both rows, as a socket writes both — the census counts sessions. See
    // `connect` above.
    app.accounts.markSeen(account.id, clock, build);
    app.accounts.markSession(token, clock, build);
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
