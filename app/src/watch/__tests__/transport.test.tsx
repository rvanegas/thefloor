import React from 'react';
import { Text } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import {
  WATCH_COLD_NUDGE_MS,
  WATCH_DRIFT_MS,
  WATCH_REPORT_SLACK_MS,
  WATCH_STALL_MS,
} from '../../../../core/constants';
import type { ChannelState, WatchState } from '../../../../core/types';
import type { PlayerState } from '../../../../core/watch';
import { watchPositionMs } from '../../../../core/watch';
import { FOLLOW_TICK_MS, useFollow, type PlayerPort } from '../drive';
import { readDrift } from '../drift';

/**
 * The diagnostic log, captured rather than written.
 *
 * `drive.ts` is the only thing in this tree that records anything, and what it
 * records is the whole subject of *how long a press takes, and where it goes*
 * below — so the module is replaced by a list, stamped off the fake clock.
 * Built inside the factory and handed back through the mock, because
 * `jest.mock` is hoisted above every `const` in this file and a closure over
 * one would be read before it exists.
 */
jest.mock('../../audio/diagnostics', () => {
  const lines: string[] = [];
  return {
    recordEvent: (text: string) => lines.push(`${Date.now()} ${text}`),
    __lines: lines,
  };
});

const logged = (
  jest.requireMock('../../audio/diagnostics') as { __lines: string[] }
).__lines;

/**
 * The follower with everything that is slow about it left in.
 *
 * A player that takes half a second to obey anything, a channel on the far
 * side of a round trip, and a clock that runs while both of them think.
 * **Every defect this file has caught was a race between two latencies**
 * rather than a wrong answer, which is why the rules' own tests were green
 * through all of them.
 *
 * It is much smaller than it was. Two thirds of it were about reading a press
 * off the player — a scrub, a play, a pause, an advert lying about all three —
 * and there is nothing to read any more: the picture's own controls are off
 * since 2026-09-18, so this player is only ever told things. See
 * planning/decisions/2026-09-18-the-picture-is-not-a-control.md.
 */

const A = 'user-a';
const B = 'user-b';
const T0 = 1_700_000_000_000;
const URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const LENGTH = 600_000;
const VIDEO = 'dQw4w9WgXcQ';
/** The room the published reading is keyed on. See `drift.ts`. */
const CHANNEL = 'c1';

/** How long this player takes to do as it is told. Longer than a tick. */
const LAG_MS = 600;

/** How long an action takes to reach the channel and come back. */
const TRIP_MS = 300;

/**
 * A player that obeys, but not instantly, like every embed does.
 *
 * A command leaves it buffering for a while and only then takes effect, and
 * it goes on reporting its old state in the meantime. A second command
 * arriving inside that window does not restart the clock — a real player is
 * already on its way.
 */
