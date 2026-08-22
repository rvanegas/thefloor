import {
  NO_NUDGE,
  NUDGE_FIRST_MS,
  NUDGE_LIMIT,
  NUDGE_REPEAT_MS,
  type NudgeState,
  step,
} from '../nudge';

const CLAIM = 1_000_000;

/**
 * Runs the schedule forward the way the hook does — arm a timer for `nextAt`,
 * call again when it fires — and returns when each buzz landed.
 *
 * Written as a driver rather than as a series of hand-computed instants
 * because the thing worth pinning is the *sequence* a real caller sees. A test
 * that asserts each step in isolation can pass while the states do not join up.
 */
function run(
  start: NudgeState,
  from: number,
  { claim, speaking, until }: { claim: number | null; speaking: boolean; until: number }
): { state: NudgeState; buzzes: number[] } {
  let state = start;
  let now = from;
  const buzzes: number[] = [];
  for (;;) {
    const next = step(state, { claim, speaking, now });
    state = next.state;
    if (next.buzz) buzzes.push(now);
    if (next.nextAt === null || next.nextAt > until) return { state, buzzes };
    now = next.nextAt;
  }
}

describe('nudging somebody who is talking while silenced', () => {
  it('says nothing to somebody who is silenced and quiet', () => {
    // The commonest case by far, and the one a cue at the transition would
    // have buzzed anyway: they are listening, which is what the floor is for.
    const { buzzes } = run(NO_NUDGE, CLAIM, {
      claim: CLAIM,
      speaking: false,
      until: CLAIM + 60_000,
    });
    expect(buzzes).toEqual([]);
  });

  it('says nothing to somebody talking who is not silenced', () => {
    const { buzzes } = run(NO_NUDGE, CLAIM, {
      claim: null,
      speaking: true,
      until: CLAIM + 60_000,
    });
    expect(buzzes).toEqual([]);
  });

  it('waits two seconds, then buzzes every three, four times', () => {
    const { buzzes } = run(NO_NUDGE, CLAIM, {
      claim: CLAIM,
      speaking: true,
      until: CLAIM + 60_000,
    });
    expect(buzzes).toEqual([
      CLAIM + NUDGE_FIRST_MS,
      CLAIM + NUDGE_FIRST_MS + NUDGE_REPEAT_MS,
      CLAIM + NUDGE_FIRST_MS + NUDGE_REPEAT_MS * 2,
      CLAIM + NUDGE_FIRST_MS + NUDGE_REPEAT_MS * 3,
    ]);
    expect(buzzes).toHaveLength(NUDGE_LIMIT);
  });

  it('stops for the rest of the claim, however long it lasts', () => {
    // Three minutes is the longest a claim can run, and a phone that buzzed
    // for all of it would be worse than the problem.
    const spent = run(NO_NUDGE, CLAIM, {
      claim: CLAIM,
      speaking: true,
      until: CLAIM + 30_000,
    });
    const later = run(spent.state, CLAIM + 180_000, {
      claim: CLAIM,
      speaking: true,
      until: CLAIM + 300_000,
    });
    expect(later.buzzes).toEqual([]);
  });

  it('restarts the two-second delay after a pause, and does not buzz on resuming', () => {
    let state = run(NO_NUDGE, CLAIM, {
      claim: CLAIM,
      speaking: true,
      until: CLAIM + NUDGE_FIRST_MS,
    }).state;
    // They stop.
    state = step(state, { claim: CLAIM, speaking: false, now: CLAIM + 3_000 }).state;
    // And start again. The next buzz is two seconds in, not immediate: the
    // delay is what tells talking apart from a noise, and it is wanted every
    // time.
    const resumed = run(state, CLAIM + 20_000, {
      claim: CLAIM,
      speaking: true,
      until: CLAIM + 23_000,
    });
    expect(resumed.buzzes).toEqual([CLAIM + 20_000 + NUDGE_FIRST_MS]);
  });

  it('does not refill the budget on every pause', () => {
    // The case the per-claim cap exists for: a sentence, a breath, a sentence.
    // Counted per run of speech, somebody speaking normally would collect four
    // buzzes over and over for one claim.
    let state = NO_NUDGE;
    let now = CLAIM;
    const buzzes: number[] = [];
    for (let turn = 0; turn < 6; turn += 1) {
      const spoke = run(state, now, {
        claim: CLAIM,
        speaking: true,
        until: now + 6_000,
      });
      buzzes.push(...spoke.buzzes);
      state = step(spoke.state, {
        claim: CLAIM,
        speaking: false,
        now: now + 6_000,
      }).state;
      now += 12_000;
    }
    expect(buzzes).toHaveLength(NUDGE_LIMIT);
  });

  it('gives a fresh budget to a second claim', () => {
    // A new claim is a new situation. Somebody who was told four times about
    // the last one has learnt nothing about this one.
    const spent = run(NO_NUDGE, CLAIM, {
      claim: CLAIM,
      speaking: true,
      until: CLAIM + 30_000,
    });
    const again = run(spent.state, CLAIM + 60_000, {
      claim: CLAIM + 60_000,
      speaking: true,
      until: CLAIM + 120_000,
    });
    expect(again.buzzes).toHaveLength(NUDGE_LIMIT);
  });

  it('forgets the budget when the floor is released', () => {
    const spent = run(NO_NUDGE, CLAIM, {
      claim: CLAIM,
      speaking: true,
      until: CLAIM + 30_000,
    });
    const released = step(spent.state, {
      claim: null,
      speaking: true,
      now: CLAIM + 40_000,
    });
    expect(released.state).toEqual(NO_NUDGE);
  });

  it('does not owe a buzz immediately when a timer fires late', () => {
    // Timers on a busy phone are late, and a run of speech long enough to be
    // buzzed at is exactly when the audio stack is busiest. Measuring the next
    // gap from the delivery rather than from what was due keeps the buzzes
    // three seconds apart rather than firing two together to catch up.
    const armed = step(NO_NUDGE, { claim: CLAIM, speaking: true, now: CLAIM });
    const late = step(armed.state, {
      claim: CLAIM,
      speaking: true,
      now: CLAIM + 5_000,
    });
    expect(late.buzz).toBe(true);
    expect(late.nextAt).toBe(CLAIM + 5_000 + NUDGE_REPEAT_MS);
  });
});
