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

  /**
   * `review` names the one address whose code is fixed, so that App Review can
   * sign in without an inbox. Absent in normal operation, and absent is the
   * only configuration in which every code is random.
   */
  constructor(
    private db: Db,
    private review?: { identifier: string; code: string }
  ) {}

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

  /**
   * Records that this person has the app open.
   *
   * Called as a socket opens, on every message it carries, and as it closes.
   * Writing on each message rather than only at the edges is what keeps the
   * value true for somebody who has been connected for hours: the client
   * heartbeats, so the stored time is never more than one interval stale, and
   * "connected since Tuesday" never reads as "last seen Tuesday".
   *
   * The cost is one small UPDATE per client per heartbeat, which at this scale
   * is nothing. If it ever stops being nothing, the fix is to write only when
   * the stored value is older than an interval, not to move the call.
   */
  markSeen(id: string, now: number): void {
    this.db
      .prepare('UPDATE accounts SET last_seen_at = ? WHERE id = ?')
      .run(now, id);
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

    // The review address gets its fixed code; everyone else, four bytes of
    // randomness. Placed after the throttle rather than before it so that the
    // reviewer's path is the ordinary one in every respect but the digits —
    // there is no point in a sign-in that App Review can use and nobody else
    // exercises.
    const code =
      this.review && sameIdentifier(id, this.review.identifier)
        ? this.review.code
        : String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0');
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
  contactsFor(userId: string): Array<{
    account: { id: string; displayName: string };
    status: string;
    lastSeenAt: number | null;
  }> {
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
      // An outgoing request shows the *address* in the name slot, which reads
      // as though the two were interchangeable and means the opposite: until
      // they accept, there is a row here and not yet a person, and their name
      // is theirs to give out. Nothing in this server ever looks an account up
      // by `display_name` — see DECISIONS.md, which this line has already sent
      // one reader to the wrong conclusion without.
      const view =
        status === 'outgoing'
          ? { id: '', displayName: account.identifier }
          : { id: account.id, displayName: account.display_name };
      // Withheld from an outgoing request for the same reason the name is:
      // that row is an address, not yet a person, and whether somebody is
      // behind it is precisely what it must not reveal.
      const lastSeenAt =
        status === 'outgoing' ? null : (account.last_seen_at ?? null);
      return [{ account: view, status, lastSeenAt }];
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
        lastSeenAt: null,
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

    return this.requestKnown(from, target.id, now);
  }

  /**
   * Asks somebody to be a contact when you already know who they are.
   *
   * The point of it existing separately from `requestContact` is that you can
   * meet somebody in a channel an acquaintance brought you both into, and know
   * their name and their account id while having no idea of their address.
   * Requesting them through the by-address path would mean showing you the
   * address first, which is theirs to give out rather than ours.
   *
   * Whether you are entitled to ask at all is the caller's check — sharing a
   * channel, in practice — because an id you can ask about is otherwise an id
   * anyone can pester.
   */
  requestContactById(
    from: string,
    targetId: string,
    now: number
  ): { ok: true; accepted: boolean } | { ok: false; error: string } {
    if (!this.byId(targetId)) return { ok: false, error: 'No such person.' };
    const result = this.requestKnown(from, targetId, now);
    return result.ok ? { ok: true, accepted: result.accepted } : result;
  }

  /**
   * The half of a request that applies once the other person is known to
   * exist, shared by both ways of naming them.
   */
  private requestKnown(
    from: string,
    targetId: string,
    now: number
  ):
    | { ok: true; accepted: boolean; targetId: string }
    | { ok: false; error: string } {
    if (targetId === from) return { ok: false, error: 'That’s you.' };

    const existing = this.contactState(from, targetId);
    if (existing?.state === 'accepted') {
      return { ok: false, error: 'Already a contact.' };
    }
    if (existing?.state === 'pending') {
      if (existing.requester === from) {
        return { ok: false, error: 'Request already sent.' };
      }
      // They asked first; treat this as accepting.
      this.acceptContact(from, targetId);
      return { ok: true, accepted: true, targetId };
    }

    const [a, b] = pairKey(from, targetId);
    this.db
      .prepare(
        'INSERT INTO contacts (a_id, b_id, state, requester_id, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(a, b, 'pending', from, now);
    return { ok: true, accepted: false, targetId };
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

  // --- Erasure ------------------------------------------------------------

  /**
   * Everybody who would notice this account going: their contacts, requested
   * and accepted alike. Read before `erase` runs, since afterwards there is no
   * row left to read it from.
   *
   * Addresses invited but never signed up carry no id and are dropped — there
   * is nobody to tell.
   */
  audienceFor(accountId: string): string[] {
    return this.contactsFor(accountId)
      .map((entry) => entry.account.id)
      .filter(Boolean);
  }

  /**
   * Deletes an account: everything that made it a person, and everything only
   * it could act through.
   *
   * **The row itself survives, emptied, and that is not a hedge.** Every channel
   * ever started carries `initiator_id` and `invitee_id` as real foreign keys
   * into this table — including channels that other people are still talking in,
   * and channels long ended that anchor their recordings. Removing the row would
   * either break those constraints or require rewriting other people's history
   * to say somebody else started it. What is left behind is a tombstone: no
   * address, no name, no bio, nothing anybody can sign in as and nothing that
   * describes a human being. `public()` gives it the same shape as any other
   * account, so a stale id in an old participant list resolves to something
   * rather than to nothing, and every screen already falls back gracefully when
   * it does not.
   *
   * The identifier is replaced rather than nulled — the column is NOT NULL
   * UNIQUE, and a value derived from the id is unique by construction. It is
   * deliberately not an email address, so the same person signing up again gets
   * a genuinely new account rather than walking back into this one.
   *
   * What goes with it:
   *
   * - **Contacts**, both directions and both states. Nobody keeps a relationship
   *   with an account that is gone, and nobody is left holding the address.
   * - **Invitations**, sent and received: rows this account sent to addresses
   *   that never signed up, and rows other people sent to *its* address, which
   *   would otherwise resolve into a contact request from a stranger if that
   *   address ever signed up again.
   * - **Sign-in codes and tokens**, so every device is signed out at once,
   *   including any this person no longer has.
   *
   * Donations are **unlinked rather than deleted**: they are money that changed
   * hands, Ko-fi holds the authoritative record either way, and a payment
   * disappearing from this side because the payer left would leave the two ends
   * disagreeing with nothing to reconcile from. `matched_by` goes with the link
   * it describes, so a row cannot claim to be matched to nobody.
   *
   * Devices are `Devices.forgetAccount`'s job and are not reached from here —
   * this class owns identity, that one owns addresses, and the route calls both.
   */
  erase(accountId: string): boolean {
    const account = this.byId(accountId);
    if (!account) return false;

    this.db
      .prepare('DELETE FROM contacts WHERE a_id = ? OR b_id = ?')
      .run(accountId, accountId);
    this.db
      .prepare('DELETE FROM pending_invites WHERE requester_id = ?')
      .run(accountId);
    this.db
      .prepare('DELETE FROM pending_invites WHERE identifier = ? COLLATE NOCASE')
      .run(account.identifier);
    this.db
      .prepare('DELETE FROM otp_codes WHERE identifier = ? COLLATE NOCASE')
      .run(account.identifier);
    this.db.prepare('DELETE FROM tokens WHERE account_id = ?').run(accountId);
    this.db
      .prepare(
        'UPDATE donations SET account_id = NULL, matched_by = NULL WHERE account_id = ?'
      )
      .run(accountId);

    this.db
      .prepare(
        `UPDATE accounts
            SET identifier = ?, display_name = ?, bio = NULL,
                last_seen_at = NULL, donations_allowed = NULL
          WHERE id = ?`
      )
      .run(erasedIdentifier(accountId), ERASED_DISPLAY_NAME, accountId);
    return true;
  }
}

/**
 * What an erased account is called wherever an id still resolves to one — an
 * old channel's participant list, a recording made before they left.
 *
 * Not a name anybody could have chosen: display names are what somebody types
 * about themselves, and this is the application saying there is nobody here.
 */
export const ERASED_DISPLAY_NAME = 'Deleted account';

/**
 * Not an email address, deliberately. `request-code` refuses anything that is
 * not one, so no code can ever be issued for this value however it is typed —
 * and the same person signing up again gets a new account rather than this one
 * back.
 */
function erasedIdentifier(accountId: string): string {
  return `erased:${accountId}`;
}

function normalize(identifier: string): string {
  return identifier.trim();
}

/**
 * Whether two identifiers name the same person, matched the way the database
 * matches them — trimmed, and case-insensitively, since `byIdentifier` looks up
 * COLLATE NOCASE. Configuring the review address in one case and having it
 * typed in another is exactly the kind of thing that would otherwise fail
 * silently, on the one sign-in nobody can debug from the outside.
 */
function sameIdentifier(x: string, y: string): boolean {
  return normalize(x).toLowerCase() === normalize(y).toLowerCase();
}

function constantTimeEquals(x: string, y: string): boolean {
  const a = Buffer.from(x);
  const b = Buffer.from(y);
  return a.length === b.length && timingSafeEqual(a, b);
}
