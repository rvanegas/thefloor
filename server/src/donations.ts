import { timingSafeEqual } from 'node:crypto';
import type { Accounts } from './accounts';
import type { Db } from './db';

/** What Ko-fi sends, as much of it as is read. */
export interface KofiPayload {
  kofi_transaction_id: string;
  verification_token: string;
  type: string;
  amount: string;
  currency: string;
  email?: string | null;
  from_name?: string | null;
  message?: string | null;
  timestamp?: string | null;
  is_public?: boolean;
  is_subscription_payment?: boolean;
}

export type RecordResult =
  | { ok: true; stored: boolean; accountId: string | null }
  | { ok: false; reason: 'unconfigured' | 'malformed' | 'unverified' };

export interface DonationTotals {
  count: number;
  /** When they first gave, by our clock. */
  since: number;
  /** One entry per currency given in, largest first. */
  totals: Array<{ currency: string; cents: number }>;
}

/**
 * The record of what people have given, and the only thing that writes it.
 *
 * The verification token lives here rather than in the route because the whole
 * contract with Ko-fi — the form encoding, the shared secret, the idempotency
 * key, the attribution — is one thing worth testing in one place. The route
 * that calls this is four lines.
 */
export class Donations {
  constructor(
    private db: Db,
    private accounts: Accounts,
    /** Ko-fi's webhook verification token. Without it nothing is accepted. */
    private verificationToken?: string
  ) {}

  // --- Writing ------------------------------------------------------------

  /**
   * Takes one webhook delivery, start to finish: verify, parse, attribute,
   * store.
   *
   * `stored: false` with `ok: true` is a replay — the same transaction id
   * arriving twice, which Ko-fi will do on any answer it does not like. It is
   * success, not an error, and the caller should say so.
   */
  record(body: string, now: number): RecordResult {
    if (!this.verificationToken) return { ok: false, reason: 'unconfigured' };

    const payload = parseKofi(body);
    if (!payload) return { ok: false, reason: 'malformed' };

    // Checked before anything is read out of the payload and before anything
    // touches the database, so an unverified caller cannot cost more than a
    // parse.
    if (!constantTimeEquals(payload.verification_token, this.verificationToken)) {
      return { ok: false, reason: 'unverified' };
    }

    const cents = toCents(payload.amount);
    if (cents === null) return { ok: false, reason: 'malformed' };

    // Everything Ko-fi sent except the thing that proves they sent it.
    //
    // The token is a long-lived shared secret, and storing it on every row put
    // a copy of it in the database, in backups, and in the output of any query
    // careless enough to select the payload. It has done its work by this line
    // and keeping it buys nothing. The rest of the payload is kept whole, so a
    // field nobody anticipated is still recoverable.
    const { verification_token: _discarded, ...keep } =
      payload as unknown as Record<string, unknown>;
    const raw = JSON.stringify(keep);

    const account = payload.email
      ? this.accounts.byIdentifier(payload.email)
      : undefined;

    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO donations (
           kofi_transaction_id, account_id, matched_by, email, from_name,
           message, amount_cents, currency, kind, is_recurring, is_public,
           received_at, kofi_at, raw
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        payload.kofi_transaction_id,
        account?.id ?? null,
        account ? 'email' : null,
        payload.email ?? null,
        payload.from_name ?? null,
        payload.message ?? null,
        cents,
        payload.currency,
        payload.type,
        payload.is_subscription_payment ? 1 : 0,
        payload.is_public ? 1 : 0,
        now,
        payload.timestamp ?? null,
        raw
      );

    const stored = Number(result.changes) > 0;
    return {
      ok: true,
      stored,
      accountId: stored ? (account?.id ?? null) : null,
    };
  }

  // --- Reading ------------------------------------------------------------

  /** What one person has given. Null when they have given nothing. */
  forAccount(accountId: string): DonationTotals | null {
    const rows = this.db
      .prepare(
        `SELECT currency, SUM(amount_cents) AS cents, COUNT(*) AS count,
                MIN(received_at) AS since
         FROM donations WHERE account_id = ?
         GROUP BY currency ORDER BY cents DESC`
      )
      .all(accountId) as Array<{
      currency: string;
      cents: number;
      count: number;
      since: number;
    }>;
    if (rows.length === 0) return null;

    return {
      count: rows.reduce((sum, row) => sum + Number(row.count), 0),
      since: Math.min(...rows.map((row) => Number(row.since))),
      // Grouped rather than summed into one number: adding dollars to euros
      // would produce a figure that is not true in any currency, and somebody
      // who has given in two is exactly who would notice.
      totals: rows.map((row) => ({
        currency: row.currency,
        cents: Number(row.cents),
      })),
    };
  }
}

/**
 * Pulls the payload out of a Ko-fi delivery.
 *
 * They POST form-encoded with the JSON in a single `data` field, which is why
 * this takes the raw body rather than a parsed object. Returns null on anything
 * it cannot make sense of, including a payload missing the fields every row
 * needs — an unparseable delivery is a bug worth a 400, not a row of nulls.
 */
export function parseKofi(body: string): KofiPayload | null {
  let data: string | null;
  try {
    data = new URLSearchParams(body).get('data');
  } catch {
    return null;
  }
  if (!data) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const payload = parsed as Record<string, unknown>;
  const required = ['kofi_transaction_id', 'verification_token', 'type', 'amount', 'currency'];
  for (const field of required) {
    if (typeof payload[field] !== 'string' || payload[field] === '') return null;
  }
  return payload as unknown as KofiPayload;
}

/**
 * "3.00" to 300.
 *
 * Deliberately strict, and deliberately not `parseFloat`: that answers 3 for
 * "3 dollars" and NaN for "", and a NaN reaching an INTEGER NOT NULL column is
 * a row nobody can read afterwards. Anything not plainly a number of units and
 * up to two subunits is refused, which is a 400 the sender can see rather than
 * a total quietly wrong by an unknown amount.
 */
export function toCents(amount: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!match) return null;
  const units = Number(match[1]);
  const subunits = Number((match[2] ?? '0').padEnd(2, '0'));
  if (!Number.isSafeInteger(units) || units > 1_000_000) return null;
  return units * 100 + subunits;
}

function constantTimeEquals(x: string, y: string): boolean {
  const a = Buffer.from(x);
  const b = Buffer.from(y);
  return a.length === b.length && timingSafeEqual(a, b);
}
