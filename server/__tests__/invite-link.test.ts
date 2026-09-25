import { buildApp, type App } from '../src/app';
import {
  INVITE_GUESS_WINDOW_MS,
  INVITE_MAX_GUESSES,
  INVITE_PINS_PER_ACCOUNT,
  INVITE_TTL_MS,
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

/** The two halves out of a minted URL, which is how anybody redeeming has them. */
function halves(url: string): { username: string; pin: string } {
  const match = /\/i\/([^/]+)\/(\d{6})$/.exec(url);
  expect(match).not.toBeNull();
  return { username: match![1], pin: match![2] };
}

const redeem = (user: User, username: string, pin: string) =>
  app.fastify.inject({
    method: 'POST',
    url: '/contacts/invite/accept',
    headers: auth(user.token),
    payload: { username, pin },
  });

/**
 * Read from `Accounts` rather than over HTTP, as the other contact tests do:
 * the list reaches a client on the Home snapshot over the socket, and there is
 * no route to ask for one.
 */
const contacts = (user: User) => app.accounts.contactsFor(user.account.id);

describe('minting', () => {
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

  it('builds the link out of the username', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    expect(await link(alice)).toMatch(/\/i\/alice_k\/\d{6}$/);
  });

  it('mints a new pin every time, since each is good for one person', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    expect(halves(await link(alice)).pin).not.toBe(
      halves(await link(alice)).pin
    );
  });

  /**
   * The cap, and it evicts rather than refusing: a refusal would be a screen
   * telling somebody to tidy up a list of links they have never been shown.
   */
  it('keeps only the newest pins, and the evicted one stops working', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');

    const first = halves(await link(alice));
    // The clock moves, because that is what "oldest" is measured on. Several
    // mints inside one millisecond are ordered by pin, which is arbitrary but
    // still keeps the cap — the ordering only decides which of them goes.
    for (let i = 0; i < INVITE_PINS_PER_ACCOUNT; i += 1) {
      clock += 1000;
      await link(alice);
    }

    const response = await redeem(bob, first.username, first.pin);
    expect(response.statusCode).toBe(400);

    // And the newest is untouched, so this is a cap rather than a cull.
    const newest = halves(await link(alice));
    expect((await redeem(bob, newest.username, newest.pin)).statusCode).toBe(200);
  });
});

