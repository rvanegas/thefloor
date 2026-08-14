import { buildApp, type App } from '../src/app';
import { toCents } from '../src/donations';

/**
 * Voluntary donations, which unlock nothing.
 *
 * The interesting part is not the money, it is the attribution: Ko-fi's link
 * carries no field to put an account id in, so who gave is known only if they
 * paid with an address somebody has signed in with. Everything else is left
 * unattributed on purpose, for a person to resolve from Ko-fi's dashboard.
 */

const TOKEN = 'verification-token-from-ko-fi';
const KOFI_URL = 'https://ko-fi.com/thefloor';

let app: App;
let clock = 1_700_000_000_000;

beforeEach(() => {
  clock = 1_700_000_000_000;
  app = buildApp({
    dbPath: ':memory:',
    now: () => clock,
    kofi: { url: KOFI_URL, verificationToken: TOKEN },
  });
});

afterEach(async () => {
  app.channels.stop();
  await app.fastify.close();
});

async function signIn(identifier: string, displayName?: string) {
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

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

/** One delivery, shaped the way Ko-fi actually sends them. */
function delivery(overrides: Record<string, unknown> = {}) {
  const payload = {
    verification_token: TOKEN,
    kofi_transaction_id: 'txn_0001',
    type: 'Donation',
    amount: '3.00',
    currency: 'USD',
    email: 'giver@example.com',
    from_name: 'A Giver',
    message: 'keep it going',
    timestamp: '2026-08-14T13:04:30Z',
    is_public: true,
    is_subscription_payment: false,
    ...overrides,
  };
  return app.fastify.inject({
    method: 'POST',
    url: '/support/kofi',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams({ data: JSON.stringify(payload) }).toString(),
  });
}

const rows = () =>
  app.db.prepare('SELECT * FROM donations').all() as Array<{
    account_id: string | null;
    matched_by: string | null;
    amount_cents: number;
    currency: string;
    raw: string | null;
  }>;

describe('Recording a donation', () => {
  it('attributes it to the account whose address paid', async () => {
    const giver = await signIn('giver@example.com', 'A Giver');
    const answered = await delivery();

    expect(answered.statusCode).toBe(200);
    const [row] = rows();
    expect(row.account_id).toBe(giver.account.id);
    expect(row.matched_by).toBe('email');
    expect(row.amount_cents).toBe(300);
    expect(row.currency).toBe('USD');
    // Kept whole, because Ko-fi may add fields nobody asked about.
    expect(JSON.parse(row.raw!).from_name).toBe('A Giver');
  });

  it('never writes the verification token to the database', async () => {
    await signIn('giver@example.com');
    await delivery();

    // The token is a long-lived shared secret, and it authenticates anyone who
    // holds it. Storing it per row would put a copy in every backup and in the
    // output of any query that selected the payload.
    const [row] = rows();
    expect(row.raw).not.toContain(TOKEN);
    expect(JSON.parse(row.raw!).verification_token).toBeUndefined();

    // Belt and braces: nothing anywhere in the row carries it.
    const everything = JSON.stringify(
      app.db.prepare('SELECT * FROM donations').all()
    );
    expect(everything).not.toContain(TOKEN);
  });

  it('keeps a donation from somebody with no account here', async () => {
    const answered = await delivery({ email: 'stranger@example.com' });
    expect(answered.statusCode).toBe(200);
    const [row] = rows();
    expect(row.account_id).toBe(null);
    expect(row.matched_by).toBe(null);
    expect(row.amount_cents).toBe(300);
  });

  it('writes once however many times it is delivered', async () => {
    await signIn('giver@example.com');
    const first = await delivery();
    const again = await delivery();

    expect(first.statusCode).toBe(200);
    // A replay is success. Anything else and Ko-fi retries it forever.
    expect(again.statusCode).toBe(200);
    expect(rows()).toHaveLength(1);
  });

  it('refuses a wrong token, and writes nothing', async () => {
    const answered = await delivery({ verification_token: 'not-the-token' });
    expect(answered.statusCode).toBe(401);
    expect(rows()).toHaveLength(0);
  });

  it('refuses an unreadable payload rather than storing a broken row', async () => {
    const notForm = await app.fastify.inject({
      method: 'POST',
      url: '/support/kofi',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'data=not-json',
    });
    const noAmount = await delivery({ amount: 'three dollars' });

    expect(notForm.statusCode).toBe(400);
    expect(noAmount.statusCode).toBe(400);
    expect(rows()).toHaveLength(0);
  });

  it('is refused entirely when no token is configured', async () => {
    await app.fastify.close();
    app = buildApp({ dbPath: ':memory:', now: () => clock, kofi: { url: KOFI_URL } });
    const answered = await delivery();
    expect(answered.statusCode).toBe(503);
    expect(rows()).toHaveLength(0);
  });
});

describe('Attribution', () => {
  it('matches the address however it was capitalised', async () => {
    const giver = await signIn('giver@example.com');
    await delivery({ email: 'Giver@Example.COM' });
    expect(rows()[0].account_id).toBe(giver.account.id);
  });

  it('leaves a donation from an unrecognised address for a person to resolve', async () => {
    await signIn('giver@example.com');
    await delivery({ email: 'giver@work-address.example.com' });

    // Guessing from who most recently opened the app would credit the wrong
    // person whenever two are donating at once, and nothing afterwards would
    // ever reveal it had. Unattributed is visible and fixable by hand.
    const [row] = rows();
    expect(row.account_id).toBe(null);
    expect(row.matched_by).toBe(null);
  });

  it('can be resolved by hand afterwards, with no payload to invent', async () => {
    const giver = await signIn('giver@example.com');
    // Ko-fi has no read API, so a row copied out of their dashboard is the
    // recovery path — and it honestly has no webhook body behind it.
    app.db
      .prepare(
        `INSERT INTO donations (kofi_transaction_id, account_id, matched_by,
           email, amount_cents, currency, kind, is_recurring, is_public,
           received_at)
         VALUES (?, ?, 'manual', ?, 500, 'USD', 'Donation', 0, 1, ?)`
      )
      .run('txn_from_dashboard', giver.account.id, 'other@example.com', clock);

    const answered = await app.fastify.inject({
      method: 'GET',
      url: '/support',
      headers: auth(giver.token),
    });
    expect(answered.json().mine.totals).toEqual([
      { currency: 'USD', cents: 500 },
    ]);
  });
});

describe('What a person is told about their own giving', () => {
  it('adds up only their own, and says where to give', async () => {
    const giver = await signIn('giver@example.com');
    const other = await signIn('other@example.com');
    await delivery({ kofi_transaction_id: 'txn_a', amount: '3.00' });
    await delivery({ kofi_transaction_id: 'txn_b', amount: '2.50' });
    await delivery({
      kofi_transaction_id: 'txn_c',
      amount: '99.00',
      email: 'other@example.com',
    });

    const mine = await app.fastify.inject({
      method: 'GET',
      // Asked from a device that may be shown the link, so this covers the
      // whole shape of the answer; who is offered it is its own describe.
      url: '/support?locale=en-US&tz=America/Los_Angeles',
      headers: auth(giver.token),
    });
    expect(mine.json()).toEqual({
      url: KOFI_URL,
      identifier: 'giver@example.com',
      mine: {
        count: 2,
        since: clock,
        totals: [{ currency: 'USD', cents: 550 }],
      },
    });

    const theirs = await app.fastify.inject({
      method: 'GET',
      url: '/support',
      headers: auth(other.token),
    });
    expect(theirs.json().mine.totals).toEqual([{ currency: 'USD', cents: 9900 }]);
  });

  it('says nothing has been given when nothing has', async () => {
    const giver = await signIn('giver@example.com');
    const answered = await app.fastify.inject({
      method: 'GET',
      url: '/support',
      headers: auth(giver.token),
    });
    expect(answered.json().mine).toBe(null);
  });

  it('keeps two currencies apart rather than adding them', async () => {
    const giver = await signIn('giver@example.com');
    await delivery({ kofi_transaction_id: 'txn_a', amount: '3.00' });
    await delivery({
      kofi_transaction_id: 'txn_b',
      amount: '10.00',
      currency: 'EUR',
    });

    const answered = await app.fastify.inject({
      method: 'GET',
      url: '/support',
      headers: auth(giver.token),
    });
    expect(answered.json().mine.totals).toEqual([
      { currency: 'EUR', cents: 1000 },
      { currency: 'USD', cents: 300 },
    ]);
  });

  it('needs a token', async () => {
    const support = await app.fastify.inject({ method: 'GET', url: '/support' });
    expect(support.statusCode).toBe(401);
  });
});

describe('Who is offered the link at all', () => {
  const supportFrom = (token: string, query = '') =>
    app.fastify.inject({
      method: 'GET',
      url: `/support${query}`,
      headers: auth(token),
    });

  it('offers it to a device that looks American', async () => {
    const giver = await signIn('giver@example.com');
    const answered = await supportFrom(
      giver.token,
      '?locale=en-US&tz=America/Los_Angeles'
    );
    expect(answered.json().url).toBe(KOFI_URL);
  });

  it('withholds it from everywhere else', async () => {
    const giver = await signIn('giver@example.com');
    const answered = await supportFrom(
      giver.token,
      '?locale=en-GB&tz=Europe/London'
    );
    // Not an error and not a 403 — there is simply nowhere to donate, and the
    // screen renders no Support section at all.
    expect(answered.json().url).toBe(null);
    expect(answered.statusCode).toBe(200);
  });

  it('withholds it from a build that says nothing', async () => {
    const giver = await signIn('giver@example.com');
    // Every installed build before this shipped sends no hints. Guessing that
    // silence means the United States is the one guess that could put an
    // external payment link in front of the wrong storefront.
    expect((await supportFrom(giver.token)).json().url).toBe(null);
  });

  it('still reports what they have given, wherever they are', async () => {
    const giver = await signIn('giver@example.com');
    await delivery();
    const answered = await supportFrom(
      giver.token,
      '?locale=en-GB&tz=Europe/London'
    );
    // Withholding the link is a rule about where money may be solicited, not
    // about who may see their own history.
    expect(answered.json().url).toBe(null);
    expect(answered.json().mine.totals).toEqual([
      { currency: 'USD', cents: 300 },
    ]);
  });

  it('lets an override win in both directions', async () => {
    const forced = await signIn('forced@example.com');
    const denied = await signIn('denied@example.com');
    const set = (id: string, value: number) =>
      app.db
        .prepare('UPDATE accounts SET donations_allowed = ? WHERE id = ?')
        .run(value, id);

    set(forced.account.id, 1);
    set(denied.account.id, 0);

    // Somebody known to be American, whose phone is abroad with them.
    expect(
      (await supportFrom(forced.token, '?locale=en-GB&tz=Europe/London')).json()
        .url
    ).toBe(KOFI_URL);
    // And somebody known not to be, whose device says otherwise.
    expect(
      (
        await supportFrom(denied.token, '?locale=en-US&tz=America/New_York')
      ).json().url
    ).toBe(null);
  });
});

describe('Parsing an amount', () => {
  it('reads what Ko-fi sends', () => {
    expect(toCents('3.00')).toBe(300);
    expect(toCents('0.99')).toBe(99);
    expect(toCents('10')).toBe(1000);
    expect(toCents(' 7.5 ')).toBe(750);
  });

  it('refuses anything it cannot read exactly', () => {
    // parseFloat would answer 3 for the first and NaN for the rest, and a NaN
    // in an INTEGER NOT NULL column is a row nobody can read afterwards.
    for (const bad of ['3 dollars', '', 'NaN', '-3.00', '1,000.00', '3.000']) {
      expect(toCents(bad)).toBe(null);
    }
  });
});
