import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Environment,
  SignedDataVerifier,
  VerificationException,
  VerificationStatus,
} from '@apple/app-store-server-library';

/**
 * Who the App Store says signed a purchase, and the one thing that checks it.
 *
 * In-app purchase is the *Pro* subscription — see pro.ts. Donations are not
 * sold this way and stay on the Ko-fi link. The app sends the transaction
 * StoreKit handed it, exactly as Apple signed it, and nothing the app says
 * about it is believed: product, expiry, account and environment are all read
 * out of the signed payload here.
 */

/**
 * The bundle identifier and the App Store's numeric id for this app — both
 * permanent once registered, so constants rather than configuration, as the
 * apple-app-site-association in app.ts is. A wrong one fails every purchase
 * as unverified.
 */
export const BUNDLE_ID = 'co.rvanegas.thefloor';
export const APP_APPLE_ID = 6799628190;

/**
 * Apple Root CA - G3, which every App Store signature chains to.
 *
 * In the tree rather than fetched: a trust anchor read off the network at
 * startup is one the network can substitute. Downloaded from
 * apple.com/certificateauthority on 2026-10-19; SHA-256
 * 63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79,
 * valid until 2039.
 */
const ROOT_CERTIFICATE = join(__dirname, '..', 'certs', 'AppleRootCA-G3.cer');

/** A purchase, as Apple signed it. */
export interface AppleTransaction {
  transactionId: string;
  /**
   * The first transaction of a subscription, shared by every renewal — what a
   * subscription is keyed on, where a single purchase is its own.
   */
  originalTransactionId: string;
  productId: string;
  /** 'Auto-Renewable Subscription', 'Consumable' and so on. */
  type: string | null;
  /** What the app passed to StoreKit; see `ProSubscriptions.accountToken`. */
  appAccountToken: string | null;
  /** When this period of a subscription ends. */
  expiresDate: number | null;
  /** 'Production' or 'Sandbox' — TestFlight and review purchases are Sandbox. */
  environment: string;
  purchaseDate: number | null;
  /** Set when Apple has refunded or revoked it. */
  revocationDate: number | null;
  /** The decoded payload whole, so a field nobody read is still recoverable. */
  raw: Record<string, unknown>;
}

export interface AppleNotification {
  /** `REFUND`, `REFUND_REVERSED` and the rest of NotificationTypeV2. */
  type: string;
  transaction: AppleTransaction | null;
}

/**
 * `null` is "not genuine", which no retry will change. `'retry'` is Apple's
 * certificate checks failing for a reason that might not hold in a minute —
 * the route answers 503 so the app keeps the purchase unfinished and tries
 * again, rather than dropping it.
 */
export interface AppStoreVerifier {
  transaction(signed: string): Promise<AppleTransaction | null | 'retry'>;
  notification(signed: string): Promise<AppleNotification | null | 'retry'>;
}

/** Apple's own verifier, for both environments a real purchase arrives from. */
export function appleVerifier(): AppStoreVerifier {
  const roots = [readFileSync(ROOT_CERTIFICATE)];
  // Production first, because that is what money is, and Sandbox when Apple's
  // check says the environment is the wrong one — TestFlight, App Review and
  // the sandbox tester all buy there. The production verifier is the only one
  // given the app's numeric id; Apple omits it from sandbox payloads.
  const verifiers = [
    new SignedDataVerifier(roots, true, Environment.PRODUCTION, BUNDLE_ID, APP_APPLE_ID),
    new SignedDataVerifier(roots, true, Environment.SANDBOX, BUNDLE_ID),
  ];

  async function attempt<T>(
    run: (verifier: SignedDataVerifier) => Promise<T>
  ): Promise<T | null | 'retry'> {
    for (const verifier of verifiers) {
      try {
        return await run(verifier);
      } catch (error) {
        if (!(error instanceof VerificationException)) return null;
        if (error.status === VerificationStatus.INVALID_ENVIRONMENT) continue;
        if (error.status === VerificationStatus.RETRYABLE_VERIFICATION_FAILURE) {
          return 'retry';
        }
        return null;
      }
    }
    return null;
  }

  return {
    async transaction(signed) {
      const decoded = await attempt((v) => v.verifyAndDecodeTransaction(signed));
      if (decoded === null || decoded === 'retry') return decoded;
      return toTransaction(decoded as unknown as Record<string, unknown>);
    },
    async notification(signed) {
      const decoded = await attempt((v) => v.verifyAndDecodeNotification(signed));
      if (decoded === null || decoded === 'retry') return decoded;
      const inner = decoded.data?.signedTransactionInfo;
      let transaction: AppleTransaction | null = null;
      if (inner) {
        const verified = await attempt((v) => v.verifyAndDecodeTransaction(inner));
        if (verified === 'retry') return 'retry';
        transaction = verified
          ? toTransaction(verified as unknown as Record<string, unknown>)
          : null;
      }
      return { type: String(decoded.notificationType ?? ''), transaction };
    },
  };
}

/**
 * The fields read, out of a payload already verified. Exported for the fake
 * verifier the tests use, so the two cannot disagree about the shape.
 */
export function toTransaction(payload: Record<string, unknown>): AppleTransaction | null {
  const text = (key: string) =>
    typeof payload[key] === 'string' && payload[key] !== '' ? (payload[key] as string) : null;
  const number = (key: string) =>
    typeof payload[key] === 'number' && Number.isFinite(payload[key])
      ? (payload[key] as number)
      : null;

  const transactionId = text('transactionId');
  const productId = text('productId');
  if (!transactionId || !productId) return null;
  return {
    transactionId,
    originalTransactionId: text('originalTransactionId') ?? transactionId,
    productId,
    type: text('type'),
    appAccountToken: text('appAccountToken'),
    expiresDate: number('expiresDate'),
    environment: text('environment') ?? 'Production',
    purchaseDate: number('purchaseDate'),
    revocationDate: number('revocationDate'),
    raw: payload,
  };
}
