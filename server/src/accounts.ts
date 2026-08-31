import { randomBytes } from 'node:crypto';
import type { ClientKind } from './release';
import type {
  LeaderboardEntry,
  ProfileView,
  PublicAccount,
} from '../../core/protocol';
import { MAX_DISPLAY_NAME_LENGTH } from '../../core/constants';
import {
  DEFAULT_ACCOUNT_SETTINGS,
  isColorSchemePreference,
  type AccountSettings,
} from '../../core/settings';
import {
  IM_SERVICES,
  normaliseImHandle,
  type ImHandles,
  type ImService,
} from '../../core/im';
import {
  hashesEqual,
  insertWithUniqueKey,
  newId,
  pairKey,
  sha256,
  type AccountRow,
  type Db,
} from './db';

/**
 * Which column holds which service's handle.
 *
 * A map rather than a template on the service name, so that the string reaching
 * the SQL below is one of three literals this file wrote — the service names
 * are typed and come from `core/im.ts`, but a column name interpolated into a
 * statement should be a value that was chosen here rather than one that merely
 * arrived here.
 */
const IM_COLUMNS = {
  whatsapp: 'im_whatsapp',
  telegram: 'im_telegram',
  signal: 'im_signal',
} as const satisfies Record<ImService, keyof AccountRow>;

const imColumn = (service: ImService) => IM_COLUMNS[service];

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
 * How long a watch party's follower link stays good.
 *
 * Six hours, and the figure is a film with an interval rather than a round
 * number. The socket layer re-checks a connection's credential every
 * heartbeat, so a fifteen-minute token — which is what a link handed to
 * another screen otherwise wants to be — would cut the page off in the third
 * act, with nothing on screen to say why.
 *
 * Long is affordable here in a way it would not be for a session token,
 * because of what this one *can do*: follow one channel on one screen and
 * report a duration. A leaked link exposes what is being watched, not the
 * ability to change it and not the account.
 */
