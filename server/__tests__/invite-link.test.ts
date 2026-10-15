import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildApp, type App } from '../src/app';
import {
  INVITE_GUESS_WINDOW_MS,
  INVITE_MAX_GUESSES,
  INVITE_TTL_MS,
  LINK_ACCEPT_WINDOW_MS,
  LINK_MAX_ACCEPTS,
} from '../src/accounts';
import { MemoryMailer } from '../src/mail';
import { invitePage } from '../src/invite';

/**
 * An invite link is a username anybody may read and six digits nobody should
 * be able to find, so the questions worth asking are about the second half:
 * what one pin is worth, what it is worth twice, and what a thousand guesses
 * at one are worth. The relationship it produces is the easy part and is
 * checked first only because everything else is a refusal of it.
 *
 * The pin went on 2026-09-25 and came back on 2026-10-15; a link with no pin
 * is the shim for the three weeks between, and is tested as one below.
 */

let app: App;
let clock = 1_700_000_000_000;

/**
 * This suite's own train directory rather than `server/web`, and it is empty
 * unless a test says otherwise — the same arrangement `open.test.ts` and
 * `train-root.test.ts` make, through the same `BuildOptions.trainRoot`.
 *
 * **It is here because this file used to read whatever was on disk, and pass or
 * fail on it.** § *hands the tab a username and no pin* asserts the page writes
 * the handover key, which `invitePage` emits only when `webAppReady` — and that
 * is `server/web/{stable,beta}/index.html` existing, which `bin/deploy-web`
 * builds and `.gitignore` excludes. So the test passed in a checkout that had
 * built a train at some point and failed in a fresh worktree, on a condition it
 * was not testing and nobody had stated. `bin/deploy` runs this suite, so the
 * failing direction could refuse a deploy for it.
 *
 * An empty directory is the honest default: a box serving no train is an
 * ordinary box, and every test here bar one means that. See
 * `decision/2026-09-27-a-test-may-not-read-an-untracked-build.md`.
 */
let trainRoot: string;

/**
 * Runs `body` with these trains standing, and takes them down afterwards.
 *
 * `open.test.ts`'s `withTrains` in miniature, and deliberately the same shape:
 * a train is a fact a test asserts *under*, so it is scoped to the test rather
 * than set up for the file. The content does not matter — `availableTrains`
 * only checks that `index.html` is reachable.
 */
async function withTrain<T>(name: string, body: () => Promise<T>): Promise<T> {
  const dir = join(trainRoot, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'index.html'), '<!doctype html>');
  try {
    return await body();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

beforeEach(async () => {
  clock = 1_700_000_000_000;
  trainRoot = await mkdtemp(join(tmpdir(), 'thefloor-invite-trains-'));
  app = buildApp({
    dbPath: ':memory:',
    mailer: new MemoryMailer(),
    now: () => clock,
    updateUrl: 'https://apps.apple.com/app/id0000000000',
    trainRoot,
  });
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
  await rm(trainRoot, { recursive: true, force: true });
});

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function signIn(identifier: string, displayName: string) {
  const code = app.accounts.issueCode(identifier, clock)!;
  const verified = await app.fastify.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: { identifier, code, displayName },
  });
  return verified.json() as {
    token: string;
    account: { id: string; displayName: string };
  };
}

type User = Awaited<ReturnType<typeof signIn>>;

/** Somebody with a username, which is the whole of what a link needs. */
async function named(identifier: string, displayName: string, username: string) {
  const user = await signIn(identifier, displayName);
  const set = await app.fastify.inject({
    method: 'POST',
    url: '/me',
    headers: auth(user.token),
    payload: { username },
  });
  expect(set.statusCode).toBe(200);
  return user;
}

const mint = (user: User) =>
  app.fastify.inject({
    method: 'POST',
    url: '/contacts/invite-link',
    headers: auth(user.token),
  });

async function link(user: User): Promise<string> {
  const response = await mint(user);
  expect(response.statusCode).toBe(200);
  const { url } = response.json() as { url: string | null };
  expect(url).not.toBeNull();
  return url!;
}

/** The two halves of a link, which is how anybody following one has them. */
function halves(url: string): { username: string; pin: string } {
  const match = /\/i\/([^/?]+)\/(\d{6})$/.exec(url);
  expect(match).not.toBeNull();
  return { username: match![1], pin: match![2] };
}

/**
 * Takes up a link. A test that passes no pin is testing the shim for links
 * minted between 2026-09-25 and 2026-10-15, which carried none.
 */
