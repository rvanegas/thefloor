import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import type { ChannelState } from '../../../../core/types';
import type { RouteSnapshot } from '../../../modules/audio-route';
import { setFilmProbe } from '../../audio/probe';
import { spanMs } from '../../audio/chime';
import type { EngineTransition } from '../../audio/engineState';
import { CHIME_TAIL_MS, HANDOVER_MS } from '../../audio/useFilmHandover';
import { waitForChime } from '../../audio/chimeFinish';
import {
  announcePress,
  describeChimePlayer,
  readStart,
  START_SETTLE_MS,
  startHolding,
  UNCONFIRMED_MS,
  useFilmStart,
  wouldScreen,
} from '../filmStart';

jest.mock('../../audio/diagnostics', () => ({ recordEvent: () => {} }));

/**
 * **A film started here gives the microphone up before it plays.**
 *
 * Build 312 released it when the server's snapshot arrived and played at the
 * press, so the category change landed under a starting player — and a player
 * that had begun to buffer before `Playback` arrived stuck there, three resumes
 * in four, for five seconds each. The order this pins is the fix: chime, hold,
 * release, wait for iOS to say `Playback`, and only then play.
 */

const ME = 'acct_me';
const THEM = 'acct_them';
const NOW = 1_700_000_000_000;
const URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

const joined = () =>
  reduce(
    createChannel({ id: 'sess_1', initiator: ME, invitees: [THEM], now: NOW }),
    { type: 'ENTER', userId: THEM },
    NOW
  );
const loaded = (c: ChannelState) =>
  reduce(
    c,
    { type: 'START_WATCH', userId: ME, videoId: 'dQw4w9WgXcQ', url: URL },
    NOW + 1_000
  );
const here = (c: ChannelState) =>
  reduce(c, { type: 'WATCH_HERE', userId: ME, watching: true }, NOW + 1_500);
const play = (c: ChannelState) =>
  reduce(c, { type: 'WATCH_PLAY', userId: ME }, NOW + 2_000);
const pause = (c: ChannelState) =>
  reduce(c, { type: 'WATCH_PAUSE', userId: ME }, NOW + 3_000);

