import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import {
  actFrom,
  channelAnswered,
  desiredFor,
  followInstructions,
  hasArrived,
  showingTheFilm,
  watchPositionMs,
} from '../../../core/watch';
import type {
  Desired,
  PlayerHistory,
  PlayerReading,
  PlayerState,
  WatchIntent,
} from '../../../core/watch';
import {
  WATCH_OBEDIENCE_MS,
  WATCH_PATIENCE_MS,
} from '../../../core/constants';
import type { WatchState } from '../../../core/types';

/**
 * How often a follower re-reads its player and the clock.
 *
 * Twice a second, well inside `WATCH_DRIFT_MS`. What this catches is not drift
 * accumulating — snapshots carry that — but a player that stalled to buffer,
 * which nothing reports, and a duration turning up, which does not announce
 * itself either.
 */
export const FOLLOW_TICK_MS = 500;

/**
 * The widest gap between two readings that may still be compared.
 *
 * **A stall and a scrub are the same arithmetic if the readings are far
 * enough apart.** A player that stops advancing falls behind by exactly the
 * time between two readings, so as long as that is about a tick the error
 * stays under `WATCH_DRIFT_MS` and a stall can never read as a jump. Let the
 * gap grow and it can: the app going behind something else throttles this
 * timer to seconds or minutes, and the reading that comes back describes a
 * player that has been paused the whole time against a transport that has
 * not — a phone coming out of a pocket dragging the party back to where it
 * was when it went in.
 */
const READINGS_COMPARABLE_MS = FOLLOW_TICK_MS * 2.5;

/**
 * The half of a player that a follower needs, whatever it actually is.
 *
 * Two things implement this: a YouTube iframe in the web app and a WebView on
 * native. Everything above this line is one rule in `core/watch.ts`;
 * everything below it is a platform.
 *
 * `read` returns null when the player is not ready to be asked — before the
 * API has loaded, or after it has gone away — and the driver says nothing to a
 * player it cannot read.
 */
export interface PlayerPort {
  read: () => PlayerReading | null;
  play: () => void;
  pause: () => void;
  seek: (positionMs: number) => void;
}

/**
 * What a follower may do besides follow.
 *
 * Absent — what any screen that may not drive gets — this is the pure
 * follower it always was.
 */
export interface Drive {
  /**
   * Whether this device may move the channel's transport, which is
   * `canControlWatch` asked where the channel is known. A press on the
   * video's own controls is only an intent when this is true; otherwise it
   * is corrected away, which is what the inert frame already says.
   */
  mayControl: boolean;
  /** Where a press on the video's own controls goes. */
  onIntent: (intent: WatchIntent) => void;
}

/**
 * What this follower is in the middle of, and it is only ever one thing.
 *
 * **The repair of 2026-09-18, and the shape is the whole of it.** A follower
 * that both commands its player and reads it cannot tell its own unobeyed
 * instruction from somebody's thumb — the two are the same reading, and the
 * IFrame API will not say which, since `onStateChange` carries the new state
 * and nothing about its cause. Three attempts tried to separate them by *how
 * long ago* the instruction went out: a seek settle, a command settle, a
 * dwell, a quiet period, a pending window, seven constants between them, each
 * one trading a misread against an erased press.
 *
 * They are separated by *state* here instead, and every transition is an
 * observation rather than an elapsed window:
 *
 * - **`watching`** — the player is where the channel wants it. Nothing is
 *   ever said to a player in this state, so anything it does has no
 *   explanation on this device and is therefore its owner's doing. This is
 *   the only state in which a press is read.
 * - **`sending`** — the player has been told something and has not arrived
 *   yet. Nothing is read, so a correction cannot come back as an act. Ends
 *   when the player arrives (`hasArrived`).
 * - **`told`** — the channel has been told something and has not answered
 *   yet. Nothing is said to the player, so a correction cannot undo the press
 *   on its way out. Ends when the channel agrees (`channelAnswered`).
 * - **`wondering`** — a position that moved further than time did, looked at
 *   once more before anybody acts on it. See below.
 * - **`settling`** — the player is between states and this follower did not
 *   put it there. See below.
 *
 * Commanding and reading are therefore never both available, which is the
 * property none of the timer arrangements could hold. Each wait carries a
 * fuse — `WATCH_PATIENCE_MS` — for the observation that never comes.
 *
 * **Why a jump gets a second look and a press does not.** A play or a pause
 * that is wrong costs one spurious transition, which the phases above bound
 * and which corrects itself. A *position* that is wrong moves the whole room
 * to somewhere nobody asked for — a single bad reading throwing six people
 * ninety seconds into a film — so the asymmetry in the cost is worth one tick
 * of latency on a scrub.
 *
 * It is not the dwell that failed three times. That one waited to see the
 * same jump twice, which a jump can never do — the reading after a scrub is
 * continuous with the one before it — and it corrected the player while it
 * waited, which erased the press it was waiting on. This waits on the *gap*
 * the jump left between the player and the channel, which is durable, and it
 * says nothing at all in the meantime.
 */
