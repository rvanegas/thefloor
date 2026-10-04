import type { ChimePlayerReading } from '../../../modules/audio-route';
import { CHIME_HOLD_MAX_MS, waitForChime, type ChimeHoldEnd } from '../chimeFinish';
import { CHIME_TAIL_MS, HANDOVER_MS } from '../useFilmHandover';

/**
 * The play chime's hold on the microphone, ended by the sound and not by a
 * guess at its length — see `waitForChime`. A release that lands inside the
 * samples cuts the chime off, which is the build 329 report this answers: the
 * device showing the film never heard its own play chime.
 */
const NOW = 1_700_000_000_000;

/** A chime player that started when the hold did and finishes when told. */
function player(overrides: Partial<ChimePlayerReading> = {}) {
  const started = Date.now();
  let finishedAt: number | null = null;
  return {
    finish() {
      finishedAt = Date.now();
    },
    read: (): ChimePlayerReading => ({
      present: true,
      accepted: true,
      playing: finishedAt === null,
      positionMs: 0,
      durationMs: 180,
      sinceMs: Date.now() - started,
      decodeFailed: false,
      ...(finishedAt === null
        ? {}
        : { finishedAfterMs: finishedAt - started, finishedCleanly: true }),
      ...overrides,
    }),
  };
}

function hold(read: () => ChimePlayerReading | null) {
  const ends: [ChimeHoldEnd, number][] = [];
  const cancel = waitForChime((end, ms) => ends.push([end, ms]), read);
  return { ends, cancel };
}

beforeEach(() => jest.useFakeTimers({ now: NOW }));
afterEach(() => jest.useRealTimers());

describe('the play chime holding the microphone', () => {
  it('holds past the timer when the sound began late, until it has finished', () => {
    const chime = player();
    const { ends } = hold(chime.read);
    // A slow start: still sounding when the old timer would have released.
    jest.advanceTimersByTime(HANDOVER_MS + 100);
    expect(ends).toEqual([]);
    chime.finish();
    jest.advanceTimersByTime(CHIME_TAIL_MS - 1);
    expect(ends).toEqual([]);
    jest.advanceTimersByTime(40);
    expect(ends.map(([end]) => end)).toEqual(['finished']);
  });

  it('lets go at once when the player refused the sound', () => {
    const { ends } = hold(player({ accepted: false }).read);
    expect(ends.map(([end]) => end)).toEqual(['refused']);
  });

  it('falls back to the old timer where there is nothing to ask', () => {
    const { ends } = hold(() => null);
    jest.advanceTimersByTime(HANDOVER_MS - 21);
    expect(ends).toEqual([]);
    jest.advanceTimersByTime(40);
    expect(ends.map(([end]) => end)).toEqual(['no reading']);
  });

  it('does not take an earlier chime’s finish for this one', () => {
    const { ends } = hold(() => ({
      present: true,
      accepted: true,
      playing: false,
      positionMs: 180,
      durationMs: 180,
      sinceMs: 5_000,
      decodeFailed: false,
      finishedAfterMs: 180,
      finishedCleanly: true,
    }));
    jest.advanceTimersByTime(CHIME_TAIL_MS + 40);
    expect(ends).toEqual([]);
    jest.advanceTimersByTime(HANDOVER_MS);
    expect(ends.map(([end]) => end)).toEqual(['no reading']);
  });

  it('gives up holding at its deadline, finish or no finish', () => {
    const { ends } = hold(player().read);
    jest.advanceTimersByTime(CHIME_HOLD_MAX_MS + 40);
    expect(ends.map(([end]) => end)).toEqual(['deadline']);
  });

  it('says nothing once cancelled', () => {
    const chime = player();
    const { ends, cancel } = hold(chime.read);
    cancel();
    chime.finish();
    jest.advanceTimersByTime(CHIME_HOLD_MAX_MS * 2);
    expect(ends).toEqual([]);
  });
});
