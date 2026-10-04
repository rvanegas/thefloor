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
import { hasMicrophone, isScreening, microphoneNeeded } from '../micNeeded';
import {
  agrees,
  baseInstructions,
  desiredFor,
  inPlace,
  initialFollow,
  rescueInstructions,
  showingTheFilm,
  stepFollow,
  watchPositionMs,
} from '../watch';
import {
  WATCH_ADVERT_MARGIN_MS,
  WATCH_DRIFT_MS,
  WATCH_HANDOVER_WAIT_MS,
  WATCH_LENGTH_SLACK_MS,
  WATCH_REBUILD_MS,
  WATCH_RESCUE_MS,
  WATCH_RUNG_MS,
  WATCH_SILENT_MS,
  WATCH_STALL_MS,
} from '../constants';
import type { ChannelAction, ChannelState, WatchState } from '../types';
import type { FollowInput, PlayerReading, PlayerState } from '../watch';

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

/**
 * **The screen gives its microphone up, and the price is paid by whoever
 * pressed Play.**
 *
 * This described the opposite between 2026-09-23 and 2026-09-26, and the
 * reversal is measured rather than preferred both times. Closing the device
 * buys the film a `playback` session and stereo, and costs about a second on
 * every press of Play, all of it spent tearing the microphone down before the
 * category can move — `engine stop` at 0.92 to 1.11 seconds on build 277,
 * against 0.27 to 0.41 seconds for a pause.
 *
 * **Holding the device and changing the configuration instead cost more.**
 * `SCREENING` kept the film's stereo without releasing anything, and changing
 * the configuration mid-run stops the audio engine — which nothing restarts, so
 * the pause put every microphone back onto a dead engine and the room could not
 * talk until somebody left the channel and came back. Build 296, and it did not
 * buy the second back either. Releasing and retaking the device is what brings
 * the engine up, so the expensive version is the one that works. See
 * decision/2026-09-26-the-film-keeps-its-stereo.md.
 */
describe('the screen gives its microphone up', () => {
  it('closes it for whoever is watching here while the film plays', () => {
    const state = apply(watching(), [
      [here(A), T0],
      [{ type: 'WATCH_PLAY', userId: A }, T0],
    ]);
    expect(microphoneNeeded(state, A)).toBe(false);
    // **But they still *have* one**, which is the distinction `hasMicrophone`
    // exists for: `anyScreenInTheRoom` has to ask whether somebody's microphone
    // matters in order to decide whether to close it, and asking
    // `microphoneNeeded` would be asking a question whose answer it is
    // computing.
    expect(hasMicrophone(state, A)).toBe(true);
    // And nobody else's is touched. The exception is about the device showing
    // the film, not about the room.
    expect(microphoneNeeded(state, B)).toBe(true);
  });

  it('knows which device is screening, which is what closes it', () => {
    const state = apply(watching(), [
      [here(A), T0],
      [{ type: 'WATCH_PLAY', userId: A }, T0],
    ]);
    expect(isScreening(state, A)).toBe(true);
    expect(isScreening(state, B)).toBe(false);
  });

  it('stops screening at the pause, so the room is a room again', () => {
    const state = apply(watching(), [
      [here(A), T0],
      [{ type: 'WATCH_PLAY', userId: A }, T0],
      [{ type: 'WATCH_PAUSE', userId: A }, T0 + 5_000],
    ]);
    expect(isScreening(state, A)).toBe(false);
    // **The reported bug of 2026-09-26, at the predicate.** Everything above
    // this line was true while the room was silent; what failed was further
    // down, in what the app did with the answer. Pinned here anyway, because a
    // predicate that stopped saying this would break the room again and from a
    // place nobody would look twice at.
    expect(microphoneNeeded(state, A)).toBe(true);
  });

  it('is not screening for a screen on another device', () => {
    const state = reduce(watching(), { type: 'WATCH_PLAY', userId: A }, T0);
    expect(isScreening(state, A)).toBe(false);
    expect(microphoneNeeded(state, A)).toBe(true);
  });
});

/**
 * The follower's rule since 2026-10-03: agreement is a state, a seek is owed
 * only to a player that is not placed, and every other rest has a deadline
 * that leads up the ladder. See
 * planning/decision/2026-10-03-the-follower-rests-only-on-agreement.md.
 */
