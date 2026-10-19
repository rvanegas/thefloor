import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp, type App } from '../src/app';
import { toTransaction, appleVerifier, type AppStoreVerifier } from '../src/appStore';
import { PRO_LEEWAY_MS } from '../src/pro';

/**
 * *Pro*: a monthly App Store subscription that makes transcription unmetered.
 *
 * The verifier is a fake, because Apple's signature cannot be produced here
 * and Apple's library is what tests the cryptography. A "signed" transaction
 * below is its payload as JSON, decoded by the same `toTransaction` the real
 * verifier uses — so everything after the signature check is the code that
 * runs on the box. `appleVerifier` itself is checked at the bottom, against
 * the real certificate.
 */

const PRODUCT = 'co.rvanegas.thefloor.pro.monthly';
const NOT_GENUINE = 'not-genuine';
const TRY_LATER = 'try-later';
const DAY = 24 * 60 * 60 * 1000;

const fake: AppStoreVerifier = {
  async transaction(signed) {
    if (signed === TRY_LATER) return 'retry';
    if (signed === NOT_GENUINE) return null;
    return toTransaction(JSON.parse(signed));
  },
  async notification(signed) {
    if (signed === TRY_LATER) return 'retry';
    if (signed === NOT_GENUINE) return null;
    const { type, transaction } = JSON.parse(signed);
    return { type, transaction: transaction ? toTransaction(transaction) : null };
  },
};

let app: App;
let clock = 1_700_000_000_000;

function build(onSale = true) {
  app = buildApp({
    dbPath: ':memory:',
    now: () => clock,
    freeTranscriptMinutes: 60,
    pro: onSale ? { productId: PRODUCT, verifier: fake } : undefined,
  });
}

beforeEach(() => {
  clock = 1_700_000_000_000;
  build();
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
    payload: { identifier, code },
  });
  return verified.json() as { token: string; account: { id: string } };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

const status = async (token: string) =>
  (await app.fastify.inject({ method: 'GET', url: '/pro', headers: auth(token) })).json();

const tokenOf = async (token: string) => (await status(token)).offer.accountToken as string;

/** One period of a subscription, the way Apple's payload carries it. */
const period = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    transactionId: '2000000000000001',
    originalTransactionId: '2000000000000001',
    productId: PRODUCT,
    bundleId: 'co.rvanegas.thefloor',
    type: 'Auto-Renewable Subscription',
    purchaseDate: clock,
    expiresDate: clock + 30 * DAY,
    environment: 'Production',
    ...overrides,
  });

const upload = (token: string, signedTransaction: unknown) =>
  app.fastify.inject({
    method: 'POST',
    url: '/pro/apple',
    headers: auth(token),
    payload: { signedTransaction },
  });

const notify = (type: string, transaction: string | null) =>
  app.fastify.inject({
    method: 'POST',
    url: '/app-store/notifications',
    payload: {
      signedPayload: JSON.stringify({
        type,
        transaction: transaction ? JSON.parse(transaction) : null,
      }),
    },
  });

const rows = () =>
  app.db.prepare('SELECT * FROM pro_subscriptions').all() as Array<{
    account_id: string | null;
    expires_at: number | null;
    revoked_at: number | null;
    environment: string;
  }>;

describe('What Floor Settings is told', () => {
  it('offers the product and a token that is a UUID', async () => {
    const me = await signIn('me@example.com');
    expect(await status(me.token)).toEqual({
      until: null,
      freeMinutes: 60,
      offer: {
        product: PRODUCT,
        accountToken: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
        ),
      },
    });
  });

  it('gives each account one token, and the same one every time', async () => {
    const me = await signIn('me@example.com');
    const other = await signIn('other@example.com');
    const first = await tokenOf(me.token);
    expect(await tokenOf(me.token)).toBe(first);
    expect(await tokenOf(other.token)).not.toBe(first);
  });

  it('offers nothing when it is not on sale', async () => {
    build(false);
    const me = await signIn('me@example.com');
    expect((await status(me.token)).offer).toBe(null);
    expect((await upload(me.token, period())).statusCode).toBe(503);
  });

  it('needs a token', async () => {
    const answered = await app.fastify.inject({ method: 'GET', url: '/pro' });
    expect(answered.statusCode).toBe(401);
  });
});

