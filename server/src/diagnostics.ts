import { DIAGNOSTICS_RETENTION_MS } from '../../core/constants';
import type { SilenceNotice } from './channels';
import { newId, type Db } from './db';

/**
 * What phones and the server say about a fault while it is happening: the
 * lines a debug account's phone ships from its audio panel, and the server's
 * silence notices that those lines are evidence against. `bin/diagnostics`
 * reads both back as one timeline.
 *
 * **In tables rather than the journal, since 2026-10-03.** Both went to the
 * journal until then, on the premise that "`journalctl` already rotates" and
 * so this data would be gone in a day or two without anybody deciding it. It
 * was measured false on 2026-09-17: journald on the box rotates by size, at a
 * cap sixteen months away, and had deleted nothing since its first boot. So a
 * deleted account's lines outlived it by more than a year, in the one store
 * `DELETE /me` cannot reach. See planning/decision/
 * 2026-10-03-diagnostics-expire-on-the-server-s-clock-rather-than-the-journal-s.md.
 *
 * **Swept at DIAGNOSTICS_RETENTION_MS, and forgotten with the account.** The
 * two obligations the journal was chosen to avoid, taken on because the
 * journal never discharged them; the sweep runs on its own timer so that a box
 * where no phone ships anything still expires what is there.
 *
 * **Read by `bin/diagnostics` and nothing else** — no endpoint reads it back,
 * on usage.ts's rule for the meter.
 */
export class Diagnostics {
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private db: Db) {}

  /**
   * One row per line, stamped with the phone's own time when it sent one and
   * with arrival otherwise — the phone's is what the timeline is sorted by,
   * since a phone with no signal sends a minute of lines at once.
   */
  record(
    accountId: string,
    build: number | null,
    lines: Array<{ at: number | null; text: string }>,
    now: number
  ): void {
    const insert = this.db.prepare(
      `INSERT INTO diagnostic_lines (id, account_id, build, at, received_at, text)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    // One commit for the batch rather than one per line: a batch is up to five
    // hundred of them, and arrives whole or not at all.
    this.db.exec('BEGIN');
    try {
      for (const line of lines) {
        insert.run(newId('dl'), accountId, build, line.at ?? now, now, line.text);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /**
   * A notice kept whole, as the JSON it was raised as. Its accounts are found
   * by `forget` inside that text rather than given columns, because an
   * `unrestored` notice names them only inside its `pairs`.
   */
  notice(notice: SilenceNotice, now: number): void {
    this.db
      .prepare(
        `INSERT INTO silence_notices (id, at, channel_id, kind, body)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(newId('sn'), now, notice.channelId, notice.kind, JSON.stringify(notice));
  }

  /**
   * Removes every line an account shipped and every notice that names it.
   *
   * Called from `DELETE /me`, beside `Usage.forget` and `Excess.forget`. A
   * notice is matched by the id appearing anywhere in its body, which is exact
   * rather than approximate: an account id is a prefix and a fixed-length
   * random tail (`newId`), so no id is ever found inside another.
   */
  forget(accountId: string): void {
    this.db.prepare('DELETE FROM diagnostic_lines WHERE account_id = ?').run(accountId);
    this.db
      .prepare('DELETE FROM silence_notices WHERE instr(body, ?) > 0')
      .run(accountId);
  }

  /** Deletes whatever arrived longer ago than the horizon, and says how much. */
  sweep(now: number): { lines: number; notices: number } {
    const cutoff = now - DIAGNOSTICS_RETENTION_MS;
    const lines = this.db
      .prepare('DELETE FROM diagnostic_lines WHERE received_at < ?')
      .run(cutoff);
    const notices = this.db
      .prepare('DELETE FROM silence_notices WHERE at < ?')
      .run(cutoff);
    return { lines: Number(lines.changes), notices: Number(notices.changes) };
  }

  /**
   * Sweeps once straight away and then hourly, on the app's clock — as
   * `Accounts.start` does, and for its reasons.
   */
  start(now: () => number, everyMs: number): void {
    if (this.sweepTimer) return;
    this.sweep(now());
    this.sweepTimer = setInterval(() => this.sweep(now()), everyMs);
    this.sweepTimer.unref?.();
  }

  stop(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }
}
