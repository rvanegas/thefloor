import { describeChannel } from '../naming';

/**
 * Three surfaces used to answer this question three ways — Home listed the
 * names, the channel header and the push title said "N people". These cases
 * are the one answer they now share.
 */
describe('describing a channel nobody has named', () => {
  it('names the other party when there is one', () => {
    expect(describeChannel(['Alice'])).toBe('Alice');
  });

  it('names both when there are two', () => {
    expect(describeChannel(['Alice', 'Bob'])).toBe('Alice and Bob');
  });

  it('stops at two names and counts the rest, for a one-line row', () => {
    expect(describeChannel(['Alice', 'Bob', 'Carol'])).toBe(
      'Alice, Bob and 1 other'
    );
    expect(describeChannel(['Alice', 'Bob', 'Carol', 'Dan', 'Erin'])).toBe(
      'Alice, Bob and 3 others'
    );
  });

  it('says so plainly when everyone else has left', () => {
    // A channel the others walked out of is still yours. This used to render
    // as "1 people" in the header and on the lock screen.
    expect(describeChannel([])).toBe('Just you');
  });
});
