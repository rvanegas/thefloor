import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Accounts,
  INVITE_TTL_MS,
  OTP_TTL_MS,
  TOKEN_TTL_MS,
} from '../src/accounts';
import { buildApp } from '../src/app';
import { openDb } from '../src/db';
import { MemoryMailer } from '../src/mail';

/**
 * Housekeeping for the two tables nothing else bounds.
 *
 * The sweep is meant to be invisible — both deadlines are already enforced on
 * read, so removing a dead row can only change how much of the database is
 * dead weight. The tests that matter are therefore the ones asserting it takes
 * nothing that was still live, and the one asserting an expired invite really
 * has stopped meaning anything.
 */

const T0 = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

let accounts: Accounts;
let db: ReturnType<typeof openDb>;

beforeEach(() => {
  db = openDb(':memory:');
  accounts = new Accounts(db);
});

const inviteCount = () =>
  (db.prepare('SELECT count(*) AS n FROM pending_invites').get() as { n: number })
    .n;
const codeCount = () =>
  (db.prepare('SELECT count(*) AS n FROM otp_codes').get() as { n: number }).n;

/** Signs someone in, creating the account, and returns it. */
function signIn(identifier: string, name: string, now: number) {
  const code = accounts.issueCode(identifier, now)!;
  return accounts.verifyCode(identifier, code, name, now)!.account;
}

describe('expired one-time codes', () => {
  it('are removed once past their deadline', () => {
    accounts.issueCode('alice@example.com', T0);
    expect(codeCount()).toBe(1);

    expect(accounts.sweepExpired(T0 + OTP_TTL_MS + 1).codes).toBe(1);
    expect(codeCount()).toBe(0);
  });

  it('are left alone while still usable', () => {
    accounts.issueCode('alice@example.com', T0);

    expect(accounts.sweepExpired(T0 + OTP_TTL_MS - 1).codes).toBe(0);
    expect(codeCount()).toBe(1);
  });

  it('do not take a live code down with an expired one', () => {
    accounts.issueCode('old@example.com', T0);
    accounts.issueCode('fresh@example.com', T0 + OTP_TTL_MS);

    accounts.sweepExpired(T0 + OTP_TTL_MS + 1);

    expect(codeCount()).toBe(1);
    // The survivor is still good enough to sign in with.
    expect(accounts.byIdentifier('fresh@example.com')).toBeUndefined();
  });
});

describe('expired session tokens', () => {
  it('are removed once past their deadline', () => {
    // Signing in issues the token; counting on exactly one is what keeps this
    // independent of how many sessions an account is allowed to hold.
    signIn('a@example.com', 'A', T0);

    expect(accounts.sweepExpired(T0 + TOKEN_TTL_MS + 1).tokens).toBe(1);
    expect(accounts.accountForToken('anything', T0)).toBeUndefined();
  });

  it('are left alone while they can still sign someone in', () => {
    const a = signIn('a@example.com', 'A', T0);
    const token = accounts.issueToken(a.id, T0);

    expect(accounts.sweepExpired(T0 + TOKEN_TTL_MS - 1).tokens).toBe(0);
    expect(accounts.accountForToken(token, T0 + DAY)?.id).toBe(a.id);
  });
});

describe('expired invitations', () => {
  /** Sends a contact request to an address with no account behind it. */
  function inviteStranger(now: number) {
    const sender = signIn('sender@example.com', 'Sender', now);
    accounts.requestContact(sender.id, 'stranger@example.com', now);
    return sender;
  }

  it('are removed once past the TTL', () => {
    inviteStranger(T0);
    expect(inviteCount()).toBe(1);

    expect(accounts.sweepExpired(T0 + INVITE_TTL_MS + 1).invites).toBe(1);
    expect(inviteCount()).toBe(0);
  });

  it('survive right up to the deadline', () => {
    inviteStranger(T0);

    expect(accounts.sweepExpired(T0 + INVITE_TTL_MS - 1).invites).toBe(0);
    expect(inviteCount()).toBe(1);
  });

  /**
   * The point of the expiry, and the only test here that is about behaviour
   * rather than housekeeping: a stranger who signs up long afterwards should
   * not be handed a request predating anything they know about.
   */
  it('no longer become a contact request when the address signs up', () => {
    const sender = inviteStranger(T0);
    accounts.sweepExpired(T0 + INVITE_TTL_MS + 1);

    const stranger = signIn(
      'stranger@example.com',
      'Stranger',
      T0 + INVITE_TTL_MS + DAY
    );

    expect(accounts.contactState(sender.id, stranger.id)).toBeNull();
    expect(
      accounts.contactsFor(stranger.id).filter((c) => c.status === 'incoming')
    ).toHaveLength(0);
  });

  /** The same flow without a sweep, so the test above is testing the sweep. */
  it('still resolve normally when swept before the deadline', () => {
    const sender = inviteStranger(T0);
    accounts.sweepExpired(T0 + DAY);

    const stranger = signIn('stranger@example.com', 'Stranger', T0 + 2 * DAY);

    expect(accounts.contactState(sender.id, stranger.id)).toEqual({
      state: 'pending',
      requester: sender.id,
    });
  });

  it('leaves the sender nothing to look at once it has gone', () => {
    const sender = inviteStranger(T0);
    expect(accounts.contactsFor(sender.id)).toHaveLength(1);

    accounts.sweepExpired(T0 + INVITE_TTL_MS + 1);

    expect(accounts.contactsFor(sender.id)).toHaveLength(0);
  });
});

