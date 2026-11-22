import type { Db } from './db';

/**
 * Who is **unlimited**: Pro everywhere Pro decides, without a subscription —
 * the operator, testers, App Review, people given it. **The mark is auth's**
 * since 2026-11-22 (dianoia-auth's
 * `planning/decision/2026-11-22-unlimited-is-one-mark-kept-here.md`), kept by
 * user name and set there by its operator alone, and noesis reads the same
 * one, so unlimited at either is unlimited at both. The `transcripts_unlimited`
 * column it replaced is gone.
 *
 * This is a copy of auth's last answer, in the `unlimited` table, replaced
 * whole each `UNLIMITED_REFRESH_MS`: asked for synchronously wherever Pro
 * decides, it cannot wait on auth, and a restart while auth is unreachable
 * keeps the last answer rather than metering everybody. A change at auth
 * reaches The Floor within the minute. An account with no username is never
 * in it, auth knowing people by nothing else.
 */
export const UNLIMITED_REFRESH_MS = 60 * 1000;

export class Unlimited {
  constructor(private db: Db) {}

  has(username: string | null | undefined): boolean {
    if (!username) return false;
    return !!this.db.prepare('SELECT 1 FROM unlimited WHERE username = ?').get(username);
  }

  /** Replaces the copy with auth's answer, whole. */
  replace(usernames: string[]): void {
    const insert = this.db.prepare('INSERT OR IGNORE INTO unlimited (username) VALUES (?)');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec('DELETE FROM unlimited');
      for (const username of usernames) insert.run(username);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /** Asks auth and keeps its answer; false, keeping the last one, where it could not be asked. */
  async refresh(ask: () => Promise<string[]>): Promise<boolean> {
    let usernames: string[];
    try {
      usernames = await ask();
    } catch {
      return false;
    }
    this.replace(usernames);
    return true;
  }
}
