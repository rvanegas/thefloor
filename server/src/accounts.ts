import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { ProfileView, PublicAccount } from '../../core/protocol';
import { MAX_BIO_LENGTH, MAX_DISPLAY_NAME_LENGTH } from '../../core/constants';
import {
  insertWithUniqueKey,
  newId,
  pairKey,
  sha256,
  type AccountRow,
  type Db,
} from './db';

export const OTP_TTL_MS = 10 * 60 * 1000;
/**
 * Minimum gap between codes for one identifier. Issuing now sends real email,
 * so an unthrottled endpoint is a way to bill someone else's SES account and to
 * bury a stranger's inbox.
 */
export const OTP_RESEND_INTERVAL_MS = 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * How long a request to an address with no account waits for that address to
 * sign up.
 *
 * There has to be a deadline, because an invite resolves the *first* time its
 * address signs in and nothing else ever removes one. Without this, somebody
 * joining years from now could be handed a contact request from a stranger,
 * dated before they had heard of the app — the feature working exactly as
 * designed, and not what anyone would expect. Thirty days rather than ninety
 * for that reason, and because it clears a mistyped address out of the
 * sender's list while they might still remember sending it.
 */
export const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * How often expired rows are swept. Every deadline here is far longer than the
 * interval, so this figure decides only how long dead rows linger — never
 * whether something expires on time, which is enforced on read regardless.
 */
export const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