/**
 * The wiring, not the deletion. Sweeping is a property of the application
 * rather than of one entry point, so it has to hold for anything that builds
 * the app — a deploy, this suite, a one-off script. Seeding a database on disk
 * and then handing it to `buildApp` is the only way to observe the sweep that
 * runs at construction.
 */
describe('a built app sweeps on its own', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'thefloor-sweep-'));
    dbPath = join(dir, 'test.db');

    const seed = openDb(dbPath);
    const seeded = new Accounts(seed);
    seeded.issueCode('stale@example.com', T0);
    const code = seeded.issueCode('sender@example.com', T0)!;
    const sender = seeded.verifyCode(
      'sender@example.com',
      code,
      'Sender',
      T0
    )!.account;
    seeded.requestContact(sender.id, 'stranger@example.com', T0);
    seed.close();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('clears rows that expired while it was not running', async () => {
    const app = buildApp({
      dbPath,
      mailer: new MemoryMailer(),
      now: () => T0 + INVITE_TTL_MS + DAY,
    });

    const remaining = (table: string) =>
      (app.db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as {
        n: number;
      }).n;

    expect(remaining('otp_codes')).toBe(0);
    expect(remaining('pending_invites')).toBe(0);
    // Only the dead rows: the account that sent the invite is untouched.
    expect(remaining('accounts')).toBe(1);

    await app.fastify.close();
  });

  it('leaves rows that are still live', async () => {
    const app = buildApp({
      dbPath,
      mailer: new MemoryMailer(),
      now: () => T0 + DAY,
    });

    expect(
      (app.db.prepare('SELECT count(*) AS n FROM pending_invites').get() as {
        n: number;
      }).n
    ).toBe(1);

    await app.fastify.close();
  });
});

describe('the sweep itself', () => {
  it('reports nothing on an empty database', () => {
    expect(accounts.sweepExpired(T0)).toEqual({
      codes: 0,
      invites: 0,
      tokens: 0,
      watchTokens: 0,
    });
  });

  it('is idempotent — a second pass finds nothing left', () => {
    accounts.issueCode('alice@example.com', T0);
    signIn('sender@example.com', 'Sender', T0);
    accounts.requestContact(
      accounts.byIdentifier('sender@example.com')!.id,
      'stranger@example.com',
      T0
    );

    const at = T0 + INVITE_TTL_MS + 1;
    // The token from signing in is good for ninety days, so it outlives this.
    expect(accounts.sweepExpired(at)).toEqual({
      codes: 1,
      invites: 1,
      tokens: 0,
      watchTokens: 0,
    });
    expect(accounts.sweepExpired(at)).toEqual({
      codes: 0,
      invites: 0,
      tokens: 0,
      watchTokens: 0,
    });
  });

  it('leaves accounts, contacts, and live tokens alone', () => {
    const a = signIn('a@example.com', 'A', T0);
    const b = signIn('b@example.com', 'B', T0);
    accounts.requestContact(a.id, 'b@example.com', T0);
    const token = accounts.issueToken(a.id, T0);

    accounts.sweepExpired(T0 + INVITE_TTL_MS + 1);

    expect(accounts.byId(a.id)).toBeDefined();
    expect(accounts.byId(b.id)).toBeDefined();
    expect(accounts.contactState(a.id, b.id)?.state).toBe('pending');
    expect(accounts.accountForToken(token, T0 + DAY)?.id).toBe(a.id);
  });
});
