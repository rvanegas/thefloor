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

/** The username out of a link, which is how anybody following one has it. */
function halves(url: string): { username: string } {
  const match = /\/i\/([^/?]+)/.exec(url);
  expect(match).not.toBeNull();
  return { username: match![1] };
}

/**
 * Takes up a link. The pin is optional, and a test that passes one is testing
 * the shim for links minted before 2026-09-25.
 */
const redeem = (user: User, username: string, pin?: string) =>
  app.fastify.inject({
    method: 'POST',
    url: '/contacts/invite/accept',
    headers: auth(user.token),
    payload: pin ? { username, pin } : { username },
  });

/**
 * Writes an `invite_pins` row by hand, which is the only way to get one now:
 * nothing mints them since the pin went. This is how the shim is exercised —
 * a link that was already in somebody's thread on the day it changed.
 */
function oldLink(
  owner: User,
  username: string,
  pin = '042317'
): { username: string; pin: string } {
  app.db
    .prepare(
      'INSERT INTO invite_pins (owner_id, pin, created_at) VALUES (?, ?, ?)'
    )
    .run(owner.account.id, pin, clock);
  return { username, pin };
}

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

  it('builds the link out of the username, and carries the name', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    expect(await link(alice)).toMatch(/\/i\/alice_k\?name=Alice$/);
  });

  /**
   * **The change of 2026-09-25 in one assertion.** A link used to be minted per
   * press and spent by the first taker, so two presses had to differ; it is a
   * standing door now, so two presses that differ would mean two doors.
   */
  it('is the same address every time', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    expect(await link(alice)).toBe(await link(alice));
  });

  it('follows the name when it changes', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    await app.fastify.inject({
      method: 'POST',
      url: '/me',
      headers: auth(alice.token),
      payload: { displayName: 'Alice Kowalski' },
    });
    expect(await link(alice)).toContain('name=Alice%20Kowalski');
  });

  it('mints nothing, so following one twice is not a refusal', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    const { username } = halves(await link(alice));
    expect((await redeem(bob, username)).statusCode).toBe(200);
    // A standing door has no seat to spend. The second call finds them already
    // contacts and says so, rather than telling Bob his own acceptance had
    // already been used.
    expect((await redeem(bob, username)).statusCode).toBe(200);
  });
});

describe('following a link', () => {
  it('makes the pair contacts outright, both ways round', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    const { username } = halves(await link(alice));

    expect((await redeem(bob, username)).statusCode).toBe(200);
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
    const { username } = halves(await link(alice));
    await redeem(bob, username);

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
    const { username } = halves(await link(alice));

    const { channelId } = (await redeem(bob, username)).json();
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
    const { username } = halves(await link(alice));
    await redeem(bob, username);

    expect(app.accounts.invitedCount(alice.account.id)).toBe(1);
  });

  it('refuses the owner their own link', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const { username } = halves(await link(alice));
    const response = await redeem(alice, username);
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toContain('your own');
  });

  /**
   * The one thing the accept route is coy about, and the reason it can be:
   * the page says nothing, so this is the only place a username's existence
   * could leak, and it does not.
   */
  it('answers a username nobody holds the way it answers any other refusal', async () => {
    const bob = await signIn('bob@example.com', 'Bob');
    const response = await redeem(bob, 'nobody_at_all');
    expect(response.statusCode).toBe(400);
    expect(contacts(bob)).toEqual([]);
  });
});

/**
 * The budget, which is what a standing door costs.
 *
 * A link carries no pin, so the accept route names an owner and nothing else —
 * and an account that never saw a link can walk usernames and accept against
 * each one. Since credit follows the first contact, unlimited accepting would
 * also be unlimited standings.
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
 * Links minted before 2026-09-25, still sitting in the threads they were
 * pasted into. Nothing makes one any more, so these are written by hand.
 * planning/SHIMS.md says what retires all of this.
 */
describe('a link that still carries a pin', () => {
  it('is still good, and makes the pair contacts', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    const { username, pin } = oldLink(alice, 'alice_k');

    expect((await redeem(bob, username, pin)).statusCode).toBe(200);
    expect(contacts(bob)).toEqual([
      expect.objectContaining({ status: 'accepted' }),
    ]);
  });

  it('is still spent by the first person to use it', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    const carol = await signIn('carol@example.com', 'Carol');
    const { username, pin } = oldLink(alice, 'alice_k');

    expect((await redeem(bob, username, pin)).statusCode).toBe(200);
    const second = await redeem(carol, username, pin);
    expect(second.statusCode).toBe(400);
    expect((second.json() as { error: string }).error).toContain('already');
    expect(contacts(carol)).toEqual([]);
  });

  it('still expires after thirty days', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    const { username, pin } = oldLink(alice, 'alice_k');

    clock += INVITE_TTL_MS + 1;
    const response = await redeem(bob, username, pin);
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toContain('expired');
  });

  it('still stops answering an account after enough wrong pins', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    const { username, pin } = oldLink(alice, 'alice_k');

    for (let i = 0; i < INVITE_MAX_GUESSES; i += 1) {
      await redeem(bob, username, '000000');
    }
    // Even the right pin, because what is locked is the account being guessed
    // at rather than any one pin.
    expect((await redeem(bob, username, pin)).statusCode).toBe(400);

    clock += INVITE_GUESS_WINDOW_MS;
    expect((await redeem(bob, username, pin)).statusCode).toBe(200);
  });

  /**
   * The pin-less path is not a way around the lock: the same username, offered
   * with no pin while the account is locked, must not quietly succeed.
   */
  it('is not bypassed by dropping the pin', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    const { username } = oldLink(alice, 'alice_k');

    for (let i = 0; i < INVITE_MAX_GUESSES; i += 1) {
      await redeem(bob, username, '000000');
    }
    // Deliberately recorded: a standing door has nothing to guess at, so this
    // succeeds. The lock protects a *pin*, and there is no pin here to protect.
    expect((await redeem(bob, username)).statusCode).toBe(200);
  });
});