export class Accounts {
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private db: Db) {}

  // --- Maintenance --------------------------------------------------------

  /**
   * Begins sweeping, and sweeps once straight away so a server that has been
   * down for a while does not carry the backlog until the first interval.
   *
   * Takes the clock rather than reading one, so the sweep agrees with whatever
   * the rest of the application believes the time to be. Reading `Date.now()`
   * in here would make this the single component that disagrees — harmless in
   * production and wrong everywhere else.
   */
  start(now: () => number = Date.now): void {
    if (this.sweepTimer) return;
    this.sweepExpired(now());
    this.sweepTimer = setInterval(
      () => this.sweepExpired(now()),
      SWEEP_INTERVAL_MS
    );
    this.sweepTimer.unref?.();
  }

  stop(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }

  /**
   * Deletes rows that can no longer do anything, and reports what went.
   *
   * This changes no behaviour: nothing here is honoured past its deadline
   * anyway — `verifyCode` refuses an expired code and deletes it on sight,
   * `accountForToken` refuses an expired token, and an invite past its TTL is
   * one nobody should be handed. It exists because nothing else bounds these
   * tables. A code nobody returns to enter, a token belonging to a phone that
   * was reinstalled rather than signed out of, or a request to an address that
   * never signs up, would otherwise sit there for the life of the database.
   */
  sweepExpired(now: number): {
    codes: number;
    invites: number;
    tokens: number;
  } {
    const codes = this.db
      .prepare('DELETE FROM otp_codes WHERE expires_at <= ?')
      .run(now).changes;
    const invites = this.db
      .prepare('DELETE FROM pending_invites WHERE created_at <= ?')
      .run(now - INVITE_TTL_MS).changes;
    const tokens = this.db
      .prepare('DELETE FROM tokens WHERE expires_at <= ?')
      .run(now).changes;
    return {
      codes: Number(codes),
      invites: Number(invites),
      tokens: Number(tokens),
    };
  }

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

  /**
   * Writes a person's own profile.
   *
   * Both fields are optional and absent means unchanged, so the client can
   * save one without having to send the other and without a blank field
   * silently erasing something.
   *
   * Normalised the same way a channel's name and description are: a display
   * name is trimmed and capped, and a blank one is refused rather than
   * accepted, because a person with no name at all appears as an empty space
   * in every roster. A bio is trimmed at the ends only — its interior is
   * Markdown, where a blank line is a paragraph break — and blank clears it.
   */
  updateProfile(
    accountId: string,
    changes: { displayName?: string; bio?: string }
  ): AccountRow | undefined {
    const account = this.byId(accountId);
    if (!account) return undefined;

    if (changes.displayName !== undefined) {
      const name = changes.displayName.trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
      if (name !== '') {
        this.db
          .prepare('UPDATE accounts SET display_name = ? WHERE id = ?')
          .run(name, accountId);
      }
    }

    if (changes.bio !== undefined) {
      const bio = changes.bio.trim().slice(0, MAX_BIO_LENGTH);
      this.db
        .prepare('UPDATE accounts SET bio = ? WHERE id = ?')
        .run(bio === '' ? null : bio, accountId);
    }

    return this.byId(accountId);
  }

  /** A person's profile, for anyone entitled to see it. */
  profile(id: string): ProfileView | null {
    const row = this.byId(id);
    if (!row) return null;
    return {
      account: { id: row.id, displayName: row.display_name },
      bio: row.bio ?? null,
    };
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
   *
   * A name given here always takes effect, on an existing account as much as a
   * new one. Signing out and back in is therefore how someone corrects it;
   * without that, a typo made once at signup would be permanent. Omitting the
   * name keeps whatever is already there.
   */
  establish(
    identifier: string,
    displayName: string | undefined,
    now: number
  ): { account: AccountRow; token: string } {
    const id = normalize(identifier);
    const name = displayName?.trim();
    let account = this.byIdentifier(id);

    if (!account) {
      // A second signup on one address collides on `identifier`, not on the
      // primary key, so it still fails here rather than looping — which is
      // right, since another account id would not make the address free.
      const accountId = insertWithUniqueKey(
        () => newId('acct'),
        (candidate) =>
          this.db
            .prepare(
              'INSERT INTO accounts (id, identifier, display_name, created_at) VALUES (?, ?, ?, ?)'
            )
            .run(candidate, id, name || id, now)
      );
      account = this.byId(accountId)!;
      this.resolveInvitesFor(account);
    } else if (name && name !== account.display_name) {
      this.db
        .prepare('UPDATE accounts SET display_name = ? WHERE id = ?')
        .run(name, account.id);
      account = this.byId(account.id)!;
    }

    return { account, token: this.issueToken(account.id, now) };
  }

  // --- Tokens -------------------------------------------------------------

  /**
   * Issues a session token, ending every session this account already had.
   *
   * One session per account, deliberately. Signing in elsewhere is the only
   * signal available that a device may no longer be in the owner's hands — a
   * lost phone cannot be revoked any other way, since nothing else in the
   * product lists or cancels a session, and the token would otherwise stay
   * good for ninety days. The cost is that a genuine second device signs the
   * first one out, which is the trade named in BACKLOG and accepted.
   */
  issueToken(accountId: string, now: number): string {
    this.revokeAllForAccount(accountId);
    // The token itself is what is minted, so a retry hands the caller a fresh
    // secret rather than reusing one whose hash is already stored against
    // somebody else's account.
    return insertWithUniqueKey(
      () => randomBytes(32).toString('base64url'),
      (token) =>
        this.db
          .prepare(
            'INSERT INTO tokens (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
          )
          .run(sha256(token), accountId, now, now + TOKEN_TTL_MS)
    );
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

  /**
   * Ends every session for one account, and says how many there were.
   *
   * This is what `tokens_account` was indexed for. It is the only operation
   * that can reach a session whose token you do not hold — signing out from
   * the device you have cannot revoke the one you lost.
   */
  revokeAllForAccount(accountId: string): number {
    return Number(
      this.db
        .prepare('DELETE FROM tokens WHERE account_id = ?')
        .run(accountId).changes
    );
  }

  // --- Contacts -----------------------------------------------------------

  /**
   * Turns requests sent to this address before it had an account into real
   * pending contact requests, now that it does.
   *
   * Someone who signs up therefore finds whoever invited them already waiting,
   * which is the point of storing the request in the first place.
   */
  private resolveInvitesFor(account: AccountRow): void {
    const invites = this.db
      .prepare(
        'SELECT requester_id FROM pending_invites WHERE identifier = ? COLLATE NOCASE'
      )
      .all(account.identifier) as Array<{ requester_id: string }>;

    for (const { requester_id } of invites) {
      if (requester_id === account.id) continue;
      const [a, b] = pairKey(requester_id, account.id);
      this.db
        .prepare(
          `INSERT OR IGNORE INTO contacts (a_id, b_id, state, requester_id, created_at)
           VALUES (?, ?, 'pending', ?, ?)`
        )
        .run(a, b, requester_id, account.created_at);
    }

    this.db
      .prepare('DELETE FROM pending_invites WHERE identifier = ? COLLATE NOCASE')
      .run(account.identifier);
  }

  /**
   * The contact list, including requests sent to addresses with no account.
   *
   * An outgoing request is shown as the address it was sent to rather than the
   * recipient's name, and carries no account id. That is what makes a request
   * to a real account and one to an address that does not exist identical:
   * showing a display name for one and an address for the other would answer
   * the question the pending_invites table exists to avoid answering. The name
   * appears when they accept, which is also when it starts to mean anything.
   */
  contactsFor(
    userId: string
  ): Array<{ account: { id: string; displayName: string }; status: string }> {
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
      const view =
        status === 'outgoing'
          ? { id: '', displayName: account.identifier }
          : { id: account.id, displayName: account.display_name };
      return [{ account: view, status }];
    });

    // Requests to addresses that have no account yet, shown exactly as above.
    const invites = this.db
      .prepare(
        'SELECT identifier FROM pending_invites WHERE requester_id = ?'
      )
      .all(userId) as Array<{ identifier: string }>;
    for (const invite of invites) {
      entries.push({
        account: { id: '', displayName: invite.identifier },
        status: 'outgoing',
      });
    }

    const rank = (s: string) =>
      s === 'incoming' ? 0 : s === 'accepted' ? 1 : 2;
    return entries.sort(
      (x, y) =>
        rank(x.status) - rank(y.status) ||
        x.account.displayName.localeCompare(y.account.displayName)
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
  ):
    // targetId is null when the address has no account yet: there is nobody to
    // notify, which the caller has to know without the answer reaching a user.
    | { ok: true; accepted: boolean; targetId: string | null }
    | { ok: false; error: string } {
    const id = normalize(identifier);
    const target = this.byIdentifier(id);

    // No account with that address: the request is stored against the address
    // itself and resolves if they ever sign up. Deliberately indistinguishable
    // from a request to a real account — refusing here would answer whether an
    // address has an account, one guess at a time.
    if (!target) {
      const me = this.byId(from);
      if (me && me.identifier.toLowerCase() === id.toLowerCase()) {
        return { ok: false, error: 'That’s you.' };
      }
      const already = this.db
        .prepare(
          'SELECT 1 FROM pending_invites WHERE requester_id = ? AND identifier = ? COLLATE NOCASE'
        )
        .get(from, id);
      if (already) return { ok: false, error: 'Request already sent.' };

      this.db
        .prepare(
          'INSERT INTO pending_invites (requester_id, identifier, created_at) VALUES (?, ?, ?)'
        )
        .run(from, id, now);
      return { ok: true, accepted: false, targetId: null };
    }

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
      return { ok: true, accepted: true, targetId: target.id };
    }

    const [a, b] = pairKey(from, target.id);
    this.db
      .prepare(
        'INSERT INTO contacts (a_id, b_id, state, requester_id, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(a, b, 'pending', from, now);
    return { ok: true, accepted: false, targetId: target.id };
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

  /**
   * Takes back a request the caller sent, identified by the address it was
   * sent to.
   *
   * The address rather than a row id, on purpose: outgoing rows carry an empty
   * account id so that a request to a stranger and one to a real user look the
   * same, and an id-based withdrawal would hand back the very distinction that
   * emptiness exists to withhold. The address is also the one thing the sender
   * already knows. Whichever form the request took — a `pending_invites` row
   * for an address with no account, or a pending `contacts` row for one with —
   * the same call removes it, and the answer does not say which it was.
   *
   * Only the requester's own request: the recipient of a pending contact has
   * `declineContact`, and an accepted contact is not a request any more.
   */
  withdrawRequest(
    from: string,
    identifier: string
  ): { withdrawn: boolean; targetId: string | null } {
    const id = normalize(identifier);
    const invites = this.db
      .prepare(
        'DELETE FROM pending_invites WHERE requester_id = ? AND identifier = ? COLLATE NOCASE'
      )
      .run(from, id);
    if (invites.changes > 0) return { withdrawn: true, targetId: null };

    const target = this.byIdentifier(id);
    if (!target) return { withdrawn: false, targetId: null };
    const existing = this.contactState(from, target.id);
    if (
      !existing ||
      existing.state !== 'pending' ||
      existing.requester !== from
    ) {
      return { withdrawn: false, targetId: null };
    }
    const [a, b] = pairKey(from, target.id);
    this.db
      .prepare('DELETE FROM contacts WHERE a_id = ? AND b_id = ?')
      .run(a, b);
    return { withdrawn: true, targetId: target.id };
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