describe('redeeming', () => {
  it('makes the pair contacts outright, both ways round', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    const { username, pin } = halves(await link(alice));

    const response = await redeem(bob, username, pin);
    expect(response.statusCode).toBe(200);

    // Accepted, not pending: publishing the link was the ask and following it
    // was the answer.
    expect(contacts(bob)).toEqual([
      expect.objectContaining({
        account: expect.objectContaining({ id: alice.account.id }),
        status: 'accepted',
      }),
    ]);
    expect(contacts(alice)).toEqual([
      expect.objectContaining({
        account: expect.objectContaining({ id: bob.account.id }),
        status: 'accepted',
      }),
    ]);
  });

  it('gives the pair the channel that is the point of being contacts', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    const { username, pin } = halves(await link(alice));
    await redeem(bob, username, pin);

    // Read from Bob's own home list, as `contact-channels.test.ts` does:
    // `channelsFor` is about presence, and neither of them has stepped in.
    const shared = app.channels
      .rejoinableFor(bob.account.id)
      .filter(
        (entry) =>
          entry.others.length === 1 && entry.others[0].id === alice.account.id
      );
    expect(shared).toHaveLength(1);
  });

  /**
   * And says so, which is the half that was missing until 2026-09-25.
   *
   * `2026-09-24-accepting-a-request-opens-the-channel-it-makes.md` built this
   * for a contact request and left the invite link alone; the link is the
   * arrival where it matters most, since this may be somebody's first contact
   * and first channel, thirty seconds after signing up.
   */
  it('names that channel in the reply, so the app can open it', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    const { username, pin } = halves(await link(alice));

    const response = await redeem(bob, username, pin);
    const { channelId } = response.json();
    expect(typeof channelId).toBe('string');

    // The id is the pair's channel and not some other one Bob can see.
    const shared = app.channels
      .rejoinableFor(bob.account.id)
      .filter((entry) => entry.channelId === channelId);
    expect(shared).toHaveLength(1);
    expect(shared[0].others.map((o) => o.id)).toEqual([alice.account.id]);
  });

  it('credits the owner with having brought them here', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    const { username, pin } = halves(await link(alice));
    await redeem(bob, username, pin);

    expect(app.accounts.invitedCount(alice.account.id)).toBe(1);
  });

  /**
   * The email path and the link path meeting, which is the ordinary case
   * rather than an exotic one: Alice writes to an address, Bob signs up and
   * finds a pending request, and the link he was sent then upgrades it.
   */
  it('upgrades a request that was already waiting, without duplicating it', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const url = await link(alice);
    await app.fastify.inject({
      method: 'POST',
      url: '/contacts/request',
      headers: auth(alice.token),
      payload: { identifier: 'bob@example.com' },
    });

    clock += 1000;
    const bob = await signIn('bob@example.com', 'Bob');
    // `incoming` rather than `pending`: `contactsFor` says which way an
    // unanswered request points, which the row's own state does not.
    expect(contacts(bob)).toEqual([
      expect.objectContaining({ status: 'incoming' }),
    ]);

    const { username, pin } = halves(url);
    expect((await redeem(bob, username, pin)).statusCode).toBe(200);

    const after = contacts(bob);
    expect(after).toHaveLength(1);
    expect(after[0].status).toBe('accepted');
  });

  it('refuses a pin that has already been spent', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    const carol = await signIn('carol@example.com', 'Carol');
    const { username, pin } = halves(await link(alice));

    expect((await redeem(bob, username, pin)).statusCode).toBe(200);
    const second = await redeem(carol, username, pin);
    expect(second.statusCode).toBe(400);
    // Said rather than denied: somebody following a forwarded link should be
    // told what happened to it.
    expect((second.json() as { error: string }).error).toContain('already');
    expect(contacts(carol)).toEqual([]);
  });

  it('refuses a pin past its thirty days', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    const { username, pin } = halves(await link(alice));

    clock += INVITE_TTL_MS;
    expect((await redeem(bob, username, pin)).statusCode).toBe(400);
  });

  it('refuses the owner their own link', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const { username, pin } = halves(await link(alice));
    expect((await redeem(alice, username, pin)).statusCode).toBe(400);
  });

  /**
   * The one that makes six digits defensible: a pin is a fact about the
   * account named beside it, so the same digits under a different username
   * open nothing.
   */
  it('refuses a pin offered under somebody else’s username', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    await named('mallory@example.com', 'Mallory', 'mallory_x');
    const bob = await signIn('bob@example.com', 'Bob');
    const { pin } = halves(await link(alice));

    expect((await redeem(bob, 'mallory_x', pin)).statusCode).toBe(400);
    expect(contacts(bob)).toEqual([]);
  });

  it('answers a username nobody holds the way it answers a bad pin', async () => {
    const bob = await signIn('bob@example.com', 'Bob');
    const missing = await redeem(bob, 'nobody_here', '123456');
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const wrong = await redeem(bob, 'alice_k', '000000');

    // Identical, deliberately: a username is guessable by design, so telling
    // the two apart would turn this route into the directory there is not.
    expect(missing.statusCode).toBe(wrong.statusCode);
    expect(missing.json()).toEqual(wrong.json());
    expect(alice).toBeDefined();
  });
});

