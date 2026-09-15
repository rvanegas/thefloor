import { answersWaiting, seenAtOf, watermarkOf } from '../helpSeen';

/**
 * The rule behind the Support tab's dab.
 *
 * **It is a watermark and not a set, which is what keeps it honest.** The help
 * screen says at length that it has no unread count — one person with a script
 * writes an answer into the question's own place, and there is no reply to the
 * reply. One number can only say *something came back since you last looked*,
 * which is the whole of what a tab owes, and cannot say which question, so
 * nothing inside that screen gains a mark.
 *
 * The asymmetry with the Contacts dab is the thing to hold on to and is why
 * this file exists at all: a request to answer is live state and stops being
 * true when it is answered, so that mark clears itself. An answer stays
 * answered for ever, so this one has to be *read* to clear.
 */

describe('answersWaiting', () => {
  /** Nothing answered, nothing to say — the state of most accounts. */
  it('says nothing when no answer exists', () => {
    expect(answersWaiting(null, null)).toBe(false);
    expect(answersWaiting(null, 500)).toBe(false);
  });

  /**
   * Absent rather than null is what an old server sends: the field is optional
   * precisely so a client between a release and the deploy after it reads
   * silence as nothing to say rather than as something waiting.
   */
  it('reads a server that has never heard of the field as nothing', () => {
    expect(answersWaiting(undefined, null)).toBe(false);
    expect(answersWaiting(undefined, 500)).toBe(false);
  });

  /**
   * **Never seen is not the same as nothing waiting**, and this is the case
   * that makes the mark worth having: an account asks on one phone and picks up
   * the other, where nobody has read anything.
   */
  it('marks an answer this install has never read', () => {
    expect(answersWaiting(500, null)).toBe(true);
  });

  /** Read up to the newest answer: nothing waiting. */
  it('says nothing once the newest answer has been read', () => {
    expect(answersWaiting(500, 500)).toBe(false);
    expect(answersWaiting(500, 900)).toBe(false);
  });

  /** And marks the next one, which is what a second answer looks like. */
  it('marks an answer newer than what was read', () => {
    expect(answersWaiting(900, 500)).toBe(true);
  });
});

describe('watermarkOf', () => {
  /** An account with questions and no answers writes nothing. */
  it('is null when nothing has been answered', () => {
    expect(watermarkOf([])).toBeNull();
    expect(
      watermarkOf([{ answeredAt: null }, { answeredAt: null }])
    ).toBeNull();
  });

  /**
   * The newest, whatever order the rows arrive in. `forAccount` sorts by
   * `asked_at` rather than by `answered_at`, so the newest answer is not the
   * first row and is not the last one either.
   */
  it('takes the newest answer, in any order', () => {
    expect(
      watermarkOf([
        { answeredAt: 300 },
        { answeredAt: 900 },
        { answeredAt: 100 },
      ])
    ).toBe(900);
  });

  /** Unanswered rows are skipped, not counted as zero. */
  it('ignores the questions still waiting', () => {
    expect(
      watermarkOf([{ answeredAt: null }, { answeredAt: 300 }])
    ).toBe(300);
  });

  /**
   * **Off the rows rather than off the clock**, which is the one thing this
   * function exists to guarantee. Marking read with `Date.now()` would swallow
   * an answer written between the fetch and the write — invisible for ever,
   * the failure a watermark has and a set does not. Taking the number from what
   * was on screen makes the worst case a mark that survives one reading.
   */
  it('never reaches past the newest answer it was shown', () => {
    const now = 10_000;
    expect(watermarkOf([{ answeredAt: 300 }])).toBeLessThan(now);
  });
});

describe('seenAtOf', () => {
  /** Never written: never seen. */
  it('reads an empty store as never seen', () => {
    expect(seenAtOf(null)).toBeNull();
  });

  it('reads back what was written', () => {
    expect(seenAtOf('1700000000000')).toBe(1_700_000_000_000);
  });

  /**
   * Anything unreadable is never seen, which shows the mark to somebody who may
   * have read the answer. A mark too many costs a tap; the other direction
   * hides an answer somebody is waiting for.
   */
  it('reads rubbish as never seen', () => {
    expect(seenAtOf('')).toBeNull();
    expect(seenAtOf('soon')).toBeNull();
    expect(seenAtOf('0')).toBeNull();
    expect(seenAtOf('-1')).toBeNull();
  });
});
