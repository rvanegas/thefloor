import {
  anyScreenInTheRoom,
  canUnmuteRoom,
  createChannel,
  isPartyMuted,
  isWithheld,
  reduce,
} from '../channel';
import { hasMicrophone, microphoneNeeded } from '../micNeeded';
import {
  correctionFor,
  followInstructions,
  intentFrom,
  watchPositionMs,
} from '../watch';
import { WATCH_DRIFT_MS, WATCH_SEEK_SETTLE_MS } from '../constants';
import type { ChannelAction, ChannelState, WatchState } from '../types';
import type { PlayerHistory, PlayerReading, PlayerState } from '../watch';

const A = 'user-a';
const B = 'user-b';
const T0 = 1_700_000_000_000;

const URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const VIDEO = 'dQw4w9WgXcQ';
const LENGTH = 600_000;

function apply(
  state: ChannelState,
  steps: Array<[ChannelAction, number]>
): ChannelState {
  return steps.reduce((s, [action, at]) => reduce(s, action, at), state);
}

/** A and B in a room, with a party loaded and its length known. */
function watching(now = T0): ChannelState {
  return apply(
    reduce(
      createChannel({ id: 's1', initiator: A, invitees: [B], now }),
      { type: 'ENTER', userId: B },
      now
    ),
    [
      [{ type: 'START_WATCH', userId: A, videoId: VIDEO, url: URL }, now],
      [{ type: 'WATCH_READY', userId: A, durationMs: LENGTH }, now],
    ]
  );
}

const here = (userId: string, watching = true): ChannelAction => ({
  type: 'WATCH_HERE',
  userId,
  watching,
});

describe('declaring this device the screen', () => {
  it('is refused to somebody who is not in the room', () => {
    const state = reduce(watching(), { type: 'STEP_OUT', userId: B }, T0);
    expect(reduce(state, here(B), T0).watchingHere).toEqual([]);
  });

  it('is idempotent, so a reconnecting screen changes no state', () => {
    const state = reduce(watching(), here(A), T0);
    expect(reduce(state, here(A), T0)).toBe(state);
  });

  it('is cleared by stopping the party', () => {
    const state = apply(watching(), [
      [here(A), T0],
      [{ type: 'STOP_WATCH', userId: A }, T0],
    ]);
    expect(state.watchingHere).toEqual([]);
  });

  it('is cleared by putting a different film on', () => {
    const state = apply(watching(), [
      [here(A), T0],
      [
        { type: 'START_WATCH', userId: A, videoId: 'aaaaaaaaaaa', url: URL },
        T0,
      ],
    ]);
    expect(state.watchingHere).toEqual([]);
  });

  it('stops counting when its owner steps out, without being cleared', () => {
    const state = apply(watching(), [
      [here(A), T0],
      [{ type: 'STEP_OUT', userId: A }, T0],
    ]);
    // The row survives — nothing went looking for it — and the predicate that
    // matters stops reading it, which is the whole of the departure handling.
    expect(state.watchingHere).toEqual([A]);
    expect(anyScreenInTheRoom(state)).toBe(false);
  });
});

describe('who counts as a screen in the room', () => {
  it('counts a member watching here', () => {
    expect(anyScreenInTheRoom(reduce(watching(), here(A), T0))).toBe(true);
  });

  it('counts a member who is watching here and self-muted', () => {
    const state = apply(watching(), [
      [here(A), T0],
      [{ type: 'SET_SELF_MUTE', userId: A, muted: true }, T0],
    ]);
    // A muted microphone is held open rather than released, so the session is
    // still a call's and the film is still mono. Self-mute is not an input.
    expect(anyScreenInTheRoom(state)).toBe(true);
  });

  it('does not count a guest with no speech grant', () => {
    const withGuest = reduce(
      watching(),
      {
        type: 'GUEST_ENTERED',
        guest: {
          id: 'g1',
          name: 'Guest 1',
          admittedAt: T0,
          maySpeak: false,
          request: 'none',
        },
      },
      T0
    );
    const state = reduce(withGuest, here('g1'), T0);
    expect(hasMicrophone(state, 'g1')).toBe(false);
    expect(anyScreenInTheRoom(state)).toBe(false);
  });
});

