import { WATCH_DRIFT_MS, WATCH_LENGTH_SLACK_MS } from './constants';
import type { WatchParty, WatchState } from './types';

/**
 * A video everybody is watching at once, on their own screens.
 *
 * The Floor carries no video. What travels is a transport clock over a link,
 * and each person's own player follows it — so the shape here is deliberately
 * `playback.ts`'s: a position banked at the last transition plus the moment
 * the current run began, from which the live position is derived. Two features
 * measuring elapsed time two different ways would be two places to get it
 * wrong.
 *
 * What it does *not* carry is a volume. `PlaybackState.volume` is shared
 * because the server applies it to the samples before publishing, so it is
 * part of what the channel sounded like. Nothing is published here; how loud
 * your own screen is is your device's business.
 */

export function initialWatchState(): WatchState {
  return {
    party: null,
    status: 'idle',
    positionMs: 0,
    startedAt: null,
    mutedAll: false,
    enforced: false,
    failure: null,
  };
}

/**
 * How far into the video the party has reached.
 *
 * Clamped to the length once a follower's player has reported one, for the
 * reason `playbackPositionMs` clamps: the position is derived from elapsed
 * wall clock and nothing stops that clock at the end. Until a duration is
 * known there is nothing to clamp against, and the raw elapsed time is the
 * honest answer.
 */
export function watchPositionMs(watch: WatchState, now: number): number {
  if (watch.status !== 'playing' || watch.startedAt === null) {
    return watch.positionMs;
  }
  const elapsed = watch.positionMs + (now - watch.startedAt);
  return Math.min(elapsed, watch.party?.durationMs ?? elapsed);
}

/**
 * Whether a playing video has run out and should come to rest.
 *
 * False while the duration is unknown. A party whose followers have never
 * reported one runs until somebody stops it, which is the only thing that can
 * be true of a video whose length nothing here knows.
 */
export function hasReachedEnd(watch: WatchState, now: number): boolean {
  if (watch.status !== 'playing' || !watch.party) return false;
  if (watch.party.durationMs === null) return false;
  return watchPositionMs(watch, now) >= watch.party.durationMs;
}

/**
 * Starts a party on this video, replacing whatever was there.
 *
 * **The room begins muted**, which is a default rather than an inheritance —
 * every party starts this way regardless of what the last one was left at.
 *
 * That default would have been heavy-handed before the mute followed the
 * transport, and this is the one place worth spelling out why it is not now.
 * A mute that held regardless of play state would silence a channel from the
 * moment somebody pasted a link, and keep it silent through every pause,
 * until a person noticed a control they had not touched. What holds instead is
 * quiet *while the video plays* — so the default only ever asserts itself over
 * a running film, which is the one time nobody wants an open microphone
 * pointed at their own screen. Pause, and everybody has their voice back
 * without having asked for it.
 *
 * The party also starts paused, so the mute asserts nothing at all until
 * somebody presses Play. Between them, the first thing this default can
 * possibly do is the thing it is for.
 */
export function startParty(party: WatchParty): WatchState {
  return {
    party,
    status: 'paused',
    positionMs: 0,
    startedAt: null,
    mutedAll: true,
    enforced: false,
    failure: null,
  };
}

/**
 * Withholds every microphone in the room, or gives them all back.
 *
 * Refused when there is no party, so the state cannot be left set on an idle
 * channel where nothing in the interface would explain it — `stopParty`
 * returns the initial state and clears it for the same reason.
 */
export function setPartyMute(watch: WatchState, muted: boolean): WatchState {
  if (!watch.party) return watch;
  // Refused rather than silently ignored is the caller's business — the
  // reducer checks `canUnmuteRoom` and never reaches here — but the rule is
  // restated at the mutation for the same reason every guard in core is: a
  // second caller arriving later must not be able to lift an enforced mute by
  // going round the guard.
  if (watch.enforced && !muted) return watch;
  return { ...watch, mutedAll: muted };
}

/**
 * Whether this party is withholding the room's microphones at this moment.
 *
 * The stored intent **and** the transport: a mute holds while the video plays
 * and lifts the moment it pauses. Lives here rather than in channel.ts so that
 * `micNeeded.ts` and the reducer can ask the same question without one of them
 * importing the other — the derivation is the thing that must not exist twice.
 *
 * See `WatchState.mutedAll` for why it is derived rather than written on every
 * play and pause.
 */
export function partyWithholds(watch: WatchState): boolean {
  return watch.mutedAll && watch.status === 'playing';
}

export function stopParty(): WatchState {
  return initialWatchState();
}