const redeem = (user: User, username: string, pin?: string) =>
  app.fastify.inject({
    method: 'POST',
    url: '/contacts/invite/accept',
    headers: auth(user.token),
    payload: pin ? { username, pin } : { username },
  });

/** Takes up a whole link, pin and all, which is what the app does. */
const follow = (user: User, url: string) => {
  const { username, pin } = halves(url);
  return redeem(user, username, pin);
};

/**
 * Read from `Accounts` rather than over HTTP, as the other contact tests do:
 * the list reaches a client on the Home snapshot over the socket, and there is
 * no route to ask for one.
 */
const contacts = (user: User) => app.accounts.contactsFor(user.account.id);

describe('the link itself', () => {
  it('has no link for an account with no username', async () => {
    const alice = await signIn('alice@example.com', 'Alice');
    // Signing up derives one, so having none is now something somebody has
    // done on purpose: a blank is how a username is given up.
    await app.fastify.inject({
      method: 'POST',
      url: '/me',
      headers: auth(alice.token),
      payload: { username: '' },
    });
    const response = await mint(alice);
    // Not an error: "you have no link" is the answer to the question, and the
    // screen asking draws a way to choose a username from exactly this.
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ url: null });
  });

  it('builds the link out of the username and a pin, and carries no name', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const url = await link(alice);
    expect(url).toMatch(/\/i\/alice_k\/\d{6}$/);
    expect(url).not.toContain('name=');
  });

  /**
   * **The change of 2026-10-15 in one assertion.** A link is one seat again,
   * so two presses that gave the same address would give two people one seat.
   */
  it('is a fresh link every time', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    expect(await link(alice)).not.toBe(await link(alice));
  });

  it('keeps at most ten live, letting the oldest go', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    const first = await link(alice);
    for (let i = 0; i < 10; i += 1) {
      clock += 1;
      await link(alice);
    }
    const live = app.db
      .prepare('SELECT COUNT(*) AS n FROM invite_pins WHERE owner_id = ?')
      .get(alice.account.id) as { n: number };
    expect(live.n).toBe(10);
    expect((await follow(bob, first)).statusCode).toBe(400);
  });
});

describe('following a link', () => {
  it('makes the pair contacts outright, both ways round', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');

    expect((await follow(bob, await link(alice))).statusCode).toBe(200);
    expect(contacts(bob)).toEqual([
      expect.objectContaining({ status: 'accepted' }),
    ]);
    expect(contacts(alice)).toEqual([
      expect.objectContaining({ status: 'accepted' }),
    ]);
  });

  it('gives the pair the channel that is the point of being contacts', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    await follow(bob, await link(alice));

    const shared = app.channels
      .rejoinableFor(bob.account.id)
      .filter(
        (entry) =>
          entry.others.length === 1 && entry.others[0].id === alice.account.id
      );
    expect(shared).toHaveLength(1);
  });

  it('names that channel in the reply, so the app can open it', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');

    const { channelId } = (await follow(bob, await link(alice))).json();
    expect(typeof channelId).toBe('string');
    const shared = app.channels
      .rejoinableFor(bob.account.id)
      .filter((entry) => entry.channelId === channelId);
    expect(shared).toHaveLength(1);
    expect(shared[0].others.map((o) => o.id)).toEqual([alice.account.id]);
  });

  it('credits the owner with having brought them here', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    await follow(bob, await link(alice));

    expect(app.accounts.invitedCount(alice.account.id)).toBe(1);
  });

  it('is spent by the first person to follow it', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    const carol = await signIn('carol@example.com', 'Carol');
    const url = await link(alice);

    expect((await follow(bob, url)).statusCode).toBe(200);
    const second = await follow(carol, url);
    expect(second.statusCode).toBe(400);
    expect((second.json() as { error: string }).error).toContain('already');
    expect(contacts(carol)).toEqual([]);
  });

  /**
   * The web app keeps an invitation in the tab until it hears it was spent,
   * so the same person arriving twice is ordinary — a reload, or a second tap
   * on the link in the thread — and must open the channel again rather than
   * be told their own acceptance was used.
   */
  it('answers the person who spent it again, with the same channel', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    const url = await link(alice);

    const first = await follow(bob, url);
    const again = await follow(bob, url);
    expect(again.statusCode).toBe(200);
    expect(again.json().channelId).toBe(first.json().channelId);
  });

  it('leaves the seat alone for somebody who is already a contact', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    const carol = await signIn('carol@example.com', 'Carol');
    await follow(bob, await link(alice));

    const url = await link(alice);
    expect((await follow(bob, url)).statusCode).toBe(200);
    expect((await follow(carol, url)).statusCode).toBe(200);
  });

  it('expires after thirty days', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    const url = await link(alice);

    clock += INVITE_TTL_MS + 1;
    const response = await follow(bob, url);
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toContain('expired');
  });

  it('stops answering an account after enough wrong pins', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    const { username, pin } = halves(await link(alice));

    for (let i = 0; i < INVITE_MAX_GUESSES; i += 1) {
      await redeem(bob, username, pin === '000000' ? '000001' : '000000');
    }
    // Even the right pin, because what is locked is the account being guessed
    // at rather than any one pin.
    expect((await redeem(bob, username, pin)).statusCode).toBe(400);

    clock += INVITE_GUESS_WINDOW_MS;
    expect((await redeem(bob, username, pin)).statusCode).toBe(200);
  });

  it('refuses the owner their own link', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const response = await follow(alice, await link(alice));
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toContain('your own');
  });

  it('answers a username nobody holds the way it answers any other refusal', async () => {
    const bob = await signIn('bob@example.com', 'Bob');
    const response = await redeem(bob, 'nobody_at_all', '042317');
    expect(response.statusCode).toBe(400);
    expect(contacts(bob)).toEqual([]);
  });
});

