import { randomBytes } from 'node:crypto';
import { MAX_DISPLAY_NAME_LENGTH } from '../../core/constants';
import {
  hashesEqual,
  newId,
  sha256,
  type Db,
  type GuestLinkRow,
  type GuestSessionRow,
} from './db';

/**
 * How long an admitted guest's seat outlives their last sign of life.
 *
 * Long enough that a deploy is survivable — the box restarts, every page
 * reconnects, and the reconnection secret is what stops a guest having to
 * knock again at a channel that may by then have nobody watching for knocks.
 * Short enough that a tab left open overnight is not a standing seat: a guest
 * has no account, so there is nothing anybody could revoke afterwards except
 * this clock and the emptying rule.
 *
 * Refreshed on every sign of life, so it bounds absence rather than a visit.
 */
export const GUEST_SESSION_TTL_MS = 6 * 60 * 60 * 1000;

/** What a guest is called when they do not say. */
export const ANON_NAME_PREFIX = 'Anon ';

/**
 * A newly admitted guest, and the only time their secret exists in the clear.
 *
 * Returned rather than stored: the row holds a hash, exactly as `tokens` does,
 * so this value cannot be recovered from the database and has to reach the
 * page that will use it or be lost.
 */
export interface AdmittedGuest {
  session: GuestSessionRow;
  secret: string;
}

/**
 * The two tables a person with no account leaves behind, and nothing else.
 *
 * Storage only, in the manner of `Devices`: it knows who was let in and what
 * they may do, and it has never heard of LiveKit, of a socket or of the
 * reducer. `ChannelRegistry` owns it and is what turns a row here into a
 * publish grant or a mute — which is what lets every rule below be tested
 * without a media plane.
 *
 * Two things about the lifetime, both of which are the whole reason this class
 * exists rather than a handful of queries scattered through `channels.ts`:
 *
 * - **A row is unusable long before it is gone.** Expiry, ejection and
 *   revocation all say a guest may not come back; none of them deletes
 *   anything. `forgetChannel` is the only removal, and it runs with the
 *   channel's own sweep.
 * - **The emptying of a channel is an event, not a query.** A link is valid
 *   until the channel is emptied of present members — and presence does not
 *   survive a restart, so asking "is anybody present" at boot would find every
 *   channel empty and revoke every outstanding link at every deploy. The
 *   registry calls `channelEmptied` on the transition instead. A restart is
 *   not an emptying: nobody chose to leave.
 */
export class Guests {
  constructor(private db: Db) {}

  // --- Links --------------------------------------------------------------

