import {
  anyScreenInTheRoom,
  canClaimFloor,
  canControlPlayback,
  canControlWatch,
  canLoadTrack,
  canStartRecording,
  canUnmuteRoom,
  createChannel,
  isPartyMuted,
  isWithheld,
  reduce,
} from '../channel';
import { hasMicrophone, microphoneNeeded } from '../micNeeded';
import {
  desiredFor,
  followInstructions,
  hasArrived,
  showingTheFilm,
  watchPositionMs,
} from '../watch';
import {
  WATCH_DRIFT_MS,
  WATCH_LENGTH_SLACK_MS,
  WATCH_STALL_MS,
} from '../constants';
import type { ChannelAction, ChannelState, WatchState } from '../types';
import type { PlayerReading, PlayerState } from '../watch';

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

describe('enforcement is lifted when its premise goes', () => {
  /** A muted, enforced run: A is watching on the device they are in the room on. */
  function enforcedRun(): ChannelState {
    return apply(watching(), [
      [here(A), T0],
      [{ type: 'WATCH_PLAY', userId: A }, T0],
    ]);
  }

  it('gives the room its button back when the film moves to another device', () => {
    // The reported case. The film comes up by default on the device you are
    // looking at, so a party started from a phone samples `enforced` true;
    // handing the picture to a television empties `watchingHere` without
    // ending the run. The room stayed silent and buttonless for the rest of
    // the film, under a sentence saying somebody was watching in the room.
    const moved = reduce(enforcedRun(), here(A, false), T0 + 2_000);

    expect(moved.watch.enforced).toBe(false);
    expect(canUnmuteRoom(moved)).toBe(true);
    expect(moved.watch.status).toBe('playing');
  });

  it('leaves the room quiet until somebody says otherwise', () => {
    const moved = reduce(enforcedRun(), here(A, false), T0 + 2_000);

    // What comes back is the ability to speak, not speech. Lifting the mute
    // here would be the reducer deciding the room wants to talk.
    expect(moved.watch.mutedAll).toBe(true);
    expect(isPartyMuted(moved)).toBe(true);
    expect(isWithheld(moved, B)).toBe(true);

    const unmuted = reduce(
      moved,
      { type: 'SET_WATCH_MUTE', userId: A, muted: false },
      T0 + 3_000
    );
    expect(isPartyMuted(unmuted)).toBe(false);
    expect(isWithheld(unmuted, B)).toBe(false);
  });

  it('lifts when the only screen steps out of the room', () => {
    // `watchingHere` is filtered by presence wherever it is read, so leaving
    // is the same event as putting the film down — and it reaches this by the
    // same path rather than by a rule written again for departures.
    const gone = reduce(
      enforcedRun(),
      { type: 'STEP_OUT', userId: A },
      T0 + 2_000
    );

    expect(canUnmuteRoom(gone)).toBe(true);
  });

  it('does not re-impose mid-run when the screen comes back', () => {
    // The asymmetry, which is the whole design: lifting gives speech back and
    // interrupts nobody, where imposing would cut a voice off mid-sentence and
    // take a button out from under a finger. So it drops one way only.
    const back = apply(enforcedRun(), [
      [here(A, false), T0 + 2_000],
      [here(A), T0 + 3_000],
    ]);

    expect(back.watch.enforced).toBe(false);
    expect(canUnmuteRoom(back)).toBe(true);

    // The next run asks again, and the answer is yes — A is watching here.
    const next = apply(back, [
      [{ type: 'WATCH_PAUSE', userId: A }, T0 + 4_000],
      [{ type: 'WATCH_PLAY', userId: A }, T0 + 5_000],
    ]);
    expect(next.watch.enforced).toBe(true);
    expect(canUnmuteRoom(next)).toBe(false);
  });

  it('does not disturb a run that was never enforced', () => {
    // Identity is the reducer's word for nothing happened, and this must not
    // be what breaks it: an action that changed nothing cannot have taken the
    // last screen out of the room.
    const plain = apply(watching(), [[{ type: 'WATCH_PLAY', userId: A }, T0]]);
    expect(reduce(plain, here(B, false), T0 + 1_000)).toBe(plain);
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
    durationMs: number | null = LENGTH
  ): PlayerReading => ({ state, positionMs, durationMs });

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

  /**
   * **The stall that never ends, which is what patience cost until
   * 2026-09-20.** A buffering player is told nothing so that a seek cannot
   * throw away a buffer that is filling — and a player whose buffer never
   * fills was then a frozen frame and a spinner under a party playing
   * perfectly for everybody else, with nothing in the application that would
   * ever speak to it again. Recovering it took a person pausing and playing,
   * which is exactly the pair below.
   */
  it('nudges a player that has been buffering past all patience', () => {
    const stuck = reading('buffering', 0);
    // Still on its way, right up to the threshold.
    expect(
      followInstructions(playing(), stuck, T0 + WATCH_STALL_MS, WATCH_STALL_MS - 1)
    ).toEqual([]);
    // And past it, treated like any other player that is not where the room
    // is: sent there, and told to play.
    expect(
      followInstructions(playing(), stuck, T0 + WATCH_STALL_MS, WATCH_STALL_MS)
    ).toEqual([{ do: 'seek', positionMs: WATCH_STALL_MS }, { do: 'play' }]);
  });

  it('does not nudge a stalled player that is already where the room is', () => {
    // Paused parties and a stall at the right position are not this defect:
    // what is drawn is the right frame, and a seek would throw away a buffer
    // to arrive where the player already is.
    expect(
      followInstructions(playing(), reading('buffering', 0), T0, WATCH_STALL_MS)
    ).toEqual([{ do: 'play' }]);
  });

  it('seeks before playing when a player is behind', () => {
    const drift = WATCH_DRIFT_MS + 5_000;
    expect(
      followInstructions(playing(), reading('paused', 0), T0 + drift)
    ).toEqual([{ do: 'seek', positionMs: drift }, { do: 'play' }]);
  });

  it('says nothing to a player that is merely a little adrift', () => {
    // The tolerance is `hasArrived`'s now rather than a second opinion held
    // here: a correction is a visible stutter, so the gap has to be worth one.
    expect(
      followInstructions(playing(), reading('playing', 0), T0 + WATCH_DRIFT_MS)
    ).toEqual([]);
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
 * Whether a player has arrived where it was sent.
 *
 * **The observation the whole follower now turns on.** A follower that has
 * said anything to its player stays deaf until this is true, so a correction
 * can never be read back as somebody's thumb — the loop that produced a
 * play-pause flip three separate times. What makes it a repair rather than a
 * fourth guess is that it is a fact about the player rather than a guess
 * about how long players take.
 */
describe('a player asked whether it has arrived', () => {
  const reading = (
    state: PlayerState,
    positionMs: number | null,
    durationMs: number | null = LENGTH
  ): PlayerReading => ({ state, positionMs, durationMs });

  const want = { status: 'playing' as const, positionMs: 60_000 };

  it('has, when it is doing the right thing in the right place', () => {
    expect(hasArrived(reading('playing', 60_000), want)).toBe(true);
  });

  it('has, within the tolerance the shared clock is kept to', () => {
    expect(hasArrived(reading('playing', 60_000 + WATCH_DRIFT_MS), want)).toBe(
      true
    );
    expect(
      hasArrived(reading('playing', 60_000 + WATCH_DRIFT_MS + 1), want)
    ).toBe(false);
  });

  it('has not, while it is still on its way', () => {
    // `buffering` is going somewhere and `unstarted` has not begun. Reading
    // either as arrival is how a follower starts talking over itself.
    expect(hasArrived(reading('buffering', 60_000), want)).toBe(false);
    expect(hasArrived(reading('unstarted', 60_000), want)).toBe(false);
  });

  it('has not, when it is doing the other thing', () => {
    expect(hasArrived(reading('paused', 60_000), want)).toBe(false);
  });

  it('has, at the end of the film, whatever it was asked for', () => {
    // A player at the end cannot be made to be anywhere else without being
    // restarted, so waiting for it to arrive is waiting for ever.
    expect(hasArrived(reading('ended', LENGTH), want)).toBe(true);
  });

  it('has not, while it cannot say where it is', () => {
    expect(hasArrived(reading('playing', null), want)).toBe(false);
  });
});

/**
 * An advert, which is a different video in the same frame.
 *
 * Every attempt at this listed "an advert starting" among the lies it was
 * guessing around, and guessed with a timer. The API says so if it is asked
 * the right question: during a pre-roll both the position and the length
 * describe the advert, so a player reporting a length that is not the film's
 * is not showing the film.
 */
describe('telling a film from what runs before it', () => {
  const reading = (durationMs: number | null): PlayerReading => ({
    state: 'playing',
    positionMs: 3_000,
    durationMs,
  });

  const playing = (at = T0) =>
    apply(watching(at), [[{ type: 'WATCH_PLAY', userId: A }, at]]).watch;

  it('is the film when the lengths agree', () => {
    expect(showingTheFilm(playing(), reading(LENGTH))).toBe(true);
  });

  it('is the film within the slack a rounded length needs', () => {
    expect(
      showingTheFilm(playing(), reading(LENGTH - WATCH_LENGTH_SLACK_MS))
    ).toBe(true);
  });

  it('is not the film when a ninety-second spot says so', () => {
    expect(showingTheFilm(playing(), reading(90_000))).toBe(false);
  });

  it('is the film whenever either end cannot say', () => {
    // An unknown is not evidence of an advert, and refusing to follow on one
    // would leave a party that never learned its length unable to run.
    expect(showingTheFilm(playing(), reading(null))).toBe(true);
    const unlearned = reduce(
      createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 }),
      { type: 'START_WATCH', userId: A, videoId: VIDEO, url: URL },
      T0
    ).watch;
    expect(showingTheFilm(unlearned, reading(90_000))).toBe(true);
  });
});

/**
 * What the channel asks of every player, in one place.
 */
describe('what the channel wants a player to be', () => {
  it('is nothing at all when there is no party', () => {
    const idle = { ...watching().watch, party: null };
    expect(desiredFor(idle, T0)).toBeNull();
  });

  it('is the pair, and the position is the shared clock’s', () => {
    const watch = apply(watching(), [
      [{ type: 'WATCH_PLAY', userId: A }, T0],
    ]).watch;
    expect(desiredFor(watch, T0 + 5_000)).toEqual({
      status: 'playing',
      positionMs: 5_000,
    });
  });
});

/**
 * A watch party is a mode the channel is in, and since 2026-09-18 an
 * exclusive one — **of the floor and the recording for as long as it is
 * loaded, and of the audio player only while it is running.**
 *
 * The split is of 2026-09-20: the transports are exclusive of each other, the
 * mode is exclusive of the rest. See `watchIsPlaying`.
 */
describe('a channel with a film on', () => {
  const withFilm = () => watching();
  const withoutFilm = () =>
    reduce(
      createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 }),
      { type: 'ENTER', userId: B },
      T0
    );

  it('refuses a floor claim', () => {
    expect(canClaimFloor(withoutFilm(), A, T0)).toBe(true);
    expect(canClaimFloor(withFilm(), A, T0)).toBe(false);
  });

  const playingFilm = () => reduce(withFilm(), { type: 'WATCH_PLAY', userId: A }, T0);

  it('takes a track while it sits paused, and refuses one while it runs', () => {
    expect(canLoadTrack(withoutFilm(), A)).toBe(true);
    expect(canLoadTrack(withFilm(), A)).toBe(true);
    expect(canLoadTrack(playingFilm(), A)).toBe(false);
  });

  it('leaves the audio player live until it plays', () => {
    expect(canControlPlayback(withoutFilm(), A)).toBe(true);
    expect(canControlPlayback(withFilm(), A)).toBe(true);
    expect(canControlPlayback(playingFilm(), A)).toBe(false);
  });

  it('refuses a recording, as it always did', () => {
    expect(canStartRecording(withFilm(), A)).toBe(false);
  });

  it('lets anybody in the room drive, claim or no claim', () => {
    // **The floor is not asked any more.** It cannot be claimed while a film
    // is on, so there was nothing left for it to say here — and what it used
    // to say was that a visible, pressable bar did nothing on somebody
    // else's screen.
    const state = withFilm();
    expect(canControlWatch(state, A)).toBe(true);
    expect(canControlWatch(state, B)).toBe(true);
  });
});
