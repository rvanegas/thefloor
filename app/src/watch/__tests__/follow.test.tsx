import React from 'react';
import { AppState, Text } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { reduce } from '../../../../core/channel';
import { createChannel } from '../../../../core/channel';
import type { ChannelState, WatchState } from '../../../../core/types';
import type { PlayerState, WatchIntent } from '../../../../core/watch';
import { FOLLOW_TICK_MS, useFollow, type PlayerPort } from '../drive';

/**
 * The follower, and the one thing it is ever doing.
 *
 * **Commanding and reading are never both available**, which is the property
 * three arrangements of timers could not hold. A follower that has spoken to
 * its player is deaf until the player arrives; a follower that has spoken to
 * the channel is silent until the channel answers; and in between — settled —
 * it says nothing at all, so anything the player does is its owner's doing.
 *
 * These are the tick-by-tick tests of those three phases. `transport.test.tsx`
 * is the same follower against a player that takes its time and a channel on
 * the far side of a round trip, which is where the races live.
 */

const A = 'user-a';
const B = 'user-b';
const T0 = 1_700_000_000_000;
const URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const LENGTH = 600_000;

function channel(): ChannelState {
  const made = createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 });
  const entered = reduce(made, { type: 'ENTER', userId: B }, T0);
  const started = reduce(
    entered,
    { type: 'START_WATCH', userId: A, videoId: 'dQw4w9WgXcQ', url: URL },
    T0
  );
  return reduce(
    started,
    { type: 'WATCH_READY', userId: A, durationMs: LENGTH },
    T0
  );
}

/** A party that is running, as the channel reports it. */
function playing(): WatchState {
  return reduce(channel(), { type: 'WATCH_PLAY', userId: A }, T0).watch;
}

/** A player this test drives by hand, and the calls it was given. */
function fakePlayer() {
  const calls: string[] = [];
  let state: PlayerState = 'playing';
  let positionMs = 0;
  let durationMs: number | null = LENGTH;
  return {
    calls,
    say(next: PlayerState, at?: number) {
      state = next;
      if (at !== undefined) positionMs = at;
    },
    /** What the frame is showing, which during an advert is not the film. */
    showing(length: number | null) {
      durationMs = length;
    },
    advance(ms: number) {
      if (state === 'playing') positionMs += ms;
    },
    port: {
      read: () => ({ state, positionMs, durationMs }),
      play: () => calls.push('play'),
      pause: () => calls.push('pause'),
      seek: (ms: number) => calls.push(`seek:${ms}`),
    } satisfies PlayerPort,
  };
}

let tree: ReactTestRenderer | null = null;

/**
 * Mounts the follower over a watch state the test owns, and hands back a
 * way to move time forward a tick at a time.
 */
function follow(
  watch: WatchState,
  port: PlayerPort,
  onIntent: (i: WatchIntent) => void
) {
  const sent: WatchIntent[] = [];
  let current = watch;
  function Follower({ watch: w }: { watch: WatchState }) {
    useFollow(w, port, true, {
      mayControl: true,
      onIntent: (intent) => {
        sent.push(intent);
        onIntent(intent);
      },
    });
    return <Text>following</Text>;
  }
  act(() => {
    tree = renderer.create(<Follower watch={current} />);
  });
  return {
    sent,
    /**
     * One tick of the follower's clock, with the player advancing with it.
     *
     * **`advanceTimersByTime` moves the fake clock as well as the timers**, so
     * it is the only thing here allowed to say what time it is. Setting the
     * system clock as well — which this did until 2026-09-18 — runs the
     * channel at twice the player's speed, and the drift that manufactures
     * pushes the follower into correcting when the test meant it to be
     * settled. Two sessions have now lost time to it.
     */
    tick(advance: (ms: number) => void = () => {}) {
      advance(FOLLOW_TICK_MS);
      act(() => {
        jest.advanceTimersByTime(FOLLOW_TICK_MS);
      });
    },
    /** The channel changing under the follower, as a snapshot would. */
    say(next: WatchState) {
      current = next;
      act(() => {
        tree!.update(<Follower watch={next} />);
      });
    },
  };
}

beforeEach(() => {
  jest.useFakeTimers({ now: T0, doNotFake: ['nextTick'] });
  (AppState as unknown as { currentState: string }).currentState = 'active';
});

afterEach(() => {
  act(() => {
    tree?.unmount();
  });
  tree = null;
  jest.useRealTimers();
});

describe('a settled follower', () => {
  it('says nothing to a player that is where the channel wants it', () => {
    const player = fakePlayer();
    const run = follow(playing(), player.port, () => {});
    run.tick(player.advance);
    run.tick(player.advance);
    run.tick(player.advance);
    expect(player.calls).toEqual([]);
    expect(run.sent).toEqual([]);
  });

  it('reads what its player does, because it said nothing to it', () => {
    /*
      **The behaviour that changed on 2026-09-18, stated plainly.** A press is
      acted on the first time it is seen, where three earlier arrangements
      waited a tick to see whether it stood. The wait was there to tell a
      thumb from this follower's own unobeyed command — and in a settled
      phase there is no unobeyed command to confuse it with, because nothing
      has been said to this player at all.
    */
    const player = fakePlayer();
    const run = follow(playing(), player.port, () => {});
    run.tick(player.advance);
    player.say('paused');
    run.tick(player.advance);
    expect(run.sent).toEqual([{ do: 'pause' }]);
  });
});