describe('a player agreeing with the room', () => {
  const reading = (
    state: PlayerState,
    positionMs: number | null = 60_000
  ): PlayerReading => ({ state, positionMs, durationMs: LENGTH, videoId: VIDEO });
  const run = { status: 'playing' as const, positionMs: 60_000 };
  const rest = { status: 'paused' as const, positionMs: 60_000 };

  it('is the state alone, wherever the player is', () => {
    expect(agrees(reading('playing', 60_000 + WATCH_DRIFT_MS * 10), run)).toBe(
      true
    );
    expect(agrees(reading('paused', 0), rest)).toBe(true);
  });

  it('is never a player on its way', () => {
    expect(agrees(reading('buffering'), run)).toBe(false);
    expect(agrees(reading('buffering'), rest)).toBe(false);
  });

  it('takes a cued player for a stopped one', () => {
    expect(agrees(reading('unstarted'), rest)).toBe(true);
    expect(agrees(reading('unstarted'), run)).toBe(false);
  });

  it('takes a finished film for a run only while the room agrees it is over', () => {
    expect(agrees(reading('ended', LENGTH), { ...run, positionMs: LENGTH })).toBe(
      true
    );
    // A replay: the room has gone back to nought and the player is still at
    // the end. Agreeing here is how every screen once stayed at Finished.
    expect(agrees(reading('ended', LENGTH), { ...run, positionMs: 0 })).toBe(
      false
    );
  });
});

describe('a player in place', () => {
  const want = { status: 'playing' as const, positionMs: 60_000 };
  const at = (state: PlayerState, positionMs: number | null): PlayerReading => ({
    state,
    positionMs,
    durationMs: LENGTH,
    videoId: VIDEO,
  });

  it('is within the tolerance of where the room is', () => {
    expect(inPlace(at('playing', 60_000 + WATCH_DRIFT_MS), want)).toBe(true);
    expect(inPlace(at('paused', 60_000 + WATCH_DRIFT_MS + 1), want)).toBe(false);
    expect(inPlace(at('unstarted', 60_000), want)).toBe(true);
  });

  it('is never a buffering player, a finished one, or one that cannot say', () => {
    expect(inPlace(at('buffering', 60_000), want)).toBe(false);
    expect(inPlace(at('ended', 60_000), want)).toBe(false);
    expect(inPlace(at('playing', null), want)).toBe(false);
  });
});

describe('what a player that does not agree is told', () => {
  const at = (state: PlayerState): PlayerReading => ({
    state,
    positionMs: 0,
    durationMs: LENGTH,
    videoId: VIDEO,
  });
  const run = { status: 'playing' as const, positionMs: 30_000 };
  const rest = { status: 'paused' as const, positionMs: 30_000 };

  it('is play, and a seek first only when it is not placed', () => {
    expect(baseInstructions(run, at('paused'), true)).toEqual([{ do: 'play' }]);
    expect(baseInstructions(run, at('paused'), false)).toEqual([
      { do: 'seek', positionMs: 30_000 },
      { do: 'play' },
    ]);
  });

  it('is play to a buffering player, unless it is refilling mid-film', () => {
    expect(baseInstructions(run, at('buffering'), true)).toEqual([{ do: 'play' }]);
    expect(baseInstructions(run, at('buffering'), true, true)).toEqual([]);
  });

  it('pauses first and seeks second, and stops a cued player the seek starts', () => {
    expect(baseInstructions(rest, at('playing'), false)).toEqual([
      { do: 'pause' },
      { do: 'seek', positionMs: 30_000 },
    ]);
    expect(baseInstructions(rest, at('unstarted'), false)).toEqual([
      { do: 'seek', positionMs: 30_000 },
      { do: 'pause' },
    ]);
  });

  it('is a seek and the state on the rescue, placed or not', () => {
    expect(rescueInstructions(run, at('buffering'))).toEqual([
      { do: 'seek', positionMs: 30_000 },
      { do: 'play' },
    ]);
    expect(rescueInstructions(rest, at('ended'))).toEqual([
      { do: 'pause' },
      { do: 'seek', positionMs: 30_000 },
      { do: 'pause' },
    ]);
  });
});

