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
   */
  register(
    token: string,
    accountId: string,
    platform: DevicePlatform,
    now: number
  ): void {
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
   * Forgets one address.
   *
   * Called on sign-out, and on every token Apple reports as dead. Nothing else
   * bounds this table: an install that is deleted rather than signed out of
   * would otherwise be sent to for the life of the database.
   */
  forget(token: string): void {
    this.db.prepare('DELETE FROM device_tokens WHERE token = ?').run(token);
  }

  /** Forgets every address for one person. */
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
