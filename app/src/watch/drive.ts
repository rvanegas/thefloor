import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import {
  contradictionFrom,
  followInstructions,
  scrubStands,
  watchPositionMs,
} from '../../../core/watch';
import type {
  PlayerHistory,
  PlayerReading,
  PlayerState,
  WatchIntent,
} from '../../../core/watch';
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
 * How long a press on the video's own controls is given to come back.
 *
 * An intent goes to the server and returns as a snapshot, and until it does
 * the channel still says the thing the person just changed — so a follower
 * left running would correct the press away, which is the entire defect this
 * exists to fix, reproduced with an extra network hop in it. So the follower
 * says nothing at all while one is outstanding.
 *
 * It is a round trip rather than a tolerance of the shared clock, which is
 * why it lives here and not beside `WATCH_DRIFT_MS` in core. The window has
 * to end even when the answer never comes: a press refused by the server —
 * somebody claimed the floor in the same second — leaves a player nothing
 * will correct until this expires.
 */
const INTENT_SETTLE_MS = 2_500;

/**
 * How long a disagreement has to stand before it counts as somebody's doing.
 *
 * **One tick, and it is the difference between a remote and a fight.** Read
 * at a single instant, a player at odds with the channel is equally a thumb
 * and a player halfway through obeying — and the embed produces the second
 * constantly: a state reported late, an advert starting, a stall that
 * resolves itself. The first version of this took every one of them for a
 * press, so one device's slow player instructed the room, the room obeyed,
 * and the correction that followed produced the next instruction. It showed
 * as a Play that stuttered play-pause-play-pause and settled on pause.
 *
 * A press is durable and a blip is not, and half a second is the whole of
 * what separates them. Slightly under a tick, so ordinary timer jitter does
 * not push a genuine press into a third reading.
 */
const INTENT_DWELL_MS = 400;

/**
 * How long after one press before another may be read.
 *
 * Belt and braces for the oscillation above rather than a rule about people:
 * a disagreement that survives the dwell and then comes straight back is a
 * player arguing with the channel, and the worst this can then do is one
 * transition every two seconds instead of one per tick. Two seconds is also
 * comfortably longer than the round trip it takes for a press to come back
 * as a snapshot, and comfortably shorter than any pair of presses a person
 * actually makes.
 *
 * **It is a silence and not merely a deafness**, which is the repair of
 * 2026-09-17. A window that stopped this follower *reading* a press while it
 * went on correcting the player was worse than one that did nothing: a second
 * press made inside it was pushed back to whatever the channel said before
 * anything could notice it had been made. What that produced is what was
 * reported — press Play, watch it start and stop again, press it again, and
 * again, each press restarting the window that erased the last one. So
 * nothing is said to the player in here either; the channel is not going
 * anywhere, and a player that really is disobeying is corrected two seconds
 * later instead of straight away.
 */
const INTENT_QUIET_MS = 2_000;

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
 * Three things implement this: a YouTube iframe in the web app, a WebView on
 * native, and the follower page while it still exists. Everything above this
 * line is one rule in `core/watch.ts`; everything below it is a platform.
 *
 * `read` returns null when the player is not ready to be asked — before the
 * API has loaded, or after it has gone away — and the driver says nothing to a
 * player it cannot read.
 */
export interface PlayerPort {
  read: () => { state: PlayerState; positionMs: number | null } | null;
  play: () => void;
  pause: () => void;
  seek: (positionMs: number) => void;
}

/**
 * What a follower may do besides follow.
 *
 * Absent — the default, and what the follower page and any screen that may
 * not drive get — this is the pure follower it always was.
 */
export interface Drive {
  /**
   * Whether this device may move the channel's transport, which is
   * `canControlWatch` asked where the channel is known. A press on the
   * video's own controls is only an intent when this is true; otherwise it
   * is corrected away exactly as before, which is the same answer the greyed
   * buttons give.
   */
  mayControl: boolean;
  /** Where a press on the video's own controls goes. */
  onIntent: (intent: WatchIntent) => void;
}

/**
 * Keeps a player in step with the channel — and, for whoever may drive, lets
 * that player's own controls move the channel instead.
 *
 * **The rules are not here.** `followInstructions` decides what to say to a
 * player and `contradictionFrom` decides whether a player is out of step in a
 * way neither of them caused; this carries the memory neither may keep — and
 * the half-second of patience that turns a disagreement into a press. That
 * memory is five things: when this follower last spoke to the player, what
 * the last tick saw, which disagreement is standing, which press is in the
 * air, and whether the app was being looked at a tick ago.
 *
 * The seek bookkeeping cannot live in core, which has no memory, and must not
 * live in the channel, which would be six devices writing one field — so each
 * follower remembers its own.
 */