describe('the ladder', () => {
  const run = { status: 'playing' as const, positionMs: 30_000 };
  const at = (state: PlayerState, positionMs = 30_000): PlayerReading => ({
    state,
    positionMs,
    durationMs: LENGTH,
    videoId: VIDEO,
  });
  const input = (over: Partial<FollowInput> = {}): FollowInput => ({
    want: run,
    key: 'playing|0',
    reading: at('paused'),
    advert: false,
    placed: true,
    holding: false,
    canRebuild: true,
    now: T0,
    ...over,
  });

  /** Steps the follower every half second for `ms`, with the same input. */
  function climb(ms: number, over: Partial<FollowInput> = {}) {
    let follow = initialFollow();
    const steps = [];
    for (let t = 0; t <= ms; t += 500) {
      const step = stepFollow(follow, input({ ...over, now: T0 + t }));
      follow = step.follow;
      steps.push({ t, ...step });
    }
    return steps;
  }
  const rungs = (steps: ReturnType<typeof climb>) =>
    steps.filter((s) => s.climbed).map((s) => [s.t, s.climbed!.to]);

  it('rests without a deadline on agreement and says nothing', () => {
    const steps = climb(60_000, { reading: at('playing') });
    expect(steps.every((s) => s.rest === 'agreed')).toBe(true);
    expect(steps.some((s) => s.instructions.length > 0)).toBe(false);
  });

  it('climbs every rung to the top for a player that ignores everything', () => {
    const steps = climb(60_000);
    expect(rungs(steps)).toEqual([
      [0, 0],
      [WATCH_RUNG_MS, 1],
      [WATCH_RUNG_MS * 2, 2],
      [WATCH_RUNG_MS * 2 + WATCH_RESCUE_MS, 3],
      [WATCH_RUNG_MS * 2 + WATCH_RESCUE_MS + WATCH_REBUILD_MS, 4],
    ]);
    expect(steps.find((s) => s.climbed?.to === 2)!.instructions).toEqual(
      rescueInstructions(run, at('paused'))
    );
    expect(steps.find((s) => s.climbed?.to === 3)!.rebuild).toBe(true);
    expect(steps[steps.length - 1].rest).toBe('given up');
  });

  it('gives up a rung sooner where the page cannot be rebuilt', () => {
    const steps = climb(30_000, { canRebuild: false });
    expect(rungs(steps).map(([, to]) => to)).toEqual([0, 1, 2, 4]);
  });

  it('gives a mid-film stall the long window, and a cold one the short', () => {
    let follow = initialFollow();
    follow = stepFollow(follow, input({ reading: at('playing') })).follow;
    const mid = climb(WATCH_STALL_MS + 500, { reading: at('buffering') });
    expect(rungs(mid)).toEqual([[0, 0], [WATCH_RUNG_MS, 1], [WATCH_RUNG_MS * 2, 2]]);
    // From a standstill both rungs are short. Mid-film, which is the
    // reading after a tick of playing, the first waits out the stall window.
    let steps = [];
    for (let t = 0; t <= WATCH_STALL_MS + 500; t += 500) {
      const step = stepFollow(
        follow,
        input({ reading: at('buffering'), now: T0 + 500 + t })
      );
      follow = step.follow;
      steps.push({ t, ...step });
    }
    expect(steps.filter((s) => s.climbed).map((s) => s.climbed!.to)).toEqual([0, 1]);
    expect(steps.find((s) => s.climbed?.to === 1)!.t).toBe(WATCH_STALL_MS);
    // The second rung's instruction to a buffering player is a play, which
    // costs it nothing — never a seek.
    expect(steps.find((s) => s.climbed?.to === 1)!.instructions).toEqual([
      { do: 'play' },
    ]);
  });

  it('starts again from nothing when the room asks for something else', () => {
    let follow = initialFollow();
    for (let t = 0; t <= WATCH_RUNG_MS * 2; t += 500) {
      follow = stepFollow(follow, input({ now: T0 + t })).follow;
    }
    expect(follow.rung).toBe(2);
    const step = stepFollow(
      follow,
      input({ key: 'paused|0', want: { ...run, status: 'paused' }, now: T0 + 7_000 })
    );
    expect(step.follow.rung).toBeNull();
    expect(step.rest).toBe('agreed');
  });

  it('ends the climb on agreement and says how long it took', () => {
    let follow = initialFollow();
    for (let t = 0; t <= 4_000; t += 500) {
      follow = stepFollow(follow, input({ now: T0 + t })).follow;
    }
    const step = stepFollow(follow, input({ reading: at('playing'), now: T0 + 4_500 }));
    expect(step.rest).toBe('agreed');
    expect(step.agreedAfterMs).toBe(4_500);
    expect(step.follow.rung).toBeNull();
  });

  it('rebuilds a page that has gone silent, without telling it anything first', () => {
    const steps = climb(WATCH_SILENT_MS + 500, { reading: null });
    expect(steps.filter((s) => s.rest === 'silent').length).toBeGreaterThan(0);
    expect(rungs(steps)).toEqual([[WATCH_SILENT_MS, 3]]);
    expect(steps.some((s) => s.instructions.length > 0)).toBe(false);
  });

  it('gives up on a rebuilt page that never answers', () => {
    const steps = climb(WATCH_SILENT_MS + WATCH_REBUILD_MS + 500, {
      reading: null,
    });
    expect(rungs(steps).map(([, to]) => to)).toEqual([3, 4]);
  });

  it('tells a rebuilt page once, when it answers', () => {
    let follow = initialFollow();
    for (let t = 0; t <= WATCH_SILENT_MS; t += 500) {
      follow = stepFollow(follow, input({ reading: null, now: T0 + t })).follow;
    }
    expect(follow.rung).toBe(3);
    const first = stepFollow(
      follow,
      input({ reading: at('unstarted', 0), placed: false, now: T0 + 4_000 })
    );
    expect(first.instructions).toEqual([
      { do: 'seek', positionMs: 30_000 },
      { do: 'play' },
    ]);
    const second = stepFollow(
      first.follow,
      input({ reading: at('unstarted', 0), placed: false, now: T0 + 4_500 })
    );
    expect(second.instructions).toEqual([]);
    expect(second.rest).toBe('rebuilding');
  });

  it('waits out an advert for its own length, and then gives up', () => {
    const ad: PlayerReading = { ...at('playing', 1_000), durationMs: 30_000, videoId: 'ad' };
    const steps = climb(30_000 + WATCH_ADVERT_MARGIN_MS + 500, {
      reading: ad,
      advert: true,
    });
    expect(
      steps
        .filter((s) => s.t < 30_000 + WATCH_ADVERT_MARGIN_MS)
        .every((s) => s.rest === 'advert')
    ).toBe(true);
    expect(rungs(steps)).toEqual([[30_000 + WATCH_ADVERT_MARGIN_MS, 4]]);
  });

  it('holds a play for the handover, and no longer than its deadline', () => {
    const steps = climb(WATCH_HANDOVER_WAIT_MS + 500, { holding: true });
    expect(steps[0].rest).toBe('handover');
    expect(rungs(steps)).toEqual([[WATCH_HANDOVER_WAIT_MS, 0]]);
  });

  it('never rests without a deadline in anything but agreement', () => {
    // The property the ladder exists for, over every reading a player can
    // give: within a bounded time the follower agrees or has given up.
    const readings: (PlayerReading | null)[] = [
      null,
      at('unstarted', 0),
      at('buffering'),
      at('paused'),
      at('ended', LENGTH),
    ];
    const bound =
      WATCH_SILENT_MS + WATCH_STALL_MS + WATCH_RUNG_MS + WATCH_RESCUE_MS +
      WATCH_REBUILD_MS;
    for (const reading of readings) {
      for (const placed of [true, false]) {
        const steps = climb(bound, { reading, placed });
        const last = steps[steps.length - 1];
        expect(['agreed', 'given up']).toContain(last.rest);
      }
    }
  });
});

