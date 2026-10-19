import { Platform } from 'react-native';
import {
  deepLinkToSubscriptions,
  ErrorCode,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  restorePurchases,
  type Purchase,
} from 'expo-iap';
import type { ProView } from '../../../core/protocol';

/**
 * *Pro*, bought through the App Store, on iOS — and nothing at all anywhere
 * else. `purchases.web.ts` is this file with every answer empty, so the web
 * bundle never imports StoreKit; on Android `available` is false. Whoever is
 * Pro is Pro everywhere: only the buying is here. See server/src/pro.ts.
 *
 * **The order is the whole design: the server records a transaction, and only
 * then is it finished.** StoreKit keeps anything unfinished and offers it
 * again — through the listener, and to `getAvailablePurchases` at the next
 * launch — so finishing first is the one way to lose one. Every failure leaves
 * it unfinished, which costs a retry and never a subscription.
 */

export const available = Platform.OS === 'ios';

/** Pro as the store prices it, in the person's own currency. */
export interface Offer {
  product: string;
  price: string;
}

/**
 * Where the server stands on one upload. `recorded` is the only one that
 * finishes the transaction; `refused` is one the server says is not genuine,
 * and `later` is anything that might succeed if tried again.
 */
export type UploadResult =
  | { kind: 'recorded'; pro: ProView }
  | { kind: 'refused' }
  | { kind: 'later' };

/** What the screen hears about a purchase it may not have started. */
export type PurchaseEvent =
  | { kind: 'recorded'; pro: ProView }
  /** Null message: StoreKit took it and the server has not confirmed it yet. */
  | { kind: 'failed'; message: string | null }
  | { kind: 'cancelled' };

let connection: Promise<boolean> | null = null;

/** Connects once, and again after a failure rather than never. */
function connect(): Promise<boolean> {
  if (!connection) {
    connection = initConnection().then(
      () => true,
      () => {
        connection = null;
        return false;
      }
    );
  }
  return connection;
}

/**
 * Pro, priced. Null when the store does not have the product — App Store
 * Connect not set up yet — or cannot be reached, and the screen then offers
 * nothing rather than a button that cannot work.
 */
export async function loadOffer(product: string): Promise<Offer | null> {
  if (!available || !product) return null;
  if (!(await connect())) return null;
  const found = (await fetchProducts({ skus: [product], type: 'subs' })) ?? [];
  const match = (found as Array<{ id: string; displayPrice: string }>).find(
    (p) => p.id === product
  );
  return match ? { product, price: match.displayPrice } : null;
}

/**
 * Asks StoreKit for it. The outcome arrives through `watchPurchases`, never
 * here — the sheet can be dismissed, approved later by a parent, or succeed
 * after this screen has gone. False when the store cannot be reached at all,
 * which the screen says in its own words.
 */
export async function subscribe(product: string, accountToken: string): Promise<boolean> {
  if (!(await connect())) return false;
  await requestPurchase({
    request: { apple: { sku: product, appAccountToken: accountToken } },
    type: 'subs',
  });
  return true;
}

/** The current watcher's sweep, so `restore` can ask for one. */
let sweep: (() => Promise<void>) | null = null;

/**
 * Restore, which Apple asks a subscription to offer. It asks the store to
 * resynchronise and then sends whatever it holds, exactly as a launch does;
 * the answers arrive as events. Mostly useful when an upload failed: Pro
 * lives on the account, so signing in on another phone already has it.
 */
export async function restore(): Promise<boolean> {
  if (!(await connect())) return false;
  await restorePurchases();
  await sweep?.();
  return true;
}

/** Apple's own screen for cancelling or changing it, which is the only one. */
export async function manage(): Promise<void> {
  await deepLinkToSubscriptions();
}

const listeners = new Set<(event: PurchaseEvent) => void>();

/** For the screen, which shows what happened to a purchase it can see. */
export function onPurchase(listener: (event: PurchaseEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function tell(event: PurchaseEvent) {
  for (const listener of listeners) listener(event);
}

/**
 * Hands every transaction StoreKit reports to `upload`, and finishes it once
 * the server has it — for as long as somebody is signed in, so a purchase
 * completing after the screen closed is still recorded, and every renewal the
 * phone hears of reaches the server even if Apple's own notification did not.
 *
 * Also sweeps up what is current at the start, which is the recovery for an
 * upload that failed or an app killed in between.
 */
export function watchPurchases(
  upload: (signedTransaction: string) => Promise<UploadResult>
): () => void {
  if (!available) return () => {};
  let stopped = false;
  // One upload per transaction at a time: the listener and the sweep can both
  // see the same transaction at launch.
  const inFlight = new Set<string>();

  async function handle(purchase: Purchase) {
    const signed = purchase.purchaseToken;
    const key = purchase.transactionId ?? signed;
    if (!signed || !key || inFlight.has(key) || stopped) return;
    inFlight.add(key);
    try {
      const result = await upload(signed);
      if (result.kind === 'recorded') {
        await finishTransaction({ purchase, isConsumable: false });
        tell({ kind: 'recorded', pro: result.pro });
      } else {
        // Refused or unreachable, it stays unfinished and is sent again at
        // the next launch — which is what the screen then says.
        tell({ kind: 'failed', message: null });
      }
    } catch {
      // The store would not finish it: it comes round again, and the server
      // already has it, so nothing is lost.
      tell({ kind: 'failed', message: null });
    } finally {
      inFlight.delete(key);
    }
  }

  const updated = purchaseUpdatedListener((purchase) => void handle(purchase));
  const failed = purchaseErrorListener((error) => {
    // Cancelling the sheet is a choice, not an error, and gets no message —
    // only the button back.
    if (error.code === ErrorCode.UserCancelled) return tell({ kind: 'cancelled' });
    tell({ kind: 'failed', message: error.message || null });
  });

  const sweepNow = async () => {
    if (!(await connect()) || stopped) return;
    try {
      const current = (await getAvailablePurchases()) ?? [];
      for (const purchase of current) await handle(purchase);
    } catch {
      // Nothing to sweep is the usual answer; a failure is the same outcome.
    }
  };
  sweep = sweepNow;
  void sweepNow();

  return () => {
    stopped = true;
    if (sweep === sweepNow) sweep = null;
    updated.remove();
    failed.remove();
  };
}