/**
 * Starts or resumes. A video played from its own end starts again from the
 * beginning, which is the only reading of "play" available at that position —
 * the same rule shared playback follows.
 */
export function watchPlay(
  watch: WatchState,
  now: number,
  /**
   * Whether anybody in the room is watching on the device they are in it on,
   * which only the channel can answer — hence a parameter rather than a
   * lookup. **This is the sampling point**: the question is asked here, at the
   * edge of a run, and the answer is written to `enforced` and left alone
   * until the next one.
   */
  screenInTheRoom = false
): WatchState {
  if (!watch.party) return watch;
  const atEnd =
    watch.party.durationMs !== null &&
    watch.positionMs >= watch.party.durationMs;
  return {
    ...watch,
    status: 'playing',
    positionMs: atEnd ? 0 : watch.positionMs,
    startedAt: now,
    // Forced on rather than merely locked: a run that cannot be unmuted must
    // also not begin audible, or the first thing an enforced party does is
    // publish a room full of microphones pointed at their own screens.
    mutedAll: screenInTheRoom ? true : watch.mutedAll,
    enforced: screenInTheRoom,
    failure: null,
  };
}

export function watchPause(watch: WatchState, now: number): WatchState {
  if (!watch.party) return watch;
  return {
    ...watch,
    status: 'paused',
    positionMs: watchPositionMs(watch, now),
    startedAt: null,
    // A pause ends the run and with it the enforcement, so that unmuting a
    // paused party is allowed. The next `watchPlay` asks the question again,
    // which is what makes somebody unplugging their laptop mid-evening take
    // effect without anything having to watch for it.
    enforced: false,
  };
}

/** Moves the position, leaving the party running if it was running. */
export function watchSeek(
  watch: WatchState,
  positionMs: number,
  now: number
): WatchState {
  if (!watch.party) return watch;
  const ceiling = watch.party.durationMs;
  const clamped = Math.max(
    0,
    ceiling === null ? positionMs : Math.min(positionMs, ceiling)
  );
  return {
    ...watch,
    positionMs: clamped,
    startedAt: watch.status === 'playing' ? now : null,
  };
}

/**
 * The one fact the channel learns from a client rather than deciding.
 *
 * Nothing here asks YouTube anything, so how long a video runs is only ever
 * known because a follower's player said. Recorded once and then left alone:
 * a second follower reporting a different figure is a disagreement no rule can
 * settle, and the first answer is at least the one every clamp so far has been
 * made against.
 */
export function learnDuration(
  watch: WatchState,
  durationMs: number
): WatchState {
  if (!watch.party || watch.party.durationMs !== null) return watch;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return watch;
  return { ...watch, party: { ...watch.party, durationMs } };
}

/**
 * The party could not be started or kept running, and says why.
 *
 * It comes to rest where it got to rather than resetting, exactly as playback
 * does: pressing play again is a retry from where everybody was.
 */
export function failWatch(
  watch: WatchState,
  reason: string,
  now: number
): WatchState {
  return { ...watchPause(watch, now), failure: reason };
}

/**
 * Every YouTube id is eleven of these, and nothing else is.
 *
 * Matched rather than merely extracted so that a link with a plausible shape
 * and an implausible id is refused here rather than by a player five seconds
 * later, on somebody else's screen.
 */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Parses a pasted YouTube link. Null when it is not one.
 *
 * In core for exactly the reason core exists: the app needs it to decide
 * whether the Start button lights up, and the server needs it to decide
 * whether to accept — and those two must not disagree.
 *
 * By regular expression rather than by `URL`, which core cannot rely on: this
 * runs under Metro as well as Node, and React Native's URL is not the
 * platform's.
 */
