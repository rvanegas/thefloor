import { describeChannel } from '../naming';
import { createChannel, reduce } from '../channel';

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

describe('when a channel was last in use', () => {
  const A = 'user-a';
  const B = 'user-b';
  const T0 = 1_700_000_000_000;

  const opened = (now = T0) =>
    createChannel({ id: 'c1', initiator: A, invitees: [B], now });

  it('starts at the moment it was opened', () => {
    expect(opened().lastActiveAt).toBe(T0);
  });

  it('moves when somebody steps in', () => {
    const s = reduce(opened(), { type: 'ENTER', userId: B }, T0 + 60_000);
    expect(s.lastActiveAt).toBe(T0 + 60_000);
  });

  it('moves again when the channel empties, marking when it went quiet', () => {
    // The interesting stamp for ordering: a channel is ranked by when it was
    // last in use, and for an empty one that is when the last person left.
    let s = reduce(opened(), { type: 'ENTER', userId: B }, T0 + 1_000);
    s = reduce(s, { type: 'STEP_OUT', userId: A }, T0 + 5_000);
    s = reduce(s, { type: 'STEP_OUT', userId: B }, T0 + 30_000);
    expect(s.present).toEqual([]);
    expect(s.lastActiveAt).toBe(T0 + 30_000);
  });

  it('is untouched by things that are not comings and goings', () => {
    // Renaming a channel from the settings screen is not using it, and should
    // not jump it up the list.
    const s = reduce(
      opened(),
      { type: 'SET_NAME', userId: A, name: 'Thursday' },
      T0 + 90_000
    );
    expect(s.lastActiveAt).toBe(T0);
  });
});
