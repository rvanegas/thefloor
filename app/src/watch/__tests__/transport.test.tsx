import React from 'react';
import { Text } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { createChannel, reduce } from '../../../../core/channel';
import { WATCH_STALL_MS } from '../../../../core/constants';
import type { ChannelState, WatchState } from '../../../../core/types';
import type { PlayerState } from '../../../../core/watch';
import { watchPositionMs } from '../../../../core/watch';
import { FOLLOW_TICK_MS, useFollow, type PlayerPort } from '../drive';

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

let tree: ReactTestRenderer | null = null;

function run(
  opts: {
    /**
     * The channel as it stands before this follower exists, for the screen
     * that arrives at a party already under way.
     */
    already?: (channel: ChannelState) => ChannelState;
  } = {}
) {
  const player = laggyPlayer(LAG_MS);
  const wire = server((opts.already ?? ((c) => c))(party()), TRIP_MS);
  function Follower({ watch }: { watch: WatchState }) {
    useFollow(watch, player.port, true);
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
      already: (c) => pause(play(c, T0), T0 + 60_000),
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