function laggyPlayer(lag: number) {
  /** Set by `stuck`: commands are heard and recorded, and nothing happens. */
  let deaf = false;
  let state: PlayerState = 'unstarted';
  let positionMs = 0;
  let durationMs: number | null = LENGTH;
  /** Which video is in the frame, which an advert changes. */
  let showing: string | null = VIDEO;
  let want: PlayerState | null = null;
  let pending: { at: number; run: () => void; seeking?: boolean } | null =
    null;
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
     * An advert taking the frame over, reporting its own clock, its own
     * length **and its own id** — which is how `showingTheFilm` tells one
     * from the film. The id since 2026-09-23; see `showingTheFilm` for what
     * comparing the lengths alone could not see.
     */
    advert(seconds: number | null) {
      if (seconds === null) {
        durationMs = LENGTH;
        showing = VIDEO;
        return;
      }
      durationMs = seconds * 1000;
      positionMs = 1_000;
      showing = 'ad000000000';
    },
    /**
     * The connection going away for a while.
     *
     * The player stops where it is and reports `buffering` until it has
     * refilled — it does not move, so the transport's wall clock runs on
     * without it and the drift is real rather than staged. This is the one
     * thing a phone on a poor connection does that nothing else here models.
     */
    stall(ms: number) {
      state = 'buffering';
      want = null;
      pending = {
        at: Date.now() + ms,
        run: () => {
          state = 'playing';
          want = 'playing';
        },
      };
    },
    /**
     * A stall with nothing on the far side of it, and a player that cannot be
     * talked out of it.
     *
     * **The defect this models is the absence of an ending.** `stall` above
     * recovers by itself, which every ordinary stall does; this one does not,
     * and it also ignores what it is told — a frame that has genuinely lost
     * its way and answers a seek with more buffering. It still records the
     * calls, which is the whole of what is being asserted: that something is
     * eventually said, and that it is not said every tick.
     */
    stuck() {
      state = 'buffering';
      want = null;
      pending = null;
      deaf = true;
    },
    /**
     * A player that hears every command, reports a steady state, and does
     * nothing — which is the shape the *unable to resume from a pause*
     * reports have, and is not the stall above.
     *
     * It is worth keeping the two apart because the follower treats them
     * quite differently: a buffering player is deliberately told nothing
     * while it settles, and a player that says `paused` is told to play at
     * every fuse. Only the second can be recognised as disobedient.
     */
    latch() {
      want = null;
      pending = null;
      deaf = true;
    },
    step(now: number, ms: number) {
      if (state === 'playing') positionMs += ms;
      /*
        **A film that runs out ends by itself**, which nothing else in this
        harness did. Every player here was immortal, so `ended` — the one
        state `hasArrived` answers true for whatever was asked — was never
        reached by a simulation and was only ever tested as a reading handed
        to the rules directly.
      */
      if (state === 'playing' && durationMs !== null && positionMs >= durationMs) {
        positionMs = durationMs;
        state = 'ended';
        want = null;
        pending = null;
      }
      if (pending && now >= pending.at) {
        const go = pending.run;
        pending = null;
        go();
      }
    },
    port: {
      read: () => ({ state, positionMs, durationMs, videoId: showing }),
      play: () => {
        calls.push('play');
        if (deaf) return;
        /*
          **A seek already on its way is not abandoned by a play beside it.**
          `seek` below leaves a player that was not paused playing when it
          lands, so the pair `followInstructions` issues together — seek,
          then play — is one instruction twice over rather than two places
          to be. A player that dropped the position and played from where it
          was would be a player nothing could move.
        */
        if (pending?.seeking) return;
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
        if (deaf) return;
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
        play the video."*
      */
      seek: (ms: number) => {
        calls.push(`seek:${Math.round(ms)}`);
        if (deaf) return;
        const was = state;
        state = 'buffering';
        pending = {
          at: Date.now() + lag,
          seeking: true,
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
  return reduce(
    started,
    { type: 'WATCH_READY', userId: A, durationMs: LENGTH },
    T0
  );
}

/** The channel, reached over a wire with a round trip in it. */
function server(initial: ChannelState, trip: number) {
  let state = initial;
  const queue: {
    at: number;
    act: (c: ChannelState, now: number) => ChannelState;
  }[] = [];
  return {
    get watch(): WatchState {
      return state.watch;
    },
    /** A button, pressed anywhere in the room. */
    press(
      action: (c: ChannelState, now: number) => ChannelState,
      now: number
    ) {
      queue.push({ at: now + trip, act: action });
    },
    deliver(now: number) {
      while (queue.length && queue[0].at <= now) {
        state = queue.shift()!.act(state, now);
      }
    },
  };
}

const play = (c: ChannelState, t: number) =>
  reduce(c, { type: 'WATCH_PLAY', userId: A }, t);
const pause = (c: ChannelState, t: number) =>
  reduce(c, { type: 'WATCH_PAUSE', userId: A }, t);
const seekTo = (positionMs: number) => (c: ChannelState, t: number) =>
  reduce(c, { type: 'WATCH_SEEK', userId: A, positionMs }, t);
/**
 * A player saying it has started, which is what starts the room's clock.
 *
 * **The harness sends this because a device does.** `watchPlay` banks a start
 * `WATCH_STARTUP_GRACE_MS` in the future — no player begins at the press — and
 * the first player to report pulls it to the truth. A simulation that never
 * reported would be a room of screens that never came back, which is the
 * deadline's case and has its own test.
 */
const started = (positionMs: number) => (c: ChannelState, t: number) =>
  reduce(c, { type: 'WATCH_STARTED', userId: A, positionMs }, t);

let tree: ReactTestRenderer | null = null;

function run(
  opts: {
    /**
     * The channel as it stands before this follower exists, for the screen
     * that arrives at a party already under way.
     */
    already?: (channel: ChannelState) => ChannelState;
    /**
     * How long this player takes to start, when the default is not the point.
     *
     * Only *how long a press takes, and where it goes* below passes it: that
     * section is about the relationship between a player's own latency and
     * what the log says about it, so the latency has to be a variable rather
     * than a constant everything else is written against.
     */
    lag?: number;
    /**
     * How far this device's own wall clock is from the server's.
     *
     * **The one latency this harness could not model until the follower took a
     * clock.** Everything here ran on one fake `Date.now()` for both the channel
     * and the follower, so a device disagreeing with the server about what time
     * it is was not expressible — which is why `drive.ts` comparing a server
     * stamp against `Date.now()` went unnoticed. The room's clock is the
     * server's; the device's is that minus this.
     */
    skew?: number;
  } = {}
) {
  const player = laggyPlayer(opts.lag ?? LAG_MS);
  const skew = opts.skew ?? 0;
  /** What the room thinks the time is, which is what a device is handed. */
  const roomNow = () => Date.now() + skew;
  const wire = server((opts.already ?? ((c) => c))(party()), TRIP_MS);
  function Follower({ watch }: { watch: WatchState }) {
    useFollow(watch, player.port, true, roomNow, CHANNEL);
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
        // The channel is the server's, so it is reduced and delivered on the
        // server's clock. The two are the same number unless `skew` says not.
        const there = roomNow() + STEP;
        const was = player.state;
        player.step(now, STEP);
        // The report crosses the wire like everything else, so it lands a round
        // trip after the player actually began — which is what a phone does,
        // and is well inside the grace.
        if (was !== 'playing' && player.state === 'playing') {
          wire.press(started(player.positionMs), there);
        }
        wire.deliver(there);
        act(() => {
          tree!.update(<Follower watch={wire.watch} />);
          jest.advanceTimersByTime(STEP);
        });
      }
    },
    /** The room's clock, which is what a press is stamped with. */
    now: roomNow,
    /** What the two of them say, side by side. */
    where() {
      const now = roomNow();
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
});

afterEach(() => {
  act(() => {
    tree?.unmount();
  });
  tree = null;
  jest.useRealTimers();
});

describe('a button pressed in the room', () => {
  it('starts the film here', () => {
    const sim = run();
    sim.wire.press(play, Date.now());
    sim.advance(4_000);
    expect(inStep(sim.where())).toBe(true);
    expect(sim.where().channel).toBe('playing');
  });

  it('stops it again', () => {
    const sim = run();
    sim.wire.press(play, Date.now());
    sim.advance(4_000);
    sim.wire.press(pause, Date.now());
    sim.advance(4_000);
    expect(inStep(sim.where())).toBe(true);
    expect(sim.where().channel).toBe('paused');
  });

  it('moves it, and the picture goes with it', () => {
    const sim = run();
    sim.wire.press(play, Date.now());
    sim.advance(4_000);
    sim.wire.press(seekTo(300_000), Date.now());
    sim.advance(6_000);
    expect(sim.player.positionMs).toBeGreaterThanOrEqual(300_000);
    expect(inStep(sim.where())).toBe(true);
  });

  it('is answered on every press, however fast they come', () => {
    // **No window in which this follower is deaf.** There used to be four,
    // each one a way of not mistaking a press for the echo of a correction;
    // with nothing to mistake, a press a second is just three presses.
    const sim = run();
    sim.wire.press(play, Date.now());
    sim.advance(1_000);
    sim.wire.press(pause, Date.now());
    sim.advance(1_000);
    sim.wire.press(play, Date.now());
    sim.advance(6_000);
    expect(sim.where().channel).toBe('playing');
    expect(inStep(sim.where())).toBe(true);
  });
});

describe('a press', () => {
  /*
    **The half-second that was nobody's fault.**

    A press is not a command to your own player: it goes to the server and
    comes back as a snapshot, and the follower used to notice that snapshot
    only when its own interval next came round — so every play and every
    pause carried a `FOLLOW_TICK_MS` window on top of the round trip, for no
    reason other than that nothing woke the loop. This is the assertion that
    the loop is woken: the play must be out of the door in the tick the
    snapshot lands in, not the one after it.
  */
  it('reaches the player as soon as the channel says so, not at the next tick', () => {
    const sim = run();
    sim.player.calls.length = 0;
    sim.wire.press(play, Date.now());

    // The round trip and one step, which is well short of a tick. Under the
    // interval alone there is nothing here at all.
    sim.advance(TRIP_MS + 50);
    expect(sim.player.calls).toContain('play');
  });
});

describe('a party left alone', () => {
  it('settles, and stays settled', () => {
    // The seek storm's test: nothing is pressed, so nothing should be said
    // to the player at all once it is running.
    const sim = run();
    sim.wire.press(play, Date.now());
    sim.advance(4_000);
    const after = sim.player.calls.length;
    sim.advance(30_000);

    expect(sim.player.calls.slice(after)).toEqual([]);
    expect(inStep(sim.where())).toBe(true);
  });
});

describe('a screen joining a party that is paused', () => {
  it('does not start the film by arriving', () => {
    /*
      **The seek that put a new screen where the party had got to also
      started it**, a cued player being one of the states the API says a seek
      sets going. A paused party therefore pauses after the corrective seek —
      for the two states a seek actually starts, since a player that was
      playing was stopped by the pause issued before it.
    */
    const sim = run({
      // Played, reported and paused: a party that ran for a minute on a real
      // screen. Without the report the clock would not have started and the
      // minute would be two seconds short. See `WATCH_STARTUP_GRACE_MS`.
      already: (c) => pause(started(0)(play(c, T0), T0), T0 + 60_000),
    });
    expect(sim.where().channel).toBe('paused');

    sim.advance(8_000);

    expect(sim.where().channel).toBe('paused');
    expect(sim.player.state).toBe('paused');
    expect(Math.abs(sim.player.positionMs - 60_000)).toBeLessThanOrEqual(1_500);
  });
});

describe('an advert in the frame', () => {
  it('is left alone until the film is back', () => {
    /*
      **An advert is a different video reporting its own clock**, so its
      position reads as a jump to the start and its length is nothing like
      the film's. Correcting it would seek the advert. They end by
      themselves. See `showingTheFilm`.
    */
    const sim = run();
    sim.wire.press(play, Date.now());
    sim.advance(6_000);
    const calls = sim.player.calls.length;

    sim.player.advert(90);
    sim.advance(5_000);
    expect(sim.player.calls.slice(calls)).toEqual([]);

    sim.player.advert(null);
    sim.advance(4_000);
    expect(inStep(sim.where())).toBe(true);
  });
});

describe('a player that cannot keep up', () => {
  /*
    **The stutter three phones showed on one party**, and the reason it is
    tested here rather than in `core/`: the rule is one clause in
    `followInstructions`, but what made it a stutter is this file's subject —
    a fuse, a tick and a latency arranged so that the cure kept re-arming the
    disease.

    A stall is not a fault. The transport is a wall clock, so a player that
    stops for a second is a second behind and can never win it back on its
    own; the only repair available is a forward seek. A seek **discards the
    buffer** and starts fetching somewhere else, so correcting a player that
    is still refilling stalls it again — and `WATCH_OBEDIENCE_MS` brings the
    follower back to do it once more. The picture never gets the second it
    needs, and somebody watching sees it stop and start every second or two.
  */
  it('is left alone while it refills, however far behind it falls', () => {
    const sim = run();
    sim.wire.press(play, Date.now());
    sim.advance(3_000);
    sim.player.calls.length = 0;

    // Four seconds of nothing, which is past `WATCH_DRIFT_MS` and past the
    // fuse twice over — the window in which every correction was a relapse.
    // Stopping short of the end of it on purpose: the seek owed to a player
    // that has *finished* refilling is the next test's subject, and it is
    // owed.
    sim.player.stall(4_000);
    sim.advance(3_500);

    expect(sim.player.calls).toEqual([]);
  });

  /**
   * **The stall with no far side, which is what patience cost.**
   *
   * Reported from a real party: one member watching happily, another looking
   * at a frozen frame and a spinner, and the only cures a human pausing and
   * playing or leaving full screen. A buffering player is told nothing so
   * that a seek cannot throw away a buffer that is filling — and that silence
   * had no end, so a buffer that never filled was a picture nothing would
   * ever speak to again.
   */
  it('nudges a player whose stall has no end, and then leaves it alone again', () => {
    const sim = run();
    sim.wire.press(play, Date.now());
    sim.advance(3_000);
    sim.player.calls.length = 0;

    sim.player.stuck();
    // Most of the window and nothing said: an ordinary stall must still be
    // allowed to finish, which is the rule this is bounded by rather than a
    // reversal of it.
    sim.advance(WATCH_STALL_MS - 1_000);
    expect(sim.player.calls).toEqual([]);

    // Past it, and the pair a person would have pressed by hand.
    sim.advance(2_000);
    expect(sim.player.calls).toContain('play');
    expect(sim.player.calls.some((c) => c.startsWith('seek'))).toBe(true);

    // **And once per window, not once per tick**, which is the storm the
    // silence was written against: two more windows is two more nudges, not
    // forty. A tick is 500ms.
    sim.player.calls.length = 0;
    sim.advance(WATCH_STALL_MS * 2);
    expect(sim.player.calls.filter((c) => c === 'play')).toHaveLength(2);
  });

  /*
    **The press that waited ten seconds, from the build 277 log.**

    A film wedged in `buffering` with a paused transport was told to pause on
    every fuse — eighty times in two minutes — and each of those restarted the
    stall clock. A press of Play then waited out the whole of
    `WATCH_STALL_MS` before the follower would say anything at all, because a
    buffering player is one the rules leave alone.

    That patience is owed to the player and not to the person. Reported as *I
    pressed play and it took about five seconds*, which is the complaint this
    whole investigation began with — and not the audio session after all.
  */
  it('answers a press at once, however long it has been leaving a stall alone', () => {
    const sim = run();
    sim.wire.press(play, Date.now());
    sim.advance(3_000);
    sim.wire.press(pause, Date.now());
    sim.advance(2_000);

    // Wedged: buffering with no far side and deaf to what it is told, which
    // is the state the build 277 log caught. `stall` will not do — the sim's
    // player takes a pause as the end of one, so it would be resting rather
    // than stuck and the rule under test would never be reached.
    sim.player.stuck();
    sim.advance(6_000);
    sim.player.calls.length = 0;

    sim.wire.press(play, Date.now());
    // The round trip and a tick. Under the old rule there was nothing here
    // for the rest of the stall window.
    sim.advance(TRIP_MS + FOLLOW_TICK_MS + 100);
    expect(sim.player.calls).toContain('play');
  });

  it('does not repeat a pause at a player that is still buffering', () => {
    // Eighty identical instructions, 1.5s apart, with no end — the storm the
    // paused branch had because only the playing one consulted the stall
    // window. One nudge per window is the rule in both directions now.
    const sim = run();
    sim.wire.press(play, Date.now());
    sim.advance(3_000);
    sim.wire.press(pause, Date.now());
    sim.advance(2_000);

    sim.player.stuck();
    sim.player.calls.length = 0;
    sim.advance(6_000);

    expect(
      sim.player.calls.filter((c) => c === 'pause').length
    ).toBeLessThanOrEqual(1);
  });

  it('corrects it once, on the far side, and comes back in step', () => {
    const sim = run();
    sim.wire.press(play, Date.now());
    sim.advance(3_000);
    sim.player.calls.length = 0;

    sim.player.stall(4_000);
    sim.advance(4_000);
    // Playing again, and four seconds behind the channel's clock. *Now* the
    // seek is owed, and one is enough.
    sim.advance(3_000);

    expect(sim.player.calls.filter((c) => c.startsWith('seek'))).toHaveLength(
      1
    );
    expect(inStep(sim.where())).toBe(true);
  });
});

describe('a film that has run out', () => {
  /*
    **Play, on a film that has ended, and the picture does not come back.**

    The rules have both halves of this right and have had since they were
    written: `followInstructions` seeks an ended player back and starts it
    once the transport has gone back, and there is a test for exactly that.
    What no test covered is the two rules *together*, through the driver —
    and `drive.ts` returns at `hasArrived` before it ever asks for
    instructions. `hasArrived` is true for `ended` unconditionally, so the
    restart is unreachable from the only thing that would issue it.

    What it costs is the whole of the end of every party: the transport says
    playing from zero, everybody's screen stays on the last frame, and
    nothing in the application will ever speak to those players again. The
    only cure is rebuilding a player, which is what rotating the device does.
  */
  it('is started again by a press of Play', () => {
    const sim = run();
    sim.wire.press(play, Date.now());
    sim.advance(LENGTH + 4_000);
    expect(sim.player.state).toBe('ended');

    // Pause and play, which is what somebody does to a picture that has
    // stopped. `watchPlay` reads a transport at the end as a replay and puts
    // it back to zero, so this is the room asking for the film again.
    sim.wire.press(pause, Date.now());
    sim.advance(2_000);
    sim.wire.press(play, Date.now());
    sim.advance(6_000);
    expect(sim.where().channel).toBe('playing');
    expect(sim.player.state).toBe('playing');
    expect(sim.player.positionMs).toBeLessThan(10_000);
  });
});

/**
 * How long a press takes, and where it goes.
 *
 * **Written 2026-09-27, because the number this application reports about
 * itself had never been apportioned.** `watch playing after 1463ms` — the
 * median of nineteen presses on build 303, and the whole of
 * tasks/the-transport-says-nothing-while-the-film-starts.md — had been read as
 * *the round trip plus the embed starting*, and it is neither of those on its
 * own: the round trip is over before the clock starts, and up to a
 * `FOLLOW_TICK_MS` of the figure is this application noticing rather than the
 * film beginning.
 *
 * **`lag` is the one thing this harness cannot know**, being how long a real
 * embed inside a real `WKWebView` takes to obey; it is a parameter here and
 * the transition lines in `WatchPlayer.tsx` are what measure it on a phone. So
 * these are not a measurement of the complaint. They are the shape of the
 * relationship between that latency and everything this application does with
 * it — which is what says whether a phone reading is ordinary or a cliff edge.
 */
describe('how long a press takes, and where it goes', () => {
  /** The press, and then time, a step at a time, watching both ends. */
  function press(lag: number, forMs = 8_000) {
    const sim = run({ lag });
    logged.length = 0;
    sim.wire.press(play, Date.now());
    /** When the picture actually moved, measured from the press. */
    let picture: number | null = null;
    /** When the two ends came into step, which is not the same moment. */
    let settled: number | null = null;
    for (let t = 50; t <= forMs; t += 50) {
      sim.advance(50);
      if (picture === null && sim.player.state === 'playing') picture = t;
      if (settled === null && inStep(sim.where())) settled = t;
    }
    return {
      sim,
      picture,
      settled,
      /** Every arrival the log claims, in the order it claims them. */
      said: logged
        .map((l) => /watch playing after (\d+)ms/.exec(l))
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => Number(m[1])),
    };
  }

  it('does not make the picture wait for the follower', () => {
    /*
      **The correction that matters most, and it goes the other way to the
      complaint.** An arrival is noticed on the interval, so there is up to a
      `FOLLOW_TICK_MS` window between a player starting and this application
      knowing — and it is tempting to read that window as part of the wait
      somebody is sitting through. It is not. The press wakes the loop, the
      command leaves on the snapshot, and everything after that is the embed's
      own time. The window is in the knowing, not in the picture, so closing it
      would sharpen the log and would not shorten the wait by a millisecond.
    */
    const { picture, sim } = press(600);
    expect(picture).toBe(TRIP_MS + 600);
    expect(sim.player.calls).toEqual(['play']);
  });

  it('reports a figure larger than the embed actually took', () => {
    // The log's own number against the two things it is made of: the player's
    // latency, and up to a tick of this application noticing. Anybody
    // reasoning from `after Nms` about how slow an embed is has the second of
    // those inside their number, and the round trip outside it.
    const { said, picture, settled } = press(600);
    expect(said[0]).toBeGreaterThanOrEqual(600);
    expect(said[0]).toBeLessThanOrEqual(600 + FOLLOW_TICK_MS);
    // The picture moved before the line was written, not after it.
    expect(settled).toBe(picture);
  });

  /*
    **The cliff that was at `WATCH_DRIFT_MS`, and the grace that removed it.**

    The wanted position used to be a wall clock that ran while the player
    obeyed, so a player that finally started was behind by precisely its own
    latency — and `hasArrived` judged that gap against `WATCH_DRIFT_MS`. A
    player slower than the tolerance could never arrive at all. Measured on a
    phone at 1,304ms against 1,500: five of ten resumes corrected, alternating,
    and the other five a second behind for the length of the film.

    `WATCH_STARTUP_GRACE_MS` removes the premise rather than the symptom. The
    room's clock does not start until a player says it is running, so a player
    is in step when it starts however long it took, and there is no correction
    to make. What survives is the lead on a *mid-film* correction, which is a
    real drift and is tested in core.
  */
  describe('a player slower than the drift it is judged against', () => {
    it('needs no correction at all, however slow it is', () => {
      for (const lag of [WATCH_DRIFT_MS, WATCH_DRIFT_MS + 100, 1_800]) {
        const sim = run({ lag });
        sim.wire.press(play, Date.now());
        sim.advance(6_000);
        expect(inStep(sim.where())).toBe(true);
        // One instruction: the play. Nothing was corrected, because nothing
        // was wrong.
        expect(sim.player.calls).toEqual(['play']);
      }
    });
  });

  /*
    **A resume, which is the press the whole of this file is now about.**

    Before the lead, a resume started where the film was paused, ran a second
    behind the room, and was either corrected — a jump, half a second after the
    picture came back — or left behind for the rest of the film. Measured on
    build 305 at five of ten and one of five. Now the position goes out with the
    play, so the picture arrives in step and nothing is said to it afterwards.
  */
  describe('a resume, with the cost of the player already known', () => {
    /** Play, settle, pause, settle: a party ready to be resumed. */
    function resumable(lag: number) {
      const sim = run({ lag });
      sim.wire.press(play, Date.now());
      sim.advance(6_000);
      sim.wire.press(pause, Date.now());
      sim.advance(3_000);
      sim.player.calls.length = 0;
      return sim;
    }

    it('comes back in step rather than a second behind', () => {
      const sim = resumable(1_150);
      sim.wire.press(play, Date.now());
      sim.advance(4_000);
      expect(inStep(sim.where())).toBe(true);
      const where = sim.where();
      // The residue is one round trip: the report crosses the wire, so the
      // room's clock starts a trip after the picture did and every screen is
      // that far ahead of the number. Consistently, which is what matters —
      // the screens agree with each other.
      expect(Math.abs(where.channelAt - where.playerAt)).toBeLessThanOrEqual(
        TRIP_MS + 50
      );
    });

    it('is told nothing beyond the play itself', () => {
      const sim = resumable(1_150);
      sim.wire.press(play, Date.now());
      sim.advance(8_000);
      // Not a seek with it and not a correction after it: one instruction for
      // the whole resume, which is what the grace buys.
      expect(sim.player.calls).toEqual(['play']);
    });

    /*
      **Where this stops working, stated rather than left to be discovered.**

      A player slower than `WATCH_STARTUP_GRACE_MS` does not get to set the
      clock — its report arrives after the deadline has already started it — and
      that on its own is harmless, leaving it a few hundred milliseconds behind.
      What is not harmless is the pause: `watchPause` banks what the clock said,
      a player stops its own latency later, and for a slow player that gap
      exceeds `WATCH_DRIFT_MS`. The resume then seeks it *backwards* to a
      position it has already passed, which re-buffers, which puts it further
      out. Nine instructions at a latency of 2,300ms, and a picture that never
      settles.

      **It is the mirror of the bug the grace fixes, at the other end**, and it
      wants the mirror of the same repair: a player reporting where it stopped.
      Not built here, because the play side was what was asked for and what was
      measured. The phone's own pause is 350 to 1,100ms, comfortably inside the
      tolerance, so nothing about this is reachable on the hardware it was
      measured on. See
      planning/backlog/a-pause-banks-a-position-the-player-has-not-reached.md.

      **The seeking that used to follow it is gone, and the offset is not.** The
      six instructions measured here were
      `seek:6700 play seek:7400 play play seek:12200`, ending `buffering` at 7.6s
      under a room at 9.7s — a picture that never settled. They came from the
      lead being spent on a player that was *ahead*: `adrift` is judged against
      the un-led want, so it fired, and the led target was then the position the
      player already held. `followInstructions` declines that seek now. What is
      left is one instruction and a player 1.7s ahead of the room for the length
      of the film, which is the banked pause showing through and is the entry
      above.
    */
    it('is told once and settles, rather than being seeked at where it is', () => {
      const sim = resumable(2_300);
      sim.wire.press(play, sim.now());
      sim.advance(8_000);
      // One instruction: a seek to within the tolerance of where the player
      // already is cannot close the drift it was issued for, and costs the
      // buffer. Before this it was three seeks and a picture still buffering.
      expect(sim.player.calls).toEqual(['play']);
      expect(sim.player.state).toBe('playing');
      // And the offset it settles at is the pause's, which nothing here repairs
      // — stated as a number so that a stop-side report can be seen to close it.
      const where = sim.where();
      expect(where.playerAt - where.channelAt).toBeGreaterThan(WATCH_DRIFT_MS);
      expect(where.playerAt - where.channelAt).toBeLessThan(
        WATCH_REPORT_SLACK_MS
      );
    });
  });

  /*
    **The ten-second window is for a buffer, and a wedged player has none.**

    `settling` is right about a player refilling and wrong about one that never
    started, and until `WATCH_COLD_NUDGE_MS` the two were the same reading.
    Seen on build 304: a Play pressed inside the pause before it left the
    player in `buffering` for 10.5 seconds until the stall rule rescued it with
    a seek, thirteen seconds of film behind the room.
  */
  describe('a player that was told to play and never started', () => {
    it('is told again well before the stall window, and without a seek', () => {
      const sim = run({ lag: 600 });
      sim.wire.press(play, Date.now());
      sim.advance(500);
      // Wedged: it heard the play, went to buffering, and stays there.
      sim.player.stuck();
      sim.player.calls.length = 0;
      sim.advance(WATCH_COLD_NUDGE_MS + 1_000);
      // A play, because a play cannot discard the buffer a seek would.
      expect(sim.player.calls).toContain('play');
      expect(sim.player.calls.some((c) => c.startsWith('seek:'))).toBe(false);
    });

    it('is left alone for the whole window when it stalled mid-film', () => {
      // The other half, and the one the long window was written for: a film
      // that was playing and stalled is filling a buffer it will finish, and
      // nothing may throw that away early.
      const sim = run();
      sim.wire.press(play, Date.now());
      sim.advance(4_000);
      sim.player.stall(WATCH_STALL_MS * 2);
      sim.player.calls.length = 0;
      sim.advance(WATCH_COLD_NUDGE_MS + 1_000);
      expect(sim.player.calls).toEqual([]);
    });
  });
});

/*
  **The clock the follower steers on is the room's, and it is not this device's.**

  `watch.startedAt` is stamped by the server, so a follower deriving a position
  from `Date.now()` compares two clocks with no conversion and is wrong by
  exactly this device's skew — which is unbounded, drifts, and can be set by
  hand. It went unnoticed because it cannot be expressed with one clock, and
  until `useFollow` took one this harness had exactly one: `advance` moved a
  single fake `Date.now()` for the channel and the follower together, so the
  two agreed by construction in every test above.

  A skew of ten seconds is far outside `WATCH_DRIFT_MS` and would have had the
  follower seeking a healthy player once a fuse for the length of the film,
  while the scrubber beside it — drawn from `app.serverNow()` all along — read
  correctly. Two answers to one question, which is the shape of every defect in
  this subsystem.
*/
describe('a device whose own clock is wrong', () => {
  it('follows the room rather than its own watch', () => {
    // The phone is ten seconds behind the server. Nothing else is unusual.
    const sim = run({ skew: 10_000 });
    sim.wire.press(play, sim.now());
    sim.advance(4_000);
    expect(inStep(sim.where())).toBe(true);
    // A healthy player, so the play is the whole of what it is told: the skew
    // must not read as drift.
    expect(sim.player.calls).toEqual(['play']);
  });

  it('is not driven about by a clock that is ahead either', () => {
    const sim = run({ skew: -10_000 });
    sim.wire.press(play, sim.now());
    sim.advance(4_000);
    expect(inStep(sim.where())).toBe(true);
    expect(sim.player.calls).toEqual(['play']);
  });
});

/*
  **The instrument, which is the follower's own number and not a second opinion.**

  `DriftReadout` draws what `drive.ts` published rather than recomputing the
  position, because a readout built to settle a disagreement must not be able to
  join it. What is asserted here is that the publishing happens on an ordinary
  tick — not only when something is wrong — and that the seek count says what it
  claims to.
*/
describe('what the follower publishes', () => {
  it('reports a healthy party as nought seeks and a drift inside the tolerance', () => {
    const sim = run();
    sim.wire.press(play, sim.now());
    sim.advance(4_000);
    const seen = readDrift(CHANNEL);
    expect(seen).not.toBeNull();
    expect(seen!.seeksThisRun).toBe(0);
    expect(seen!.playerState).toBe('playing');
    expect(seen!.wantStatus).toBe('playing');
    expect(Math.abs(seen!.driftMs ?? Infinity)).toBeLessThanOrEqual(
      WATCH_DRIFT_MS
    );
  });

  it('counts a seek when a recovered stall is corrected', () => {
    const sim = run();
    sim.wire.press(play, sim.now());
    sim.advance(4_000);
    expect(readDrift(CHANNEL)!.seeksThisRun).toBe(0);
    // Far enough behind that the correction is owed once it can answer.
    sim.player.stall(4_000);
    sim.advance(12_000);
    expect(readDrift(CHANNEL)!.seeksThisRun).toBe(1);
  });

  it('says nothing about another room', () => {
    const sim = run();
    sim.wire.press(play, sim.now());
    sim.advance(2_000);
    expect(readDrift('another-channel')).toBeNull();
  });

  /*
    The slow resume, read through the instrument rather than off the call list:
    no seek, and the offset the pause left is visible as a positive drift. It is
    the same fact `a resume` asserts above, said in the form somebody holding the
    phone would see it.
  */
  it('shows the pause offset as drift with no seek behind it', () => {
    const sim = run({ lag: 2_300 });
    sim.wire.press(play, sim.now());
    sim.advance(6_000);
    sim.wire.press(pause, sim.now());
    sim.advance(3_000);
    sim.wire.press(play, sim.now());
    sim.advance(8_000);
    const seen = readDrift(CHANNEL)!;
    expect(seen.seeksThisRun).toBe(0);
    expect(seen.driftMs).toBeGreaterThan(WATCH_DRIFT_MS);
  });
});