  /** Mints a link to one channel. The caller has already checked membership. */
  mintLink(channelId: string, accountId: string, now: number): GuestLinkRow {
    // Not `newId`: this one is read aloud, pasted into messages and typed by
    // hand at the far end, and it is the one token here that is not a
    // credential — 24 bytes of base64url with no prefix to say what it opens.
    const token = randomBytes(24).toString('base64url');
    this.db
      .prepare(
        `INSERT INTO guest_links (token, channel_id, created_by, created_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(token, channelId, accountId, now);
    return this.link(token)!;
  }

  /** One link, revoked or not. */
  link(token: string): GuestLinkRow | undefined {
    return this.db
      .prepare('SELECT * FROM guest_links WHERE token = ?')
      .get(token) as unknown as GuestLinkRow | undefined;
  }

  /**
   * The link a knock arrived on, if it still opens anything.
   *
   * The only test is revocation. A link has no clock of its own — that was
   * settled when it stopped expiring after an hour — so what ends it is
   * somebody saying so, a guest of theirs being ejected, or the channel
   * emptying, and all three are written as `revoked_at`.
   */
  liveLink(token: string): GuestLinkRow | undefined {
    const row = this.link(token);
    return row && row.revoked_at === null ? row : undefined;
  }

  /** Every link ever minted for a channel, newest first, for settings. */
  linksFor(channelId: string): GuestLinkRow[] {
    return this.db
      .prepare(
        `SELECT * FROM guest_links WHERE channel_id = ?
         ORDER BY created_at DESC`
      )
      .all(channelId) as unknown as GuestLinkRow[];
  }

  /** A member revokes one link. Idempotent; a second revocation changes nothing. */
  revokeLink(token: string, accountId: string, now: number): boolean {
    const changes = this.db
      .prepare(
        `UPDATE guest_links SET revoked_at = ?, revoked_by = ?
         WHERE token = ? AND revoked_at IS NULL`
      )
      .run(now, accountId, token).changes;
    return Number(changes) > 0;
  }

  /**
   * Every live link to a channel, revoked at once.
   *
   * `by` is null when the emptying rule did it rather than a person, which is
   * the difference settings needs in order not to attribute a rule to whoever
   * happened to leave last.
   */
  revokeChannel(channelId: string, now: number, by: string | null = null): number {
    const changes = this.db
      .prepare(
        `UPDATE guest_links SET revoked_at = ?, revoked_by = ?
         WHERE channel_id = ? AND revoked_at IS NULL`
      )
      .run(now, by, channelId).changes;
    return Number(changes);
  }

  // --- Sessions -----------------------------------------------------------

  /**
   * Admits a guest, which is the moment a row first exists.
   *
   * Nothing is written while somebody is knocking. A knock is a live
   * conversation between a page and the screens of whoever is present, and a
   * process that dies mid-knock leaves a page that knocks again.
   *
   * The name is what they typed, trimmed and bounded like anybody else's, or
   * the next `Anon <n>` for this channel when they said nothing.
   */
  admit(
    channelId: string,
    linkToken: string | null,
    name: string | null,
    admittedBy: string,
    now: number
  ): AdmittedGuest {
    const id = newId('guest');
    const secret = randomBytes(24).toString('base64url');
    const display = this.nameFor(channelId, name);
    this.db
      .prepare(
        `INSERT INTO guest_sessions
           (id, channel_id, link_token, secret_hash, display_name,
            admitted_at, admitted_by, may_speak, last_seen_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
      )
      .run(
        id,
        channelId,
        linkToken,
        sha256(secret),
        display,
        now,
        admittedBy,
        now,
        now + GUEST_SESSION_TTL_MS
      );
    return { session: this.byId(id)!, secret };
  }

  /** One session, live or not. What `fileRun` asks for a name. */
  byId(id: string): GuestSessionRow | undefined {
    return this.db
      .prepare('SELECT * FROM guest_sessions WHERE id = ?')
      .get(id) as unknown as GuestSessionRow | undefined;
  }

  /**
   * What this guest was called, for a recording that captured them.
   *
   * `undefined` rather than a fallback, so the caller decides — `fileRun`
   * freezes names at filing time precisely because an id that resolves to
   * nothing is otherwise dropped silently, and a guest id resolves to nothing
   * everywhere else by construction.
   */
  displayName(id: string): string | undefined {
    return this.byId(id)?.display_name;
  }

  /**
   * Returns the session this secret reopens, and marks it seen.
   *
   * Deliberately indifferent to the link. A guest who was let in has been let
   * in; revoking the link stops *new* people knocking, and if it also ended
   * the seats of everyone already inside then every reconnection would be one
   * revocation away from failing — which is a page that drops out of a
   * conversation because somebody tidied up a link in another screen.
   *
   * What does stop it: ejection, expiry, and the channel emptying, which sets
   * the expiry to now.
   */
  reconnect(id: string, secret: string, now: number): GuestSessionRow | undefined {
    const row = this.byId(id);
    if (!row) return undefined;
    // `>=`, not `>`: `expires_at` is the moment the seat stops being one, and
    // the emptying rule sets it to exactly now. An inclusive reading there
    // would leave a guest reconnecting for the millisecond after the last
    // member walked out.
    if (row.ejected_at !== null || now >= row.expires_at) return undefined;
    if (!hashesEqual(sha256(secret), row.secret_hash)) return undefined;
    this.touch(id, now);
    return this.byId(id);
  }

  /** Everyone still entitled to be in this channel. */
  liveIn(channelId: string, now: number): GuestSessionRow[] {
    return this.db
      .prepare(
        `SELECT * FROM guest_sessions
         WHERE channel_id = ? AND ejected_at IS NULL AND expires_at > ?
         ORDER BY admitted_at ASC`
      )
      .all(channelId, now) as unknown as GuestSessionRow[];
  }

  /** Pushes the seat's deadline out. Called on every sign of life. */
  touch(id: string, now: number): void {
    this.db
      .prepare(
        `UPDATE guest_sessions SET last_seen_at = ?, expires_at = ?
         WHERE id = ? AND ejected_at IS NULL`
      )
      .run(now, now + GUEST_SESSION_TTL_MS, id);
  }

  /**
   * Grants or withdraws the microphone.
   *
   * Durable, which is the one thing about this table that is not obvious.
   * LiveKit runs as its own process on this box, so restarting the server does
   * not take a publish grant back — a guest granted speech is still publishing
   * while this process boots. A permission held only in memory would come back
   * saying "silent" about somebody the room is carrying, and the room wins
   * every argument of that kind.
   */
  setMaySpeak(id: string, maySpeak: boolean, now: number): boolean {
    const changes = this.db
      .prepare(
        `UPDATE guest_sessions SET may_speak = ?, last_seen_at = ?
         WHERE id = ? AND ejected_at IS NULL`
      )
      .run(maySpeak ? 1 : 0, now, id).changes;
    return Number(changes) > 0;
  }

  /**
   * Removes a guest, and closes the door they came through.
   *
   * The implicit revocation is the point: eject somebody holding a link they
   * can open again and you have removed them from the room for as long as it
   * takes them to reload the page. Anyone else admitted through that link
   * keeps their seat — they were let in individually and ejecting one guest is
   * not a statement about the others.
   */
  eject(id: string, accountId: string, now: number): boolean {
    const row = this.byId(id);
    if (!row || row.ejected_at !== null) return false;
    this.db
      .prepare(
        `UPDATE guest_sessions SET ejected_at = ?, expires_at = ?, may_speak = 0
         WHERE id = ?`
      )
      .run(now, now, id);
    if (row.link_token) this.revokeLink(row.link_token, accountId, now);
    return true;
  }

  /**
   * The last present member has gone: the links stop working and the seats
   * stop being seats.
   *
   * Called on the transition, never derived from a count. See the class
   * comment — evaluated as a question at boot this rule would revoke
   * everything, every deploy, because a restart is what empties `present`.
   */
  channelEmptied(channelId: string, now: number): void {
    this.revokeChannel(channelId, now);
    this.db
      .prepare(
        `UPDATE guest_sessions SET expires_at = ?
         WHERE channel_id = ? AND expires_at > ?`
      )
      .run(now, channelId, now);
  }

  /**
   * Removes both tables' rows for a channel. The only deletion here.
   *
   * Called by the sweep, immediately before the channel's own row goes, and
   * that ordering is a constraint rather than a preference: `DELETE FROM
   * channels` is guarded by a `NOT EXISTS` against recordings and by nothing
   * else, so a guest row still pointing at the channel does not make the sweep
   * skip it — it makes the sweep throw, on a timer, an hour after anybody did
   * anything.
   *
   * Nothing shorter-lived deletes these, deliberately. A guest can leave, and
   * their seat expire, while the run that captured them is still capturing;
   * `fileRun` needs the name at the end of it, and a rule about which sweep may
   * run first is a worse answer than keeping a row that costs a few bytes.
   */
  forgetChannel(channelId: string): void {
    this.db
      .prepare('DELETE FROM guest_sessions WHERE channel_id = ?')
      .run(channelId);
    this.db.prepare('DELETE FROM guest_links WHERE channel_id = ?').run(channelId);
  }

  // --- Naming -------------------------------------------------------------

  /**
   * What to call somebody who did not say, or what to make of what they typed.
   *
   * The number counts every session this channel has ever held rather than the
   * ones still in it, which is the second reason rows outlive a disconnect: a
   * guest who leaves and a guest who is thrown out both stop being present,
   * and neither should hand their number to whoever arrives next. Two guests
   * called Anon 2, one of whom is in a recording, is a conversation nobody can
   * later read.
   */
  private nameFor(channelId: string, typed: string | null): string {
    const trimmed = (typed ?? '').trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
    if (trimmed) return trimmed;
    const { n } = this.db
      .prepare('SELECT count(*) AS n FROM guest_sessions WHERE channel_id = ?')
      .get(channelId) as { n: number };
    return `${ANON_NAME_PREFIX}${Number(n) + 1}`;
  }
}
