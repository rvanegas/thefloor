import {
  CHIME_BEAT_SECONDS,
  CHIME_NOTE_SECONDS,
  CHIME_NOTES,
} from '../../../modules/audio-route';

/**
 * Two chimes in one tick are two sounds, not a chord.
 *
 * **The bug this file exists for is not crowding, it is simultaneity.**
 * `AudioServicesPlaySystemSound` starts a sound and returns, so a hook that
 * calls `fire` twice in one tick has asked for both at the same instant — and
 * what a room hears is one unrecognisable noise rather than two events. The
 * queue in `chime.ts` is what makes them a sequence, and it lives there rather
 * than in either hook because the presence chimes and the recording chime are
 * scheduled by two hooks that know nothing about each other.
 *
 * The native half is asserted through a fake clock; `chime.web.ts` schedules
 * against the audio context's own time instead and is not exercised here.
 */

const played: string[] = [];

jest.mock('../../../modules/audio-route', () => {
  const actual = jest.requireActual('../../../modules/audio-route');
  return {
    ...actual,
    chime: (kind: string) => {
      played.push(kind);
      return true;
    },
    prepareChime: () => true,
  };
});

// Imported after the mock, so `chime.ts` binds to it rather than to the module.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { chime } = require('../chime') as {
  chime: (kind: string) => 'played' | 'refused' | 'queued' | 'dropped';
};

/** One kind's whole slot: its notes, then the beat after it, in ms. */
const slot = (kind: 'in' | 'out' | 'nearby' | 'recording') =>
  (CHIME_NOTES[kind] * CHIME_NOTE_SECONDS + CHIME_BEAT_SECONDS) * 1000;

describe('two chimes in one tick', () => {
  /**
   * **The clock only ever moves forward, which a test had to be taught.**
   *
   * `nextFree` is module state in `chime.ts` — deliberately, since it is what
   * lets two hooks share one speaker — so it outlives a test. Resetting the
   * system time to the same instant each time therefore left the speaker
   * booked by the previous test's last chime, and every case after the first
   * queued its opening sound instead of playing it. Each test gets a minute of
   * its own rather than the same one.
   */
  let clock = new Date('2026-09-17T00:00:00Z').getTime();

  beforeEach(() => {
    played.length = 0;
    jest.useFakeTimers();
    clock += 60_000;
    jest.setSystemTime(clock);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('plays the first at once and holds the second back', () => {
    chime('out');
    chime('nearby');

    // The room hears the first immediately: a cue that waits for a queue it is
    // at the head of is a cue that arrives late for no reason.
    expect(played).toEqual(['out']);

    jest.advanceTimersByTime(slot('out') - 1);
    expect(played).toEqual(['out']);

    jest.advanceTimersByTime(1);
    expect(played).toEqual(['out', 'nearby']);
  });

  it('keeps the order it was asked in', () => {
    chime('in');
    chime('out');
    chime('nearby');

    jest.advanceTimersByTime(slot('in') + slot('out'));
    expect(played).toEqual(['in', 'out', 'nearby']);
  });

  it('spaces a recording chime against a presence one, across the two hooks', () => {
    // The case no per-hook queue could have caught: `usePresenceChime` and
    // `useRecordingChime` both fire in a tick where somebody arrives as a
    // recording starts, and neither knows the other exists.
    chime('in');
    chime('recording');

    expect(played).toEqual(['in']);
    jest.advanceTimersByTime(slot('in'));
    expect(played).toEqual(['in', 'recording']);
  });

  it('leaves a chime on its own unqueued once the speaker is free', () => {
    chime('in');
    jest.advanceTimersByTime(slot('in'));
    played.length = 0;

    chime('out');
    expect(played).toEqual(['out']);
  });

  /**
   * The outcome is the audio lab's only instrument, and nothing else reads it.
   *
   * A combination that makes no sound has four explanations that sound
   * identical from a room, and the difference between *the queue threw this
   * away* and *the speaker refused it* is the difference between a screen
   * being tapped too fast and a binary with no chime in it. Asserted here
   * because a readout that quietly starts saying `played` for everything is a
   * readout somebody will believe.
   */
  it('says what became of each chime', () => {
    expect(chime('in')).toBe('played');
    expect(chime('out')).toBe('queued');

    jest.advanceTimersByTime(slot('in') + slot('out'));
    expect(chime('nearby')).toBe('played');

    // Far enough behind that the queue stops describing the present.
    for (let i = 0; i < 12; i++) chime('in');
    expect(chime('out')).toBe('dropped');
  });

  /**
   * The case the beat going to 300ms would have broken, silently.
   *
   * Four is every chime the app has and is what one tick can declare: both
   * hooks firing at once, three rungs moved and a recording started. At the
   * old 90ms beat the last of them waited 810ms and the flat one-second
   * threshold held it; at 300ms it waits 1440ms and a flat second would have
   * thrown it away — the recording chime, in precisely the moment it is most
   * worth hearing. Asserted against the constants rather than a number so that
   * lengthening the beat again cannot quietly reintroduce it.
   */
  it('plays every kind a single tick can declare, however long the beat', () => {
    expect(chime('in')).toBe('played');
    expect(chime('out')).toBe('queued');
    expect(chime('nearby')).toBe('queued');
    expect(chime('recording')).toBe('queued');

    jest.advanceTimersByTime(
      slot('in') + slot('out') + slot('nearby') + slot('recording')
    );
    expect(played).toEqual(['in', 'out', 'nearby', 'recording']);
  });

  it('drops a chime too far behind to be about anything', () => {
    // Twelve of them is not a busy room, it is a backlog that has stopped
    // describing the present — and a sound a second behind the roster sends
    // somebody looking for a change that is already on screen.
    for (let i = 0; i < 12; i++) chime('in');

    jest.advanceTimersByTime(60_000);
    expect(played.length).toBeLessThan(12);
    expect(played.length).toBeGreaterThan(1);
  });
});
