import { playFirstAccepted } from '../../../modules/audio-route';

/**
 * The negotiation that keeps a bundle newer than its binary audible.
 *
 * **This covers a fault that was produced four times in one day and diagnosed
 * as the bug it was obscuring.** `chime`'s native signature moved from one
 * argument to four while a quiet chime was being chased; an Expo `Function`
 * throws when it receives more arguments than it declares, the caller caught
 * it and answered `false`, and the phone went completely silent — a fresh
 * symptom each time, arriving in the middle of the original one.
 *
 * There is no jest coverage of the module itself: `load()` returns null off
 * iOS, so every exported call here is a null check under test and nothing more.
 * This is the one piece of logic that decides whether a cue is heard, so it is
 * pulled out where it can be exercised.
 */

/** An Expo `Function` that declares `n` arguments, refusing any more. */
function binaryTaking(n: number): (...args: unknown[]) => boolean {
  return (...args: unknown[]) => {
    if (args.length > n) {
      throw new Error(
        `Received ${args.length} arguments, but ${n} was expected`
      );
    }
    return true;
  };
}

const forms: unknown[][] = [
  ['in', 0.18, 0.18, 'system'],
  ['in', 0.18, 0.18],
  ['in', 0.18],
  ['in'],
];

describe('playFirstAccepted', () => {
  it('takes the richest form a current binary accepts', () => {
    expect(playFirstAccepted(binaryTaking(4), forms)).toEqual({
      played: true,
      arity: 4,
    });
  });

  it('steps down to what an older binary declares, rather than going silent', () => {
    // The exact case that produced the silence: a bundle asking for a path
    // against a binary built before the path existed.
    expect(playFirstAccepted(binaryTaking(3), forms)).toEqual({
      played: true,
      arity: 3,
    });
    expect(playFirstAccepted(binaryTaking(2), forms)).toEqual({
      played: true,
      arity: 2,
    });
    expect(playFirstAccepted(binaryTaking(1), forms)).toEqual({
      played: true,
      arity: 1,
    });
  });

  it('passes the arguments of the form it settled on', () => {
    const seen: unknown[][] = [];
    const play = (...args: unknown[]) => {
      seen.push(args);
      if (args.length > 2) throw new Error('Received too many arguments');
      return true;
    };
    playFirstAccepted(play, forms);
    expect(seen[seen.length - 1]).toEqual(['in', 0.18]);
  });

  it('reports no arity when nothing is accepted', () => {
    const play = () => {
      throw new Error('module is broken in some other way');
    };
    expect(playFirstAccepted(play, forms)).toEqual({
      played: false,
      arity: null,
    });
  });

  it('does not treat a binary answering false as a refusal to try', () => {
    // False means it played nothing and knows why — an unknown kind, say.
    // Stepping down would ask the same binary the same question again.
    let calls = 0;
    const play = () => {
      calls += 1;
      return false;
    };
    expect(playFirstAccepted(play, forms)).toEqual({ played: false, arity: 4 });
    expect(calls).toBe(1);
  });
});