/**
 * An advert, which is a different video in the same frame.
 *
 * Every attempt at this listed "an advert starting" among the lies it was
 * guessing around, and guessed with a timer. The API says so if it is asked
 * the right question — and since 2026-09-23 it is asked the *right* right
 * question: the player names the video it is showing, and during a pre-roll
 * that is the advert's id.
 *
 * It used to compare lengths, which is kept below as the answer for a player
 * that will not give an id. That rule had a circle in it that cost an
 * evening: the film's length is learnt from the first player that can say,
 * and on a fresh party the first thing any player can measure is the
 * pre-roll — so the party held the advert's length as the film's, and every
 * reading of the actual film then read as an advert, for ever.
 */
describe('telling a film from what runs before it', () => {
  const reading = (
    durationMs: number | null,
    videoId: string | null = VIDEO
  ): PlayerReading => ({
    state: 'playing',
    positionMs: 3_000,
    durationMs,
    videoId,
  });

  const playing = (at = T0) =>
    apply(watching(at), [[{ type: 'WATCH_PLAY', userId: A }, at]]).watch;

  it('is the film when the lengths agree', () => {
    expect(showingTheFilm(playing(), reading(LENGTH, null))).toBe(true);
  });

  it('is the film within the slack a rounded length needs', () => {
    expect(
      showingTheFilm(playing(), reading(LENGTH - WATCH_LENGTH_SLACK_MS, null))
    ).toBe(true);
  });

  it('is not the film when a ninety-second spot says so', () => {
    expect(showingTheFilm(playing(), reading(90_000, null))).toBe(false);
  });

  it('is the advert when the player names a different video', () => {
    // No lengths involved: the frame is showing something else and says so.
    expect(showingTheFilm(playing(), reading(90_000, 'ad000000000'))).toBe(
      false
    );
  });

  it('is the film when the player names it, whatever the lengths say', () => {
    /*
      **The case the lengths get wrong and the id gets right**, and the one
      this was rebuilt for. A party that learnt its length from a pre-roll
      holds thirty seconds as the film's, so every reading of the actual film
      is a length that disagrees — and the old rule called the film an advert
      and stopped speaking to the player for the rest of the evening.
    */
    const poisoned = apply(
      reduce(
        createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 }),
        { type: 'START_WATCH', userId: A, videoId: VIDEO, url: URL },
        T0
      ),
      [[{ type: 'WATCH_READY', userId: A, durationMs: 30_000 }, T0]]
    ).watch;
    expect(poisoned.party?.durationMs).toBe(30_000);
    expect(showingTheFilm(poisoned, reading(LENGTH, VIDEO))).toBe(true);
  });

  it('is the film whenever either end cannot say', () => {
    // An unknown is not evidence of an advert, and refusing to follow on one
    // would leave a party that never learned its length unable to run.
    expect(showingTheFilm(playing(), reading(null, null))).toBe(true);
    const unlearned = reduce(
      createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 }),
      { type: 'START_WATCH', userId: A, videoId: VIDEO, url: URL },
      T0
    ).watch;
    expect(showingTheFilm(unlearned, reading(90_000, null))).toBe(true);
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
    const pressed = apply(watching(), [
      [{ type: 'WATCH_PLAY', userId: A }, T0],
    ]);
    // With a player having said it started — otherwise the clock has not
    // started and the pair below is the one the grace asks for, which is its
    // own test.
    const watch = reduce(
      pressed,
      { type: 'WATCH_STARTED', userId: A, positionMs: 0 },
      T0
    ).watch;
    expect(desiredFor(watch, T0 + 5_000)).toEqual({
      status: 'playing',
      positionMs: 5_000,
    });
  });
});

