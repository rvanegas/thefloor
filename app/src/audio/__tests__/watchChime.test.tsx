import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import type { ChannelState } from '../../../../core/types';
import { useWatchChime } from '../useWatchChime';

const ME = 'acct_me';
const THEM = 'acct_them';
const NOW = 1_700_000_000_000;
const URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

/**
 * The film says when it starts and stops, for the ear that cannot see the
 * transport.
 *
 * Three rules carry this file. **Only the edges of a run make a sound** — what
 * the room hears is its own microphones shutting, so a link pasted or a film
 * swapped while nothing is playing is silent. **Every way out of a run is the
 * same sound**, a stop and a film running out both meaning the room has its
 * voices back. And **a film already playing when you arrive is not a
 * beginning**, on the rule the other two chime hooks state: announcing it
 * would be reporting the past.
 */

const joined = () => {
  const channel = createChannel({
    id: 'sess_1',
    initiator: ME,
    invitees: [THEM],
    now: NOW,
  });
  return reduce(channel, { type: 'ENTER', userId: THEM }, NOW);
};

const load = (channel: ChannelState, by = ME, at = NOW + 1_000) =>
  reduce(
    channel,
    { type: 'START_WATCH', userId: by, videoId: 'dQw4w9WgXcQ', url: URL },
    at
  );

const play = (channel: ChannelState, by = ME, at = NOW + 2_000) =>
  reduce(channel, { type: 'WATCH_PLAY', userId: by }, at);

const pause = (channel: ChannelState, by = ME, at = NOW + 3_000) =>
  reduce(channel, { type: 'WATCH_PAUSE', userId: by }, at);

const stop = (channel: ChannelState, by = ME, at = NOW + 4_000) =>
  reduce(channel, { type: 'STOP_WATCH', userId: by }, at);

/** This device is the one showing the film, which is what moves its session. */
const here = (channel: ChannelState, by = ME, at = NOW + 1_500) =>
  reduce(channel, { type: 'WATCH_HERE', userId: by, watching: true }, at);

/**
 * The audio engine, as the hook hears from it.
 *
 * A pause on a screening device retakes the microphone, and the engine
 * restarts with recording about six hundred and fifty milliseconds later. The
 * hook is told by `willStartEngine`; this stands in for it, and `start` is the
 * engine reporting in. Null is a platform with no engine to hear from.
 */
function engine() {
  let waiting: (() => void) | null = null;
  let recording: boolean | null = null;
  const wait = (done: () => void, needsRecording: boolean) => {
    waiting = done;
    recording = needsRecording;
    return () => {
      waiting = null;
    };
  };
  // Getters on the function itself: `Object.assign` would copy a value once.
  Object.defineProperty(wait, 'waiting', { get: () => waiting !== null });
  Object.defineProperty(wait, 'recording', { get: () => recording });
  return Object.assign(
    wait as typeof wait & {
      readonly waiting: boolean;
      /** Whether the wait was for a start with recording on. */
      readonly recording: boolean | null;
    },
    {
      start: () => {
        const done = waiting;
        waiting = null;
        done?.();
      },
    }
  );
}

function mount(
  channel: ChannelState | null,
  waitForEngine:
    | ((done: () => void, recording: boolean) => () => void)
    | null = null
) {
  const fire = jest.fn();
  function Probe({ state }: { state: ChannelState | null }) {
    useWatchChime(state, ME, fire, waitForEngine);
    return null;
  }
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Probe state={channel} />);
  });
  return {
    fire,
    update(next: ChannelState | null) {
      act(() => {
        tree.update(<Probe state={next} />);
      });
    },
    unmount: () => act(() => tree.unmount()),
  };
}

