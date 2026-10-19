import type { ProView } from '../../../core/protocol';

/**
 * Buying *Pro* on the web, which is nothing: a browser has no StoreKit. Being
 * Pro still shows — that is the server's answer, not this file's. The same
 * exports as `purchases.ts`, so nothing above this file asks which platform
 * it is on, and the web bundle never imports the native module.
 */

export const available = false;

export interface Offer {
  product: string;
  price: string;
}

export type UploadResult =
  | { kind: 'recorded'; pro: ProView }
  | { kind: 'refused' }
  | { kind: 'later' };

export type PurchaseEvent =
  | { kind: 'recorded'; pro: ProView }
  | { kind: 'failed'; message: string | null }
  | { kind: 'cancelled' };

export async function loadOffer(_product: string): Promise<Offer | null> {
  return null;
}

export async function subscribe(_product: string, _accountToken: string): Promise<boolean> {
  return false;
}

export async function restore(): Promise<boolean> {
  return false;
}

export async function manage(): Promise<void> {}

export function onPurchase(_listener: (event: PurchaseEvent) => void): () => void {
  return () => {};
}

export function watchPurchases(
  _upload: (signedTransaction: string) => Promise<UploadResult>
): () => void {
  return () => {};
}
