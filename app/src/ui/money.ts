/**
 * Saying what somebody has given, in words rather than a table.
 *
 * Its own file, and tested, because currency formatting is the kind of thing
 * that looks obviously right and is quietly wrong for the one person who gave
 * in euros — and because the alternative was arithmetic inside JSX.
 */

/** What a donation total looks like on the wire. */
export interface Given {
  count: number;
  since: number;
  totals: Array<{ currency: string; cents: number }>;
}

/**
 * Symbols for the currencies Ko-fi actually pays out in that have one worth
 * showing. Anything else falls back to its code, which reads as "12.00 SEK" —
 * plainer than a wrong symbol, and nobody is misled about what they gave.
 */
const SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CAD: 'CA$',
  AUD: 'A$',
  NZD: 'NZ$',
  JPY: '¥',
};

/**
 * One amount, as money.
 *
 * Two decimal places always, including on a round number: "$5" reads as an
 * approximation where "$5.00" reads as a figure. Yen is the exception that
 * would need zero decimals, and is left alone here rather than half-handled —
 * it would take a subunit table to do properly, and this shows a total
 * somebody already knows rather than issuing a receipt.
 */
export function formatAmount(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(2);
  const symbol = SYMBOLS[currency.toUpperCase()];
  return symbol ? `${symbol}${amount}` : `${amount} ${currency.toUpperCase()}`;
}

/**
 * The whole of what somebody has given, across however many currencies.
 *
 * Currencies are joined rather than summed, for the reason the server groups
 * them: adding dollars to euros produces a number that is not true in either,
 * and the person who gave in both is exactly who would notice.
 */
export function describeGiving(given: Given): string {
  const amounts = given.totals.map((total) =>
    formatAmount(total.cents, total.currency)
  );
  if (amounts.length === 0) return 'nothing yet';
  if (amounts.length === 1) return amounts[0];
  return `${amounts.slice(0, -1).join(', ')} and ${amounts[amounts.length - 1]}`;
}