describe('useWatchChime', () => {
  it('sounds when the film starts playing', () => {
    const loaded = load(joined());
    const probe = mount(loaded);
    probe.update(play(loaded));
    expect(probe.fire.mock.calls).toEqual([['play']]);
  });

  it('sounds the other one when it is paused', () => {
    const playing = play(load(joined()));
    const probe = mount(playing);
    probe.update(pause(playing));
    expect(probe.fire.mock.calls).toEqual([['pause']]);
  });

  /**
   * The one departure from the presence chimes, taken from
   * `useRecordingChime`: the sound is not feedback for whoever pressed the
   * button but the moment at which the room was told, and a notice one party
   * is exempt from is a weaker thing to have given.
   */
  it('sounds for the person who pressed it too', () => {
    const loaded = load(joined(), ME);
    const probe = mount(loaded);
    probe.update(play(loaded, ME));
    expect(probe.fire).toHaveBeenCalledWith('play');
  });

  /**
   * **A film is loaded paused**, and a paused party has taken nothing from
   * anybody: every microphone in the room is still open, so there is nothing
   * for a sound to announce. `startParty` in core/watch.ts is where that
   * default and its reasoning are.
   */
  it('says nothing when a link is merely pasted', () => {
    const channel = joined();
    const probe = mount(channel);
    probe.update(load(channel));
    expect(probe.fire).not.toHaveBeenCalled();
  });

  it('says nothing when a paused party is stopped', () => {
    const loaded = load(joined());
    const probe = mount(loaded);
    probe.update(stop(loaded));
    expect(probe.fire).not.toHaveBeenCalled();
  });

  /**
   * **Stop sounds like a pause, deliberately.** What the chime says is that the
   * room has its voices back, which is equally true of a stop, a pause and a
   * film reaching its end; a listener who cannot see the screen has no use for
   * the difference and would have to be taught a third cue to learn it.
   */
  it('sounds the pause when a running film is stopped outright', () => {
    const playing = play(load(joined()));
    const probe = mount(playing);
    probe.update(stop(playing));
    expect(probe.fire.mock.calls).toEqual([['pause']]);
  });

  it('sounds both ends of a run somebody plays and pauses', () => {
    const loaded = load(joined());
    const probe = mount(loaded);
    const playing = play(loaded);
    probe.update(playing);
    probe.update(pause(playing));
    expect(probe.fire.mock.calls).toEqual([['play'], ['pause']]);
  });

  it('says nothing about a film that was already playing when you looked', () => {
    // Stepping into a room with a film running is not the moment it started.
    // The picture and the transport are what tell you about that.
    const probe = mount(play(load(joined())));
    expect(probe.fire).not.toHaveBeenCalled();
  });

  it('says nothing about a film in a channel this device has just changed to', () => {
    const probe = mount(joined());
    const other = reduce(
      createChannel({
        id: 'sess_2',
        initiator: ME,
        invitees: [THEM],
        now: NOW,
      }),
      { type: 'ENTER', userId: THEM },
      NOW
    );
    probe.update(play(load(other)));
    expect(probe.fire).not.toHaveBeenCalled();
  });

  /**
   * **The chime waits for the session it is played into, on the one device
   * whose session moves.**
   *
   * A chime is an `AVAudioPlayer` playing into the session this app holds, and
   * a device showing the film has handed that session to the `WKWebView` for
   * the length of the run — `isScreening` in core/micNeeded.ts is what drops
   * its microphone. So the pause chime has to wait out the retake, which is
   * about seven hundred milliseconds, and the play chime does not, the release
   * being withheld for its length by `useFilmHandover`.
   */
  describe('on the device showing the film', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const screening = () => here(load(joined()));

    /*
      **The engine, not the category.** Build 312 waited for the category to
      read `playAndRecord`, which it does the moment it is written, and two of
      three pause chimes fired into the half-second before the engine was back
      and were swallowed.
    */
    it('holds the pause chime until the engine has restarted', () => {
      const restart = engine();
      const playing = play(screening());
      const probe = mount(playing, restart);
      probe.update(pause(playing));
      expect(probe.fire).not.toHaveBeenCalled();
      expect(restart.waiting).toBe(true);

      act(() => void jest.advanceTimersByTime(600));
      expect(probe.fire).not.toHaveBeenCalled();

      act(() => restart.start());
      expect(probe.fire.mock.calls).toEqual([['pause']]);
    });

    /*
      **A capturing device waits for recording; a muted one does not.** An
      unmuted retake can start the engine playout-only on its way to recording,
      and a chime fired there lands under the second restart. A muted device
      never records, and on build 329 waited for it until the chime was thrown
      away, twenty times in one evening.
    */
    it('waits for a recording start on a device that will capture', () => {
      const restart = engine();
      const playing = play(screening());
      const probe = mount(playing, restart);
      probe.update(pause(playing));
      expect(restart.recording).toBe(true);
    });

    it('waits for any start on a device that is muted', () => {
      const restart = engine();
      const playing = reduce(
        play(screening()),
        { type: 'SET_SELF_MUTE', userId: ME, muted: true },
        NOW + 2_500
      );
      const probe = mount(playing, restart);
      probe.update(pause(playing));
      expect(restart.recording).toBe(false);

      act(() => restart.start());
      expect(probe.fire.mock.calls).toEqual([['pause']]);
    });

    /**
     * **Dropped rather than played late**, which is the rule `chime` already
     * applies to anything further behind than `CHIME_STALE_MS`. An engine that
     * never comes back is a dropped connection or a backgrounded app, and a
     * notice about the room getting its voices back, arriving seconds after it
     * did, sends somebody looking for a change already on screen.
     */
    it('throws the pause chime away if the engine never restarts', () => {
      const restart = engine();
      const playing = play(screening());
      const probe = mount(playing, restart);
      probe.update(pause(playing));
      act(() => void jest.advanceTimersByTime(5_000));
      expect(restart.waiting).toBe(false);
      act(() => restart.start());
      expect(probe.fire).not.toHaveBeenCalled();
    });

    it('never holds the play chime', () => {
      const loaded = here(load(joined()));
      const probe = mount(loaded, engine());
      probe.update(play(loaded));
      expect(probe.fire.mock.calls).toEqual([['play']]);
    });

    /*
      **A held pause chime is not the effect's to cancel**, since 2026-10-03.
      It was, so anything that re-ran the effect mid-wait — the app leaving
      the front, the next snapshot — cancelled it, and the effect, seeing no
      new edge, returned: the chime gone with no line in the journal at all.
    */
    it('survives a re-render while it waits for the engine', () => {
      const restart = engine();
      const playing = play(screening());
      const probe = mount(playing, restart);
      const paused = pause(playing);
      probe.update(paused);
      // A later snapshot of the same paused room — a roster change, say.
      probe.update(
        reduce(paused, { type: 'SET_SELF_MUTE', userId: THEM, muted: true }, NOW + 3_200)
      );
      act(() => restart.start());
      expect(probe.fire.mock.calls).toEqual([['pause']]);
    });

    /*
      **The one collapse.** A pause and a play inside the wait leave the room
      quiet again, so a chime saying it has its voices back would be untrue:
      dropped, and said in the journal rather than silently.
    */
    it('is dropped, not played, when the room plays again before it sounds', () => {
      const restart = engine();
      const playing = play(screening());
      const probe = mount(playing, restart);
      const paused = pause(playing);
      probe.update(paused);
      const again = play(paused, ME, NOW + 3_300);
      probe.update(again);
      // The play chime is the replay's own; the pause chime never sounds.
      act(() => restart.start());
      expect(probe.fire.mock.calls.filter(([kind]) => kind === 'pause')).toEqual([]);
    });

    it('stops waiting when the channel is left mid-hold', () => {
      const restart = engine();
      const playing = play(screening());
      const probe = mount(playing, restart);
      probe.update(pause(playing));
      probe.unmount();
      expect(restart.waiting).toBe(false);
      act(() => void jest.advanceTimersByTime(5_000));
      expect(probe.fire).not.toHaveBeenCalled();
    });
  });

  /**
   * **The gate is *did this device hand its session over*, not *what category
   * is it in*.** A phone in a pocket never leaves `playAndRecord` and is the
   * ear this whole hook exists for; a guest with no speech grant is on
   * `playback` permanently and would wait the full two seconds to be given
   * nothing. Neither is made to wait.
   */
  it('sounds at once for somebody present who is not watching here', () => {
    const playing = play(load(joined()));
    const probe = mount(playing, engine());
    probe.update(pause(playing));
    expect(probe.fire.mock.calls).toEqual([['pause']]);
  });

  /**
   * Android and a browser, where there is no engine to hear from and the
   * session does not move for a film. A cue withheld for want of a report that
   * can never come would be the fault this gate was written to fix.
   */
  it('sounds at once where there is no engine to hear from', () => {
    const playing = play(here(load(joined())));
    const probe = mount(playing, null);
    probe.update(pause(playing));
    expect(probe.fire.mock.calls).toEqual([['pause']]);
  });

  it('forgets the film when this device stops being present anywhere', () => {
    const loaded = load(joined());
    const probe = mount(loaded);
    const playing = play(loaded);
    probe.update(playing);
    probe.fire.mockClear();

    probe.update(null);
    probe.update(playing);
    expect(probe.fire).not.toHaveBeenCalled();
  });
});