/**
 * The `code` beside each refusal's sentence, which is what lets the app say it
 * in the reader's language. `error` is checked alongside, because an app older
 * than the code still reads it.
 */
describe('a refusal names itself', () => {
  const refusal = (response: { json: () => unknown }) =>
    response.json() as { error: string; code?: string };

  it('names the owner taking up their own link', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    expect(refusal(await follow(alice, await link(alice)))).toEqual({
      error: 'This is your own invite link.',
      code: 'self',
    });
  });

  it('names a username nobody holds', async () => {
    const bob = await signIn('bob@example.com', 'Bob');
    expect(refusal(await redeem(bob, 'nobody_at_all'))).toEqual({
      error: 'This invite link cannot be opened.',
      code: 'unknown',
    });
  });

  it('names a day that has run out', async () => {
    const bob = await signIn('bob@example.com', 'Bob');
    for (let i = 0; i < LINK_MAX_ACCEPTS; i += 1) {
      const owner = await named(`o${i}@example.com`, `Owner ${i}`, `owner_${i}`);
      await redeem(bob, halves(await link(owner)).username);
    }
    const extra = await named('extra@example.com', 'Extra', 'extra_one');
    expect(refusal(await redeem(bob, halves(await link(extra)).username)).code).toBe(
      'too_many'
    );
  });

  it('names a link that was used, and one that expired', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    const carol = await signIn('carol@example.com', 'Carol');
    const url = await link(alice);
    await follow(bob, url);
    expect(refusal(await follow(carol, url)).code).toBe('used');

    const dave = await named('dave@example.com', 'Dave', 'dave_d');
    const stale = await link(dave);
    clock += INVITE_TTL_MS + 1;
    expect(refusal(await follow(carol, stale)).code).toBe('expired');
  });

  /**
   * `locked` shares `unknown`'s sentence on purpose, and a code of its own
   * would tell apart what the sentence keeps alike.
   */
  it('names a lock exactly as it names a username nobody holds', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    const { username, pin } = halves(await link(alice));
    for (let i = 0; i < INVITE_MAX_GUESSES; i += 1) {
      await redeem(bob, username, pin === '000000' ? '000001' : '000000');
    }
    expect(refusal(await redeem(bob, username, pin))).toEqual(
      refusal(await redeem(bob, 'nobody_at_all'))
    );
  });
});

/**
 * The budget, which is what the pin-less door costs, and a shim with it.
 *
 * A link with no pin — one minted between 2026-09-25 and 2026-10-15 — names an
 * owner and nothing else, so an account that never saw a link can walk
 * usernames and accept against each one. Since credit follows the first
 * contact, unlimited accepting would also be unlimited standings.
 */