describe('enforcement is sampled when a run starts', () => {
  it('forces the mute on and locks it when a screen is in the room', () => {
    const state = apply(watching(), [
      [{ type: 'SET_WATCH_MUTE', userId: A, muted: false }, T0],
      [here(A), T0],
      [{ type: 'WATCH_PLAY', userId: A }, T0],
    ]);
    expect(state.watch.enforced).toBe(true);
    expect(isPartyMuted(state)).toBe(true);
    expect(canUnmuteRoom(state)).toBe(false);
    expect(isWithheld(state, B)).toBe(true);
  });

  it('refuses an unmute for the length of the run', () => {
    const playing = apply(watching(), [
      [here(A), T0],
      [{ type: 'WATCH_PLAY', userId: A }, T0],
    ]);
    const tried = reduce(
      playing,
      { type: 'SET_WATCH_MUTE', userId: A, muted: false },
      T0 + 1_000
    );
    expect(isPartyMuted(tried)).toBe(true);
  });

  it('leaves the mute liftable when every screen is elsewhere', () => {
    const state = apply(watching(), [
      [{ type: 'WATCH_PLAY', userId: A }, T0],
      [{ type: 'SET_WATCH_MUTE', userId: A, muted: false }, T0 + 1_000],
    ]);
    expect(state.watch.enforced).toBe(false);
    expect(canUnmuteRoom(state)).toBe(true);
    expect(isPartyMuted(state)).toBe(false);
  });

  it('does not cut a running unmuted film when somebody switches mid-run', () => {
    const running = apply(watching(), [
      [{ type: 'WATCH_PLAY', userId: A }, T0],
      [{ type: 'SET_WATCH_MUTE', userId: A, muted: false }, T0 + 1_000],
    ]);
    const switched = reduce(running, here(A), T0 + 2_000);
    // Nothing happens until the next run. This is the whole point of sampling.
    expect(isPartyMuted(switched)).toBe(false);
    expect(isWithheld(switched, B)).toBe(false);
  });

  it('takes effect at the next run after the switch', () => {
    const switched = apply(watching(), [
      [{ type: 'WATCH_PLAY', userId: A }, T0],
      [{ type: 'SET_WATCH_MUTE', userId: A, muted: false }, T0 + 1_000],
      [here(A), T0 + 2_000],
      [{ type: 'WATCH_PAUSE', userId: A }, T0 + 3_000],
      [{ type: 'WATCH_PLAY', userId: A }, T0 + 4_000],
    ]);
    expect(isPartyMuted(switched)).toBe(true);
    expect(canUnmuteRoom(switched)).toBe(false);
  });

  it('lifts enforcement at a pause, so a paused party may be unmuted', () => {
    const paused = apply(watching(), [
      [here(A), T0],
      [{ type: 'WATCH_PLAY', userId: A }, T0],
      [{ type: 'WATCH_PAUSE', userId: A }, T0 + 5_000],
    ]);
    expect(paused.watch.enforced).toBe(false);
    expect(canUnmuteRoom(paused)).toBe(true);
    const unmuted = reduce(
      paused,
      { type: 'SET_WATCH_MUTE', userId: A, muted: false },
      T0 + 6_000
    );
    expect(unmuted.watch.mutedAll).toBe(false);
    // And the next run re-asks, because the screen is still here.
    const again = reduce(unmuted, { type: 'WATCH_PLAY', userId: A }, T0 + 7_000);
    expect(isPartyMuted(again)).toBe(true);
  });
});

describe('the screen stops capturing', () => {
  it('closes the microphone of whoever is watching here, while playing', () => {
    const state = apply(watching(), [
      [here(A), T0],
      [{ type: 'WATCH_PLAY', userId: A }, T0],
    ]);
    expect(microphoneNeeded(state, A)).toBe(false);
    // The person it is an exception for still has a microphone in the room —
    // which is what stops the exception eating its own premise.
    expect(hasMicrophone(state, A)).toBe(true);
    // And nobody else's is touched.
    expect(microphoneNeeded(state, B)).toBe(true);
  });

  it('gives it back at the pause', () => {
    const state = apply(watching(), [
      [here(A), T0],
      [{ type: 'WATCH_PLAY', userId: A }, T0],
      [{ type: 'WATCH_PAUSE', userId: A }, T0 + 5_000],
    ]);
    expect(microphoneNeeded(state, A)).toBe(true);
  });

  it('does not close it for a screen on another device', () => {
    const state = reduce(watching(), { type: 'WATCH_PLAY', userId: A }, T0);
    expect(microphoneNeeded(state, A)).toBe(true);
  });
});