export const WATCH_TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

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
   *
   * `review.contact` is the second demo account, which has no code — it is
   * named only so that `buildsSeenSince` can leave both of them out.
   */
  constructor(
    private db: Db,
    private review?: { identifier: string; code: string; contact?: string }
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
    watchTokens: number;
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
    // Counted separately from the sessions above rather than folded in with
    // them, because they answer different questions: one number says how many
    // phones stopped being signed in, and a watch link that expired is a
    // browser tab nobody closed.
    const watchTokens = this.db
      .prepare('DELETE FROM watch_tokens WHERE expires_at <= ?')
      .run(now).changes;
    return {
      codes: Number(codes),
      invites: Number(invites),
      tokens: Number(tokens),
      watchTokens: Number(watchTokens),
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
   * Where this account stands with transcription's one free use.
   *
   * `unlimited` is the hand-set mark; `spentOn` is the recording whose
   * transcript took the free use, null while it is unspent. Two facts rather
   * than one boolean because the refusal has to say *which* rule refused: "not
   * this server" and "you have had yours" are different sentences, and the
   * second one is temporary in a way the first is not.
   */
  transcriptAllowance(id: string): { unlimited: boolean; spentOn: string | null } {
    const row = this.byId(id);
    return {
      unlimited: row?.transcripts_unlimited === 1,
      spentOn: row?.free_transcript_id ?? null,
    };
  }

  /**
   * Records that this account's free transcript has gone on this recording.
   *
   * Written when the transcript is asked for rather than when it lands, so a
   * pending one holds the credit — otherwise five taps in the time one takes
   * to come back are five free transcripts. `refundFreeTranscript` is the
   * other half, for when the thing never arrives.
   *
   * Idempotent in the only way that matters: the guard is `IS NULL`, so a
   * second call cannot move an already-spent credit onto a different
   * recording, and an unlimited account that somehow reaches here does not
   * quietly acquire a spent one.
   *
   * Takes the clock rather than reading one, for the reason `start` does.
   */
  spendFreeTranscript(id: string, recordingId: string, at: number): void {
    this.db
      .prepare(
        `UPDATE accounts SET free_transcript_id = ?, free_transcript_at = ?
         WHERE id = ? AND free_transcript_id IS NULL`
      )
      .run(recordingId, at, id);
  }

  /**
   * Gives the free use back, because this transcript produced nothing.
   *
   * Keyed on the recording rather than the account, so the caller does not
   * have to remember who paid — the row does. **Only a failure calls this.**
   * Deleting a transcript does not: it destroyed something that was made, and
   * making it again costs what it cost the first time, which is exactly the
   * loop this limit exists to close.
   */
  refundFreeTranscript(recordingId: string): void {
    this.db
      .prepare(
        `UPDATE accounts SET free_transcript_id = NULL, free_transcript_at = NULL
         WHERE free_transcript_id = ?`
      )
      .run(recordingId);
  }

  /**
   * Writes a person's own profile.
   *
   * Every field is optional and absent means unchanged, so the client can save
   * one without having to send the others and without a blank field silently
   * erasing something.
   *
   * Normalised the same way a channel's name is: a display name is trimmed and
   * capped, and a blank one is refused rather than accepted, because a person
   * with no name at all appears as an empty space in every roster.
   *
   * A messaging handle is normalised on the way in, so what is stored is
   * `core/im.ts`'s canonical form whatever a field held. Blank clears it;
   * **anything that is neither blank nor a handle is dropped rather than
   * stored**, and the route is what refuses it — this is the layer that
   * writes, and a half-written profile is worse than a refused one.
   */
  updateProfile(
    accountId: string,
    changes: { displayName?: string; im?: ImHandles }
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

    for (const service of IM_SERVICES) {
      const given = changes.im?.[service];
      if (given === undefined) continue;
      // Blank is a removal and anything else has to survive normalisation;
      // what does not is left alone here, the route having already refused it.
      const handle = normaliseImHandle(service, given);
      if (handle === null && given.trim() !== '') continue;
      this.db
        .prepare(`UPDATE accounts SET ${imColumn(service)} = ? WHERE id = ?`)
        .run(handle, accountId);
    }

    return this.byId(accountId);
  }

  /**
   * What this person has chosen, with the defaults filled in.
   *
   * Complete rather than partial, always, so that no caller — and no client
   * downstream of one — has to hold a second copy of what a default is. Null
   * columns are the untouched case and are answered from
   * `DEFAULT_ACCOUNT_SETTINGS`, which is the only place the defaults are
   * written down.
   *
   * Answers for an account that does not exist, with the defaults. The callers
   * are a socket saying hello and a route that has already authenticated, so a
   * missing row here means a deletion raced a connection, and the honest thing
   * for a read-only preference is the answer everybody starts with.
   */
  settings(accountId: string): AccountSettings {
    const row = this.byId(accountId);
    if (!row) return { ...DEFAULT_ACCOUNT_SETTINGS };
    return {
      // Anything unrecognised reads as the default rather than being passed
      // on. The column is text and this is the one place it is interpreted,
      // so a value written by hand or left by a retired scheme cannot reach a
      // client as a colour it has no palette for.
      appearance: isColorSchemePreference(row.appearance)
        ? row.appearance
        : DEFAULT_ACCOUNT_SETTINGS.appearance,
      tapToStepIn:
        row.tap_to_step_in === null
          ? DEFAULT_ACCOUNT_SETTINGS.tapToStepIn
          : row.tap_to_step_in === 1,
    };
  }

  /**
   * Writes what somebody chose, and answers with all of it.
   *
   * Partial in the sense `updateProfile` is: an absent field is left alone, so
   * a screen saving the scheme cannot silently reset the tap. What comes back
   * is the whole of it, because the caller's next move is to tell every device
   * this account holds, and a partial answer would make each of them merge.
   *
   * The default is stored as itself rather than as a null. That is the
   * opposite of what `NotificationPreferences.set` does, and deliberately:
   * these two are set from a screen showing both choices as buttons, where
   * choosing the default back is an act — and the row it writes is what a
   * second device is then told about. Reverting to null would leave the two
   * cases indistinguishable at the moment the difference is visible, which is
   * one phone waiting to be told what the other just did.
   */
  updateSettings(
    accountId: string,
    changes: Partial<AccountSettings>
  ): AccountSettings | undefined {
    if (!this.byId(accountId)) return undefined;
    if (changes.appearance !== undefined) {
      this.db
        .prepare('UPDATE accounts SET appearance = ? WHERE id = ?')
        .run(changes.appearance, accountId);
    }
    if (changes.tapToStepIn !== undefined) {
      this.db
        .prepare('UPDATE accounts SET tap_to_step_in = ? WHERE id = ?')
        .run(changes.tapToStepIn ? 1 : 0, accountId);
    }
    return this.settings(accountId);
  }

  /**
   * Where somebody can be reached elsewhere, or an empty object.
   *
   * Read off the row rather than queried, and returned with the absent
   * services left out entirely — a key with an empty string in it would be a
   * handle as far as the client is concerned, and it would draw a dead link
   * for it.
   */
  imHandles(row: AccountRow): ImHandles {
    const handles: ImHandles = {};
    for (const service of IM_SERVICES) {
      const stored = row[imColumn(service)];
      if (stored) handles[service] = stored;
    }
    return handles;
  }

  /**
   * How many people this account is the reason are here — **transitively**.
   *
   * Somebody you invited counts, and so does everybody they went on to invite,
   * all the way down. The intent is reach rather than effort: an account that
   * brought in one person who brought in fifty did more for this than one that
   * sent fifty invitations to a quiet room, and the number that says so is the
   * one worth showing.
   *
   * Two things it deliberately does not count. **Deleted accounts** are
   * excluded — a tombstone is not a person, and a number that stays high after
   * everybody it counted has left is a claim about a population that is not
   * there. But the walk still passes *through* one, so somebody whose inviter
   * later deleted their account is still credited to whoever invited *them*;
   * dropping the subtree would silently rewrite a third party's total on
   * somebody else's decision. And **contact requests to addresses that already
   * had an account** never appear here at all: they are two people finding each
   * other, not one of them arriving.
   *
   * `UNION` rather than `UNION ALL`, which both deduplicates and terminates.
   * The edges are a forest by construction — an inviter exists before the
   * account naming them — so a cycle would mean the table is corrupt, and this
   * returns a wrong number rather than looping forever if it ever is.
   */
  invitedCount(id: string): number {
    const row = this.db
      .prepare(
        `WITH RECURSIVE invited(id) AS (
           SELECT id FROM accounts WHERE invited_by = ?
           UNION
           SELECT a.id FROM accounts a JOIN invited ON a.invited_by = invited.id
         )
         SELECT COUNT(*) AS n FROM accounts
          WHERE id IN (SELECT id FROM invited)
            AND identifier NOT GLOB ?`
      )
      .get(id, `${ERASED_IDENTIFIER_PREFIX}*`) as { n: number };
    return Number(row.n);
  }

  /**
   * Names an inviter for an account that arrived without one.
   *
   * The second way credit is earned, and the only one that is not an email
   * address resolving at sign-up. Somebody follows a guest link, makes an
   * account inside the room to accept a member's ask, and `pending_invites`
   * has never heard of them — so the walk in `invitedCount` would stop at a
   * person who is plainly here because a member brought them. See
   * `ChannelRegistry.acceptGuestAsk`, which is the one caller and which owns
   * the harder half of the judgement: *whether this account is new*, which
   * this cannot see and will not guess at.
   *
   * What it does own is that credit is written once and never moved. An
   * account with an inviter keeps the one it has, so a second ask from a
   * second member cannot reassign it, and the earliest claim wins here for the
   * same reason the earliest invitation does in `resolveInvitesFor`.
   *
   * The forest invariant is checked rather than assumed. Every other edge is
   * acyclic by construction — an inviter exists before the account naming
   * them — and this one is not, being written long after both accounts do; so
   * it walks the inviter's own ancestry first and refuses an edge that would
   * close a loop. `invitedCount` returns a wrong number rather than looping on
   * a corrupt table, which is not a guarantee worth spending.
   */
  creditInviter(accountId: string, inviterId: string): boolean {
    if (accountId === inviterId) return false;
    const account = this.byId(accountId);
    if (!account || account.invited_by) return false;
    if (!this.byId(inviterId)) return false;

    for (
      let ancestor = this.byId(inviterId)?.invited_by;
      ancestor;
      ancestor = this.byId(ancestor)?.invited_by
    ) {
      if (ancestor === accountId) return false;
    }

    this.db
      .prepare('UPDATE accounts SET invited_by = ? WHERE id = ?')
      .run(inviterId, accountId);
    return true;
  }

  /**
   * Everybody who has brought anybody here, most first.
   *
   * One query rather than `invitedCount` per account, because the answer is
   * one closure: walk every edge outwards from its tail, keeping the ancestor
   * fixed, and each account's total is how many pairs name it. Doing it the
   * obvious way is a recursive walk per row over the same table.
   *
   * **Only accounts with a count of one or more appear**, which falls out of
   * the join rather than being filtered for: an account nobody arrived through
   * is in no pair. That is the right shape for a board — a list whose tail is
   * every account that has ever existed, all reading nought, is a list of
   * accounts rather than a ranking.
   *
   * Tombstones are excluded at both ends, and for the two different reasons
   * `invitedCount` gives: a deleted account is not a person to count, and is
   * not a person to rank either. The chain is still walked *through* one, so
   * the pairs it stands between survive it.
   *
   * Ties break on display name, so that two accounts level on the number sit
   * in an order that does not change between reads.
   */
  leaderboard(limit = 100): LeaderboardEntry[] {
    const erased = `${ERASED_IDENTIFIER_PREFIX}*`;
    const rows = this.db
      .prepare(
        `WITH RECURSIVE chain(ancestor, descendant) AS (
           SELECT invited_by, id FROM accounts WHERE invited_by IS NOT NULL
           UNION
           SELECT chain.ancestor, a.id
             FROM accounts a JOIN chain ON a.invited_by = chain.descendant
         )
         SELECT inviter.id AS id,
                inviter.display_name AS displayName,
                COUNT(*) AS invited
           FROM chain
           JOIN accounts inviter ON inviter.id = chain.ancestor
           JOIN accounts arrival ON arrival.id = chain.descendant
          WHERE inviter.identifier NOT GLOB ?
            AND arrival.identifier NOT GLOB ?
          GROUP BY inviter.id
          ORDER BY invited DESC, inviter.display_name ASC
          LIMIT ?`
      )
      .all(erased, erased, limit) as Array<{
      id: string;
      displayName: string;
      invited: number;
    }>;

    return rows.map(({ id, displayName, invited }) => ({
      account: { id, displayName },
      invited: Number(invited),
    }));
  }

  /**
   * A person's profile, for anyone entitled to see it.
   *
   * `viewerId` decides two fields and nothing else: whether who invited them
   * is a name this reader would recognise — see `invitedByFor` — and whether
   * the reader is entitled to the messaging handles.
   *
   * The handles are settled here rather than in the route, unlike the email
   * beside them on the same screen, because the test is the reader's standing
   * and this class is what knows it. The email's test is an act by the person
   * the address belongs to, aimed at a named reader, which is a different
   * question and stays where the other per-reader decisions are.
   */
  profile(id: string, viewerId: string): ProfileView | null {
    const row = this.byId(id);
    if (!row) return null;
    const invitedBy = this.invitedByFor(row, viewerId);
    // Yourself included: this is the screen they are edited on, so a profile
    // that withheld them from their owner would be an editor with empty
    // fields over a row that is not empty.
    const im =
      viewerId === id || this.areContacts(viewerId, id)
        ? this.imHandles(row)
        : {};
    return {
      account: { id: row.id, displayName: row.display_name },
      invited: this.invitedCount(row.id),
      ...(invitedBy ? { invitedBy } : {}),
      // Absent rather than empty, which is what the client reads as "nothing
      // to draw" — the same shape a server that predates this sends.
      ...(Object.keys(im).length > 0 ? { im } : {}),
    };
  }

  /**
   * Who invited this person, but only when the reader already knows them.
   *
   * The rule is that the inviter is **you, or one of your contacts** — a name
   * you could have got from your own contact list, attached to a fact you
   * could not. Anybody else gets nothing at all: not a name, not an id, not a
   * hint that there was an inviter. A profile is readable by a contact, by
   * anyone sharing a live channel and by yourself, and that last audience is
   * exactly the one this must not leak to. Somebody an acquaintance brought
   * into a channel would otherwise learn, from a screen they are entitled to
   * open, the name of a stranger who knows them — which is the shape of thing
   * `pending_invites` exists to avoid answering.
   *
   * A tombstone is excluded, for the reason it is excluded from the counts: it
   * is not a person, and "Invited by Deleted account" tells a reader nothing
   * except that somebody left.
   *
   * Note this is not symmetrical with the count, and deliberately. The number
   * on a profile is the same number for everybody who can see the profile;
   * this line is not, because a name is a name and a total is not.
   */
  private invitedByFor(
    row: AccountRow,
    viewerId: string
  ): PublicAccount | undefined {
    if (!row.invited_by) return undefined;
    const inviter = this.byId(row.invited_by);
    if (!inviter) return undefined;
    if (inviter.identifier.startsWith(ERASED_IDENTIFIER_PREFIX)) return undefined;
    const known =
      inviter.id === viewerId || this.areContacts(viewerId, inviter.id);
    if (!known) return undefined;
    return { id: inviter.id, displayName: inviter.display_name };
  }

  /**
   * When somebody last had the app open, or null if never.
   *
   * Kept out of `profile()` rather than folded into it, because a profile goes
   * to a wider audience than this may: only a contact sees availability, and a
   * shape that carries it by default is one every caller has to remember to
   * strip. Asked for explicitly, by the one route entitled to answer.
   */
  lastSeenAt(id: string): number | null {
    return this.byId(id)?.last_seen_at ?? null;
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
  /**
   * `build` is what the client said it is, when it said anything. **A missing
   * build does not clear the stored one**, which is the whole subtlety of this
   * write: the two file transfers and any older client call without it, and
   * treating that as "now unknown" would let one such call erase the evidence
   * that this person is on something current. Absence means "no news", and the
   * column keeps the last thing actually claimed.
   */
  /**
   * **The time never goes backwards**, which is why this is a `MAX` rather than
   * an assignment. The socket close handler stamps `connection.lastSeen` — the
   * last thing that socket heard, rather than the moment it ended — and a
   * socket can end well after its replacement has connected: a phone that flaps
   * has a new socket stamping the present while the dead one is still waiting
   * on a close frame. Assigning would let the corpse rewind the column by
   * however long it took to die. The column means the last moment anything
   * proved this person was there, and nothing that arrives later can make that
   * earlier.
   *
   * `build` is deliberately not guarded the same way: it is not a clock, and
   * the rule above governs it instead.
   */
  markSeen(id: string, now: number, build?: number | null): void {
    if (build == null) {
      this.db
        .prepare(
          'UPDATE accounts SET last_seen_at = MAX(COALESCE(last_seen_at, 0), ?) WHERE id = ?'
        )
        .run(now, id);
      return;
    }
    this.db
      .prepare(
        `UPDATE accounts
            SET last_seen_at = MAX(COALESCE(last_seen_at, 0), ?), last_build = ?
          WHERE id = ?`
      )
      .run(now, build, id);
  }

  /**
   * The same two facts about one *session*, which is the nearest thing this
   * server has to one device.
   *
   * `markSeen` above writes them against the account, where `last_seen_at` is
   * the maximum across every device somebody holds — right for a contact list,
   * which asks whether a person is about — and `last_build` is whichever
   * device spoke last. That second one cannot answer the build census: a phone
   * on a current build overwrites a tablet below the floor, and the census
   * exists precisely to notice the tablet. See `buildsSeenSince`.
   *
   * Keyed on the token because every path that learns a build already holds
   * one: the socket keeps the credential it was accepted on, and an HTTP
   * request carries it in the header. Nothing had to be threaded anywhere.
   *
   * A token that is not in the table writes nothing, which is an ordinary
   * outcome rather than a failure — a session revoked from another device goes
   * on making requests until something answers 401.
   */
  markSession(
    token: string,
    now: number,
    build?: number | null,
    client: ClientKind = 'native'
  ): void {
    // Stored only for web, so the column stays NULL for every native sign-in —
    // which is what makes the census's default free rather than a backfill.
    // See the column's comment in db.ts.
    const kind = client === 'web' ? 'web' : null;
    if (build == null) {
      this.db
        .prepare(
          `UPDATE tokens
              SET last_seen_at = MAX(COALESCE(last_seen_at, 0), ?),
                  last_client = ?
            WHERE token_hash = ?`
        )
        .run(now, kind, sha256(token));
      return;
    }
    this.db
      .prepare(
        `UPDATE tokens
            SET last_seen_at = MAX(COALESCE(last_seen_at, 0), ?),
                last_build = ?,
                last_client = ?
          WHERE token_hash = ?`
      )
      .run(now, build, kind, sha256(token));
  }

  /**
   * The oldest build seen from anybody active since `since`, and whether
   * anything active declined to say.
   *
   * This is the measurement `MIN_SUPPORTED_BUILD` has never had. The floor is
   * a declaration — a shim may be deleted once the floor has passed the build
   * that needed it — and the question it turns on is "is anything older than
   * this still calling", which until now had no source but memory.
   *
   * **`silent` is the important half, and it is why this does not simply
   * return a number.** An account active in the window but reporting no build
   * is not evidence of anything modern: it is a client from before the header
   * existed, and it must be read as *at or below* the first build that sends
   * one. A `oldest` of 40 with `silent: 2` does not mean the population starts
   * at 40. Collapsing the two into one integer would produce a number that
   * looks like a measurement and reads like a guess, which is the exact defect
   * being fixed.
   *
   * **Counted over sessions rather than accounts, since 2026-08-24.** Several
   * sessions per account became ordinary that day, and `accounts.last_build`
   * is one column written by whichever device spoke last — so a phone on a
   * current build masked a tablet below the floor, in exactly the measurement
   * that exists to notice the tablet. One row per sign-in is the right grain:
   * a session is an install, and an install is what a raised floor strands.
   *
   * `silent` counts sessions too, and that changed what the number on
   * `/healthz` means. It was accounts that declined to say; it is now
   * sign-ins. The reading is the same and the units are finer.
   *
   * Sessions rather than `device_tokens`, which is per device and looks like
   * the better fit until you ask what it is: a register of push *addresses*.
   * An install that declined notification permission has no row there at all,
   * and those are not people a census may quietly omit.
   *
   * Revocation does the cleaning. Signing out deletes the row, so does signing
   * out from another device, and so does `erase` — so a session that has
   * stopped calling stops being counted without anything having to sweep.
   *
   * **Presence here is `tokens.last_seen_at`, which is the socket's to
   * write.** A session that has never held a socket is not in the window at
   * all, however many HTTP calls it has made — deliberately, since the two
   * clients that matter both connect. It is worth knowing before reading a low
   * `silent` as good news. The account-level column of the same name means
   * something different and still exists: the maximum across somebody's
   * devices, which is what a contact list renders.
   *
   * **Two kinds of row are left out, because neither is somebody a raised
   * floor could strand.** A tombstone cannot sign in — `erase` deletes its
   * tokens and rewrites its identifier — so whatever build it last called
   * from is a fossil, and one was holding `oldest` at 51 on production while
   * the real population started at 56. That exclusion is now belt as well as
   * braces: `erase` deleting the tokens is itself enough to drop a tombstone
   * out of a count over sessions, where against `accounts` the row remained
   * and had to be named. It stays because it costs one clause and states the
   * intent, and because nothing should have to know the deletion order to
   * read this query. The demo accounts are a phone at Apple
   * that reinstalls whatever is under review at each submission, and the
   * second of them has never reported a build at all, so leaving them in
   * pins `silent` above zero permanently — which is the one condition under
   * which this whole reading is not to be trusted. Both exclusions are
   * narrower than they look: an erased row keeps its `last_build` for
   * `bin/db` to read, and the demo accounts are still counted by everything
   * else that counts accounts.
   *
   * `erase` also nulls `last_seen_at`, so a tombstone is usually outside the
   * window anyway — usually, not always: a socket already authenticated when
   * the account was deleted stamps it again as it goes, which is how the row
   * on production got back in. The prefix is what makes this certain rather
   * than probable.
   */
  buildsSeenSince(since: number): { oldest: number | null; silent: number } {
    const demo = [this.review?.identifier, this.review?.contact]
      .filter((id): id is string => id !== undefined)
      .map((id) => normalize(id).toLowerCase());
    const row = this.db
      .prepare(
        `SELECT MIN(t.last_build) AS oldest,
                SUM(CASE WHEN t.last_build IS NULL THEN 1 ELSE 0 END) AS silent
           FROM tokens t
           JOIN accounts a ON a.id = t.account_id
          WHERE t.last_seen_at IS NOT NULL AND t.last_seen_at >= ?
            AND (t.last_client IS NULL OR t.last_client <> 'web')
            AND a.identifier NOT LIKE ?
            AND LOWER(a.identifier) NOT IN (${demo.map(() => '?').join(', ') || "''"})`
      )
      .get(since, `${ERASED_IDENTIFIER_PREFIX}%`, ...demo) as {
      oldest: number | null;
      silent: number | null;
    };
    return { oldest: row?.oldest ?? null, silent: row?.silent ?? 0 };
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
    if (!this.consumeCode(id, code, now)) return null;
    return this.establish(id, displayName, now);
  }

  /**
   * Checks a code against an address and spends it, without signing anybody in.
   *
   * Split out of `verifyCode` on 2026-08-31 for the second thing a code now
   * proves: that the person holding it reads the mail at that address. Signing
   * in is one use of that proof and changing your address is the other, and
   * the two must not drift — a check written twice is a check that gets
   * relaxed once.
   *
   * True exactly once per code. Spent whether or not what follows succeeds,
   * which is what a one-time code means; the caller asks for another if it has
   * to start again.
   */
  consumeCode(identifier: string, code: string, now: number): boolean {
    const id = normalize(identifier);
    const row = this.db
      .prepare('SELECT * FROM otp_codes WHERE identifier = ?')
      .get(id) as
      | { code_hash: string; expires_at: number; attempts: number }
      | undefined;

    if (!row) return false;
    if (now > row.expires_at || row.attempts >= OTP_MAX_ATTEMPTS) {
      this.db.prepare('DELETE FROM otp_codes WHERE identifier = ?').run(id);
      return false;
    }

    if (!hashesEqual(sha256(code.trim()), row.code_hash)) {
      this.db
        .prepare(
          'UPDATE otp_codes SET attempts = attempts + 1 WHERE identifier = ?'
        )
        .run(id);
      return false;
    }

    this.db.prepare('DELETE FROM otp_codes WHERE identifier = ?').run(id);
    return true;
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

  /**
   * Moves an account to a different sign-in address.
   *
   * **Called only after `consumeCode` has said yes for the new address**, and
   * the ordering is the whole security argument: the code proves the person
   * asking reads the mail there, which is exactly what the address is going to
   * mean afterwards. Anything less would let a stolen token move an account
   * somewhere its owner cannot follow it.
   *
   * The collision check is here rather than at the moment the code was
   * requested, and that placement is deliberate. Refusing early would answer
   * "does an account exist at this address" for any address somebody cares to
   * type, one guess at a time — the disclosure `requestContact` goes out of
   * its way not to make. Refusing here answers it only to somebody who has
   * just read a code out of that mailbox, who may have the answer.
   *
   * Sessions are untouched. Tokens key on the account, not the address, so
   * changing it does not sign anybody out — of this device or of any other.
   */
  changeIdentifier(
    accountId: string,
    identifier: string,
    now: number
  ): { ok: true; account: AccountRow } | { ok: false; error: string } {
    const id = normalize(identifier);
    const account = this.byId(accountId);
    if (!account) return { ok: false, error: 'No such account.' };

    // Already yours, which is a no-op rather than a failure: somebody who
    // confirmed the address they already had has ended up where they meant to
    // be, and an error would be the screen arguing with them about it.
    if (sameIdentifier(account.identifier, id)) return { ok: true, account };

    const taken = this.byIdentifier(id);
    if (taken) {
      return {
        ok: false,
        error: 'That address already signs in to another account.',
      };
    }

    this.db
      .prepare('UPDATE accounts SET identifier = ? WHERE id = ?')
      .run(id, accountId);
    const moved = this.byId(accountId)!;

    // Anybody who wrote to the new address before it belonged to anyone gets
    // their contact request now — the rows would otherwise wait for a first
    // sign-in that can never happen, this account having already had one.
    // Without the credit and dated now: see `resolveInvitesFor`.
    this.resolveInvitesFor(moved, { credit: false, at: now });
    return { ok: true, account: moved };
  }

  // --- Tokens -------------------------------------------------------------

  /**
   * Issues a session token, leaving every session this account already had.
   *
   * **Several sessions per account, as of 2026-08-24.** This used to revoke
   * every other token first, so signing in anywhere signed you out everywhere
   * else. The reasoning was real — a token is good for ninety days, and
   * signing in elsewhere was the only signal available that a phone might have
   * left its owner's hands — but it was paying for that signal with the
   * ordinary case, which is one person with a phone and a tablet.
   *
   * What replaces it is `revokeOthersForAccount`, behind *Sign out other
   * devices*: the same lever, pulled deliberately by somebody who has lost a
   * phone rather than automatically by everybody who owns two. The difference
   * is that it now costs a decision instead of a device.
   *
   * Nothing here says anything about presence. An account may be signed in on
   * as many devices as it likes and is still in at most one channel — that is
   * `stepOutOfOthers` in channels.ts and the `displaced` message in ws.ts,
   * which are about rooms rather than about credentials.
   */
  issueToken(accountId: string, now: number): string {
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

  // --- Watch tokens ---------------------------------------------------------
  //
  // A credential for one channel on one screen. Kept apart from the sessions
  // above at every level — its own table, its own two methods, and nothing in
  // between that could confuse the two. See the schema for why that separation
  // is load-bearing rather than tidy.

  /**
   * Mints a link credential for one participant to follow one channel.
   *
   * Revokes nothing, which is the whole difference from `issueToken`: a person
   * may have a laptop and an iPad open on the same party, and one of them
   * arriving must not close the other or sign their phone out.
   */
  issueWatchToken(accountId: string, channelId: string, now: number): string {
    return insertWithUniqueKey(
      () => randomBytes(32).toString('base64url'),
      (token) =>
        this.db
          .prepare(
            `INSERT INTO watch_tokens (token_hash, account_id, channel_id, created_at, expires_at)
             VALUES (?, ?, ?, ?, ?)`
          )
          .run(
            sha256(token),
            accountId,
            channelId,
            now,
            now + WATCH_TOKEN_TTL_MS
          )
    );
  }

  /**
   * Who this watch link belongs to and which channel it may follow.
   *
   * Returns the pair rather than an account, because half of what the token
   * says is the channel — a socket that took only the account from it would be
   * back to holding a session credential, which is exactly what this table
   * exists not to be.
   */
  watchTokenFor(
    token: string,
    now: number
  ): { account: AccountRow; channelId: string } | undefined {
    const row = this.db
      .prepare(
        'SELECT account_id, channel_id, expires_at FROM watch_tokens WHERE token_hash = ?'
      )
      .get(sha256(token)) as
      | { account_id: string; channel_id: string; expires_at: number }
      | undefined;
    if (!row || now > row.expires_at) return undefined;
    const account = this.byId(row.account_id);
    return account ? { account, channelId: row.channel_id } : undefined;
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

  /**
   * Ends every session for one account **except the one asking**, and says how
   * many went.
   *
   * This is what signing in elsewhere used to do by itself, kept as something
   * somebody does on purpose — see `issueToken`. It is the only way to reach a
   * session whose token you do not hold, which is the whole point: the device
   * you have in your hand can revoke itself, and the one you left on a train
   * can be revoked by nothing else.
   *
   * The caller's own token is spared by hash rather than by count, so a
   * request made with an expired or already-revoked credential simply removes
   * everything — there is no row to spare and no session to keep.
   */
  revokeOthersForAccount(accountId: string, keep: string): number {
    return Number(
      this.db
        .prepare('DELETE FROM tokens WHERE account_id = ? AND token_hash != ?')
        .run(accountId, sha256(keep)).changes
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
  private resolveInvitesFor(
    account: AccountRow,
    /**
     * Whether this arrival is one somebody gets the credit for, and what to
     * date the contact rows.
     *
     * A signup is both: the invitation is why this person is here, and the
     * account's own `created_at` is the honest date for a row that existed in
     * all but name before the account did. **An address change is neither.**
     * Who brought somebody here was settled the day they arrived and does not
     * move because they changed mailbox — crediting it again would hand the
     * count to whoever happened to have written to their new address, and
     * `invited_by` is written once by every other path for exactly that
     * reason. The rows are dated now, because that is when the pair became
     * reachable to each other.
     */
    options: { credit: boolean; at: number } = {
      credit: true,
      at: account.created_at,
    }
  ): void {
    const invites = this.db
      .prepare(
        `SELECT requester_id FROM pending_invites WHERE identifier = ? COLLATE NOCASE
          ORDER BY created_at ASC, requester_id ASC`
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
        .run(a, b, requester_id, options.at);
    }

    // **The earliest invitation gets the credit, and only that one.** Several
    // people can have written to the same address and all of them get a
    // contact request out of it — but exactly one of them is the reason this
    // person is here, and splitting the credit between them, or handing it to
    // each, would make the totals mean something nobody could state. Ordered
    // by the clock and then by id, so two invitations sent in the same
    // millisecond still resolve the same way on every replay.
    //
    // Written here rather than anywhere later because this is the one moment
    // the answer is knowable: the rows are deleted immediately below, and an
    // invitation that expired first was swept before this ran, which is what
    // makes an unattributed signup indistinguishable from an uninvited one.
    const first = invites.find(({ requester_id }) => requester_id !== account.id);
    if (first && options.credit) {
      this.db
        .prepare('UPDATE accounts SET invited_by = ? WHERE id = ?')
        .run(first.requester_id, account.id);
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

  /**
   * Lets one contact see your sign-in address.
   *
   * **Directional and one at a time**, which is the whole shape of it. Being
   * somebody's contact is agreement to talk, not to be written to outside this
   * application — the address is how a stranger reaches you for ever, and it is
   * the one piece of a person here that nothing else in the app hands out. So
   * it is given to one named person by a deliberate act, and their showing you
   * theirs is a separate decision they make on their own screen.
   *
   * Idempotent, and the stamp is not refreshed on a second call: what is
   * recorded is the decision, and a decision does not happen twice.
   *
   * Nothing checks here that the two are contacts. The route does, alongside
   * every other question about who may do what — see the profile route, which
   * settles the same question for reading one.
   */
  showEmail(ownerId: string, viewerId: string, now: number): void {
    this.db
      .prepare(
        `INSERT INTO email_reveals (owner_id, viewer_id, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(owner_id, viewer_id) DO NOTHING`
      )
      .run(ownerId, viewerId, now);
  }

  /**
   * Stops showing it.
   *
   * Worth having even though it recalls nothing: what it ends is the standing
   * ability to come back for the address later, which is not the same as
   * unsending it. The screen says so rather than letting the button imply
   * otherwise.
   */
  hideEmail(ownerId: string, viewerId: string): void {
    this.db
      .prepare('DELETE FROM email_reveals WHERE owner_id = ? AND viewer_id = ?')
      .run(ownerId, viewerId);
  }

  /** Whether `ownerId` is currently showing their address to `viewerId`. */
  showsEmail(ownerId: string, viewerId: string): boolean {
    return !!this.db
      .prepare(
        'SELECT 1 FROM email_reveals WHERE owner_id = ? AND viewer_id = ?'
      )
      .get(ownerId, viewerId);
  }

  /**
   * `ownerId`'s address if they are showing it to `viewerId`, and null
   * otherwise — never the address on the strength of the reader's own standing.
   *
   * One method rather than a flag the caller then uses to go and read the
   * column, so there is no call site where the address is in hand before the
   * question has been asked.
   */
  emailShownTo(ownerId: string, viewerId: string): string | null {
    if (!this.showsEmail(ownerId, viewerId)) return null;
    const row = this.byId(ownerId);
    if (!row) return null;
    // A tombstone's identifier is not an address and must never be rendered as
    // one; `erase` clears these rows anyway, so this is the belt to that
    // braces.
    if (row.identifier.startsWith(ERASED_IDENTIFIER_PREFIX)) return null;
    return row.identifier;
  }

  /** Every accepted pair, for the one-to-one channel each of them is owed. */
  acceptedPairs(): Array<[string, string]> {
    const rows = this.db
      .prepare("SELECT a_id, b_id FROM contacts WHERE state = 'accepted'")
      .all() as unknown as Array<{ a_id: string; b_id: string }>;
    return rows.map((row) => [row.a_id, row.b_id] as [string, string]);
  }

  /**
   * Ends an accepted contact.
   *
   * **Mutual, because the row is the pair.** One row holds both directions and
   * has done since contacts existed, so there is no way to stop being somebody's
   * contact while they go on being yours — and no half-state worth inventing
   * for it here. Either of them may do this and it means the same thing.
   *
   * Only an accepted one. A pending row is withdrawn by its requester or
   * declined by its recipient, and those say what they are; routing a third
   * verb through the same delete would let a request be cancelled by whichever
   * side found this endpoint first.
   *
   * The channels the pair shared are not this class's business — see
   * `Channels.leavePairChannels`, which the route calls next.
   */
  removeContact(userId: string, otherId: string): boolean {
    if (!this.areContacts(userId, otherId)) return false;
    const [a, b] = pairKey(userId, otherId);
    const result = this.db
      .prepare("DELETE FROM contacts WHERE a_id = ? AND b_id = ? AND state = 'accepted'")
      .run(a, b);
    // Any address either of them was showing the other goes with it, both ways
    // and without asking. It was shown to a contact; ending the contact ends
    // the audience, and leaving the row would keep a screen offering to copy an
    // address off a profile the reader may no longer even open.
    this.db
      .prepare(
        `DELETE FROM email_reveals
          WHERE (owner_id = ? AND viewer_id = ?)
             OR (owner_id = ? AND viewer_id = ?)`
      )
      .run(a, b, b, a);
    return result.changes > 0;
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
   * address, no name, no way to reach them anywhere else, nothing
   * anybody can sign in as and nothing that
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
   * `invited_by` **stays**, and is the one field here that is not about this
   * account at all: it is the edge somebody else's invited-count is counted
   * along. Clearing it would take everybody this person went on to invite out
   * of their inviter's total — a third party's number changing because of a
   * decision they never heard about. The count itself stops including this
   * account the moment the row becomes a tombstone, which is the part that is
   * about the person leaving.
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
    // Both directions: the addresses they were showing, and the ones they were
    // being shown. The first is the account's own to take with it; the second
    // is somebody else's address sitting in a row that now points at nobody,
    // which is a disclosure outliving the person it was made to.
    this.db
      .prepare('DELETE FROM email_reveals WHERE owner_id = ? OR viewer_id = ?')
      .run(accountId, accountId);
    this.db
      .prepare('DELETE FROM pending_invites WHERE identifier = ? COLLATE NOCASE')
      .run(account.identifier);
    this.db
      .prepare('DELETE FROM otp_codes WHERE identifier = ? COLLATE NOCASE')
      .run(account.identifier);
    this.db.prepare('DELETE FROM tokens WHERE account_id = ?').run(accountId);
    // The same reasoning one line up, applied to the other kind of credential
    // this account may have handed out: a link that outlived the account would
    // be a browser tab following a channel on behalf of nobody.
    this.db
      .prepare('DELETE FROM watch_tokens WHERE account_id = ?')
      .run(accountId);
    this.db
      .prepare(
        'UPDATE donations SET account_id = NULL, matched_by = NULL WHERE account_id = ?'
      )
      .run(accountId);

    this.db
      .prepare(
        `UPDATE accounts
            SET identifier = ?, display_name = ?,
                last_seen_at = NULL, donations_allowed = NULL,
                debug = NULL, im_whatsapp = NULL, im_telegram = NULL,
                im_signal = NULL
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
  return `${ERASED_IDENTIFIER_PREFIX}${accountId}`;
}

/**
 * What makes a tombstone recognisable as one, in SQL as well as here — see
 * `invitedCount`, which has to tell a person from the shape a deleted one
 * leaves behind and has nothing else to go on.
 */
export const ERASED_IDENTIFIER_PREFIX = 'erased:';

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
