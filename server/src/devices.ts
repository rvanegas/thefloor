import type { Db, DeviceTokenRow } from './db';

export type DevicePlatform = 'ios' | 'android';

/**
 * One place a person can be reached, and the sign-in that claimed it.
 *
 * `sessionHash` is null for a row written before the column existed and for
 * one registered by a client that sent no credential — both of which the
 * caller reads as "cannot tell", and answers with the person-level test it
 * used for everybody until 2026-08-24.
 */
export interface DeviceAddress {
  token: string;
  sessionHash: string | null;
}

/**
 * Where each person can be reached when their app is not running.
 *
 * Storage only — it knows addresses, never how to send to one. `Pusher` in
 * `push.ts` is the other half, and the two are kept apart so that switching
 * transports or losing credentials cannot cost the registry, and so tests can
 * exercise the registry without a network at all.
 */
export class Devices {
  constructor(private db: Db) {}

  /**
   * Records where this install can be reached, as the given account.
   *
   * An upsert rather than an insert, and keyed on the token, because a device
   * signing out and back in as somebody else keeps the address Apple gave it.
   * Inserting would leave the old row behind, and the old row says this phone
   * belongs to the previous account — which is how one person's conversations
   * end up on another person's lock screen. Moving the row is the only correct
   * reading of the same address arriving under a new name.
   *
   * **Several addresses per account, which mirrors several sessions per
   * account.** This deleted every other row for the account until 2026-08-24,
   * because `Accounts.issueToken` revoked every other session on sign-in and a
   * second live address was therefore describing a state the auth layer
   * forbade. Both halves went together, as the note that used to be here said
   * they would have to: a phone and a tablet signed in at once are two places
   * one person can be reached, and deleting one of them would be silently
   * taking back the device they had just been allowed to have.
   *
   * The failure the deletion was guarding against has not gone away — a phone
   * signed out and left holding this account's notifications — and is now
   * handled where it belongs, by whatever ends the session: `/auth/sign-out`
   * forgets the address it names, and *Sign out other devices* forgets every
   * address but the caller's alongside revoking every token but theirs.
   *
   * The remaining unbounded case is a reinstall, which mints a fresh address
   * for the same phone and leaves its predecessor behind. That row is dead the
   * moment Apple sees it — the old token stops resolving — and is deleted at
   * the first 410 in reply to a send. See `forget`.
   */
  register(
    token: string,
    accountId: string,
    platform: DevicePlatform,
    now: number,
    sessionHash?: string
  ): void {
    this.db
      .prepare(
        `INSERT INTO device_tokens
           (token, account_id, platform, created_at, last_seen_at, session_hash)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(token) DO UPDATE SET
           account_id   = excluded.account_id,
           platform     = excluded.platform,
           last_seen_at = excluded.last_seen_at,
           session_hash = excluded.session_hash`
      )
      .run(token, accountId, platform, now, now, sessionHash ?? null);
  }

  /** Every address these people can be reached at. */
  tokensFor(accountIds: string[]): string[] {
    if (accountIds.length === 0) return [];
    const placeholders = accountIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT token FROM device_tokens WHERE account_id IN (${placeholders})`
      )
      .all(...accountIds) as Array<{ token: string }>;
    return rows.map((row) => row.token);
  }

  /**
   * The same addresses with the session that registered each, keyed by whose
   * they are.
   *
   * `tokensFor` flattens the accounts away, which was right while every
   * recipient of one notification was treated alike. Once each person could
   * say how loudly a channel may interrupt them, the sender has to know which
   * address belongs to whom — so this is the same single query with the column
   * it was already selecting kept rather than discarded.
   *
   * Accounts with no registered device are absent rather than present with an
   * empty list: a caller iterating this is looking for somewhere to send, and
   * an entry that resolves to nowhere is a group of no tokens to reason about.
   *
   * **It carries the session hash because the caller decides per address.**
   * This returned bare tokens while a person had one device and the question
   * "is this person in the app" could stand in for "is this phone looking at
   * the screen". Those came apart on 2026-08-24 — see the schema — and the
   * push notifier now suppresses an address whose own session is connected,
   * rather than dropping the person on the strength of any of them.
   */
  addressesByAccount(
    accountIds: readonly string[]
  ): Map<string, DeviceAddress[]> {
    const byAccount = new Map<string, DeviceAddress[]>();
    if (accountIds.length === 0) return byAccount;
    const placeholders = accountIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT account_id, token, session_hash FROM device_tokens
         WHERE account_id IN (${placeholders})`
      )
      .all(...accountIds) as Array<{
      account_id: string;
      token: string;
      session_hash: string | null;
    }>;
    for (const row of rows) {
      byAccount.set(row.account_id, [
        ...(byAccount.get(row.account_id) ?? []),
        { token: row.token, sessionHash: row.session_hash },
      ]);
    }
    return byAccount;
  }

  /**
   * Forgets one address.
   *
   * Called on sign-out, and on every token Apple answers 410 Unregistered for
   * — which is what an install that was deleted rather than signed out of
   * eventually becomes. Deleting the app invalidates the token at Apple's end,
   * so that case cleans itself up rather than needing to be noticed here.
   *
   * **Lazily, though: 410 only arrives in reply to a send.** An address nobody
   * is ever notified at is never tested and never removed. That is a row, not
   * a leak, but it is a weaker claim than it was: `register` kept exactly one
   * row per account until 2026-08-24, which bounded the table by how many
   * accounts exist. Now it is bounded by how many devices have registered and
   * never been notified at since — an account's own phones, plus a reinstall's
   * predecessor until the first send finds it dead.
   *
   * Which is also why nothing reads `last_seen_at`. It was written against a
   * pruning sweep the 410 reply made unnecessary; it survives as a record of
   * when somebody last opened the app, which is worth having and is not a
   * garbage collector. If the table ever does want pruning, that column is
   * what a sweep would read.
   */
  forget(token: string): void {
    this.db.prepare('DELETE FROM device_tokens WHERE token = ?').run(token);
  }

  /**
   * Forgets every address for one person.
   *
   * One caller now: deleting an account. It had a second and less obvious one
   * until 2026-08-24 — signing in, which used to revoke every other session
   * and so had to drop the addresses those sessions were reachable at. Signing
   * in revokes nothing any more, so it takes nobody's notifications with it.
   */
  forgetAccount(accountId: string): void {
    this.db
      .prepare('DELETE FROM device_tokens WHERE account_id = ?')
      .run(accountId);
  }

  /**
   * Forgets every address for one person **except one**.
   *
   * The other half of `Accounts.revokeOthersForAccount`, and it has to be the
   * other half rather than a consequence of it: a revoked session cannot
   * deregister its own address, because the moment it learns it is finished is
   * a 401, at which point it holds no credential to say so with. So the device
   * doing the signing out speaks for all of them, and names itself as the one
   * to keep.
   *
   * A caller with no address of its own — an install that has never been
   * granted notification permission — passes none, and every row goes. That is
   * right: it is asking for every other device to be signed out, and it has no
   * row of its own to spare.
   */
  forgetOthers(accountId: string, keep: string | undefined): void {
    if (keep === undefined) {
      this.forgetAccount(accountId);
      return;
    }
    this.db
      .prepare('DELETE FROM device_tokens WHERE account_id = ? AND token != ?')
      .run(accountId, keep);
  }

  /** For tests and `bin/db`-shaped questions. */
  list(accountId: string): DeviceTokenRow[] {
    return this.db
      .prepare(
        'SELECT * FROM device_tokens WHERE account_id = ? ORDER BY created_at'
      )
      .all(accountId) as unknown as DeviceTokenRow[];
  }
}