describe('following the transport', () => {
  const reading = (
    state: PlayerState,
    positionMs: number | null,
    seekedAt: number | null = null
  ): PlayerReading => ({ state, positionMs, seekedAt });

  const playing = (at = T0) =>
    apply(watching(at), [[{ type: 'WATCH_PLAY', userId: A }, at]]).watch;

  it('starts a player that is not playing', () => {
    expect(
      followInstructions(playing(), reading('paused', 0), T0)
    ).toEqual([{ do: 'play' }]);
  });

  it('says nothing to a player that is already in step', () => {
    expect(followInstructions(playing(), reading('playing', 0), T0)).toEqual([]);
  });

  it('leaves a buffering player alone rather than restating play', () => {
    expect(
      followInstructions(playing(), reading('buffering', 0), T0)
    ).toEqual([]);
  });

  it('seeks before playing when a player is behind', () => {
    const drift = WATCH_DRIFT_MS + 5_000;
    expect(
      followInstructions(playing(), reading('paused', 0), T0 + drift)
    ).toEqual([{ do: 'seek', positionMs: drift }, { do: 'play' }]);
  });

  it('will not correct twice inside the settle window', () => {
    const drift = WATCH_DRIFT_MS + 5_000;
    const now = T0 + drift;
    expect(
      correctionFor(
        playing(),
        reading('playing', 0, now - WATCH_SEEK_SETTLE_MS + 1),
        now
      )
    ).toBeNull();
    expect(
      correctionFor(
        playing(),
        reading('playing', 0, now - WATCH_SEEK_SETTLE_MS - 1),
        now
      )
    ).toBe(drift);
  });

  it('leaves an ended player alone while the channel agrees it is over', () => {
    const ended = apply(watching(), [
      [{ type: 'WATCH_PLAY', userId: A }, T0],
    ]).watch;
    const at = LENGTH;
    expect(
      followInstructions(ended, reading('ended', at), T0 + LENGTH)
    ).toEqual([]);
  });

  it('restarts an ended player once the transport has gone back', () => {
    const replayed = apply(watching(), [
      [{ type: 'WATCH_PLAY', userId: A }, T0],
      [{ type: 'WATCH_SEEK', userId: A, positionMs: 0 }, T0 + LENGTH],
    ]).watch;
    expect(
      followInstructions(replayed, reading('ended', LENGTH), T0 + LENGTH)
    ).toEqual([{ do: 'seek', positionMs: 0 }, { do: 'play' }]);
  });

  it('pauses first and corrects second', () => {
    const paused = apply(watching(), [
      [{ type: 'WATCH_PLAY', userId: A }, T0],
      [{ type: 'WATCH_PAUSE', userId: A }, T0 + 60_000],
    ]).watch;
    expect(
      followInstructions(paused, reading('playing', 0), T0 + 60_000)
    ).toEqual([{ do: 'pause' }, { do: 'seek', positionMs: 60_000 }]);
  });

  it('corrects a paused player that was already at rest', () => {
    // BACKLOG.md § *A rewind while the watch party is paused leaves the
    // picture where it was*: the old shape corrected only in the branch that
    // had just paused a playing player, so this returned nothing and the
    // frame stayed where it was until somebody pressed Play.
    const rewound = apply(watching(), [
      [{ type: 'WATCH_PLAY', userId: A }, T0],
      [{ type: 'WATCH_PAUSE', userId: A }, T0 + 60_000],
      [{ type: 'WATCH_SEEK', userId: A, positionMs: 0 }, T0 + 61_000],
    ]).watch;
    expect(
      followInstructions(rewound, reading('paused', 60_000), T0 + 62_000)
    ).toEqual([{ do: 'seek', positionMs: 0 }]);
  });
});

/**
 * The video's own bar, pressed — the other direction through the same port.
 *
 * Every test here is really the one question `intentFrom` exists to answer:
 * which of the two moved. A player that disagrees with the channel is either
 * somebody's thumb or somebody's follower a heartbeat behind, and the reading
 * is identical; get it wrong in the generous direction and one person's phone
 * reaches into everybody else's evening, so the false-positive cases below
 * outnumber the true ones on purpose.
 */
