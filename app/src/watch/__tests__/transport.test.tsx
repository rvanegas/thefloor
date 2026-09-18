import React from 'react';
import { AppState, Text } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import type { ChannelState, WatchState } from '../../../../core/types';
import type { PlayerState, WatchIntent } from '../../../../core/watch';
import { watchPositionMs } from '../../../../core/watch';
import { useFollow, type PlayerPort } from '../drive';

/**
 * The transport with everything that is slow about it left in.
 *
 * `follow.test.tsx` drives the follower a tick at a time against a player it
 * moves by hand, which is how the rules are tested. This one is the other
 * half: a player that takes half a second to obey anything, a channel on the
 * far side of a round trip, and a clock that runs while both of them think.
 * **Every defect in here survived the tick-at-a-time tests**, because each of
 * them is a race between two latencies rather than a wrong answer.
 *
 * Reported from a watch on 2026-09-17, after the dwell had already landed:
 * *play results in alternating play and pause, never settling into desired
 * state. Video seek is also reverted, as if seek within video is ignored by
 * app.* They are two faces of one thing — the follower correcting the player
 * back to the channel during the window in which it has not yet read what the
 * person did to it.
 */

const A = 'user-a';
const B = 'user-b';
const T0 = 1_700_000_000_000;
const URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const LENGTH = 600_000;

/** How long this player takes to do as it is told. Longer than a tick. */
const LAG_MS = 600;

/** How long a press takes to reach the channel and come back. */
const TRIP_MS = 300;

/**
 * A player that obeys, but not instantly, like every embed does.
 *
 * The thing it has that a hand-driven fake does not is *latency*: a command
 * leaves it buffering for a while and only then takes effect, and it goes on
 * reporting its old state in the meantime. A second command arriving inside
 * that window does not restart the clock — a real player is already on its
 * way — which matters, because the follower used to send one every tick.
 */
function laggyPlayer(lag: number) {
  let state: PlayerState = 'unstarted';
  let positionMs = 0;
  let durationMs: number | null = LENGTH;
  let want: PlayerState | null = null;
  let pending: { at: number; run: () => void } | null = null;
  const calls: string[] = [];
  return {
    calls,
    get state() {
      return state;
    },
    get positionMs() {
      return positionMs;
    },
    /**
     * An advert taking the frame over, reporting its own clock and its own
     * length — which is how `showingTheFilm` tells one from the film.
     */
    advert(seconds: number | null) {
      if (seconds === null) {
        durationMs = LENGTH;
        return;
      }
      durationMs = seconds * 1000;
      positionMs = 1_000;
    },
    /** Somebody's thumb on the video's own bar, which lands at once. */
    press(next: PlayerState, at?: number) {
      state = next;
      want = next;
      pending = null;
      if (at !== undefined) positionMs = at;
    },
    step(now: number, ms: number) {
      if (state === 'playing') positionMs += ms;
      if (pending && now >= pending.at) {
        const go = pending.run;
        pending = null;
        go();
      }
    },
    port: {
      read: () => ({ state, positionMs, durationMs }),
      play: () => {
        calls.push('play');
        if (state === 'playing' || want === 'playing') return;
        want = 'playing';
        state = 'buffering';
        pending = {
          at: Date.now() + lag,
          run: () => {
            state = 'playing';
          },
        };
      },
      pause: () => {
        calls.push('pause');
        if (state === 'paused' || want === 'paused') return;
        want = 'paused';
        pending = {
          at: Date.now() + lag,
          run: () => {
            state = 'paused';
          },
        };
      },
      /*
        **Seeking starts a player that has not begun**, which is the API's own
        rule and the opposite of the intuition: *"If the player is paused when
        the function is called, it will remain paused. If the function is
        called from another state (playing, video cued, etc.), the player will
        play the video."* A fake that kept a cued player cued through a seek
        would be a fake that could not reproduce the defect this file exists
        to catch.
      */
      seek: (ms: number) => {
        calls.push(`seek:${Math.round(ms)}`);
        const was = state;
        state = 'buffering';
        pending = {
          at: Date.now() + lag,
          run: () => {
            positionMs = ms;
            state = was === 'paused' ? 'paused' : 'playing';
            want = state;
          },
        };
      },
    } satisfies PlayerPort,
  };
}

function party(): ChannelState {
  const made = createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 });
  const entered = reduce(made, { type: 'ENTER', userId: B }, T0);
  const started = reduce(
    entered,
    { type: 'START_WATCH', userId: A, videoId: 'dQw4w9WgXcQ', url: URL },
    T0
  );
  return reduce(started, { type: 'WATCH_READY', userId: A, durationMs: LENGTH }, T0);
}

