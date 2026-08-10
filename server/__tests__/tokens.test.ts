import { Accounts, TOKEN_TTL_MS } from '../src/accounts';
import { openDb } from '../src/db';

/**
 * One session per account.
 *
 * A token is good for ninety days and nothing in the product lists or cancels
 * one, so signing in elsewhere is the only signal available that a device may
 * have left the owner's hands. These assert that signing in really does end
 * the previous session, and — the other half, easy to lose — that it ends
 * nobody else's.
 */

const T0 = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

let accounts: Accounts;
let db: ReturnType<typeof openDb>;

beforeEach(() => {
  db = openDb(':memory:');
  accounts = new Accounts(db);
});

const tokenCount = () =>
  (db.prepare('SELECT count(*) AS n FROM tokens').get() as { n: number }).n;

function signIn(identifier: string, name: string, now: number) {
  const code = accounts.issueCode(identifier, now)!;
  return accounts.verifyCode(identifier, code, name, now)!;
}

describe('signing in again', () => {
  it('ends the session that was already open', () => {
    const first = signIn('alice@example.com', 'Alice', T0);
    expect(accounts.accountForToken(first.token, T0)?.id).toBe(
      first.account.id
    );

    // A second device, an hour later.
    const second = signIn('alice@example.com', 'Alice', T0 + 60 * 60 * 1000);

    expect(accounts.accountForToken(first.token, T0 + DAY)).toBeUndefined();
    expect(accounts.accountForToken(second.token, T0 + DAY)?.id).toBe(
      first.account.id
    );
  });

  it('leaves exactly one row behind, however many times it happens', () => {
    signIn('alice@example.com', 'Alice', T0);
    signIn('alice@example.com', 'Alice', T0 + DAY);
    signIn('alice@example.com', 'Alice', T0 + 2 * DAY);

    expect(tokenCount()).toBe(1);
  });

  it('does not disturb anybody else', () => {
    const bob = signIn('bob@example.com', 'Bob', T0);
    signIn('alice@example.com', 'Alice', T0);

    // Alice signing in twice must not touch Bob.
    signIn('alice@example.com', 'Alice', T0 + DAY);

    expect(accounts.accountForToken(bob.token, T0 + DAY)?.id).toBe(
      bob.account.id
    );
    expect(tokenCount()).toBe(2);
  });

  it('is still a real sign-in — the new token works immediately', () => {
    signIn('alice@example.com', 'Alice', T0);
    const again = signIn('alice@example.com', 'Alice', T0 + DAY);

    const found = accounts.accountForToken(again.token, T0 + DAY);
    expect(found?.identifier).toBe('alice@example.com');
    // And carries a fresh ninety days rather than inheriting the old deadline.
    expect(
      accounts.accountForToken(again.token, T0 + DAY + TOKEN_TTL_MS - 1)
    ).toBeDefined();
  });
});

describe('revoking every session for an account', () => {
  it('reaches a token the caller does not hold', () => {
    const lost = signIn('alice@example.com', 'Alice', T0);

    expect(accounts.revokeAllForAccount(lost.account.id)).toBe(1);
    expect(accounts.accountForToken(lost.token, T0)).toBeUndefined();
  });

  it('reports nothing when the account has no sessions', () => {
    const alice = signIn('alice@example.com', 'Alice', T0);
    accounts.revokeAllForAccount(alice.account.id);

    expect(accounts.revokeAllForAccount(alice.account.id)).toBe(0);
  });

  it('is scoped to the one account', () => {
    const alice = signIn('alice@example.com', 'Alice', T0);
    const bob = signIn('bob@example.com', 'Bob', T0);

    accounts.revokeAllForAccount(alice.account.id);

    expect(accounts.accountForToken(alice.token, T0)).toBeUndefined();
    expect(accounts.accountForToken(bob.token, T0)?.id).toBe(bob.account.id);
  });

  it('leaves the account itself intact — this ends sessions, not people', () => {
    const alice = signIn('alice@example.com', 'Alice', T0);
    accounts.revokeAllForAccount(alice.account.id);

    expect(accounts.byId(alice.account.id)).toBeDefined();
    // And they can sign back in.
    const back = signIn('alice@example.com', 'Alice', T0 + DAY);
    expect(accounts.accountForToken(back.token, T0 + DAY)?.id).toBe(
      alice.account.id
    );
  });
});

describe('signing out', () => {
  it('ends the session it was given', () => {
    const alice = signIn('alice@example.com', 'Alice', T0);

    accounts.revokeToken(alice.token);

    expect(accounts.accountForToken(alice.token, T0)).toBeUndefined();
    expect(tokenCount()).toBe(0);
  });
});