describe('guessing', () => {
  it('stops answering an account after enough wrong pins', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    const { username, pin } = halves(await link(alice));

    for (let i = 0; i < INVITE_MAX_GUESSES; i += 1) {
      const wrong = String(i).padStart(6, '0');
      expect((await redeem(bob, username, wrong)).statusCode).toBe(400);
    }

    // **Even the correct pin**, which is the whole point of a lockout: it must
    // not be the one guess that gets through, or the counter is decoration.
    expect((await redeem(bob, username, pin)).statusCode).toBe(400);
    expect(contacts(bob)).toEqual([]);
  });

  it('answers again once the window has passed', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    const { username, pin } = halves(await link(alice));

    for (let i = 0; i < INVITE_MAX_GUESSES; i += 1) {
      await redeem(bob, username, String(i).padStart(6, '0'));
    }
    clock += INVITE_GUESS_WINDOW_MS;

    // The lockout is grief-able by design — anybody may spend it — so it has
    // to lapse rather than needing somebody to come and lift it.
    expect((await redeem(bob, username, pin)).statusCode).toBe(200);
  });

  it('does not count a spent link against its owner', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    const carol = await signIn('carol@example.com', 'Carol');
    const spent = halves(await link(alice));
    await redeem(bob, spent.username, spent.pin);

    // Somebody forwarding a used link around cannot lock out the live ones.
    for (let i = 0; i < INVITE_MAX_GUESSES; i += 1) {
      await redeem(carol, spent.username, spent.pin);
    }

    const fresh = halves(await link(alice));
    expect((await redeem(carol, fresh.username, fresh.pin)).statusCode).toBe(200);
  });
});

describe('the page', () => {
  const open = (url: string) => app.fastify.inject({ method: 'GET', url });

  it('names the inviter for a live pin', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const url = await link(alice);

    const response = await open(new URL(url).pathname);
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Alice');
  });

  /**
   * The disclosure rule, and the reason the pin is in the path rather than in
   * a fragment: the server can refuse to say the name.
   */
  it('names nobody for a pin that is not live', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    const { username, pin } = halves(await link(alice));

    expect((await open(`/i/${username}/000000`)).body).not.toContain('Alice');
    expect((await open('/i/nobody_here/000000')).body).not.toContain('Alice');

    await redeem(bob, username, pin);
    const spent = await open(`/i/${username}/${pin}`);
    expect(spent.body).not.toContain('Alice');
    expect(spent.body).toContain('already been used');
  });

  /**
   * The budget, which is the thing that will erode.
   *
   * This page has accreted twice — see the second comment in `invite.ts` — and
   * grew to some three hundred and fifty words under five headings before
   * anybody counted. A ceiling at twice the current length fails loudly on the
   * next paragraph without arguing about any particular sentence.
   */
  it('says it in a few sentences and no sections', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const url = await link(alice);
    const body = (await open(new URL(url).pathname)).body;

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

  /**
   * The mark, which is the other half of the ask: an icon instead of an essay.
   */
  it('draws the mark', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const url = await link(alice);
    expect((await open(new URL(url).pathname)).body).toContain('<svg class="mark"');
  });

  /**
   * The pin is this page's credential, so it must not ride out on a `Referer`
   * when somebody clicks the store link. Nothing covered this before the
   * rewrite, and a copy change is exactly what could have dropped it.
   */
  it('keeps the pin out of the next request’s referrer', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const url = await link(alice);
    expect((await open(new URL(url).pathname)).body).toContain(
      '<meta name="referrer" content="no-referrer">'
    );
    // The refusal page too: a spent pin is still a pin in an address bar.
    expect((await open(`/i/${new URL(url).pathname.split('/')[2]}/000000`)).body).toContain(
      'no-referrer'
    );
  });

  it('counts a wrong pin on the page against the owner too', async () => {
    const alice = await named('alice@example.com', 'Alice', 'alice_k');
    const bob = await signIn('bob@example.com', 'Bob');
    const { username, pin } = halves(await link(alice));

    // Looking is throttled exactly as redeeming is, or somebody who only ever
    // looked would have an oracle with no limit on it.
    for (let i = 0; i < INVITE_MAX_GUESSES; i += 1) {
      await open(`/i/${username}/${String(i).padStart(6, '0')}`);
    }
    expect((await redeem(bob, username, pin)).statusCode).toBe(400);
  });
});

