import { Accounts, TOKEN_TTL_MS } from '../src/accounts';
import { openDb } from '../src/db';

/**
 * Several sessions per account, and the one lever that ends them.
 *
 * This file used to assert the opposite: signing in anywhere revoked every
 * other token, so a phone and a tablet could not be signed in at once. That
 * bought one thing — a token is good for ninety days and nothing in the
 * product lists or cancels one, so signing in elsewhere was the only signal
 * available that a device may have left its owner's hands — and it charged the
 * ordinary case for it.
 *
 * Both halves are here, because the second is what makes the first affordable.
 * Signing in leaves every other session alone; `revokeOthersForAccount` ends
 * them on purpose, sparing the caller's, and is the only operation that can
 * reach a session whose token nobody holds any more.
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
  it('leaves the session that was already open', () => {
    const first = signIn('alice@example.com', 'Alice', T0);
    expect(accounts.accountForToken(first.token, T0)?.id).toBe(
      first.account.id
    );

    // A second device, an hour later.
    const second = signIn('alice@example.com', 'Alice', T0 + 60 * 60 * 1000);

    // Both good, and both the same person: a phone and a tablet.
    expect(accounts.accountForToken(first.token, T0 + DAY)?.id).toBe(
      first.account.id
    );
    expect(accounts.accountForToken(second.token, T0 + DAY)?.id).toBe(
      first.account.id
    );
  });

  it('leaves a row per sign-in, however many times it happens', () => {
    signIn('alice@example.com', 'Alice', T0);
    signIn('alice@example.com', 'Alice', T0 + DAY);
    signIn('alice@example.com', 'Alice', T0 + 2 * DAY);

    expect(tokenCount()).toBe(3);
  });

  it('does not disturb anybody else', () => {
    const bob = signIn('bob@example.com', 'Bob', T0);
    signIn('alice@example.com', 'Alice', T0);

    // Alice signing in twice must not touch Bob — which was worth asserting
    // when this revoked, and is worth asserting still: it now says that the
    // rows accumulate against the right account.
    signIn('alice@example.com', 'Alice', T0 + DAY);

    expect(accounts.accountForToken(bob.token, T0 + DAY)?.id).toBe(
      bob.account.id
    );
    expect(tokenCount()).toBe(3);
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

describe('signing out every other device', () => {
  it('ends the others and keeps the one asking', () => {
    const phone = signIn('alice@example.com', 'Alice', T0);
    const tablet = signIn('alice@example.com', 'Alice', T0 + DAY);
    const laptop = signIn('alice@example.com', 'Alice', T0 + 2 * DAY);

    expect(
      accounts.revokeOthersForAccount(phone.account.id, phone.token)
    ).toBe(2);

    expect(accounts.accountForToken(phone.token, T0 + 3 * DAY)?.id).toBe(
      phone.account.id
    );
    expect(accounts.accountForToken(tablet.token, T0 + 3 * DAY)).toBeUndefined();
    expect(accounts.accountForToken(laptop.token, T0 + 3 * DAY)).toBeUndefined();
  });

  it('reports nothing when there was nowhere else signed in', () => {
    const only = signIn('alice@example.com', 'Alice', T0);

    expect(accounts.revokeOthersForAccount(only.account.id, only.token)).toBe(0);
    expect(accounts.accountForToken(only.token, T0)?.id).toBe(only.account.id);
  });

  it('is scoped to the one account', () => {
    const alice = signIn('alice@example.com', 'Alice', T0);
    signIn('alice@example.com', 'Alice', T0 + DAY);
    const bob = signIn('bob@example.com', 'Bob', T0);

    accounts.revokeOthersForAccount(alice.account.id, alice.token);

    expect(accounts.accountForToken(bob.token, T0 + DAY)?.id).toBe(
      bob.account.id
    );
  });

  /**
   * The case this exists for: the phone is gone, so the session being ended is
   * one nobody can present. Signing in again does not end it — that is the
   * whole of what changed — so the lever has to be reachable from a session
   * that is not the lost one.
   */
  it('reaches the session of a device nobody holds', () => {
    const lost = signIn('alice@example.com', 'Alice', T0);
    const replacement = signIn('alice@example.com', 'Alice', T0 + DAY);

    expect(accounts.accountForToken(lost.token, T0 + DAY)).toBeDefined();
    accounts.revokeOthersForAccount(
      replacement.account.id,
      replacement.token
    );
    expect(accounts.accountForToken(lost.token, T0 + DAY)).toBeUndefined();
  });
});

describe('signing out', () => {
  it('ends the session it was given', () => {
    const alice = signIn('alice@example.com', 'Alice', T0);

    accounts.revokeToken(alice.token);

    expect(accounts.accountForToken(alice.token, T0)).toBeUndefined();
    expect(tokenCount()).toBe(0);
  });

  it('ends only the session it was given', () => {
    const phone = signIn('alice@example.com', 'Alice', T0);
    const tablet = signIn('alice@example.com', 'Alice', T0 + DAY);

    accounts.revokeToken(phone.token);

    expect(accounts.accountForToken(tablet.token, T0 + DAY)?.id).toBe(
      tablet.account.id
    );
    expect(tokenCount()).toBe(1);
  });
});
