import type { Db, DeviceTokenRow } from './db';

export type DevicePlatform = 'ios' | 'android';

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
   * **One address per account, which mirrors one session per account.**
   * `Accounts.issueToken` revokes every other session on sign-in, deliberately
   * — so an account with two live addresses is describing a state the auth
   * layer forbids, and the older of them is a device that was signed out and
   * does not know it. This table used to model many, and the disagreement was
   * only visible as a phone still receiving notifications for an account it had
   * been signed out of.
   *
   * **If the multi-device trade named in BACKLOG is ever revisited, this comes
   * out with it.** The two rules are one decision expressed twice, and leaving
   * this behind would silently delete the second device somebody had just been
   * allowed to have.
   *
   * Belt to the braces of `/auth/verify`, which clears the account at the
   * moment the sessions are revoked. That one fires whether or not the new
   * device ever registers; this one holds the invariant against every other
   * route to a row — notably a reinstall, which mints a fresh token for the
   * same phone and would otherwise leave its predecessor behind forever.
   */
  register(
    token: string,
    accountId: string,
    platform: DevicePlatform,
    now: number
  ): void {
    // Before the upsert, and excluding this address, so re-registering the
    // same device is untouched rather than deleted and rewritten.
    this.db
      .prepare('DELETE FROM device_tokens WHERE account_id = ? AND token != ?')
      .run(accountId, token);
    this.db
      .prepare(
        `INSERT INTO device_tokens
           (token, account_id, platform, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(token) DO UPDATE SET
           account_id   = excluded.account_id,
           platform     = excluded.platform,
           last_seen_at = excluded.last_seen_at`
      )
      .run(token, accountId, platform, now, now);
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
   * The same addresses, but keyed by whose they are.
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
   */
  tokensByAccount(accountIds: readonly string[]): Map<string, string[]> {
    const byAccount = new Map<string, string[]>();
    if (accountIds.length === 0) return byAccount;
    const placeholders = accountIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT account_id, token FROM device_tokens
         WHERE account_id IN (${placeholders})`
      )
      .all(...accountIds) as Array<{ account_id: string; token: string }>;
    for (const row of rows) {
      byAccount.set(row.account_id, [
        ...(byAccount.get(row.account_id) ?? []),
        row.token,
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
   * a leak — `register` keeps one per account, so the table is bounded by how
   * many accounts exist rather than by how many phones have ever held one.
   *
   * Which is also why nothing reads `last_seen_at`. It was written against a
   * pruning sweep that the 410 reply and that invariant between them made
   * unnecessary; it survives as a record of when somebody last opened the app,
   * which is worth having and is not a garbage collector.
   */
  forget(token: string): void {
    this.db.prepare('DELETE FROM device_tokens WHERE token = ?').run(token);
  }

  /**
   * Forgets every address for one person.
   *
   * Two callers, and the second is not obvious: deleting an account, and
   * *signing in*, which revokes every other session and so must drop the
   * addresses those sessions were reachable at. See `/auth/verify`.
   */
  forgetAccount(accountId: string): void {
    this.db
      .prepare('DELETE FROM device_tokens WHERE account_id = ?')
      .run(accountId);
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