describe('taking up more links than anybody honestly would', () => {
  it('stops after the day’s allowance', async () => {
    const bob = await signIn('bob@example.com', 'Bob');
    for (let i = 0; i < LINK_MAX_ACCEPTS; i += 1) {
      const owner = await named(`o${i}@example.com`, `Owner ${i}`, `owner_${i}`);
      const { username } = halves(await link(owner));
      expect((await redeem(bob, username)).statusCode).toBe(200);
    }

    const extra = await named('extra@example.com', 'Extra', 'extra_one');
    const { username } = halves(await link(extra));
    const refused = await redeem(bob, username);
    expect(refused.statusCode).toBe(400);
    expect((refused.json() as { error: string }).error).toContain('today');
    expect(app.accounts.areContacts(bob.account.id, extra.account.id)).toBe(false);
  });

  it('allows again once the day has passed', async () => {
    const bob = await signIn('bob@example.com', 'Bob');
    for (let i = 0; i < LINK_MAX_ACCEPTS; i += 1) {
      const owner = await named(`o${i}@example.com`, `Owner ${i}`, `owner_${i}`);
      await redeem(bob, halves(await link(owner)).username);
    }

    clock += LINK_ACCEPT_WINDOW_MS;
    const extra = await named('extra@example.com', 'Extra', 'extra_one');
    const { username } = halves(await link(extra));
    expect((await redeem(bob, username)).statusCode).toBe(200);
  });

  it('does not spend the allowance on a link already followed', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    const { username } = halves(await link(alice));

    // Twenty taps on one link is one contact, and must not exhaust a day.
    for (let i = 0; i < LINK_MAX_ACCEPTS + 5; i += 1) {
      expect((await redeem(bob, username)).statusCode).toBe(200);
    }
    const extra = await named('extra@example.com', 'Extra', 'extra_one');
    expect(
      (await redeem(bob, halves(await link(extra)).username)).statusCode
    ).toBe(200);
  });

  it('does not spend it on the owner’s own link either', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const { username } = halves(await link(alice));
    for (let i = 0; i < LINK_MAX_ACCEPTS + 5; i += 1) {
      expect((await redeem(alice, username)).statusCode).toBe(400);
    }
    const bob = await named('bob@example.com', 'Bob', 'bob_b');
    expect(
      (await redeem(alice, halves(await link(bob)).username)).statusCode
    ).toBe(200);
  });
});

/**
 * Links minted between 2026-09-25 and 2026-10-15, which carried no pin and
 * are still sitting in the threads they were pasted into — and TestFlight
 * builds 354 to 361, which drop the pin before accepting. planning/SHIMS.md
 * says what retires all of this.
 */
describe('a link with no pin', () => {
  it('is still good, and makes the pair contacts', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');

    expect((await redeem(bob, 'alice_k')).statusCode).toBe(200);
    expect(contacts(bob)).toEqual([
      expect.objectContaining({ status: 'accepted' }),
    ]);
    expect(app.accounts.areContacts(alice.account.id, bob.account.id)).toBe(true);
  });

  it('is not a refusal the second time', async () => {
    await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    expect((await redeem(bob, 'alice_k')).statusCode).toBe(200);
    expect((await redeem(bob, 'alice_k')).statusCode).toBe(200);
  });

  /**
   * Recorded rather than defended: the lock protects a *pin*, and there is no
   * pin here to protect. What bounds this road is the day's budget above.
   */
  it('is not stopped by the lock on wrong pins', async () => {
    await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');

    for (let i = 0; i < INVITE_MAX_GUESSES; i += 1) {
      await redeem(bob, 'alice_k', '000000');
    }
    expect((await redeem(bob, 'alice_k')).statusCode).toBe(200);
  });
});