/**
 * A watch party is a mode the channel is in, and since 2026-09-18 an
 * exclusive one — **of the recording for as long as it is loaded, and of the
 * floor and the audio player only while it is running.**
 *
 * Two splits, both away from the mode and towards the run. The transports
 * parted on 2026-09-20; the floor followed on 2026-09-24, once a film that had
 * played to its end and been left loaded turned out to refuse every claim in
 * that channel for ever. See `watchIsPlaying`, and `canClaimFloor` for why a
 * paused film silences nobody.
 */
describe('a channel with a film on', () => {
  const withFilm = () => watching();
  const withoutFilm = () =>
    reduce(
      createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 }),
      { type: 'ENTER', userId: B },
      T0
    );

  const playingFilm = () => {
    // Pressed *and* reported: the film in these tests runs to its end, and a
    // transport whose clock never started would reach it two seconds late. See
    // `WATCH_STARTUP_GRACE_MS`.
    const pressed = reduce(withFilm(), { type: 'WATCH_PLAY', userId: A }, T0);
    return reduce(
      pressed,
      { type: 'WATCH_STARTED', userId: A, positionMs: 0 },
      T0
    );
  };

  it('allows a floor claim while it sits paused, and refuses one while it runs', () => {
    expect(canClaimFloor(withoutFilm(), A, T0)).toBe(true);
    expect(canClaimFloor(withFilm(), A, T0)).toBe(true);
    expect(canClaimFloor(playingFilm(), A, T0)).toBe(false);
  });

  it('gives the floor back when the film is paused rather than stopped', () => {
    // The regression this rule was changed for. `TICK` brings a film that has
    // reached its end to rest *paused and loaded* — see the end-of-film clause
    // in `reduce` — so a channel that watched something through and never
    // pressed Stop sat on a party nothing would ever clear. Asking
    // `watchPartyIsOn` there meant the Claim control in that channel was
    // greyed from the closing credits onwards, with no sentence anywhere
    // saying why.
    const ended = reduce(playingFilm(), { type: 'TICK' }, T0 + LENGTH + 1_000);
    expect(ended.watch.party).not.toBeNull();
    expect(ended.watch.status).toBe('paused');
    expect(canClaimFloor(ended, A, T0 + LENGTH + 1_000)).toBe(true);
  });

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
