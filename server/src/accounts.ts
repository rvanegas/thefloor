import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { PublicAccount } from '../../core/protocol';
import { newId, pairKey, sha256, type AccountRow, type Db } from './db';

export const OTP_TTL_MS = 10 * 60 * 1000;
/**
 * Minimum gap between codes for one identifier. Issuing now sends real email,
 * so an unthrottled endpoint is a way to bill someone else's SES account and to
 * bury a stranger's inbox.
 */
export const OTP_RESEND_INTERVAL_MS = 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export class Accounts {
  constructor(private db: Db) {}

  // --- Lookup -------------------------------------------------------------

  byId(id: string): AccountRow | undefined {
    return this.db
      .prepare('SELECT * FROM accounts WHERE id = ?')
      .get(id) as AccountRow | undefined;
  }

  /**
   * Exact match on the whole identifier, case-insensitively. Deliberately not a
   * prefix search: you should not be able to enumerate strangers by typing.
   */
  byIdentifier(identifier: string): AccountRow | undefined {
    return this.db
      .prepare('SELECT * FROM accounts WHERE identifier = ? COLLATE NOCASE')
      .get(normalize(identifier)) as AccountRow | undefined;
  }

  public(id: string): PublicAccount | null {
    const row = this.byId(id);
    return row ? { id: row.id, displayName: row.display_name } : null;
  }

  // --- One-time codes -----------------------------------------------------

  /**
   * Issues a code and returns it. Delivery is the caller's problem — in
   * development it is logged rather than sent, which is why this returns it at
   * all. A real SMS/email transport replaces that without touching this.
   */
  /**
   * Issues a code, or returns null if one was issued for this identifier less
   * than a minute ago. Callers should report success either way — whether a
   * code was just sent is not something an unauthenticated caller should learn.
   */
  issueCode(identifier: string, now: number): string | null {
    const id = normalize(identifier);

    const existing = this.db
      .prepare('SELECT created_at FROM otp_codes WHERE identifier = ?')
      .get(id) as { created_at: number } | undefined;
    if (existing && now - existing.created_at < OTP_RESEND_INTERVAL_MS) {
      return null;
    }

    const code = String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(
      6,
      '0'
    );
    this.db
      .prepare(
        `INSERT INTO otp_codes (identifier, code_hash, expires_at, attempts, created_at)
         VALUES (?, ?, ?, 0, ?)
         ON CONFLICT(identifier) DO UPDATE SET
           code_hash = excluded.code_hash,
           expires_at = excluded.expires_at,
           attempts = 0,
           created_at = excluded.created_at`
      )
      .run(id, sha256(code), now + OTP_TTL_MS, now);
    return code;
  }

  /**
   * Verifies a code and signs in, creating the account on first use. Returns
   * null on any failure — expired, wrong, or too many attempts — without
   * distinguishing them to the caller, so the endpoint cannot be used to probe
   * which identifiers exist.
   */
  verifyCode(
    identifier: string,
    code: string,
    displayName: string | undefined,
    now: number
  ): { account: AccountRow; token: string } | null {
    const id = normalize(identifier);
    const row = this.db
      .prepare('SELECT * FROM otp_codes WHERE identifier = ?')
      .get(id) as
      | { code_hash: string; expires_at: number; attempts: number }
      | undefined;

    if (!row) return null;
    if (now > row.expires_at || row.attempts >= OTP_MAX_ATTEMPTS) {
      this.db.prepare('DELETE FROM otp_codes WHERE identifier = ?').run(id);
      return null;
    }

    if (!constantTimeEquals(sha256(code.trim()), row.code_hash)) {
      this.db
        .prepare(
          'UPDATE otp_codes SET attempts = attempts + 1 WHERE identifier = ?'
        )
        .run(id);
      return null;
    }

    this.db.prepare('DELETE FROM otp_codes WHERE identifier = ?').run(id);
    return this.establish(id, displayName, now);
  }

  /**
   * Signs in, creating the account on first sight, and issues a token. This is
   * the step that follows a *successful* check — callers are responsible for
   * having done the checking.
   */
  establish(
    identifier: string,
    displayName: string | undefined,
    now: number
  ): { account: AccountRow; token: string } {
    const id = normalize(identifier);
    let account = this.byIdentifier(id);
    if (!account) {
      const accountId = newId('acct');
      this.db
        .prepare(
          'INSERT INTO accounts (id, identifier, display_name, created_at) VALUES (?, ?, ?, ?)'
        )
        .run(accountId, id, displayName?.trim() || id, now);
      account = this.byId(accountId)!;
    }
    return { account, token: this.issueToken(account.id, now) };
  }

  // --- Tokens -------------------------------------------------------------

  issueToken(accountId: string, now: number): string {
    const token = randomBytes(32).toString('base64url');
    this.db
      .prepare(
        'INSERT INTO tokens (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
      )
      .run(sha256(token), accountId, now, now + TOKEN_TTL_MS);
    return token;
  }

  accountForToken(token: string, now: number): AccountRow | undefined {
    const row = this.db
      .prepare('SELECT account_id, expires_at FROM tokens WHERE token_hash = ?')
      .get(sha256(token)) as
      | { account_id: string; expires_at: number }
      | undefined;
    if (!row || now > row.expires_at) return undefined;
    return this.byId(row.account_id);
  }

  revokeToken(token: string): void {
    this.db.prepare('DELETE FROM tokens WHERE token_hash = ?').run(sha256(token));
  }

  // --- Contacts -----------------------------------------------------------

  contactsFor(userId: string): Array<{ account: AccountRow; status: string }> {
    const rows = this.db
      .prepare('SELECT * FROM contacts WHERE a_id = ? OR b_id = ?')
      .all(userId, userId) as unknown as Array<{
      a_id: string;
      b_id: string;
      state: string;
      requester_id: string;
    }>;

    const entries = rows.flatMap((row) => {
      const otherId = row.a_id === userId ? row.b_id : row.a_id;
      const account = this.byId(otherId);
      if (!account) return [];
      const status =
        row.state === 'accepted'
          ? 'accepted'
          : row.requester_id === userId
            ? 'outgoing'
            : 'incoming';
      return [{ account, status }];
    });

    const rank = (s: string) =>
      s === 'incoming' ? 0 : s === 'accepted' ? 1 : 2;
    return entries.sort(
      (x, y) =>
        rank(x.status) - rank(y.status) ||
        x.account.display_name.localeCompare(y.account.display_name)
    );
  }

  contactState(x: string, y: string): { state: string; requester: string } | null {
    const [a, b] = pairKey(x, y);
    const row = this.db
      .prepare('SELECT state, requester_id FROM contacts WHERE a_id = ? AND b_id = ?')
      .get(a, b) as { state: string; requester_id: string } | undefined;
    return row ? { state: row.state, requester: row.requester_id } : null;
  }

  areContacts(x: string, y: string): boolean {
    return this.contactState(x, y)?.state === 'accepted';
  }

  /** Adding is never one-directional; the pair is mutual only once accepted. */
  requestContact(
    from: string,
    identifier: string,
    now: number
  ): { ok: true; accepted: boolean } | { ok: false; error: string } {
    const target = this.byIdentifier(identifier);
    if (!target) return { ok: false, error: 'No account with that phone or email.' };
    if (target.id === from) return { ok: false, error: 'That’s you.' };

    const existing = this.contactState(from, target.id);
    if (existing?.state === 'accepted') {
      return { ok: false, error: 'Already a contact.' };
    }
    if (existing?.state === 'pending') {
      if (existing.requester === from) {
        return { ok: false, error: 'Request already sent.' };
      }
      // They asked first; treat this as accepting.
      this.acceptContact(from, target.id);
      return { ok: true, accepted: true };
    }

    const [a, b] = pairKey(from, target.id);
    this.db
      .prepare(
        'INSERT INTO contacts (a_id, b_id, state, requester_id, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(a, b, 'pending', from, now);
    return { ok: true, accepted: false };
  }

  /** Only the recipient may accept — the requester cannot accept their own. */
  acceptContact(userId: string, otherId: string): boolean {
    const [a, b] = pairKey(userId, otherId);
    const existing = this.contactState(userId, otherId);
    if (!existing || existing.state !== 'pending') return false;
    if (existing.requester === userId) return false;
    this.db
      .prepare(
        "UPDATE contacts SET state = 'accepted' WHERE a_id = ? AND b_id = ?"
      )
      .run(a, b);
    return true;
  }

  declineContact(userId: string, otherId: string): boolean {
    const [a, b] = pairKey(userId, otherId);
    const existing = this.contactState(userId, otherId);
    if (!existing || existing.state !== 'pending') return false;
    this.db
      .prepare('DELETE FROM contacts WHERE a_id = ? AND b_id = ?')
      .run(a, b);
    return true;
  }
}

function normalize(identifier: string): string {
  return identifier.trim();
}

function constantTimeEquals(x: string, y: string): boolean {
  const a = Buffer.from(x);
  const b = Buffer.from(y);
  return a.length === b.length && timingSafeEqual(a, b);
}
