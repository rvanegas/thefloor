import type { BadgeSetter, PushResult } from './push';

/**
 * Keeps the number on each person's app icon equal to what is waiting for
 * them — `badgeCount` in core/badge.ts, which says what that is.
 *
 * **Driven by Home changing**, because everything the number counts is a row
 * on Home: whoever a Home push is aimed at is whoever's count may have moved.
 * That is far more often than it actually moves — a mute is a channel change —
 * so the count is recomputed and **sent only when it differs from the last one
 * sent to that person**, which is the whole of what keeps this from being a
 * push per floor claim.
 *
 * **Coalesced for `delayMs`**, so a room that fills, a phone that drops and
 * rejoins, or a burst of changes in one transition is one push carrying where
 * it settled rather than several carrying the way there.
 *
 * **What was last sent is held in memory and forgotten on restart**, which
 * costs one push per person on their next change, carrying a number their
 * icon may already show. Persisting it would buy nothing a restart is owed.
 *
 * **`resend` forgets it for one person and sends at once**, for the moment an
 * address is registered: that request comes on every launch, it is a new
 * install's first chance to be given a number at all, and an icon showing a
 * number from before a reinstall is the case nothing else would correct.
 */
export class BadgeKeeper {
  private sent = new Map<string, number>();
  private pending = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private deps: {
      setter: BadgeSetter;
      /** What should be on this person's icon now. */
      countFor: (userId: string) => number;
      /**
       * The iOS addresses to send it to, or none when this person has
       * switched notifications off in Floor Settings.
       */
      addressesFor: (userIds: readonly string[]) => Map<string, string[]>;
      onResult?: (userId: string, result: PushResult) => void;
      delayMs?: number;
    }
  ) {}

  /** These people's counts may have moved. */
  refresh(userIds: readonly string[]): void {
    for (const id of userIds) this.pending.add(id);
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.deps.delayMs ?? 2000);
    this.timer.unref?.();
  }

  /** Sends this person's count now, whatever was sent before. */
  resend(userId: string): void {
    this.sent.delete(userId);
    this.pending.delete(userId);
    this.send([userId]);
  }

  /**
   * Takes the number off these addresses, for somebody who has just switched
   * notifications off: `addressesFor` stops offering them from then on, so
   * without this the icon would keep whatever it last showed for good.
   */
  clear(userId: string, tokens: readonly string[]): void {
    this.sent.delete(userId);
    for (const token of tokens) {
      void this.deps.setter
        .setBadge(token, 0)
        .then((result) => this.deps.onResult?.(userId, result));
    }
  }

  /** Sends whatever is pending now. Exposed for tests and for shutdown. */
  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const ids = [...this.pending];
    this.pending.clear();
    this.send(ids);
  }

  private send(userIds: readonly string[]): void {
    if (userIds.length === 0) return;
    const addresses = this.deps.addressesFor(userIds);
    for (const id of userIds) {
      const tokens = addresses.get(id) ?? [];
      // Nobody to tell, so nothing is recorded as told: an address that
      // arrives later is given the count by `resend`.
      if (tokens.length === 0) continue;
      const count = this.deps.countFor(id);
      if (this.sent.get(id) === count) continue;
      this.sent.set(id, count);
      for (const token of tokens) {
        void this.deps.setter
          .setBadge(token, count)
          .then((result) => this.deps.onResult?.(id, result));
      }
    }
  }
}
