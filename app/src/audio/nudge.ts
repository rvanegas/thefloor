/**
 * When to tell somebody, without words, that they are talking to nobody.
 *
 * A floor claim cuts everyone else and says so on screen, which reaches only
 * the people looking at the screen. This is the schedule for the cue that
 * reaches the rest: it fires while they are *speaking* while silenced, rather
 * than at the moment the floor is claimed. A one-shot cue at the transition is
 * missed by exactly the person it is for — the phone is in a pocket, they are
 * mid-sentence, and a single buzz against a leg is the least noticeable thing
 * that could arrive.
 *
 * **Four buzzes, then it stops, and stopping is a decision rather than a
 * limit.** The first comes two seconds into a run of speech, the rest three
 * seconds apart. Somebody who has been told four times and is still talking
 * has either understood and carried on deliberately, or is not going to be
 * reached by a fifth — and a phone that buzzes every three seconds for the
 * whole of a claim is its own kind of hostile.
 *
 * **The budget is per claim, not per run of speech.** Resetting it on every
 * pause would let a conversational speaker — a sentence, a breath, a sentence
 * — collect four buzzes over and over for the same claim, which is the case
 * the cap exists to prevent. A new claim is a new situation and starts fresh,
 * which is what `claim` identifies: `floor.claimedAt`, the one field that
 * changes on every claim and nothing else.
 *
 * **The offsets restart with each run of speech, though.** Somebody who stops,
 * listens, and starts again gets their next buzz two seconds in rather than
 * instantly — the delay is what distinguishes talking from a noise, and it is
 * wanted every time.
 *
 * Pure, and separate from the hook, for the same reason `speaking.ts` is: the
 * timing rules are the whole substance and they are not exercisable through a
 * component that needs a live room and a real clock to produce one transition.
 */

/** How long somebody speaks while silenced before the first buzz. */
export const NUDGE_FIRST_MS = 2_000;

/** The gap between buzzes after the first, within one run of speech. */
export const NUDGE_REPEAT_MS = 3_000;

/** How many buzzes one claim is allowed to spend on one person. */
export const NUDGE_LIMIT = 4;

export interface NudgeState {
  /**
   * The claim the budget belongs to — `floor.claimedAt` — or null when this
   * person is not silenced. A different value is a different claim and resets
   * `sent`, which is why it is held rather than recomputed.
   */
  claim: number | null;
  /** Buzzes already spent on this claim. */
  sent: number;
  /**
   * When the next buzz is due, or null when nothing is pending — not speaking,
   * or the budget is gone.
   */
  dueAt: number | null;
}

export const NO_NUDGE: NudgeState = { claim: null, sent: 0, dueAt: null };

export interface NudgeStep {
  state: NudgeState;
  /** Whether to buzz at `now`. */
  buzz: boolean;
  /**
   * When to call `step` again, or null when nothing is pending. The caller
   * arms one timer for this and nothing else — there is no polling, because
   * every input that could change the answer already arrives as an event.
   */
  nextAt: number | null;
}

/**
 * Advances the schedule.
 *
 * @param claim    `floor.claimedAt` while this person is silenced by it, null
 *                 otherwise. Passing the claim rather than a boolean is what
 *                 lets a second claim start a fresh budget without the caller
 *                 having to notice the first one ended.
 * @param speaking whether the room says this person is speaking — the *held*
 *                 signal from `speaking.ts`, deliberately. Its trailing hold
 *                 is what stops the schedule restarting on every breath, and
 *                 the two seconds it holds for is why a single word still
 *                 earns a buzz: one word into a dead track is the mistake this
 *                 is about, not an exception to it.
 */
export function step(
  prev: NudgeState,
  { claim, speaking, now }: { claim: number | null; speaking: boolean; now: number }
): NudgeStep {
  // Not silenced: nothing is owed and nothing is remembered. The budget dies
  // with the claim rather than waiting to be spent on the next one.
  if (claim === null) return { state: NO_NUDGE, buzz: false, nextAt: null };

  const state = claim === prev.claim ? prev : { claim, sent: 0, dueAt: null };

  if (!speaking) {
    // The run has ended. The budget survives; the schedule does not, so the
    // next run begins with the full two-second delay again.
    return { state: { ...state, dueAt: null }, buzz: false, nextAt: null };
  }

  if (state.sent >= NUDGE_LIMIT) {
    return { state: { ...state, dueAt: null }, buzz: false, nextAt: null };
  }

  if (state.dueAt === null) {
    // A run of speech has just begun.
    const dueAt = now + NUDGE_FIRST_MS;
    return { state: { ...state, dueAt }, buzz: false, nextAt: dueAt };
  }

  if (now < state.dueAt) {
    return { state, buzz: false, nextAt: state.dueAt };
  }

  const sent = state.sent + 1;
  // Measured from now rather than from what was due, so a timer that fires
  // late does not immediately owe the next one. Being exactly three seconds
  // apart matters more than being on an absolute grid nobody can perceive.
  const dueAt = sent >= NUDGE_LIMIT ? null : now + NUDGE_REPEAT_MS;
  return { state: { claim, sent, dueAt }, buzz: true, nextAt: dueAt };
}
