import { DatabaseSync } from 'node:sqlite';
import { insertWithUniqueKey, newId } from '../src/db';

/**
 * Primary keys here are random rather than sequential, so a collision is
 * astronomically unlikely — 72 bits — and correspondingly impossible to
 * provoke through the normal call sites. These drive the retry directly with a
 * mint function that returns a key already in the table, which is the only way
 * to exercise the recovery path deterministically.
 *
 * The distinction that matters most is the one the tests below pin down: a
 * clash on the *primary key* must be retried, and a clash on any *other*
 * unique column must not be. SQLite reports both with the same message, so
 * only the extended result code separates them.
 */

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`
    CREATE TABLE accounts (
      id         TEXT PRIMARY KEY,
      identifier TEXT NOT NULL UNIQUE,
      label      TEXT NOT NULL
    );
    CREATE TABLE tokens (
      token_hash TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id)
    );
  `);
});

afterEach(() => {
  db.close();
});

const insertAccount = (identifier: string) => (key: string) => {
  db.prepare('INSERT INTO accounts (id, identifier, label) VALUES (?, ?, ?)').run(
    key,
    identifier,
    'x'
  );
};

const idsIn = () =>
  (db.prepare('SELECT id FROM accounts ORDER BY id').all() as Array<{
    id: string;
  }>).map((row) => row.id);

describe('insertWithUniqueKey', () => {
  it('returns the key it actually used', () => {
    const key = insertWithUniqueKey(() => newId('acct'), insertAccount('a@x'));

    expect(key).toMatch(/^acct_/);
    expect(idsIn()).toEqual([key]);
  });

  it('mints a new key and retries when the first one is taken', () => {
    insertWithUniqueKey(() => 'acct_taken', insertAccount('first@x'));

    const minted = ['acct_taken', 'acct_free'];
    let calls = 0;
    const key = insertWithUniqueKey(() => {
      calls += 1;
      return minted.shift()!;
    }, insertAccount('second@x'));

    expect(key).toBe('acct_free');
    expect(calls).toBe(2);
    expect(idsIn()).toEqual(['acct_free', 'acct_taken']);
  });

  it('keeps retrying across several collisions in a row', () => {
    for (const taken of ['acct_1', 'acct_2', 'acct_3']) {
      insertWithUniqueKey(() => taken, insertAccount(`${taken}@x`));
    }

    const minted = ['acct_1', 'acct_2', 'acct_3', 'acct_4'];
    const key = insertWithUniqueKey(
      () => minted.shift()!,
      insertAccount('fourth@x')
    );

    expect(key).toBe('acct_4');
  });

  /**
   * The case that must NOT retry. A second signup on one address is a real
   * duplicate: a different account id does nothing about the address, so
   * retrying would burn every attempt and report the wrong failure.
   */
  it('rethrows a duplicate on another column without retrying', () => {
    insertWithUniqueKey(() => newId('acct'), insertAccount('taken@x'));

    let calls = 0;
    expect(() =>
      insertWithUniqueKey(() => {
        calls += 1;
        return newId('acct');
      }, insertAccount('taken@x'))
    ).toThrow(/UNIQUE constraint failed: accounts.identifier/);

    expect(calls).toBe(1);
    expect(idsIn()).toHaveLength(1);
  });

  it('rethrows a foreign-key violation without retrying', () => {
    let calls = 0;
    expect(() =>
      insertWithUniqueKey(
        () => {
          calls += 1;
          return newId('tok');
        },
        (key) =>
          db
            .prepare('INSERT INTO tokens (token_hash, account_id) VALUES (?, ?)')
            .run(key, 'acct_nobody')
      )
    ).toThrow(/FOREIGN KEY constraint failed/);

    expect(calls).toBe(1);
  });

  /**
   * A mint that has stopped varying — a duplicated RNG seed, a stubbed
   * generator — must fail quickly rather than spin. The error surfaced is the
   * database's own, not a wrapper, so the cause stays visible.
   */
  it('gives up after a bounded number of attempts and throws the real error', () => {
    insertWithUniqueKey(() => 'acct_stuck', insertAccount('first@x'));

    let calls = 0;
    expect(() =>
      insertWithUniqueKey(() => {
        calls += 1;
        return 'acct_stuck';
      }, insertAccount('second@x'))
    ).toThrow(/UNIQUE constraint failed: accounts.id/);

    expect(calls).toBe(5);
    expect(idsIn()).toEqual(['acct_stuck']);
  });

  it('does not run the insert again after it succeeds', () => {
    let inserts = 0;
    insertWithUniqueKey(
      () => newId('acct'),
      (key) => {
        inserts += 1;
        insertAccount('once@x')(key);
      }
    );

    expect(inserts).toBe(1);
  });
});
