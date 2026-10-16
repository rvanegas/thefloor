import { randomBytes } from 'node:crypto';

import type { Accounts, InviteRefusal } from './accounts';
import { INVITE_TTL_MS } from './accounts';
import { insertWithUniqueKey, newId, type Db } from './db';

export interface MemberPinRow {
  id: string;
  owner_id: string;
  pin: string;
  channel_id: string;
  created_at: number;
  expires_at: number;
  used_at: number | null;
  used_by: string | null;
  withdrawn_at: number | null;
}

/**
 * How long a member link holds its place: the invite link's thirty days, the
 * two being one shape of link with two different things at the end of it.
 */
export const MEMBER_LINK_TTL_MS = INVITE_TTL_MS;

/**
 * **Member links: `/m/<username>/<pin>`**, since 2026-10-16 — *Invite as
 * member* on a channel's *People* tab, for somebody who is not a contact. The
 * invite link's shape, deliberately (`/i/<username>/<pin>`): the username says
 * whose it is, six digits make it good for one person, a wrong guess is
 * counted against that owner in the same budget, and it lasts thirty days. What
 * differs is what it opens — **a membership of one channel and nothing else**,
 * never a contact, which is a community link's rule.
 *
 * **It holds a place** among the channel's members until it is followed, taken
 * back or expires (`membersPromised` in core), so the row here is the durable
 * half and `ChannelState.memberLinks` the room's picture of it, projected back
 * on a revive — the pairing guest invitations have with `guest_sessions`.
 */
export class MemberLinks {
  constructor(
    private db: Db,
    private accounts: Accounts
  ) {}

  /** A new link for `channelId`, made by `ownerId`. */
  mint(channelId: string, ownerId: string, now: number): MemberPinRow {
    const id = newId('ml');
    const expires = now + MEMBER_LINK_TTL_MS;
    const pin = insertWithUniqueKey(
      () => String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0'),
      (candidate) => {
        this.db
          .prepare(
            `INSERT INTO member_pins (id, owner_id, pin, channel_id, created_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(id, ownerId, candidate, channelId, now, expires);
      }
    );
    return this.byId(id) ?? {
      id,
      owner_id: ownerId,
      pin,
      channel_id: channelId,
      created_at: now,
      expires_at: expires,
      used_at: null,
      used_by: null,
      withdrawn_at: null,
    };
  }

  byId(id: string): MemberPinRow | undefined {
    return this.db.prepare('SELECT * FROM member_pins WHERE id = ?').get(id) as
      | MemberPinRow
      | undefined;
  }

  /**
   * Whether a pin beside this owner's username is there to take — the invite
   * pin's answers and the same budget (`Accounts.invitePinState`): a wrong pin
   * is counted, a right one that cannot be used is not. A link taken back
   * answers as one that never existed, since nothing about it is worth
   * telling a stranger.
   */
  state(
    ownerId: string,
    pin: string,
    now: number
  ): { ok: true; row: MemberPinRow } | { ok: false; reason: InviteRefusal } {
    if (this.accounts.inviteLocked(ownerId, now)) return { ok: false, reason: 'locked' };
    const row = this.db
      .prepare('SELECT * FROM member_pins WHERE owner_id = ? AND pin = ?')
      .get(ownerId, pin.trim()) as MemberPinRow | undefined;
    if (!row || row.withdrawn_at !== null) {
      if (!row) this.accounts.countInviteGuess(ownerId, now);
      return { ok: false, reason: 'unknown' };
    }
    if (row.used_at !== null) return { ok: false, reason: 'used' };
    if (row.expires_at <= now) return { ok: false, reason: 'expired' };
    return { ok: true, row };
  }

  /** Marks a link followed, by whom. */
  spend(id: string, userId: string, now: number): void {
    this.db
      .prepare('UPDATE member_pins SET used_at = ?, used_by = ? WHERE id = ? AND used_at IS NULL')
      .run(now, userId, id);
  }

  /** Takes a link back. */
  withdraw(id: string, now: number): void {
    this.db
      .prepare(
        'UPDATE member_pins SET withdrawn_at = ? WHERE id = ? AND used_at IS NULL AND withdrawn_at IS NULL'
      )
      .run(now, id);
  }

  /** The links standing for a channel, oldest first — what a revive projects. */
  pendingIn(channelId: string, now: number): MemberPinRow[] {
    return this.db
      .prepare(
        `SELECT * FROM member_pins
         WHERE channel_id = ? AND used_at IS NULL AND withdrawn_at IS NULL AND expires_at > ?
         ORDER BY created_at`
      )
      .all(channelId, now) as unknown as MemberPinRow[];
  }
}