describe('a press on the video’s own controls', () => {
  const reading = (
    state: PlayerState,
    positionMs: number | null,
    seekedAt: number | null = null
  ): PlayerReading => ({ state, positionMs, seekedAt });

  const playing = (at = T0) =>
    apply(watching(at), [[{ type: 'WATCH_PLAY', userId: A }, at]]).watch;

  /** What the tick before this one saw, of the player and the channel both. */
  const before = (
    watch: WatchState,
    state: PlayerState,
    positionMs: number | null,
    at: number
  ): PlayerHistory => ({
    state,
    positionMs,
    at,
    status: watch.status,
    channelPositionMs: watchPositionMs(watch, at),
  });

  it('reads a pause on the bar as a pause of the party', () => {
    const watch = playing();
    const was = before(watch, 'playing', 4_500, T0 + 4_500);
    expect(
      intentFrom(watch, reading('paused', 5_000), was, T0 + 5_000)
    ).toEqual({ do: 'pause' });
  });

  it('reads a play on the bar as a play of the party', () => {
    const watch = apply(watching(), [
      [{ type: 'WATCH_PLAY', userId: A }, T0],
      [{ type: 'WATCH_PAUSE', userId: A }, T0 + 5_000],
    ]).watch;
    const was = before(watch, 'paused', 5_000, T0 + 6_000);
    expect(
      intentFrom(watch, reading('playing', 5_000), was, T0 + 6_500)
    ).toEqual({ do: 'play' });
  });

  it('reads a scrub as a seek of the party', () => {
    const watch = playing();
    const was = before(watch, 'playing', 4_500, T0 + 4_500);
    // A thumb landing a minute in, half a second after the player was where
    // it was meant to be.
    expect(
      intentFrom(watch, reading('playing', 60_000), was, T0 + 5_000)
    ).toEqual({ do: 'seek', positionMs: 60_000 });
  });

  it('is silent for a follower catching up with somebody else’s pause', () => {
    // **The case that would have made a pause go round the room for ever.**
    // The channel pauses; a tick later this player is still playing, and a
    // tick after that the follower has stopped it. Both readings look exactly
    // like a press and neither is one.
    const paused = apply(watching(), [
      [{ type: 'WATCH_PLAY', userId: A }, T0],
      [{ type: 'WATCH_PAUSE', userId: A }, T0 + 5_000],
    ]).watch;
    const stillPlaying = before(playing(), 'playing', 4_500, T0 + 4_500);
    expect(
      intentFrom(paused, reading('playing', 5_000), stillPlaying, T0 + 5_200)
    ).toBeNull();

    const caughtUp = before(paused, 'playing', 5_000, T0 + 5_200);
    expect(
      intentFrom(paused, reading('paused', 5_000), caughtUp, T0 + 5_700)
    ).toBeNull();
  });

  it('is silent when the channel is the thing that seeked', () => {
    const rewound = apply(watching(), [
      [{ type: 'WATCH_PLAY', userId: A }, T0],
      [{ type: 'WATCH_SEEK', userId: A, positionMs: 0 }, T0 + 60_000],
    ]).watch;
    // The player is still a minute in because nothing has corrected it yet,
    // which is a disagreement the channel opened and not this screen.
    const was = before(playing(), 'playing', 59_500, T0 + 59_500);
    expect(
      intentFrom(rewound, reading('playing', 60_000), was, T0 + 60_100)
    ).toBeNull();
  });

  it('is silent on the first tick, having nothing to compare against', () => {
    expect(intentFrom(playing(), reading('unstarted', 0), null, T0)).toBeNull();
  });

  it('does not read buffering, an unstarted player or the end as a press', () => {
    const watch = playing();
    for (const state of ['buffering', 'unstarted', 'ended'] as PlayerState[]) {
      const was = before(watch, 'playing', 4_500, T0 + 4_500);
      expect(intentFrom(watch, reading(state, 5_000), was, T0 + 5_000)).toBeNull();
    }
  });

  it('does not mistake ordinary drift for a scrub', () => {
    const watch = playing();
    // Half a second of tick against a player that advanced a second: the gap
    // `correctionFor` is for, and nothing a thumb did.
    const was = before(watch, 'playing', 4_000, T0 + 4_500);
    expect(intentFrom(watch, reading('playing', 5_000), was, T0 + 5_000)).toBeNull();
  });

  it('does not read its own correction as a press', () => {
    const watch = playing();
    const was = before(watch, 'playing', 4_500, T0 + 4_500);
    // The follower seeked a moment ago, so the jump is its own doing.
    expect(
      intentFrom(
        watch,
        reading('playing', 60_000, T0 + 4_900),
        was,
        T0 + 5_000
      )
    ).toBeNull();
  });

  it('says nothing at all when there is no party', () => {
    const idle = watching().watch;
    const stopped = { ...idle, party: null };
    const was = before(stopped, 'playing', 0, T0);
    expect(intentFrom(stopped, reading('paused', 0), was, T0 + 500)).toBeNull();
  });
});
