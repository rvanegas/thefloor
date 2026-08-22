import {
  NOBODY_SPEAKING,
  SPEAKING_HOLD_MS,
  nextReleaseAt,
  onActiveSpeakers,
  onAudioGone,
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

describe('somebody\u2019s audio going away', () => {
  it('stops showing whoever stepped out mid-word', () => {
    // The bug this exists for: talking at the moment of departure, so no
    // speaker event ever names them again and `active` has no expiry.
    const hold = onActiveSpeakers(NOBODY_SPEAKING, [A], T);
    expect(shownAsSpeaking(onAudioGone(hold, A), T)).toEqual([]);
  });

  it('never clears them without this, however long you wait', () => {
    // Guards the claim above by showing what the speaker event alone does.
    // In a two-person channel there is nobody left to speak, so this is the
    // whole rest of the session, not a two-second glitch.
    const hold = onActiveSpeakers(NOBODY_SPEAKING, [A], T);
    expect(shownAsSpeaking(hold, T + 3_600_000)).toEqual([A]);
    expect(nextReleaseAt(hold, T)).toBeNull();
  });

  it('drops them outright rather than holding them', () => {
    // A departure is not a breath. Two more seconds of a lit dot would sit
    // beside a card that already reads "Stepped out".
    const hold = onActiveSpeakers(NOBODY_SPEAKING, [A], T);
    const gone = onAudioGone(hold, A);
    expect(nextReleaseAt(gone, T)).toBeNull();
  });

  it('clears somebody who was mid-hold when they left', () => {
    // They stopped talking, then left before the hold ran out — so they are
    // in `releaseAt` rather than `active`, and both have to be swept.
    let hold = onActiveSpeakers(NOBODY_SPEAKING, [A], T);
    hold = onActiveSpeakers(hold, [], T);
    expect(shownAsSpeaking(onAudioGone(hold, A), T)).toEqual([]);
  });

  it('leaves everybody else alone', () => {
    let hold = onActiveSpeakers(NOBODY_SPEAKING, [A, B], T);
    hold = onAudioGone(hold, A);
    expect(shownAsSpeaking(hold, T)).toEqual([B]);
    // And B's own hold still runs from when B stops, untouched by the
    // departure.
    hold = onActiveSpeakers(hold, [], T);
    expect(shownAsSpeaking(hold, T + SPEAKING_HOLD_MS - 1)).toEqual([B]);
    expect(shownAsSpeaking(hold, T + SPEAKING_HOLD_MS)).toEqual([]);
  });

  it('returns the hold untouched when they were not being shown', () => {
    // Most departures are of somebody silent. The caller compares by
    // identity to decide whether to publish, so this must not be a copy.
    const hold = onActiveSpeakers(NOBODY_SPEAKING, [A], T);
    expect(onAudioGone(hold, B)).toBe(hold);
  });

  it('stops showing us when our own microphone closes', () => {
    // The same fault from the local end, and the one that reaches somebody
    // sitting alone: the last other person steps out while we are talking,
    // the microphone is released because nobody is left to hear it, and no
    // speaker event ever mentions us again. `LocalTrackUnpublished` is the
    // only thing that reports it.
    let hold = onActiveSpeakers(NOBODY_SPEAKING, [A, B], T);
    hold = onAudioGone(hold, B); // B stepped out.
    hold = onAudioGone(hold, A); // ...so A's microphone was released.
    expect(shownAsSpeaking(hold, T)).toEqual([]);
  });

  it('stops showing somebody who muted mid-word', () => {
    // A self-mute keeps the device, so nothing else says they went quiet —
    // and the server stops observing a muted track, so no speaker event
    // does either.
    let hold = onActiveSpeakers(NOBODY_SPEAKING, [A, B], T);
    hold = onAudioGone(hold, A);
    expect(shownAsSpeaking(hold, T)).toEqual([B]);
  });

  it('does not resurrect them when the next event arrives', () => {
    // `onActiveSpeakers` reads `hold.active` to decide who just stopped. If
    // the departed id were still in there, somebody else speaking would put
    // the gone participant into a fresh hold and light them up again.
    let hold = onActiveSpeakers(NOBODY_SPEAKING, [A], T);
    hold = onAudioGone(hold, A);
    hold = onActiveSpeakers(hold, [B], T + 5_000);
    expect(shownAsSpeaking(hold, T + 5_000)).toEqual([B]);
  });
});
