import {
  NOBODY_SPEAKING,
  SPEAKING_HOLD_MS,
  nextReleaseAt,
  onActiveSpeakers,
  shownAsSpeaking,
} from '../speaking';

const A = 'acct_a';
const B = 'acct_b';
const T = 1_000_000;

describe('holding the speaking indicator', () => {
  it('shows somebody the instant the room hears them', () => {
    // The leading edge is not smoothed. A dot that waited even a moment would
    // be a worse fault than the flicker this exists to fix.
    const hold = onActiveSpeakers(NOBODY_SPEAKING, [A], T);
    expect(shownAsSpeaking(hold, T)).toEqual([A]);
  });

  it('keeps showing them through a breath, then stops', () => {
    let hold = onActiveSpeakers(NOBODY_SPEAKING, [A], T);
    hold = onActiveSpeakers(hold, [], T);

    // Still lit through the pause between sentences.
    expect(shownAsSpeaking(hold, T)).toEqual([A]);
    expect(shownAsSpeaking(hold, T + SPEAKING_HOLD_MS - 1)).toEqual([A]);
    // And out once the hold is done.
    expect(shownAsSpeaking(hold, T + SPEAKING_HOLD_MS)).toEqual([]);
  });

  it('goes on showing somebody who never leaves the set', () => {
    // The trap this whole module exists to avoid. ActiveSpeakersChanged fires
    // on *changes*, so a minute of uninterrupted talking produces one event
    // and nothing after it. A hold keyed on "a signal in the last two seconds"
    // would put the dot out mid-sentence.
    const hold = onActiveSpeakers(NOBODY_SPEAKING, [A], T);
    expect(shownAsSpeaking(hold, T + 60_000)).toEqual([A]);
    expect(nextReleaseAt(hold, T + 60_000)).toBeNull();
  });

  it('resumes immediately rather than waiting out a hold', () => {
    let hold = onActiveSpeakers(NOBODY_SPEAKING, [A], T);
    hold = onActiveSpeakers(hold, [], T);
    hold = onActiveSpeakers(hold, [A], T + 500);

    expect(shownAsSpeaking(hold, T + 500)).toEqual([A]);
    // And the abandoned hold is gone, not merely outvoted — otherwise it would
    // fire while they are still talking.
    expect(nextReleaseAt(hold, T + 500)).toBeNull();
    expect(shownAsSpeaking(hold, T + 10_000)).toEqual([A]);
  });

  it('does not extend one person’s hold when somebody else speaks', () => {
    // Several people in a channel means events arriving constantly. If each
    // one pushed every pending release back, nobody's dot would ever go out.
    let hold = onActiveSpeakers(NOBODY_SPEAKING, [A], T);
    hold = onActiveSpeakers(hold, [B], T);
    // A is holding from T; B is active.
    hold = onActiveSpeakers(hold, [B], T + 1_000);
    hold = onActiveSpeakers(hold, [B], T + 1_500);

    expect(nextReleaseAt(hold, T)).toBe(T + SPEAKING_HOLD_MS);
    expect(shownAsSpeaking(hold, T + SPEAKING_HOLD_MS)).toEqual([B]);
  });

  it('reports when it next changes, so something can wake up', () => {
    // Nothing announces a hold running out — the room has already said all it
    // is going to about somebody who stopped. Without this the last speaker
    // stays lit until somebody else happens to talk.
    let hold = onActiveSpeakers(NOBODY_SPEAKING, [A], T);
    expect(nextReleaseAt(hold, T)).toBeNull();

    hold = onActiveSpeakers(hold, [], T);
    expect(nextReleaseAt(hold, T)).toBe(T + SPEAKING_HOLD_MS);
    expect(nextReleaseAt(hold, T + SPEAKING_HOLD_MS)).toBeNull();
  });

  it('shows several people at once, active before held', () => {
    let hold = onActiveSpeakers(NOBODY_SPEAKING, [A, B], T);
    hold = onActiveSpeakers(hold, [B], T);
    expect(shownAsSpeaking(hold, T)).toEqual([B, A]);
  });

  it('ignores a repeated identity in one event', () => {
    const hold = onActiveSpeakers(NOBODY_SPEAKING, [A, A], T);
    expect(shownAsSpeaking(hold, T)).toEqual([A]);
  });
});