describe('the page', () => {
  const open = (url: string) => app.fastify.inject({ method: 'GET', url });
  const path = (url: string) => new URL(url).pathname;

  it('names the owner to a request holding a live pin', async () => {
    const alice = await named('alice@example.com', 'Alice Kowalski', 'alice_k');
    const response = await open(path(await link(alice)));
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Alice Kowalski invited you');
  });

  /**
   * **The disclosure, from the other end.** Without a live pin beside it a
   * username gets a page that names nobody — and a username nobody holds gets
   * the same one, so walking usernames teaches a reader only what they typed.
   */
  it('names nobody for a wrong pin, and the same for a username nobody holds', async () => {
    await named('alice@example.com', 'Alice Kowalski', 'alice_k');
    const wrong = await open('/i/alice_k/000000');
    const invented = await open('/i/nobody_at_all/000000');
    expect(wrong.body).not.toContain('Alice');
    expect(wrong.body).toContain('cannot be opened');
    expect(invented.body).toBe(wrong.body);
  });

  it('says a spent link was used, and names nobody', async () => {
    const alice = await named('alice@example.com', 'Alice Kowalski', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    const url = await link(alice);
    await follow(bob, url);
    const body = (await open(path(url))).body;
    expect(body).toContain('already been used');
    expect(body).not.toContain('Alice');
    expect(body).not.toContain('Accept invite');
  });

  it('says an old link expired', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const url = await link(alice);
    clock += INVITE_TTL_MS + 1;
    expect((await open(path(url))).body).toContain('expired');
  });

  /**
   * Looking is throttled exactly as redeeming is, which is the point:
   * somebody who only ever looked would otherwise have an oracle with no
   * limit on it.
   */
  it('counts a wrong pin, and stops naming anybody once locked', async () => {
    await named('alice@example.com', 'Alice', 'alice_k');
    const alice = app.accounts.byUsername('alice_k')!;
    const live = app.accounts.mintInvitePin(alice.id, clock)!;
    for (let i = 0; i < INVITE_MAX_GUESSES; i += 1) {
      await open(`/i/alice_k/${live === '000000' ? '000001' : '000000'}`);
    }
    expect((await open(`/i/alice_k/${live}`)).body).not.toContain('Alice invited you');
  });

  it('ignores a name in the address', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const body = (await open(`${path(await link(alice))}?name=Mallory`)).body;
    expect(body).not.toContain('Mallory');
    expect(body).toContain('Alice invited you');
  });

  it('escapes the display name rather than letting it be markup', async () => {
    const alice = await named('alice@example.com', '<b>Alice</b>', 'alice_k');
    const body = (await open(path(await link(alice)))).body;
    expect(body).not.toContain('<b>Alice</b>');
    expect(body).toContain('&lt;b&gt;Alice&lt;/b&gt;');
  });

  it('says it in a few sentences and no sections', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const body = (await open(path(await link(alice)))).body;
    expect(body).not.toContain('<h2');

    const prose = body
      .slice(body.indexOf('<body>'))
      .replace(/<script[\s\S]*?<\/script>/g, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    expect(prose.split(' ').length).toBeLessThan(120);
  });

  it('draws the mark', async () => {
    expect((await open('/i/alice_k')).body).toContain('<svg class="mark"');
  });

  /** The address is the credential, and a click must not hand it on. */
  it('keeps the address out of the next request’s referrer', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    for (const url of [path(await link(alice)), '/i/alice_k/000000', '/i/alice_k']) {
      expect((await open(url)).body).toContain(
        '<meta name="referrer" content="no-referrer">'
      );
    }
  });

  /**
   * **Under a train, explicitly**, since *Accept invite* is drawn only where
   * there is a web app to accept in — so the train is the precondition of the
   * assertion and is stood up rather than inherited. See `trainRoot` above
   * for what inheriting it cost.
   */
  it('asks for one thing, with the install as the prerequisite in the bar', async () => {
    await withTrain('stable', async () => {
      const alice = await named('alice@example.com', 'Alice', 'alice_k');
      const url = await link(alice);
      const { pin } = halves(url);
      const body = (await open(path(url))).body;
      expect(body).toContain('<h1>Alice invited you</h1>');
      expect(body).toContain('<a class="get" href="');
      expect(body).toContain('Install The Floor on this iPhone first');
      // One button: the store is not a second call to action any more.
      expect(body).toContain('<a id="accept" href="/open">Accept invite</a>');
      expect(body.match(/<p class="cta">/g)).toHaveLength(1);
      expect(body).not.toContain('Get The Floor for iPhone');
      // On the click, not on arrival: a pin is one seat, and a tab that only
      // looked has not taken it.
      expect(body).toContain("addEventListener('click'");
      expect(body).toContain(
        `sessionStorage.setItem("thefloor.invite", "{\\"username\\":\\"alice_k\\",\\"pin\\":\\"${pin}\\"}")`
      );
      expect(body).not.toContain('location.replace');
      // Safari's banner hands the app the scheme form, pin and all, since
      // every build since 288 reads it.
      expect(body).toContain(`app-argument=thefloor://i/alice_k/${pin}"`);
      // On iOS a tap on Accept hands the app the same form — on the tap and
      // only there, never on load and never as a bare anchor.
      expect(body).toContain(`location.href = "thefloor://i/alice_k/${pin}"`);
      expect(body).not.toContain('href="thefloor://');
      const beforeClick = body.slice(0, body.indexOf("addEventListener('click'"));
      expect(beforeClick).not.toMatch(/location[^;]*thefloor:/);
      expect(body).not.toContain('link you were sent');
      expect(body).toContain('og:title');
    });
  });

  /**
   * The shim, from the page's end: a link with no pin still resolves, names
   * nobody whatever its `?name=` says, and renders identically for a real
   * username and an invented one.
   */
  it('names nobody for a link with no pin, real or invented', async () => {
    await named('alice@example.com', 'Alice', 'alice_k');
    const real = await open('/i/alice_k?name=Alice');
    const invented = await open('/i/nobody_at_all');
    expect(real.statusCode).toBe(200);
    expect(real.body).not.toContain('Alice');
    expect(real.body).toContain('You’ve been invited');
    expect(invented.body).toBe(real.body.replace(/alice_k/g, 'nobody_at_all'));
  });

  it('hands a link with no pin to the tab as the username alone', async () => {
    await withTrain('stable', async () => {
      const body = (await open('/i/alice_k')).body;
      expect(body).toContain('{\\"username\\":\\"alice_k\\"}');
      expect(body).toContain('Accept invite');
    });
  });

  /**
   * The other direction: a box serving no train draws no accept button and
   * writes nothing into the tab, because there is nowhere to send the reader.
   */
  it('sends Accept to the store rather than a dead web app where there is none', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const body = (await open(path(await link(alice)))).body;
    expect(body).toMatch(/<a id="accept" href="https:\/\/apps\.apple\.com[^"]*">Accept invite<\/a>/);
    expect(body).not.toContain('href="/open"');
  });
});