/** The channel, reached over a wire with a round trip in it. */
function server(initial: ChannelState, trip: number) {
  let state = initial;
  const queue: {
    at: number;
    act: (c: ChannelState, now: number) => ChannelState;
  }[] = [];
  const heard: string[] = [];
  return {
    get watch(): WatchState {
      return state.watch;
    },
    /** Every intent the channel was actually asked for, in order. */
    heard,
    send(intent: WatchIntent, now: number) {
      heard.push(
        intent.do === 'seek'
          ? `seek:${Math.round(intent.positionMs)}`
          : intent.do
      );
      queue.push({
        at: now + trip,
        act: (c, t) =>
          intent.do === 'play'
            ? reduce(c, { type: 'WATCH_PLAY', userId: A }, t)
            : intent.do === 'pause'
              ? reduce(c, { type: 'WATCH_PAUSE', userId: A }, t)
              : reduce(
                  c,
                  {
                    type: 'WATCH_SEEK',
                    userId: A,
                    positionMs: intent.positionMs,
                  },
                  t
                ),
      });
    },
    deliver(now: number) {
      while (queue.length && queue[0].at <= now) {
        state = queue.shift()!.act(state, now);
      }
    },
  };
}

let tree: ReactTestRenderer | null = null;

function run(
  opts: {
    mayControl?: boolean;
    /**
     * The channel as it stands before this follower exists, for the screen
     * that arrives at a party already under way. Applied to the fresh
     * channel, so the follower mounts against it rather than watching it
     * happen.
     */
    already?: (channel: ChannelState) => ChannelState;
  } = {}
) {
  const player = laggyPlayer(LAG_MS);
  const wire = server((opts.already ?? ((c) => c))(party()), TRIP_MS);
  function Follower({ watch }: { watch: WatchState }) {
    useFollow(watch, player.port, true, {
      mayControl: opts.mayControl ?? true,
      onIntent: (intent) => wire.send(intent, Date.now()),
    });
    return <Text>following</Text>;
  }
  act(() => {
    tree = renderer.create(<Follower watch={wire.watch} />);
  });
  const STEP = 50;
  return {
    player,
    wire,
    /**
     * Move everything forward together, in steps small enough that the tick,
     * the player's latency and the round trip all land where they would.
     *
     * `advanceTimersByTime` moves the fake clock as well as the timers, so it
     * is the only thing here allowed to say what time it is — setting the
     * system clock as well runs the channel at twice the player's speed,
     * which reads as drift that is not there.
     */
    advance(ms: number) {
      for (let done = 0; done < ms; done += STEP) {
        const now = Date.now() + STEP;
        player.step(now, STEP);
        wire.deliver(now);
        act(() => {
          tree!.update(<Follower watch={wire.watch} />);
          jest.advanceTimersByTime(STEP);
        });
      }
    },
    /** What the two of them say, side by side. */
    where() {
      const now = Date.now();
      return {
        channel: wire.watch.status,
        channelAt: Math.round(watchPositionMs(wire.watch, now)),
        player: player.state,
        playerAt: Math.round(player.positionMs),
      };
    },
  };
}