export function useFollow(
  watch: WatchState,
  port: PlayerPort | null,
  /** Paused when this device is not meant to be showing anything. */
  active: boolean,
  drive?: Drive
): void {
  const seekedAt = useRef<number | null>(null);
  const commandedAt = useRef<number | null>(null);
  const previous = useRef<PlayerHistory | null>(null);
  const pending = useRef<{ intent: WatchIntent; at: number } | null>(null);
  const standing = useRef<{ intent: WatchIntent; since: number } | null>(null);
  const spokeAt = useRef<number | null>(null);
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
      const full: PlayerReading = {
        ...reading,
        seekedAt: seekedAt.current,
        commandedAt: commandedAt.current,
      };
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
      const active_ = AppState.currentState === 'active';
      const watching = active_ && attentive.current;
      attentive.current = active_;

      // A press still in the air. Nothing is said to the player and nothing
      // is read as a further act until the channel has answered or the
      // window has run out — see `INTENT_SETTLE_MS`.
      if (pending.current) {
        const settled =
          answered(pending.current.intent, current, now) ||
          now - pending.current.at > INTENT_SETTLE_MS;
        previous.current = here;
        if (!settled) return;
        pending.current = null;
      }

      // Two readings a tick apart are comparable and two readings a minute
      // apart are not — see `READINGS_COMPARABLE_MS`. A gap this wide leaves
      // the player to be corrected in the ordinary way and starts the
      // comparison again from here.
      const comparable =
        previous.current !== null &&
        now - previous.current.at <= READINGS_COMPARABLE_MS;

      const quiet =
        spokeAt.current === null || now - spokeAt.current > INTENT_QUIET_MS;

      /*
        **Just after this follower has spoken, it watches and says nothing.**

        See `INTENT_QUIET_MS`. Correcting in here is correcting away the press
        that has not been read yet, and the person who made it presses again,
        which starts the window over. Only a screen that may drive is silent:
        for everybody else there is no press to protect and the ordinary
        correction is the whole job.
      */
      if (may?.mayControl && watching && !quiet) {
        standing.current = null;
        previous.current = here;
        return;
      }

      /*
        **A disagreement, and then the same disagreement again.**

        `contradictionFrom` answers whether this player is out of step in a
        way neither the channel nor this follower caused; whether it was
        *meant* is whether it is still true a tick later, which is the one
        thing a blip cannot manage. While a candidate stands the player is
        left alone — correcting it inside the dwell would undo the very press
        being waited on, which is the defect this whole mechanism exists to
        fix, arriving half a second late.
      */
      if (may?.mayControl && watching && comparable && quiet) {
        const held = standing.current;
        /*
          **A scrub proves itself by the gap it left, not by jumping twice.**

          A play or a pause is a state that goes on disagreeing, so the second
          look is the same look. A jump is not: the reading after a scrub is
          continuous with the one before it, so `contradictionFrom` — which
          finds a scrub by comparing a reading against its predecessor — sees
          nothing the second time, every time. A held scrub therefore answers
          to the gap between the player and the channel instead, which a thumb
          leaves open and a one-tick lie does not. See `scrubStands`.

          **And to the gap alone**, rather than to whichever question answers
          yes. A lie that goes out and comes back is two jumps, and the
          journey home is a fresh candidate of the same kind as the one being
          waited on — so a confirmation that took either would take the blip
          for the very press it exists to rule out.
        */
        const candidate =
          held?.intent.do === 'seek'
            ? scrubStands(current, full, now)
            : contradictionFrom(current, full, previous.current, now);
        if (candidate) {
          const same = held !== null && held.intent.do === candidate.do;
          if (!same) {
            standing.current = { intent: candidate, since: now };
            previous.current = here;
            return;
          }
          if (now - held.since < INTENT_DWELL_MS) {
            previous.current = here;
            return;
          }
          // A scrub reports the position it has reached rather than the one
          // it was first seen at: the film has been running for the dwell,
          // and sending where it was is sending the party a tick behind.
          standing.current = null;
          pending.current = { intent: candidate, at: now };
          spokeAt.current = now;
          previous.current = here;
          may.onIntent(candidate);
          return;
        }
      }
      // Nothing standing any more: either it went away by itself, which is
      // what a blip does, or this tick is not one that may read a press.
      standing.current = null;
      previous.current = here;

      for (const instruction of followInstructions(current, full, now)) {
        if (instruction.do === 'play') {
          commandedAt.current = now;
          player.play();
        } else if (instruction.do === 'pause') {
          commandedAt.current = now;
          player.pause();
        } else {
          // Stamped before the call rather than after it, so that a seek which
          // takes a moment to be accepted is still inside its own settle
          // window. The window is what stops the storm; starting it late is
          // starting it after the tick that would re-issue.
          seekedAt.current = now;
          player.seek(instruction.positionMs);
        }
      }
    };
    const timer = setInterval(tick, FOLLOW_TICK_MS);
    tick();
    return () => clearInterval(timer);
  }, [active]);
}

/** Whether the channel has come back saying what the press asked for. */
function answered(
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
