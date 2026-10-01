import type { Db } from './db';
import type { LiveActivityEnder, PushResult } from './push';

/**
 * The lock screen cards this server can take down, and when it does.
 *
 * **A card is the phone's to start and, ordinarily, the phone's to end** —
 * `useLockScreen` hides it the moment `here` goes null. That fails in exactly
 * the case the card is for: a phone in a pocket whose app iOS has suspended,
 * or killed, runs no JavaScript, hears no snapshot and fires no timer. The
 * server meanwhile runs `DISCONNECT_GRACE_MS` down and steps the account out,
 * and the card goes on offering a Mute for a microphone nothing is holding,
 * for as long as ActivityKit keeps it — hours.
 *
 * So the app hands over each card's ActivityKit push token, and **the server
 * ends the card in the same breath as the step-out that makes it false**,
 * whatever caused it and whether or not the phone is listening. Two events
 * make a card false:
 *
 * - **The account is no longer present in the card's channel** — the grace
 *   expiring, attention expiring, a removal, the channel being deleted, or an
 *   ordinary Step Out. The last is one the phone has already handled, and the
 *   push is then redundant and harmless; filtering it out would mean knowing
 *   which device asked, and a queued Step Out sent on reconnect is one whose
 *   card *is* still up. `endWhereAbsent`.
 * - **Another device of the account stepped in**, which leaves the account
 *   present and the card on this device describing a room it has been
 *   displaced from. `displaced` in ws.ts tells a live socket; a suspended
 *   phone has none. `endOtherDevices`.
 *
 * A row is deleted as its end is sent, whatever Apple answers: a token is good
 * for one activity, and an end that failed in transit is not improved by
 * being retried against a card the phone will have settled itself by the time
 * it next runs.
 */
export class LiveActivities {
  constructor(
    private db: Db,
    private ender: LiveActivityEnder,
    private onFailure: (result: PushResult) => void = () => {}
  ) {}

  /**
   * Records a card's token. An upsert, because iOS may reissue an activity's
   * token during its life and the newest is the one that reaches it.
   */
  register(
    token: string,
    accountId: string,
    channelId: string,
    deviceKey: string,
    now: number
  ): void {
    this.db
      .prepare(
        `INSERT INTO live_activities
           (token, account_id, channel_id, device_key, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(token) DO UPDATE SET
           account_id = excluded.account_id,
           channel_id = excluded.channel_id,
           device_key = excluded.device_key`
      )
      .run(token, accountId, channelId, deviceKey, now);
  }

  /**
   * Ends every card about this channel held by an account not in `present`,
   * or every card about it at all when the channel is gone (`null`).
   *
   * Called on every change to the channel, so the common answer is no rows
   * and the query is an index probe.
   */
  endWhereAbsent(channelId: string, present: readonly string[] | null): void {
    const rows = this.db
      .prepare(
        'SELECT token, account_id FROM live_activities WHERE channel_id = ?'
      )
      .all(channelId) as Array<{ token: string; account_id: string }>;
    if (rows.length === 0) return;
    const here = new Set(present ?? []);
    this.end(rows.filter((row) => !here.has(row.account_id)));
  }

  /** Ends every card of this account started on any other device. */
  endOtherDevices(accountId: string, deviceKey: string): void {
    const rows = this.db
      .prepare(
        'SELECT token FROM live_activities WHERE account_id = ? AND device_key != ?'
      )
      .all(accountId, deviceKey) as Array<{ token: string }>;
    this.end(rows);
  }

  /** How many cards are on record. For tests. */
  count(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM live_activities')
      .get() as { n: number };
    return row.n;
  }

  private end(rows: Array<{ token: string }>): void {
    if (rows.length === 0) return;
    const forget = this.db.prepare('DELETE FROM live_activities WHERE token = ?');
    for (const { token } of rows) {
      forget.run(token);
      void this.ender.end(token).then((result) => {
        if (result.status !== 200) this.onFailure(result);
      });
    }
  }
}
