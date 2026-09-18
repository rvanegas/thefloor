import React from 'react';
import { AppState, Text } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { reduce } from '../../../../core/channel';
import { createChannel } from '../../../../core/channel';
import type { ChannelState, WatchState } from '../../../../core/types';
import type { PlayerState, WatchIntent } from '../../../../core/watch';
import { FOLLOW_TICK_MS, useFollow, type PlayerPort } from '../drive';

/**
 * The follower, and the half-second it now waits before believing a player.
 *
 * **This is where the stutter was.** `contradictionFrom` says whether a
 * player is out of step in a way nothing here explains; it cannot say
 * whether somebody meant it, because at a single instant a thumb and a
 * player halfway through obeying are the same reading. What separates them
 * is whether the disagreement is still there a tick later — a press is
 * durable, and the embed's constant small lies are not — so the dwell lives
 * here, with the clock, and so does the decision to leave the player alone
 * while one is being waited on.
 *
 * Reported from a phone on 2026-09-17: pressing Play produced
 * play-pause-play-pause and settled on pause, with the volume indicator
 * flickering as every run re-sampled the room's mute.
 */

const A = 'user-a';
const B = 'user-b';
const T0 = 1_700_000_000_000;
const URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

function channel(): ChannelState {
  const made = createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 });
  const entered = reduce(made, { type: 'ENTER', userId: B }, T0);
  return reduce(
    entered,
    { type: 'START_WATCH', userId: A, videoId: 'dQw4w9WgXcQ', url: URL },
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
  return {
    calls,
    say(next: PlayerState, at?: number) {
      state = next;
      if (at !== undefined) positionMs = at;
    },
    advance(ms: number) {
      if (state === 'playing') positionMs += ms;
    },
    port: {
      read: () => ({ state, positionMs }),
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
function follow(watch: WatchState, port: PlayerPort, onIntent: (i: WatchIntent) => void) {
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
    /** One tick of the follower's clock, with the player advancing with it. */
    tick(advance: (ms: number) => void = () => {}) {
      jest.setSystemTime(Date.now() + FOLLOW_TICK_MS);
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

describe('a player that disagrees for one tick', () => {
  it('is not a press, and is corrected in the ordinary way', () => {
    // **The bug.** A state reported late, an advert starting, a stall that
    // resolves itself: the embed produces these constantly, and every one
    // of them used to become an instruction to the room.
    const player = fakePlayer();
    const run = follow(playing(), player.port, () => {});

    run.tick(player.advance);
    player.say('paused');
    run.tick(player.advance);
    // Nothing said to the channel, and nothing said to the player either:
    // correcting inside the dwell would undo the press being waited on.
    expect(run.sent).toEqual([]);
    expect(player.calls).toEqual([]);

    // And the blip passes.
    player.say('playing');
    run.tick(player.advance);
    expect(run.sent).toEqual([]);
  });

  it('corrects a player that stayed wrong without ever calling it a press', () => {
    // The other end of the same tick: once the follower has spoken, the
    // window in `contradictionFrom` keeps its own command from reading as
    // somebody else's.
    const player = fakePlayer();
    const run = follow(playing(), player.port, () => {});
    run.tick(player.advance);

    player.say('paused');
    run.tick(player.advance); // the dwell begins, nothing is said
    run.tick(player.advance); // it stands, and becomes a press
    expect(run.sent).toEqual([{ do: 'pause' }]);
  });
});

describe('a player that disagrees and keeps disagreeing', () => {
  it('is a press, said once', () => {
    const player = fakePlayer();
    const run = follow(playing(), player.port, () => {});
    run.tick(player.advance);

    player.say('paused');
    run.tick(player.advance);
    run.tick(player.advance);
    expect(run.sent).toEqual([{ do: 'pause' }]);

    // And not again while the channel has yet to answer: `watchPlay` is not
    // idempotent, so a repeat is a party jumping backwards.
    run.tick(player.advance);
    run.tick(player.advance);
    expect(run.sent).toEqual([{ do: 'pause' }]);
  });

  it('says nothing more once the channel has agreed', () => {
    const player = fakePlayer();
    const run = follow(playing(), player.port, () => {});
    run.tick(player.advance);
    player.say('paused');
    run.tick(player.advance);
    run.tick(player.advance);

    // The press comes back as a snapshot, which is the channel and the
    // player agreeing again.
    run.say(reduce(
      reduce(channel(), { type: 'WATCH_PLAY', userId: A }, T0),
      { type: 'WATCH_PAUSE', userId: A },
      Date.now()
    ).watch);
    run.tick(player.advance);
    run.tick(player.advance);
    run.tick(player.advance);
    expect(run.sent).toEqual([{ do: 'pause' }]);
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
