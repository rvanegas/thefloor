import {
  DEFAULT_NOTIFICATION_LEVEL,
  type NotificationLevel,
} from '../../core/notifications';
import type { ChannelNotificationLevelRow, Db } from './db';

/**
 * What each person has asked to be told about each channel.
 *
 * Storage only, in the shape `Devices` is storage only: it knows what somebody
 * chose and nothing about notifications, sound, or Apple. `alertFor` in
 * `core/notifications.ts` is the half that turns a level into a decision, and
 * keeping the two apart is what lets the rule be shared with the app while the
 * table stays on the server.
 *
 * **Only the exceptions are stored.** Somebody who has never opened the
 * setting has no row, which is why every read has a default and why setting
 * the default back is a delete rather than an update — a table of rows all
 * saying "medium" would be a table nobody could scan for anything interesting.
 */
export class NotificationPreferences {
  constructor(private db: Db) {}

  /**
   * How loudly one channel may interrupt one person.
   *
   * Answers for anybody about anything, including a channel they are not in
   * and one that does not exist. That is deliberate: the caller is a send
   * path, and a send path asking about a stale id should get the default and
   * carry on rather than raise. Whether somebody is entitled to a notification
   * at all is settled long before this.
   */
  levelFor(accountId: string, channelId: string): NotificationLevel {
    const row = this.db
      .prepare(
        `SELECT level FROM channel_notification_levels
         WHERE account_id = ? AND channel_id = ?`
      )
      .get(accountId, channelId) as
      | Pick<ChannelNotificationLevelRow, 'level'>
      | undefined;
    return row?.level ?? DEFAULT_NOTIFICATION_LEVEL;
  }

  /**
   * Every level held by these people for one channel, defaults included.
   *
   * One query rather than one per person, because the caller is notifying a
   * roster and would otherwise walk the table once per recipient on a path
   * that runs on every arrival.
   */
  levelsFor(
    accountIds: readonly string[],
    channelId: string
  ): Map<string, NotificationLevel> {
    const levels = new Map<string, NotificationLevel>(
      accountIds.map((id) => [id, DEFAULT_NOTIFICATION_LEVEL])
    );
    if (accountIds.length === 0) return levels;
    const placeholders = accountIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `SELECT account_id, level FROM channel_notification_levels
         WHERE channel_id = ? AND account_id IN (${placeholders})`
      )
      .all(channelId, ...accountIds) as Array<
      Pick<ChannelNotificationLevelRow, 'account_id' | 'level'>
    >;
    for (const row of rows) levels.set(row.account_id, row.level);
    return levels;
  }

  /**
   * Records what somebody chose, or forgets it if they chose the default.
   *
   * The delete is not an optimisation. A row saying `medium` and no row at all
   * mean the same thing today, and would stop meaning the same thing the day
   * the default moves — at which point everybody who had ever opened the
   * screen and left it alone would be pinned to the old arrangement, silently,
   * with no way to tell them apart from the people who meant it.
   */
  set(accountId: string, channelId: string, level: NotificationLevel, now: number): void {
    if (level === DEFAULT_NOTIFICATION_LEVEL) {
      this.db
        .prepare(
          `DELETE FROM channel_notification_levels
           WHERE account_id = ? AND channel_id = ?`
        )
        .run(accountId, channelId);
      return;
    }
    this.db
      .prepare(
        `INSERT INTO channel_notification_levels (account_id, channel_id, level, set_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(account_id, channel_id) DO UPDATE SET level = ?, set_at = ?`
      )
      .run(accountId, channelId, level, now, level, now);
  }
}
