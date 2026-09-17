import { PATIENCE, SILENCE, sample, startWatch, type CaptureWatch } from '../capture';

/**
 * The counting rule the guest page has carried since 2026-08-21, tested for
 * the first time on the day `/app` and `/beta` started sharing it.
 *
 * Same reason as `embedded.test.ts`: it lived in `server/web/guest.ts`, which
 * nothing here can run, so the arithmetic deciding whether somebody is told
 * their microphone is dead had only ever been executed by a stranger's phone.
 */

/** Feeds a run of readings in, which is all a caller ever does. */
function feed(peaks: (number | null)[]): CaptureWatch {
  return peaks.reduce(sample, startWatch());
}

const QUIET = SILENCE / 2;
const SPEECH = 0.2;

describe('a microphone that is working', () => {
  it('is settled by a single sample above the floor', () => {
    expect(feed([SPEECH]).verdict).toBe('heard');
  });

  it('is settled even after a long quiet start', () => {
    expect(feed([...Array(PATIENCE - 1).fill(QUIET), SPEECH]).verdict).toBe('heard');
  });

  // The floor is exclusive: a sample exactly at it is quiet. Stated because
  // the constant is small enough that the boundary is reachable by noise.
  it('does not count the floor itself as sound', () => {
    expect(feed([SILENCE]).verdict).toBe('waiting');
  });
});

describe('a microphone that is producing nothing', () => {
  it('waits out the patience before saying so', () => {
    expect(feed(Array(PATIENCE - 1).fill(QUIET)).verdict).toBe('waiting');
    expect(feed(Array(PATIENCE).fill(QUIET)).verdict).toBe('silent');
  });

  // The failure this exists for: a pause between sentences must not reach it,
  // and a person who has been talking must not be told anything at all.
  it('is not reached by a pause inside speech', () => {
    const half = Array(Math.floor(PATIENCE / 2)).fill(QUIET);
    expect(feed([SPEECH, ...half, SPEECH, ...half]).verdict).toBe('heard');
  });
});

describe('readings that are not about the microphone', () => {
  it('does not count a suspended context or a muted track', () => {
    expect(feed(Array(PATIENCE * 2).fill(null)).verdict).toBe('waiting');
  });

  // Eight seconds of samples actually taken, rather than eight seconds of
  // clock — which is the whole point of the null.
  it('counts across them rather than starting again', () => {
    const quiet = Array(PATIENCE - 1).fill(QUIET);
    expect(feed([...quiet, null, null, QUIET]).verdict).toBe('silent');
  });
});

describe('a settled question', () => {
  it('stays settled either way', () => {
    const heard = feed([SPEECH]);
    expect(sample(heard, QUIET)).toBe(heard);
    const silent = feed(Array(PATIENCE).fill(QUIET));
    expect(sample(silent, SPEECH)).toBe(silent);
  });
});