type Doing =
  | { phase: 'watching' }
  | { phase: 'sending'; want: Desired; since: number }
  | { phase: 'told'; intent: WatchIntent; since: number }
  | { phase: 'wondering'; since: number }
  | { phase: 'settling'; since: number };

/**
 * Keeps a player in step with the channel — and, for whoever may drive, lets
 * that player's own controls move the channel instead.
 *
 * **The rules are not here.** `followInstructions` decides what to say to a
 * player, `hasArrived` and `channelAnswered` say when a wait is over, and
 * `actFrom` reads a settled player's owner. This carries the one thing none
 * of them may keep: which of the three things above this follower is doing,
 * and what the last tick saw.
 */
export function useFollow(
  watch: WatchState,
  port: PlayerPort | null,
  /** Paused when this device is not meant to be showing anything. */
  active: boolean,
  drive?: Drive
): void {
  const doing = useRef<Doing>({ phase: 'watching' });
  const previous = useRef<PlayerHistory | null>(null);
  const attentive = useRef(true);
  const latest = useRef({ watch, port, drive });
  latest.current = { watch, port, drive };

  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const { watch: current, port: player, drive: may } = latest.current;
      if (!player) return;
      const reading = player.read();
      if (!reading) return;
      const now = Date.now();
      const want = desiredFor(current, now);
      if (!want) return;

      const here: PlayerHistory = {
        state: reading.state,
        positionMs: reading.positionMs,
        at: now,
        status: current.status,
        channelPositionMs: watchPositionMs(current, now),
      };

      /*
        **A press is only a press while somebody is looking at it.** iOS stops
        a video the moment the app goes behind something else, and a phone
        going into a pocket reporting that as a pause would stop the film for
        the whole room. The same guard covers a web tab losing focus, which
        does the same thing for the same reason.

        Both now and a tick ago, because coming back is the dangerous moment
        rather than being away: the reading from before describes a player
        that was stopped for as long as the app was, against a transport that
        never was.
      */
      const foreground = AppState.currentState === 'active';
      const watching = foreground && attentive.current;
      attentive.current = foreground;

      /*
        **An advert is a different video in the same frame.** Nothing is said
        to a player that is not showing the film and nothing is read from it:
        its clock is the advert's, so every reading is a true statement about
        the wrong video. They end by themselves. See `showingTheFilm`.
      */
      if (!showingTheFilm(current, reading)) {
        previous.current = here;
        return;
      }

      const state = doing.current;

      // Waiting on the player to arrive where it was sent. Nothing is read
      // until it does, so a correction can never be read back as a press.
      if (state.phase === 'sending') {
        previous.current = here;
        if (hasArrived(reading, state.want)) {
          doing.current = { phase: 'watching' };
          return;
        }
        if (now - state.since <= WATCH_OBEDIENCE_MS) return;
        // The fuse, and it is the player's rather than the channel's — see
        // `WATCH_OBEDIENCE_MS`. Waiting here is *deafness*, so a person
        // pressing something while a correction was in flight goes unheard
        // for the whole of it; the channel's four seconds would be the old
        // complaint in a new dress.
        doing.current = { phase: 'watching' };
        return;
      }

      // Waiting on the channel to answer a press. Nothing is said to the
      // player until it does, or the press is corrected away on its way out.
      if (state.phase === 'told') {
        previous.current = here;
        if (
          channelAnswered(state.intent, current, now) ||
          now - state.since > WATCH_PATIENCE_MS
        ) {
          doing.current = { phase: 'watching' };
        }
        return;
      }

      /*
        **Waiting for a player to land**, having said nothing to it. It is
        its owner's doing, so what it settles into is what they did; until
        then there is nothing to read and nothing worth correcting.

        The fuse is the player's — see `WATCH_OBEDIENCE_MS` — because a
        player that buffers indefinitely is one the channel has to be allowed
        to correct eventually, and waiting here says nothing to anybody.
      */
      let waited = false;
      if (state.phase === 'settling') {
        if (reading.state !== 'buffering') {
          // It landed. What it landed on is what its owner did, and the next
          // tick reads it in the ordinary way.
          doing.current = { phase: 'watching' };
          previous.current = here;
          return;
        }
        if (now - state.since <= WATCH_OBEDIENCE_MS) {
          previous.current = here;
          return;
        }
        /*
          **The fuse, and it has to burn through to the correction in this
          same tick.** Returning to `watching` and stopping here would meet
          the buffering test below, which would start a fresh wait with a
          fresh timestamp — a fuse that re-lights itself every time it
          reaches the end, which is no fuse at all. So the wait is recorded
          as spent and this tick goes on to correct the player.
        */
        doing.current = { phase: 'watching' };
        waited = true;
      }

      /*
        **Looking again at a jump**, having said nothing to anybody since it
        was seen. The gap it left is what answers: a thumb leaves the player
        somewhere the channel is not and it stays there, and a one-tick lie
        has already closed by now. `hasArrived` is the same tolerance the
        rest of the follower is kept to, asked the other way round.
      */
      if (state.phase === 'wondering') {
        previous.current = here;
        const real =
          !hasArrived(reading, want) &&
          reading.positionMs !== null &&
          now - state.since <= WATCH_PATIENCE_MS;
        doing.current = { phase: 'watching' };
        if (real && may?.mayControl && watching) {
          // Where it has reached rather than where it was first seen: the
          // film has been running for a tick, and sending the older figure
          // is sending the party a tick behind.
          const act: WatchIntent = {
            do: 'seek',
            positionMs: reading.positionMs as number,
          };
          doing.current = { phase: 'told', intent: act, since: now };
          may.onIntent(act);
        }
        return;
      }

      /*
        **A player that is between states, having been put there by somebody
        else.**

        Pressing Play goes `paused` → `buffering` → `playing`, and a tick is
        half a second, so the reading a follower most often catches is the
        middle one. `buffering` is not a state a person can be *in*, so
        nothing reads it as a press — and the paused branch of
        `followInstructions` treats a buffering player as one on its way to
        playing and stops it. That is right for a player this follower
        started and wrong for a thumb, and it is what *the film starts and
        immediately stops again* was.

        In `watching` nothing has been said to this player, so a transition
        here is nobody's but its owner's. It is given a tick to land on the
        state that says what it was, which costs a correction half a second
        on the rare occasion the buffering really was drift resolving itself.

        Only `buffering`. A `cued` player is not on its way anywhere and
        never leaves that state on its own — it is how a screen arrives, and
        waiting for it to settle would be waiting for ever.
      */
      if (reading.state === 'buffering' && !waited) {
        previous.current = here;
        doing.current = { phase: 'settling', since: now };
        return;
      }

      // **Watching.** Nothing has been said to this player, so whatever it is
      // doing is its owner's doing.
      if (hasArrived(reading, want)) {
        previous.current = here;
        return;
      }

      // Two readings a tick apart are comparable and two readings a minute
      // apart are not — see `READINGS_COMPARABLE_MS`. A gap this wide leaves
      // the player to be corrected in the ordinary way.
      const comparable =
        previous.current !== null &&
        now - previous.current.at <= READINGS_COMPARABLE_MS;

      if (may?.mayControl && watching && comparable) {
        const act = actFrom(current, reading, previous.current, now);
        if (act) {
          previous.current = here;
          // A jump is looked at once more before the room is moved; a play or
          // a pause is acted on as it is seen. See `Doing`.
          doing.current =
            act.do === 'seek'
              ? { phase: 'wondering', since: now }
              : { phase: 'told', intent: act, since: now };
          if (act.do !== 'seek') may.onIntent(act);
          return;
        }
      }

      // Not this player's owner, so it is this player that is wrong.
      previous.current = here;
      const instructions = followInstructions(current, reading, now);
      if (instructions.length === 0) return;
      doing.current = { phase: 'sending', want, since: now };
      for (const instruction of instructions) {
        if (instruction.do === 'play') player.play();
        else if (instruction.do === 'pause') player.pause();
        else player.seek(instruction.positionMs);
      }
    };
    const timer = setInterval(tick, FOLLOW_TICK_MS);
    tick();
    return () => clearInterval(timer);
  }, [active]);
}