describe('Subscribing', () => {
  it('makes the account Pro until its period ends, and says so', async () => {
    const me = await signIn('me@example.com');
    const token = await tokenOf(me.token);
    const answered = await upload(me.token, period({ appAccountToken: token }));
    expect(answered.statusCode).toBe(200);
    expect(answered.json().pro.until).toBe(clock + 30 * DAY);
    expect(app.pro.isPro(me.account.id, clock)).toBe(true);
  });

  it('matches the token whatever its case', async () => {
    const me = await signIn('me@example.com');
    const token = await tokenOf(me.token);
    await upload(me.token, period({ appAccountToken: token.toUpperCase() }));
    expect(rows()[0].account_id).toBe(me.account.id);
  });

  it('belongs to the token it carries, not whoever uploaded it', async () => {
    const buyer = await signIn('buyer@example.com');
    const courier = await signIn('courier@example.com');
    const token = await tokenOf(buyer.token);
    // Bought under one account, sent by the next to sign in on that phone.
    await upload(courier.token, period({ appAccountToken: token }));
    expect(app.pro.isPro(buyer.account.id, clock)).toBe(true);
    expect(app.pro.isPro(courier.account.id, clock)).toBe(false);
  });

  it('keeps one with no known token, and still says yes', async () => {
    const me = await signIn('me@example.com');
    // A 200 is what lets the app finish it rather than send it forever.
    expect((await upload(me.token, period())).statusCode).toBe(200);
    expect(rows()[0].account_id).toBe(null);
    expect(app.pro.isPro(me.account.id, clock)).toBe(false);
  });

  it('acknowledges anything that is not a subscription, and keeps nothing', async () => {
    const me = await signIn('me@example.com');
    const answered = await upload(me.token, period({ type: 'Consumable' }));
    expect(answered.statusCode).toBe(200);
    expect(rows()).toHaveLength(0);
  });

  it('is the same however many times it is sent', async () => {
    const me = await signIn('me@example.com');
    const token = await tokenOf(me.token);
    const signed = period({ appAccountToken: token });
    await upload(me.token, signed);
    await upload(me.token, signed);
    expect(rows()).toHaveLength(1);
  });

  it('counts a sandbox subscription, and says which it was', async () => {
    const me = await signIn('me@example.com');
    const token = await tokenOf(me.token);
    await upload(me.token, period({ appAccountToken: token, environment: 'Sandbox' }));
    // TestFlight and review subscribe in Sandbox, and what they are checking
    // is that Pro does what it says.
    expect(rows()[0].environment).toBe('Sandbox');
    expect(app.pro.isPro(me.account.id, clock)).toBe(true);
  });

  it('refuses a transaction that is not genuine', async () => {
    const me = await signIn('me@example.com');
    expect((await upload(me.token, NOT_GENUINE)).statusCode).toBe(422);
    expect(rows()).toHaveLength(0);
  });

  it('asks for it again later when Apple cannot be checked now', async () => {
    const me = await signIn('me@example.com');
    // 503, not 422, so the app keeps it and sends it again.
    expect((await upload(me.token, TRY_LATER)).statusCode).toBe(503);
  });

  it('refuses an upload with nothing in it, or nobody behind it', async () => {
    const me = await signIn('me@example.com');
    expect((await upload(me.token, '')).statusCode).toBe(400);
    const anonymous = await app.fastify.inject({
      method: 'POST',
      url: '/pro/apple',
      payload: { signedTransaction: period() },
    });
    expect(anonymous.statusCode).toBe(401);
  });
});