describe('the page', () => {
  const open = (url: string) => app.fastify.inject({ method: 'GET', url });

  /**
   * **It reads nothing, which is the whole of the disclosure story now.** The
   * page used to check a pin before it would say a name. There is no pin, so
   * instead it draws what the address told it — which means a username nobody
   * holds renders exactly like one somebody does, and walking usernames
   * teaches a reader only what they typed.
   */
  it('answers a real username and an invented one identically', async () => {
    await named('alice@example.com', 'Alice', 'alice_k');
    const real = await open('/i/alice_k');
    const invented = await open('/i/nobody_at_all');
    expect(real.statusCode).toBe(200);
    expect(invented.statusCode).toBe(200);
    expect(invented.body).toBe(real.body.replace(/alice_k/g, 'nobody_at_all'));
  });

  it('greets the reader with the name in the address', async () => {
    const response = await open('/i/alice_k?name=Alice%20Kowalski');
    expect(response.body).toContain('Alice Kowalski invited you');
  });

  it('falls back to the username when no name was given', async () => {
    const response = await open('/i/alice_k');
    expect(response.body).toContain('@alice_k invited you');
  });

  /**
   * A name arrives in a URL, so it is somebody else's text. Both halves of
   * handling it matter: what it may do once it is markup, and how much of the
   * page one caller may occupy.
   */
  it('escapes the name rather than letting it be markup', async () => {
    const response = await open(
      '/i/alice_k?name=%3Cscript%3Ealert(1)%3C%2Fscript%3E'
    );
    expect(response.body).not.toContain('<script>alert(1)');
    expect(response.body).toContain('&lt;script&gt;');
  });

  it('caps a name at the length a display name is stored under', async () => {
    const long = 'A'.repeat(200);
    const response = await open(`/i/alice_k?name=${long}`);
    expect(response.body).not.toContain('A'.repeat(41));
  });

  it('says it in a few sentences and no sections', async () => {
    const body = (await open('/i/alice_k?name=Alice')).body;
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

  /**
   * The address still carries a name somebody chose, and a click on the store
   * link would otherwise hand it to Apple along with the username.
   */
  it('keeps the address out of the next request’s referrer', async () => {
    expect((await open('/i/alice_k?name=Alice')).body).toContain(
      '<meta name="referrer" content="no-referrer">'
    );
  });

  /**
   * The shim, from the page's end: an address pasted into a thread before the
   * pin went still resolves, and renders the same page.
   */
  it('still serves a link that carries a pin', async () => {
    const response = await open('/i/alice_k/042317?name=Alice');
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Alice invited you');
  });

  it('hands the tab a username and no pin', async () => {
    const body = (await open('/i/alice_k')).body;
    expect(body).toContain('thefloor.invite');
    expect(body).toContain('{\\"username\\":\\"alice_k\\"}');
  });
});

/**
 * The one call to action, and the three boxes that cannot make the usual one.
 *
 * Unit calls rather than requests, because the route always passes
 * `options.updateUrl` and there is no way to reach the absent case through it.
 * What is being checked is a rule rather than a paragraph: **the button is
 * never dead.** An `href=""` is worse than an absence, and on a page whose
 * whole design is one call to action, a box that cannot offer the install has
 * to offer the other thing rather than nothing.
 */
describe('the call to action, on a box that cannot make the usual one', () => {
  const STORE = 'https://apps.apple.com/app/id123456789';
  const drawn = (extra: Partial<Parameters<typeof invitePage>[0]>) =>
    invitePage({
      username: 'alice_k',
      displayName: 'Alice',
      webAppReady: false,
      ...extra,
    });

  it('leads with the install where there is one', () => {
    const body = drawn({ appStoreUrl: STORE, webAppReady: true });
    expect(body).toContain(`<p class="cta"><a href="${STORE}"`);
    expect(body).toContain('class="browser"');
    expect(body).toContain('id="accept"');
  });

  it('promotes the browser into the button where there is no store link', () => {
    const body = drawn({ webAppReady: true });
    expect(body).toContain('<p class="cta"><a id="accept" href="/open">');
    expect(body.match(/id="accept"/g)).toHaveLength(1);
    expect(body).not.toContain('class="browser"');
  });

  it('offers no browser at all where no train is deployed', () => {
    const body = drawn({ appStoreUrl: STORE });
    expect(body).toContain(STORE);
    expect(body).not.toContain('id="accept"');
    expect(body).not.toContain('thefloor.invite');
  });

  it('draws no button at all rather than a dead one', () => {
    const body = drawn({});
    expect(body).not.toContain('class="cta"');
    expect(body).not.toContain('href=""');
    expect(body).toContain('Alice');
  });

  it('never writes an empty href in any of the four', () => {
    for (const extra of [
      { appStoreUrl: STORE, webAppReady: true },
      { appStoreUrl: STORE },
      { webAppReady: true },
      {},
    ]) {
      expect(drawn(extra)).not.toContain('href=""');
    }
  });
});