describe('a follower waiting on its player', () => {
  it('reads nothing back until the player arrives', () => {
    /*
      **The loop, closed.** The channel plays, the player has not started, so
      the follower says play — and then goes deaf. Every earlier version read
      the next reading of that same unobeyed command as somebody pressing
      pause, told the room, and produced the next instruction from the
      correction: play-pause-play-pause, three times over.
    */
    const player = fakePlayer();
    player.say('paused');
    const run = follow(playing(), player.port, () => {});
    run.tick(player.advance);
    expect(player.calls).toEqual(['play']);

    // The player goes on reporting the state it was in. Nothing is read from
    // it and nothing more is said to it.
    run.tick(player.advance);
    run.tick(player.advance);
    run.tick(player.advance);
    expect(run.sent).toEqual([]);
    expect(player.calls).toEqual(['play']);
  });

  it('starts listening again the moment it arrives', () => {
    const player = fakePlayer();
    player.say('paused');
    const run = follow(playing(), player.port, () => {});
    run.tick(player.advance);
    player.say('playing');
    run.tick(player.advance); // arrives, and the phase ends
    run.tick(player.advance); // settled, and listening

    player.say('paused');
    run.tick(player.advance);
    expect(run.sent).toEqual([{ do: 'pause' }]);
  });
});

describe('a follower waiting on the channel', () => {
  it('says nothing to the player until the press comes back', () => {
    /*
      A press goes to the server and returns as a snapshot, and until it does
      the channel still says the thing the person just changed. Correcting in
      the meantime undoes the press on its way out — which is what made
      pressing Play twice in quick succession alternate for ever.
    */
    const player = fakePlayer();
    const run = follow(playing(), player.port, () => {});
    run.tick(player.advance);
    player.say('paused');
    run.tick(player.advance);
    expect(run.sent).toEqual([{ do: 'pause' }]);

    const before = player.calls.length;
    run.tick(player.advance);
    run.tick(player.advance);
    expect(player.calls.slice(before)).toEqual([]);
    // And not said twice: `watchPlay` is not idempotent, so a repeat is a
    // party jumping backwards.
    expect(run.sent).toEqual([{ do: 'pause' }]);
  });

  it('goes back to watching once the channel agrees', () => {
    const player = fakePlayer();
    const run = follow(playing(), player.port, () => {});
    run.tick(player.advance);
    player.say('paused');
    run.tick(player.advance);

    run.say(
      reduce(
        reduce(channel(), { type: 'WATCH_PLAY', userId: A }, T0),
        { type: 'WATCH_PAUSE', userId: A },
        Date.now()
      ).watch
    );
    run.tick(player.advance);
    run.tick(player.advance);
    expect(run.sent).toEqual([{ do: 'pause' }]);
    expect(player.calls).toEqual([]);
  });
});

describe('a player showing an advert', () => {
  it('is neither read nor corrected until the film is back', () => {
    /*
      **An advert is a different video in the same frame.** Its clock is its
      own, so the position reads as a scrub to the start and the state reads
      as whatever the spot is doing. Every earlier attempt listed this among
      the lies it was guessing around; the player says which video it is
      showing if it is asked for a length. See `showingTheFilm`.
    */
    const player = fakePlayer();
    const run = follow(playing(), player.port, () => {});
    run.tick(player.advance);

    player.showing(90_000);
    player.say('playing', 1_000);
    run.tick(player.advance);
    run.tick(player.advance);
    expect(run.sent).toEqual([]);
    expect(player.calls).toEqual([]);

    // The spot ends and the film comes back where the channel left it.
    player.showing(LENGTH);
    player.say('playing', 2_000);
    run.tick(player.advance);
    expect(run.sent).toEqual([]);
  });
});

describe('a follower that was not looking', () => {
  it('reads no press while the app is behind something else', () => {
    const player = fakePlayer();
    const run = follow(playing(), player.port, () => {});
    run.tick(player.advance);

    (AppState as unknown as { currentState: string }).currentState = 'background';
    // iOS stops the video when the app goes away, which is not a press —
    // a phone going into a pocket must not stop the film for the room.
    player.say('paused');
    run.tick(player.advance);
    run.tick(player.advance);
    expect(run.sent).toEqual([]);
  });

  it('reads no press on the tick it comes back, either', () => {
    // **Coming back is the dangerous moment rather than being away.** The
    // reading from before describes a player that was stopped for as long
    // as the app was, against a transport that never was.
    const player = fakePlayer();
    const run = follow(playing(), player.port, () => {});
    run.tick(player.advance);

    (AppState as unknown as { currentState: string }).currentState = 'background';
    player.say('paused');
    run.tick(player.advance);
    (AppState as unknown as { currentState: string }).currentState = 'active';
    run.tick(player.advance);
    expect(run.sent).toEqual([]);
  });
});
