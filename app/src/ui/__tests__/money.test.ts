import { describeGiving, formatAmount } from '../money';

describe('formatAmount', () => {
  it('puts a symbol on the currencies that have one', () => {
    expect(formatAmount(300, 'USD')).toBe('$3.00');
    expect(formatAmount(1050, 'EUR')).toBe('€10.50');
    expect(formatAmount(99, 'GBP')).toBe('£0.99');
  });

  it('falls back to the code rather than guessing a symbol', () => {
    expect(formatAmount(1200, 'SEK')).toBe('12.00 SEK');
  });

  it('does not care how the currency was capitalised', () => {
    expect(formatAmount(300, 'usd')).toBe('$3.00');
  });

  it('keeps both decimals on a round number', () => {
    // "$5" reads as an approximation; "$5.00" reads as a figure.
    expect(formatAmount(500, 'USD')).toBe('$5.00');
  });
});

describe('describeGiving', () => {
  it('says the one amount', () => {
    expect(
      describeGiving({
        count: 2,
        since: 0,
        totals: [{ currency: 'USD', cents: 550 }],
      })
    ).toBe('$5.50');
  });

  it('joins currencies rather than adding them', () => {
    // Adding dollars to euros produces a number true in neither, and the
    // person who gave in both is exactly who would notice.
    expect(
      describeGiving({
        count: 3,
        since: 0,
        totals: [
          { currency: 'EUR', cents: 1000 },
          { currency: 'USD', cents: 300 },
        ],
      })
    ).toBe('€10.00 and $3.00');
  });

  it('reads as a list past two', () => {
    expect(
      describeGiving({
        count: 3,
        since: 0,
        totals: [
          { currency: 'EUR', cents: 1000 },
          { currency: 'USD', cents: 300 },
          { currency: 'GBP', cents: 250 },
        ],
      })
    ).toBe('€10.00, $3.00 and £2.50');
  });

  it('has something to say when there is nothing', () => {
    expect(describeGiving({ count: 0, since: 0, totals: [] })).toBe(
      'nothing yet'
    );
  });
});