/** iOS's route notifications, sent by hand. */
function routes() {
  const listeners = new Set<(s: RouteSnapshot) => void>();
  const listen = (listener: (s: RouteSnapshot) => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  return Object.assign(listen, {
    category(category: string) {
      for (const listener of [...listeners]) {
        listener({ outputs: [], inputs: [], sampleRate: 48_000, category, mode: '' });
      }
    },
  });
}

let tree: ReactTestRenderer | null = null;

/** The engine's transitions, sent by hand. */
function engine() {
  const listeners = new Set<(t: EngineTransition) => void>();
  const listen = (listener: (t: EngineTransition) => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  return Object.assign(listen, {
    stop() {
      for (const listener of [...listeners]) listener({ what: 'stop', play: false, rec: false });
    },
  });
}

/**
 * `category` is what the session reads at the chime: `playAndRecord` for a
 * device capturing, which is the ordinary start.
 */
function mount(
  channel: ChannelState,
  takes = true,
  category = 'AVAudioSessionCategoryPlayAndRecord',
  heard?: Parameters<typeof useFilmStart>[7]
) {
  const sound = jest.fn();
  const route = routes();
  const engines = engine();
  function Probe({ live }: { live: ChannelState }) {
    useFilmStart(live, ME, sound, route, takes, () => category, engines, heard);
    return null;
  }
  act(() => {
    tree = renderer.create(<Probe live={channel} />);
  });
  return {
    sound,
    route,
    engine: engines,
    update(next: ChannelState) {
      act(() => {
        tree!.update(<Probe live={next} />);
      });
    },
  };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  act(() => {
    tree?.unmount();
  });
  tree = null;
  setFilmProbe(false, () => {});
  jest.useRealTimers();
});

const advance = (ms: number) => act(() => void jest.advanceTimersByTime(ms));

it('is for the device that will show the film, and nobody else', () => {
  expect(wouldScreen(here(loaded(joined())), ME)).toBe(true);
  expect(wouldScreen(loaded(joined()), ME)).toBe(false);
  expect(wouldScreen(play(here(loaded(joined()))), ME)).toBe(false);
});

it('chimes, holds, releases, and is ready when iOS says Playback', () => {
  const probe = mount(here(loaded(joined())));
  act(() => announcePress('playing'));
  expect(probe.sound).toHaveBeenCalledTimes(1);
  expect(readStart()).toBe('chiming');
  expect(startHolding()).toBe(true);

  advance(HANDOVER_MS);
  expect(readStart()).toBe('releasing');
  expect(startHolding()).toBe(true);

  // Our own category is not the one being waited for.
  act(() => probe.route.category('AVAudioSessionCategoryPlayAndRecord'));
  expect(readStart()).toBe('releasing');

  act(() => probe.route.category('AVAudioSessionCategoryPlayback'));
  expect(readStart()).toBe('ready');
  expect(startHolding()).toBe(false);
});

it('plays anyway when iOS never says so', () => {
  mount(here(loaded(joined())));
  act(() => announcePress('playing'));
  advance(HANDOVER_MS);
  advance(START_SETTLE_MS - 1);
  expect(readStart()).toBe('releasing');
  advance(1);
  expect(readStart()).toBe('ready');
});

/*
  **A muted phone is already `Playback`, so no route notification is coming.**
  On build 329 every such start waited out `START_SETTLE_MS`. The engine
  stopping is the release landing, and nothing else is going to move.
*/
it('is ready when the engine stops, on a device already in Playback', () => {
  const probe = mount(here(loaded(joined())), true, 'AVAudioSessionCategoryPlayback');
  act(() => announcePress('playing'));
  advance(HANDOVER_MS);
  expect(readStart()).toBe('releasing');

  act(() => probe.engine.stop());
  // A macrotask later, out of the audio worker's callback.
  expect(readStart()).toBe('releasing');
  advance(0);
  expect(readStart()).toBe('ready');
});

/*
  **And not on one capturing**, where the engine stops about 190ms before the
  session is `Playback`. Taking that for the release landing is playing under a
  moving session, which is build 312's wedge.
*/
it('still waits for Playback when the engine stops on a capturing device', () => {
  const probe = mount(here(loaded(joined())));
  act(() => announcePress('playing'));
  advance(HANDOVER_MS);
  act(() => probe.engine.stop());
  advance(0);
  expect(readStart()).toBe('releasing');

  act(() => probe.route.category('AVAudioSessionCategoryPlayback'));
  expect(readStart()).toBe('ready');
});

it('holds the microphone past the chime by its tail', () => {
  mount(here(loaded(joined())));
  act(() => announcePress('playing'));
  advance(spanMs('play'));
  expect(readStart()).toBe('chiming');
  advance(CHIME_TAIL_MS);
  expect(readStart()).toBe('releasing');
});

/*
  **The release waits for the sound, not for a guess at it**, since
  2026-10-03. Build 329's showing device never heard its own play chime, and
  the hold had been the sound's length from the moment it was asked for — so a
  chime that began late lost its end to the release. Here the player is still
  sounding when the old timer would have let go.
*/
it('holds the microphone until the chime player says it has finished', () => {
  let finishedAt: number | null = null;
  const started = Date.now();
  const read = () => ({
    present: true as const,
    accepted: true,
    playing: finishedAt === null,
    positionMs: 0,
    durationMs: 180,
    sinceMs: Date.now() - started,
    decodeFailed: false,
    ...(finishedAt === null
      ? {}
      : { finishedAfterMs: finishedAt - started, finishedCleanly: true }),
  });
  mount(
    here(loaded(joined())),
    true,
    'AVAudioSessionCategoryPlayAndRecord',
    (done) => waitForChime(done, read)
  );
  act(() => announcePress('playing'));
  advance(HANDOVER_MS + 100);
  expect(readStart()).toBe('chiming');
  finishedAt = Date.now();
  advance(CHIME_TAIL_MS + 40);
  expect(readStart()).toBe('releasing');
});

describe('describeChimePlayer', () => {
  const reading = {
    present: true as const,
    accepted: true,
    playing: false,
    positionMs: 0,
    durationMs: 180,
    sinceMs: 340,
    decodeFailed: false,
  };

  it('says a chime ran out', () => {
    expect(
      describeChimePlayer({ ...reading, finishedAfterMs: 231.4, finishedCleanly: true })
    ).toBe('finished after 231ms');
  });

  it('says a chime is still sounding', () => {
    expect(describeChimePlayer({ ...reading, playing: true, positionMs: 92.6 })).toBe(
      'playing at 93/180ms, 340ms after play'
    );
  });

  it('says a chime was cut off', () => {
    expect(describeChimePlayer({ ...reading, positionMs: 61 })).toBe(
      'stopped at 61/180ms without finishing, 340ms after play'
    );
  });

  it('says a chime never started', () => {
    expect(describeChimePlayer({ ...reading, accepted: false })).toBe('refused by the player');
  });
});

it('releases nothing and waits for nothing when the film probe keeps the microphone', () => {
  setFilmProbe(true, () => {});
  mount(here(loaded(joined())));
  act(() => announcePress('playing'));
  advance(HANDOVER_MS);
  expect(readStart()).toBe('ready');
});

it('starts nothing for a press on a device that is not showing the film', () => {
  const probe = mount(loaded(joined()));
  act(() => announcePress('playing'));
  expect(readStart()).toBeNull();
  expect(probe.sound).not.toHaveBeenCalled();
});

it('lasts the run, and ends with it', () => {
  const ready = here(loaded(joined()));
  const probe = mount(ready);
  act(() => announcePress('playing'));
  advance(HANDOVER_MS);
  act(() => probe.route.category('AVAudioSessionCategoryPlayback'));

  const running = play(ready);
  probe.update(running);
  advance(UNCONFIRMED_MS * 2);
  expect(readStart()).toBe('ready');

  probe.update(pause(running));
  expect(readStart()).toBeNull();
});

it('is abandoned by a pause pressed before the room answered', () => {
  mount(here(loaded(joined())));
  act(() => announcePress('playing'));
  act(() => announcePress('paused'));
  expect(readStart()).toBeNull();
});

it('gives the microphone back when the room never takes the press up', () => {
  mount(here(loaded(joined())));
  act(() => announcePress('playing'));
  advance(UNCONFIRMED_MS - 1);
  expect(readStart()).not.toBeNull();
  advance(1);
  expect(readStart()).toBeNull();
});

/**
 * **A play from the room is held as a press is**, since build 327 started a
 * player under a session still changing because the press was on the other
 * phone.
 */
describe('a play from the room', () => {
  const theirs = (c: ChannelState) =>
    reduce(c, { type: 'WATCH_PLAY', userId: THEM }, NOW + 2_000);

  it('chimes, holds and releases on the snapshot', () => {
    const before = here(loaded(joined()));
    const probe = mount(before);
    probe.update(theirs(before));
    expect(probe.sound).toHaveBeenCalledTimes(1);
    expect(readStart()).toBe('chiming');
    expect(startHolding()).toBe(true);

    advance(HANDOVER_MS);
    expect(readStart()).toBe('releasing');
    act(() => probe.route.category('AVAudioSessionCategoryPlayback'));
    expect(readStart()).toBe('ready');

    // And the run's end is the room's, as for a press.
    probe.update(pause(theirs(before)));
    expect(readStart()).toBe(null);
  });

  it('starts nothing for a film already running on arrival', () => {
    const probe = mount(theirs(here(loaded(joined()))));
    expect(probe.sound).not.toHaveBeenCalled();
    expect(readStart()).toBe(null);
  });

  it('starts nothing while the film would not take the microphone', () => {
    const before = here(loaded(joined()));
    const probe = mount(before, false);
    probe.update(theirs(before));
    expect(probe.sound).not.toHaveBeenCalled();
    expect(readStart()).toBe(null);
  });

  it('chimes once for a press here that the room then confirms', () => {
    const before = here(loaded(joined()));
    const probe = mount(before);
    act(() => announcePress('playing'));
    probe.update(play(before));
    expect(probe.sound).toHaveBeenCalledTimes(1);
  });

  it('starts nothing on a device not watching here', () => {
    const before = loaded(joined());
    const probe = mount(before);
    probe.update(theirs(before));
    expect(probe.sound).not.toHaveBeenCalled();
    expect(readStart()).toBe(null);
  });
});
