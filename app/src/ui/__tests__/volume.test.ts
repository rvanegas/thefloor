import { louder, quieter } from '../volume';

/**
 * Asserted in percent, which is what the readout shows and how the rule is
 * stated: tenths above 10%, single points at or below it.
 */
const pct = (volume: number) => Math.round(volume * 100);

describe('coarse range', () => {
  it('moves a tenth at a time', () => {
    expect(pct(louder(0.7))).toBe(80);
    expect(pct(quieter(0.7))).toBe(60);
  });

  it('stops at the ends', () => {
    expect(pct(louder(1))).toBe(100);
    expect(pct(quieter(0))).toBe(0);
  });

  it('lands on tenths from a volume that is not on one', () => {
    expect(pct(louder(0.73))).toBe(80);
    expect(pct(quieter(0.73))).toBe(70);
  });
});

describe('below a tenth, where background music is tuned', () => {
  it('steps by one point down from the boundary', () => {
    expect(pct(quieter(0.1))).toBe(9);
    expect(pct(quieter(0.09))).toBe(8);
    expect(pct(quieter(0.01))).toBe(0);
  });

  it('steps by one point up until the boundary, then by tenths', () => {
    expect(pct(louder(0))).toBe(1);
    expect(pct(louder(0.09))).toBe(10);
    expect(pct(louder(0.1))).toBe(20);
  });

  it('is reversible, so a fumbled tap costs nothing', () => {
    for (const start of [0, 0.03, 0.09, 0.1, 0.2, 0.9]) {
      expect(pct(quieter(louder(start)))).toBe(pct(start));
    }
  });
});
