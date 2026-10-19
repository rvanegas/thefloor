import { randomUUID } from 'node:crypto';
import type { AppleTransaction, AppStoreVerifier } from './appStore';
import type { Db } from './db';

/**
 * *Pro*: a monthly App Store subscription that makes an account's
 * transcription unmetered — what the hand-set `transcripts_unlimited` mark
 * does, bought rather than granted. It changes nothing else, and is not the
 * *Pro* transcription model a channel can choose (GLOSSARY.md, *Pro*).
 *
 * Donations are a separate thing and stay on the Ko-fi link; giving unlocks
 * nothing, and Pro is the one thing here that is sold.
 *
 * **Apple is the record and this is a copy of it.** Every row is written from
 * a transaction Apple signed — uploaded by the app that bought it, or sent by
 * Apple itself as a notification when a subscription renews, lapses or is
 * refunded — and nothing the app says about it is believed.
 */

/**
 * How long past a period's end an account stays Pro without hearing of the
 * renewal. Apple renews at the boundary and tells this server moments later,
 * by notification and by the app's next upload; a day covers either being
 * late without making a lapsed subscription last noticeably longer.
 */
export const PRO_LEEWAY_MS = 24 * 60 * 60 * 1000;

export interface ProOptions {
  /**
   * The auto-renewable subscription's product id, exactly as created in App
   * Store Connect. Configuration rather than a constant, so purchase can be
   * withdrawn by a restart; existing subscribers stay Pro either way.
   */
  productId: string;
  verifier: AppStoreVerifier;
}

/** `retry` is Apple's checks failing for a reason that may pass later. */
export type ProRecordResult =
  | { ok: true }
  | { ok: false; reason: 'unconfigured' | 'unverified' | 'retry' };

export class ProSubscriptions {
  constructor(
    private db: Db,
    private options?: ProOptions
  ) {}

  /** The product to offer, or null when Pro is not on sale here. */
  get product(): string | null {
    return this.options?.productId || null;
  }

  /**
   * The `appAccountToken` this account's purchases carry, made on first ask.
   *
   * StoreKit takes only a UUID, and account ids are not one. Random and
   * stored rather than derived from the id, so that a purchase can be
   * credited by looking its token up — **the token decides whose a
   * subscription is, not whoever uploaded it**, which is what lands one left
   * unfinished under one account on that account when somebody else signs in
   * on the phone. Apple carries it across every renewal.
   */
  accountToken(accountId: string): string {
    const existing = this.db
      .prepare('SELECT token FROM app_store_tokens WHERE account_id = ?')
      .get(accountId) as { token: string } | undefined;
    if (existing) return existing.token;
    const token = randomUUID();
    this.db
      .prepare('INSERT INTO app_store_tokens (token, account_id) VALUES (?, ?)')
      .run(token, accountId);
    return token;
  }

  /**
   * One transaction as StoreKit handed it to the app: verify, attribute, store.
   * Idempotent, and safe to send again on every launch — the app does, for
   * every subscription StoreKit says is current.
   *
   * Anything that is not a subscription is acknowledged and not stored: there
   * is nothing else on sale, and a 200 is what lets the app finish it rather
   * than send it forever.
   */
  async record(signed: string, now: number): Promise<ProRecordResult> {
    if (!this.options) return { ok: false, reason: 'unconfigured' };
    const transaction = await this.options.verifier.transaction(signed);
    if (transaction === 'retry') return { ok: false, reason: 'retry' };
    if (!transaction) return { ok: false, reason: 'unverified' };
    this.store(transaction, now);
    return { ok: true };
  }

  /**
   * An App Store Server Notification. Every one that carries a subscription
   * transaction is stored the same way an upload is — a renewal moves the
   * expiry on, a refund or revocation ends it — so the notification type is
   * not consulted at all. Apple's transaction already says what it means.
   */
  async notification(signed: string, now: number): Promise<ProRecordResult> {
    if (!this.options) return { ok: false, reason: 'unconfigured' };
    const notification = await this.options.verifier.notification(signed);
    if (notification === 'retry') return { ok: false, reason: 'retry' };
    if (!notification) return { ok: false, reason: 'unverified' };
    if (notification.transaction) this.store(notification.transaction, now);
    return { ok: true };
  }

  /**
   * When this account's Pro ends, if it is Pro now: the latest expiry of any
   * subscription it holds that has not been revoked. Null when it is not.
   */
  activeUntil(accountId: string, now: number): number | null {
    const row = this.db
      .prepare(
        `SELECT MAX(expires_at) AS until FROM pro_subscriptions
          WHERE account_id = ? AND revoked_at IS NULL AND expires_at IS NOT NULL`
      )
      .get(accountId) as { until: number | null };
    const until = row.until === null ? null : Number(row.until);
    return until !== null && until + PRO_LEEWAY_MS > now ? until : null;
  }

  isPro(accountId: string, now: number): boolean {
    return this.activeUntil(accountId, now) !== null;
  }

  /** Whether any subscription is recorded, whatever the configuration says. */
  hasRecords(): boolean {
    return !!this.db.prepare('SELECT 1 FROM pro_subscriptions LIMIT 1').get();
  }

  /**
   * One row per subscription, keyed on its original transaction, holding the
   * furthest period anybody has shown this server. A revocation ends it; a
   * later period that is not revoked starts it again.
   */
  private store(transaction: AppleTransaction, now: number) {
    if (transaction.type !== 'Auto-Renewable Subscription') return;

    const holder = transaction.appAccountToken
      ? (this.db
          .prepare('SELECT account_id FROM app_store_tokens WHERE token = ?')
          .get(transaction.appAccountToken.toLowerCase()) as
          | { account_id: string }
          | undefined)
      : undefined;

    this.db
      .prepare(
        `INSERT INTO pro_subscriptions (
           original_transaction_id, account_id, product_id, environment,
           expires_at, revoked_at, latest_transaction_id, updated_at, raw
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(original_transaction_id) DO UPDATE SET
           account_id = COALESCE(pro_subscriptions.account_id, excluded.account_id),
           revoked_at = CASE
             WHEN excluded.revoked_at IS NOT NULL THEN excluded.revoked_at
             WHEN excluded.expires_at > COALESCE(pro_subscriptions.expires_at, 0)
               THEN NULL
             ELSE pro_subscriptions.revoked_at
           END,
           expires_at = MAX(COALESCE(pro_subscriptions.expires_at, 0),
                            COALESCE(excluded.expires_at, 0)),
           latest_transaction_id = CASE
             WHEN COALESCE(excluded.expires_at, 0) >= COALESCE(pro_subscriptions.expires_at, 0)
               THEN excluded.latest_transaction_id
             ELSE pro_subscriptions.latest_transaction_id
           END,
           updated_at = excluded.updated_at,
           raw = excluded.raw`
      )
      .run(
        transaction.originalTransactionId,
        holder?.account_id ?? null,
        transaction.productId,
        transaction.environment,
        transaction.expiresDate,
        transaction.revocationDate,
        transaction.transactionId,
        now,
        JSON.stringify(transaction.raw)
      );
  }
}