/**
 * The page in each configuration a box can be in.
 *
 * Unit calls rather than requests, because the route always passes
 * `options.updateUrl` and there is no way to reach the absent case through it.
 * **The rule is that nothing is drawn dead**: an `href=""` is worse than an
 * absence.
 */
describe('the page, box by box', () => {
  const STORE = 'https://apps.apple.com/app/id123456789';
  const drawn = (extra: Partial<Parameters<typeof invitePage>[0]>) =>
    invitePage({
      username: 'alice_k',
      pin: '042317',
      displayName: 'Alice',
      webAppReady: false,
      ...extra,
    });

  it('puts the store in the bar and never sends anybody back to the link', () => {
    const body = drawn({ appStoreUrl: STORE });
    expect(body).toContain(`<a class="get" href="${STORE}">Get the app</a>`);
    expect(body).toContain(`<a id="accept" href="${STORE}">Accept invite</a>`);
    expect(body).not.toContain('link you were sent');
    expect(body).not.toContain('href="thefloor://');
  });

  it('says the server has nothing to hand out rather than drawing a dead button', () => {
    const body = drawn({});
    expect(body).not.toContain('class="cta"');
    expect(body).toContain('not handing out the app yet');
    expect(body).toContain('Alice');
  });

  it('hands straight over only where there is a web app and no store', () => {
    const body = drawn({ webAppReady: true });
    expect(body).toContain("location.replace('/open')");
    expect(body).toContain('\\"pin\\":\\"042317\\"');
    expect(body).not.toContain('apple-itunes-app');

    const both = drawn({ webAppReady: true, appStoreUrl: STORE });
    expect(both).not.toContain('location.replace');
    expect(both).toContain(`<a class="get" href="${STORE}"`);
    expect(both).toContain('<a id="accept" href="/open">Accept invite</a>');
  });

  it('draws the banner wherever there is a store, and only then', () => {
    expect(drawn({ appStoreUrl: STORE })).toContain(
      '<meta name="apple-itunes-app" content="app-id=123456789, app-argument=thefloor://i/alice_k/042317">'
    );
    expect(drawn({ appStoreUrl: STORE, pin: undefined, displayName: undefined })).toContain(
      'app-argument=thefloor://i/alice_k">'
    );
    expect(drawn({})).not.toContain('apple-itunes-app');
  });

  it('draws a refusal with the store and no accept button', () => {
    const body = drawn({ appStoreUrl: STORE, webAppReady: true, refusal: 'used', displayName: undefined });
    expect(body).toContain('already been used');
    expect(body).not.toContain('Accept invite');
    expect(body).not.toContain('thefloor.invite');
    expect(body).toContain(`<a href="${STORE}"`);
  });

  it('never writes an empty href in any of the four', () => {
    for (const extra of [
      { appStoreUrl: STORE, webAppReady: true },
      { appStoreUrl: STORE },
      { webAppReady: true },
      {},
    ]) {
      expect(drawn(extra)).not.toContain('href=""');
      expect(drawn({ ...extra, refusal: 'expired' as const })).not.toContain('href=""');
    }
  });
});