/** Both ends of the party, agreeing to within the tolerance they are kept to. */
function inStep(where: ReturnType<ReturnType<typeof run>['where']>) {
  const together =
    where.channel === 'playing'
      ? where.player === 'playing'
      : where.player === 'paused';
  return together && Math.abs(where.channelAt - where.playerAt) <= 1_500;
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

describe('a scrub on the video’s own bar', () => {
  it('moves the party rather than being corrected away', () => {
    /*
      **The seek that was ignored.** A jump is visible for exactly one tick —
      the reading after it is continuous with the one before, the film simply
      running from its new place — so a seek candidate asked to be seen twice
      never was, and the follower dragged the picture back to where the
      channel still said it should be. What that looks like on a watch is a
      bar that does not answer a finger.
    */
    const sim = run();
    sim.wire.send({ do: 'play' }, Date.now());
    sim.advance(6_000);
    const before = sim.wire.heard.length;

    const to = sim.player.positionMs + 120_000;
    sim.player.press('playing', to);
    sim.advance(6_000);

    // One seek, carrying where the film had reached by the time it was read
    // rather than where the thumb first landed — a tick of the dwell later.
    const sent = sim.wire.heard.slice(before);
    expect(sent).toHaveLength(1);
    const asked = Number(sent[0].split(':')[1]);
    expect(asked).toBeGreaterThanOrEqual(to);
    expect(asked).toBeLessThanOrEqual(to + 1_500);
    // And the party went there, rather than the picture coming back.
    const where = sim.where();
    expect(where.channelAt).toBeGreaterThan(to);
    expect(inStep(where)).toBe(true);
  });

  it('is not read from a player that merely lied for a tick', () => {
    // The dwell's whole job, which the gap does instead for a scrub: an
    // advert's own clock, a state reported late. Here the position comes
    // back by itself, so nothing was meant by it.
    const sim = run();
    sim.wire.send({ do: 'play' }, Date.now());
    sim.advance(6_000);
    const before = sim.wire.heard.length;

    const real = sim.player.positionMs;
    sim.player.press('playing', real + 90_000);
    sim.advance(500);
    sim.player.press('playing', real + 500);
    sim.advance(4_000);

    expect(sim.wire.heard.slice(before)).toEqual([]);
    expect(inStep(sim.where())).toBe(true);
  });
});

describe('a second press, made before the first has settled', () => {
  it('is read rather than corrected away', () => {
    /*
      **The alternation.** The window after a press stopped this follower
      reading another one, but not talking to the player — so a press made
      inside it was pushed back to whatever the channel still said, and the
      person pressed again, which started the window over. Press Play, watch
      it start and stop, press again: play-pause-play-pause, settling
      nowhere. See `INTENT_QUIET_MS`.
    */
    const sim = run();
    sim.wire.send({ do: 'play' }, Date.now());
    sim.advance(6_000);

    sim.player.press('paused');
    sim.advance(2_000);
    expect(sim.wire.heard).toEqual(['play', 'pause']);
    expect(sim.where().channel).toBe('paused');

    // A second later, which is how fast anybody presses when the first press
    // looked ignored.
    sim.player.press('playing');
    sim.advance(5_000);

    expect(sim.wire.heard).toEqual(['play', 'pause', 'play']);
    expect(inStep(sim.where())).toBe(true);
  });

  it('leaves the player alone in the meantime', () => {
    // Not merely deaf: silent. Anything said to the player in this window is
    // said over a press nothing has read yet.
    const sim = run();
    sim.wire.send({ do: 'play' }, Date.now());
    sim.advance(6_000);

    sim.player.press('paused');
    sim.advance(2_000);
    const after = sim.player.calls.length;
    sim.player.press('playing');
    sim.advance(1_000);

    expect(sim.player.calls.slice(after)).toEqual([]);
  });
});

describe('a screen joining a party that is paused', () => {
  it('does not start the film by arriving', () => {
    /*
      **Reported from a device switch: handing the picture over turned a
      paused party into a playing one.**

      The new screen comes up `cued` at zero against a channel paused a
      minute in, so the follower seeks it — and a seek is what starts a cued
      player. Its own follower then read a playing player against a paused
      channel, which in a settled phase is a person pressing play, and told
      the room so. Nothing about that reading is wrong; the instruction was
      incomplete. See `followInstructions`.
    */
    // A party paused a minute in, already so before this screen existed —
    // which is what a picture being handed over looks like from the device
    // receiving it. The player is `unstarted`, which is to say cued.
    const sim = run({
      already: (c) =>
        reduce(
          reduce(c, { type: 'WATCH_PLAY', userId: A }, T0),
          { type: 'WATCH_PAUSE', userId: A },
          T0 + 60_000
        ),
    });
    expect(sim.where().channel).toBe('paused');

    // The follower's first tick runs on mount, so by here the cued player has
    // already been sent where the party is — which is the seek that used to
    // start it.
    sim.advance(8_000);

    // Nothing was said to the room at all: arriving is not pressing anything.
    expect(sim.wire.heard).toEqual([]);
    expect(sim.where().channel).toBe('paused');
    // And the screen is where the party is, stopped.
    expect(sim.player.state).toBe('paused');
    expect(Math.abs(sim.player.positionMs - 60_000)).toBeLessThanOrEqual(1_500);
  });
});

describe('an advert in the frame', () => {
  it('moves neither the room nor the picture', () => {
    /*
      **An advert is a different video reporting its own clock.** Its
      position reads as a scrub to the start and its length is nothing like
      the film's, which is how it is told apart — every earlier attempt
      listed this among the lies it was guessing around, with a timer. See
      `showingTheFilm`.
    */
    const sim = run();
    sim.wire.send({ do: 'play' }, Date.now());
    sim.advance(6_000);
    const heard = sim.wire.heard.length;
    const calls = sim.player.calls.length;

    sim.player.advert(90);
    sim.advance(5_000);
    expect(sim.wire.heard.slice(heard)).toEqual([]);
    expect(sim.player.calls.slice(calls)).toEqual([]);

    // The spot ends and the film comes back where the party had got to.
    sim.player.advert(null);
    sim.player.press('playing', Math.round(sim.where().channelAt));
    sim.advance(4_000);
    expect(sim.wire.heard.slice(heard)).toEqual([]);
    expect(inStep(sim.where())).toBe(true);
  });
});

describe('a screen that may not drive', () => {
  it('is corrected back, which is the greyed button said by the video', () => {
    // The silence above belongs to whoever may drive. For everybody else
    // there is no press to protect, and following is the whole job.
    const sim = run({ mayControl: false });
    sim.wire.send({ do: 'play' }, Date.now());
    sim.advance(6_000);

    sim.player.press('playing', sim.player.positionMs + 120_000);
    sim.advance(6_000);

    expect(sim.wire.heard).toEqual(['play']);
    expect(inStep(sim.where())).toBe(true);
  });
});

describe('a party left alone', () => {
  it('settles, and stays settled', () => {
    // The seek storm's test: nothing is pressed, so nothing should be said
    // to the player at all once it is running.
    const sim = run();
    sim.wire.send({ do: 'play' }, Date.now());
    sim.advance(4_000);
    const after = sim.player.calls.length;
    sim.advance(30_000);

    expect(sim.player.calls.slice(after)).toEqual([]);
    expect(inStep(sim.where())).toBe(true);
  });
});