describe('Renewing, lapsing and refunds', () => {
  async function subscribed() {
    const me = await signIn('me@example.com');
    const token = await tokenOf(me.token);
    await upload(me.token, period({ appAccountToken: token }));
    return { me, token };
  }

  it('moves the end on when a renewal arrives, by notification', async () => {
    const { me, token } = await subscribed();
    const renewed = await notify(
      'DID_RENEW',
      period({
        appAccountToken: token,
        transactionId: '2000000000000002',
        expiresDate: clock + 60 * DAY,
      })
    );
    expect(renewed.statusCode).toBe(200);
    expect(app.pro.activeUntil(me.account.id, clock)).toBe(clock + 60 * DAY);
  });

  it('is not shortened by an older period arriving late', async () => {
    const { me, token } = await subscribed();
    await notify(
      'DID_RENEW',
      period({ appAccountToken: token, transactionId: '2', expiresDate: clock + 60 * DAY })
    );
    // The first period, sent again by the app at its next launch.
    await upload(me.token, period({ appAccountToken: token }));
    expect(app.pro.activeUntil(me.account.id, clock)).toBe(clock + 60 * DAY);
  });

  it('lapses a day after its end when no renewal comes', async () => {
    const { me } = await subscribed();
    // A renewal is heard about moments after the boundary, so a day's grace
    // covers it being late without a lapsed one lasting noticeably longer.
    clock += 30 * DAY + PRO_LEEWAY_MS - 1;
    expect(app.pro.isPro(me.account.id, clock)).toBe(true);
    clock += 2;
    expect(app.pro.isPro(me.account.id, clock)).toBe(false);
    expect((await status(me.token)).until).toBe(null);
  });

  it('ends at once when Apple refunds it', async () => {
    const { me, token } = await subscribed();
    await notify('REFUND', period({ appAccountToken: token, revocationDate: clock + DAY }));
    expect(app.pro.isPro(me.account.id, clock + 2 * DAY)).toBe(false);
    expect(rows()[0].revoked_at).toBe(clock + DAY);
  });

  it('starts again with a later period that is not refunded', async () => {
    const { me, token } = await subscribed();
    await notify('REFUND', period({ appAccountToken: token, revocationDate: clock }));
    await notify(
      'SUBSCRIBED',
      period({ appAccountToken: token, transactionId: '3', expiresDate: clock + 60 * DAY })
    );
    expect(app.pro.isPro(me.account.id, clock)).toBe(true);
  });

  it('acknowledges a notification that carries no transaction', async () => {
    expect((await notify('TEST', null)).statusCode).toBe(200);
    expect(rows()).toHaveLength(0);
  });

  it('refuses a notification that is not genuine, or not readable', async () => {
    const forged = await app.fastify.inject({
      method: 'POST',
      url: '/app-store/notifications',
      payload: { signedPayload: NOT_GENUINE },
    });
    expect(forged.statusCode).toBe(401);
    const empty = await app.fastify.inject({
      method: 'POST',
      url: '/app-store/notifications',
      payload: {},
    });
    expect(empty.statusCode).toBe(400);
  });
});

describe('Taking it off sale', () => {
  it('leaves subscribers Pro until their period ends', async () => {
    // One database across a restart with the product unset, which is what
    // unsetting APP_STORE_PRO_PRODUCT does on the box.
    const dbPath = join(mkdtempSync(join(tmpdir(), 'pro-off-sale-')), 'floor.db');
    await app.fastify.close();
    app = buildApp({ dbPath, now: () => clock, pro: { productId: PRODUCT, verifier: fake } });
    const me = await signIn('me@example.com');
    await upload(me.token, period({ appAccountToken: await tokenOf(me.token) }));
    app.channels.stop();
    await app.fastify.close();

    app = buildApp({ dbPath, now: () => clock });
    const view = await status(me.token);
    expect(view.offer).toBe(null);
    expect(view.until).toBe(clock + 30 * DAY);
  });
});

describe('Deleting the account', () => {
  it('disconnects its subscription and forgets its token', async () => {
    const me = await signIn('me@example.com');
    const token = await tokenOf(me.token);
    await upload(me.token, period({ appAccountToken: token }));

    await app.fastify.inject({ method: 'DELETE', url: '/me', headers: auth(me.token) });

    // Apple goes on billing it until its owner cancels it there; this server
    // keeps the row, as it does a donation, and lets go of the person.
    expect(rows()).toHaveLength(1);
    expect(rows()[0].account_id).toBe(null);
    expect(app.db.prepare('SELECT * FROM app_store_tokens').all()).toHaveLength(0);
  });
});

describe('Apple’s own verifier', () => {
  it('loads the root certificate and refuses anything Apple did not sign', async () => {
    // No network: a token that is not a JWS fails before any online check.
    // What this proves is that the certificate path resolves and that garbage
    // is "not genuine" rather than an exception.
    const verifier = appleVerifier();
    expect(await verifier.transaction('not.a.jws')).toBe(null);
    expect(await verifier.notification('garbage')).toBe(null);
  });
});