export function parseYouTubeUrl(url: string): { videoId: string } | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const patterns = [
    // youtube.com/watch?v=ID, with the id anywhere among the parameters.
    /^(?:https?:\/\/)?(?:[\w-]+\.)*youtube(?:-nocookie)?\.com\/watch\?(?:[^#]*&)?v=([^&#]+)/i,
    // The share link, and the three paths that carry the id as a segment.
    /^(?:https?:\/\/)?(?:[\w-]+\.)*youtu\.be\/([^?&#/]+)/i,
    /^(?:https?:\/\/)?(?:[\w-]+\.)*youtube(?:-nocookie)?\.com\/(?:shorts|live|embed)\/([^?&#/]+)/i,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match && VIDEO_ID.test(match[1])) return { videoId: match[1] };
  }
  return null;
}

/**
 * What a player is doing, in the only five states any of this cares about.
 *
 * YouTube's own numbers are deliberately not used here: core must not know
 * what `YT.PlayerState.ENDED` is, and an app player that is a native WebView
 * has its own vocabulary anyway. Each caller maps its player's state to these
 * five and is the only thing that knows the mapping.
 */
export type PlayerState =
  | 'unstarted'
  | 'buffering'
  | 'playing'
  | 'paused'
  | 'ended';

/** A player's own account of itself, read fresh at each tick. */
export interface PlayerReading {
  state: PlayerState;
  /** Where the player is, in ms, or null when it cannot say yet. */
  positionMs: number | null;
  /**
   * How long the player says the thing it is currently showing runs for, or
   * null when it cannot say. **Not the film's length** — see `showingTheFilm`,
   * which is the whole reason this is read.
   */
  durationMs: number | null;
}

/**
 * Whether what the player is showing is the film the party is watching.
 *
 * **An advert is a different video in the same frame**, and the API says so if
 * it is asked the right question: during a pre-roll, `getCurrentTime` and
 * `getDuration` describe the advert. A player thirty seconds into a
 * ninety-second spot therefore reports a position near zero and a duration
 * nothing like the film's, and both readings are true statements about the
 * wrong video.
 *
 * Every attempt at this so far listed "an advert starting" among the lies it
 * was guessing around, and guessed with a timer. This measures it instead:
 * the party learns the film's length once, from the first follower that can
 * say — `learnDuration` — and anything reporting a materially different one
 * is not showing the film. Nothing is said to such a player and nothing is
 * read from it; adverts end by themselves.
 *
 * True while the duration is unknown at either end, which is the honest
 * answer before anybody has been able to say: an unknown is not evidence of
 * an advert, and refusing to follow on one would leave a party that never
 * learned its length unable to run at all.
 */
export function showingTheFilm(
  watch: WatchState,
  player: PlayerReading
): boolean {
  const film = watch.party?.durationMs ?? null;
  if (film === null || player.durationMs === null) return true;
  // Generous, because it is separating a film from an advert rather than
  // measuring anything: the two differ by minutes, and a player rounding its
  // own length to the nearest second must not read as a different video.
  return Math.abs(player.durationMs - film) <= WATCH_LENGTH_SLACK_MS;
}

/**
 * What the channel is asking every player to be, at this moment.
 *
 * The pair rather than either half: a player is in step when it is doing the
 * right thing *at* the right place, and the two are corrected by one
 * instruction apiece but decided together.
 */
export interface Desired {
  status: 'playing' | 'paused';
  positionMs: number;
}

export function desiredFor(watch: WatchState, now: number): Desired | null {
  if (!watch.party) return null;
  return {
    status: watch.status === 'playing' ? 'playing' : 'paused',
    positionMs: watchPositionMs(watch, now),
  };
}

/**
 * Whether a player has arrived where it was asked to be.
 *
 * **The question the whole follower now turns on.** A follower that has said
 * something to its player stays deaf until this is true, so a correction can
 * never be read back as somebody's thumb — which is the loop that produced
 * every flip-flop so far, three separate times. It is closed by *observing
 * the player arrive* rather than by a window elapsing, which is what makes it
 * a fact rather than a guess.
 *
 * `buffering` is on its way and has not arrived. `unstarted` has not begun.
 * `ended` has arrived at a stop, whatever it was asked for, because a player
 * at the end of a film cannot be made to be anywhere else without being
 * restarted — see `followInstructions`.
 */
export function hasArrived(player: PlayerReading, want: Desired): boolean {
  if (player.state === 'ended') return true;
  if (player.state === 'buffering' || player.state === 'unstarted') {
    return false;
  }
  if (player.state !== want.status) return false;
  if (player.positionMs === null) return false;
  return Math.abs(player.positionMs - want.positionMs) <= WATCH_DRIFT_MS;
}

/**
 * One thing to do to a player. A tick may produce none, one or two.
 */
export type WatchInstruction =
  | { do: 'play' }
  | { do: 'pause' }
  | { do: 'seek'; positionMs: number };

/**
 * What to tell this player to bring it where the channel wants it.
 *
 * **Only ever called about a player that has not arrived**, which is what
 * lets this be as blunt as it is: there is no tolerance to apply and no
 * decision about whether the gap is worth a stutter, because `hasArrived`
 * already asked both. Every instruction here is followed by a silence that
 * lasts until the player is where it was sent.
 *
 * Returned as a list rather than performed, because ordering is load-bearing
 * in both branches and is the kind of thing that gets quietly reversed by
 * somebody tidying. See the two comments below.
 */
export function followInstructions(
  watch: WatchState,
  player: PlayerReading,
  now: number
): WatchInstruction[] {
  const want = desiredFor(watch, now);
  if (!want) return [];

  /*
    **An ended video is not a stopped one, and nothing here may restart it.**

    `playVideo()` on an ended player starts it again from the beginning. A
    transport still saying playing — which it is for at least one tick after
    the end, and for ever when the duration was never learned — therefore
    restarted the video; the correction then saw the player at zero against a
    position at the end, called that drift, and seeked back to the end, which
    ended it again. The whole loop is invisible except as the first second
    stuttering endlessly, which is exactly how it was reported.

    **Only while the channel agrees it is over**, and that clause is what keeps
    replay working: pressing Play on a finished video moves the transport back
    to zero while the player is still ended, so a flat "never touch an ended
    player" would leave every screen at Finished for ever.
  */
  if (player.state === 'ended') {
    const here = player.positionMs ?? want.positionMs;
    if (want.positionMs >= here - WATCH_DRIFT_MS) return [];
  }

  const adrift =
    player.positionMs !== null &&
    Math.abs(player.positionMs - want.positionMs) > WATCH_DRIFT_MS;

  if (want.status === 'playing') {
    const instructions: WatchInstruction[] = [];
    if (adrift) instructions.push({ do: 'seek', positionMs: want.positionMs });
    // A buffering player is already on its way to playing and needs nothing
    // said to it.
    if (player.state !== 'playing' && player.state !== 'buffering') {
      instructions.push({ do: 'play' });
    }
    return instructions;
  }

  /*
    **Paused, and this is where the ordering matters.**

    The pause goes first and the correction second. Correcting before pausing
    sends the player somewhere it is about to be stopped at, which is a seek
    spent to land in the same wrong place.

    **And a paused transport is corrected whatever the player was doing**,
    which is the fix for BACKLOG.md § *A rewind while the watch party is paused
    leaves the picture where it was*. The old shape only corrected inside the
    branch that had just paused a playing player, so a seek arriving while
    everything was already at rest moved the readout and not the picture: the
    footer said one time, the frame showed another, and it stayed that way
    until somebody pressed Play.
  */
  const instructions: WatchInstruction[] = [];
  if (player.state === 'playing' || player.state === 'buffering') {
    instructions.push({ do: 'pause' });
  }
  if (adrift) instructions.push({ do: 'seek', positionMs: want.positionMs });
  /*
    **A seek starts a cued player, so a paused party has to stop it again.**

    The IFrame API is explicit about this and it is the opposite of the
    intuition: *"If the player is paused when the function is called, it will
    remain paused. If the function is called from another state (playing,
    video cued, etc.), the player will play the video."* A player that has
    just been built is `cued`, not paused — so the one seek that puts a fresh
    screen where the party has got to is also the thing that starts it.

    That is how **switching devices turned a paused party into a playing
    one**: the new screen was positioned, began playing as a side effect, and
    its own follower then read a playing player against a paused channel and
    told the room somebody had pressed play. The follower cannot be blamed for
    that — in `watching` it is right to believe its player — so the repair is
    that the instruction is finished rather than that the reading is doubted.

    Only for the states a seek actually starts, which is why this is not
    simply *always pause last*. A player that was `playing` or `buffering`
    was stopped by the pause above and stays stopped through the seek; one
    that was already `paused` stays paused by the documented rule. What is
    left is a player that has not begun — `cued`, which this calls
    `unstarted` — and one that has run out, and those are exactly the two a
    seek would set going.
  */
  if (adrift && (player.state === 'unstarted' || player.state === 'ended')) {
    instructions.push({ do: 'pause' });
  }
  return instructions;
}

/**
 * What the previous tick saw — of the player, and of the channel beside it.
 *
 * **A reading on its own cannot tell a press from a consequence.** A player
 * that is paused while the channel says playing is either somebody who has
 * just pressed pause on the video's own bar, or somebody's follower a
 * heartbeat behind a pause that has already happened elsewhere; the two are
 * the same reading and the opposite act. What separates them is which of the
 * two moved, so the previous tick's *pair* is kept and not just the player's
 * half of it.
 */
export interface PlayerHistory {
  state: PlayerState;
  positionMs: number | null;
  /** When that reading was taken. */
  at: number;
  /** What the channel was saying at the same moment. */
  status: WatchState['status'];
  /** Where the channel was at the same moment, per `watchPositionMs`. */
  channelPositionMs: number;
}

/**
 * A transport act performed on the video's own controls.
 *
 * Since 2026-09-18 these are the *only* controls: the bar is inside the embed
 * and visible whatever the app does, and a second row of buttons beside a bar
 * that did nothing was the confusing half. So this is not a second way to
 * press the transport any more — it is the transport.
 */
export type WatchIntent =
  | { do: 'play' }
  | { do: 'pause' }
  | { do: 'seek'; positionMs: number };

/**
 * What this player's owner just did to it.
 *
 * **Asked only of a settled player, and that is the whole repair.** Three
 * attempts read a player that this same follower might have commanded a
 * moment ago, and tried to tell a thumb from an unobeyed instruction by how
 * long ago the instruction went out — a dwell, a settle window, a quiet
 * period, seven constants between them. They are the same reading, and no
 * amount of timing separates them, because the API does not say what caused a
 * state change: `onStateChange` carries the new state and nothing else.
 *
 * So the ambiguity is removed at the source instead. A follower that has
 * said anything to its player does not ask this question until the player has
 * *arrived* where it was sent (`hasArrived`); while it is settled it says
 * nothing to the player at all. A change seen here therefore has no
 * explanation on this device, and the only remaining question is whether it
 * has one on the channel — which is exact, because the previous tick kept
 * both halves.
 *
 * Whether this device may drive is `canControlWatch`, asked by the caller:
 * core has no channel here, only the watch state.
 */
export function actFrom(
  watch: WatchState,
  player: PlayerReading,
  previous: PlayerHistory | null,
  now: number
): WatchIntent | null {
  if (!watch.party) return null;
  // The first tick of a party has nothing to be compared against, and the
  // opening reading of a fresh player — unstarted, at zero, against a
  // transport already mid-film — is the one most likely to look like an act.
  if (!previous) return null;
  // An advert is a different video reporting its own clock. Say nothing about
  // a player that is not showing the film.
  if (!showingTheFilm(watch, player)) return null;

  /*
    **The channel moved, and this player is following rather than leading.**

    Somebody pauses; every other screen's follower pauses its own player a
    tick later; each of those is a player at odds with a channel it does not
    yet match, which is a press exactly. Asking which of the two moved first
    is what stops a pause going round the room for ever.
  */
  if (previous.status !== watch.status) return null;
  const at = watchPositionMs(watch, now);
  const expectedChannel =
    previous.channelPositionMs +
    (watch.status === 'playing' ? now - previous.at : 0);
  if (Math.abs(at - expectedChannel) > WATCH_DRIFT_MS) return null;

  // The two states a person can produce, against a channel that disagrees.
  // `buffering`, `unstarted` and `ended` are the player between things, and
  // `ended` above all must never become a pause: the transport is entitled to
  // run past a duration it was never told.
  if (player.state === 'playing' && watch.status !== 'playing') {
    return { do: 'play' };
  }
  if (player.state === 'paused' && watch.status === 'playing') {
    return { do: 'pause' };
  }

  /*
    **A scrub is a position that moved further than time did.**

    Drift cannot produce one: between two ticks half a second apart a playing
    player advances about half a second, and the gap between where it should
    have reached and where it says it is is the jump somebody's thumb made.
    Measured against the *previous reading* rather than against the channel,
    so that ordinary accumulated drift does not read as an act.

    **A stall cannot produce one either, as long as the readings either side
    are a tick apart.** A player that stops advancing falls behind by exactly
    the time between the two readings, so a follower that refuses to compare
    readings further apart than a tick can never mistake a stall for a jump:
    the error is bounded below `WATCH_DRIFT_MS` by the tick itself. Enforcing
    that bound is the caller's, which owns the clock — see `useFollow`.
  */
  if (player.positionMs === null || previous.positionMs === null) return null;
  const expectedPlayer =
    previous.positionMs + (previous.state === 'playing' ? now - previous.at : 0);
  if (Math.abs(player.positionMs - expectedPlayer) > WATCH_DRIFT_MS) {
    return { do: 'seek', positionMs: player.positionMs };
  }
  return null;
}

/**
 * Whether the channel has come back saying what a press asked for.
 *
 * The other observation the follower waits on, and the reason it is here
 * rather than beside the clock that used to bound it: a press goes to the
 * server and returns as a snapshot, and until it does the channel still says
 * the thing the person just changed. A follower that corrected in the
 * meantime would undo the press on its way out.
 */
export function channelAnswered(
  intent: WatchIntent,
  watch: WatchState,
  now: number
): boolean {
  if (intent.do === 'play') return watch.status === 'playing';
  if (intent.do === 'pause') return watch.status === 'paused';
  // A seek lands where the transport was asked to go and then keeps moving,
  // so the question is whether the channel is near it rather than at it.
  return Math.abs(watchPositionMs(watch, now) - intent.positionMs) <= 2_000;
}