/**
 * The one call to action, and the three boxes that cannot offer the usual one.
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
  const named = (extra: Partial<Parameters<typeof invitePage>[0]>) =>
    invitePage({
      username: 'alice_k',
      pin: '042317',
      displayName: 'Alice',
      webAppReady: false,
      ...extra,
    });

  it('leads with the install where there is one', () => {
    const body = named({ appStoreUrl: STORE, webAppReady: true });
    expect(body).toContain(`<p class="cta"><a href="${STORE}"`);
    // And the browser is the quiet line rather than a second button.
    expect(body).toContain('class="browser"');
    expect(body).toContain('id="accept"');
  });

  it('promotes the browser into the button where there is no store link', () => {
    const body = named({ webAppReady: true });
    expect(body).toContain('<p class="cta"><a id="accept" href="/open">');
    // Exactly one way in, not the button and a line saying the same thing.
    expect(body.match(/id="accept"/g)).toHaveLength(1);
    expect(body).not.toContain('class="browser"');
  });

  it('offers no browser at all where no train is deployed', () => {
    // Sending somebody mid-acceptance to a 503 is worse than telling them to
    // use their phone, which is `landing.ts`'s rule about the same setting.
    const body = named({ appStoreUrl: STORE });
    expect(body).toContain(STORE);
    expect(body).not.toContain('id="accept"');
    expect(body).not.toContain('thefloor.invite');
  });

  it('draws no button at all rather than a dead one', () => {
    const body = named({});
    expect(body).not.toContain('class="cta"');
    expect(body).not.toContain('href=""');
    // Still names the inviter — the disclosure does not depend on the box.
    expect(body).toContain('Alice');
  });

  it('never writes an empty href in any of the four', () => {
    for (const extra of [
      { appStoreUrl: STORE, webAppReady: true },
      { appStoreUrl: STORE },
      { webAppReady: true },
      {},
    ]) {
      expect(named(extra)).not.toContain('href=""');
      expect(invitePage({
        username: 'alice_k',
        pin: '042317',
        refusal: 'used' as const,
        webAppReady: false,
        ...extra,
      })).not.toContain('href=""');
    }
  });

  /**
   * A refusal page offers the store and nothing else: the pin is dead, so the
   * browser has nothing to accept and the script would store a spent
   * invitation for the app to be refused over again.
   */
  it('gives a refusal the button and no acceptance', () => {
    const body = invitePage({
      username: 'alice_k',
      pin: '042317',
      refusal: 'used',
      appStoreUrl: STORE,
      webAppReady: true,
    });
    expect(body).toContain(STORE);
    expect(body).not.toContain('id="accept"');
    expect(body).not.toContain('thefloor.invite');
  });

  /**
   * `unknown` and `locked` must stay indistinguishable — telling them apart
   * hands a guesser the one thing worth knowing, which is whether to keep
   * going. The route has this test; the page did not.
   */
  it('answers an unknown pin and a locked account identically', () => {
    const of = (refusal: 'unknown' | 'locked') =>
      invitePage({
        username: 'alice_k',
        pin: '042317',
        refusal,
        appStoreUrl: STORE,
        webAppReady: true,
      });
    expect(of('locked')).toBe(of('unknown'));
  });

  /**
   * And `self` says its own thing, which is why the next step is a field on
   * each refusal rather than one line under the button: three of the four are
   * answered by asking the sender, and this one *is* the sender.
   */
  it('does not tell the owner to ask whoever sent it', () => {
    const body = invitePage({
      username: 'alice_k',
      pin: '042317',
      refusal: 'self',
      appStoreUrl: STORE,
      webAppReady: true,
    });
    expect(body).not.toContain('whoever sent it');
  });
});
