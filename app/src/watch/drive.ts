import { useEffect, useRef } from 'react';
import {
  desiredFor,
  followInstructions,
  hasArrived,
  showingTheFilm,
} from '../../../core/watch';
import type { Desired, PlayerReading } from '../../../core/watch';
import { WATCH_OBEDIENCE_MS } from '../../../core/constants';
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
 * What this follower is waiting for, and it is only ever one thing.
 *
 * **There is no longer anything to decide, which is the whole of the
 * 2026-09-18 repair.** This file held four phases and a reader of presses,
 * because the video's own bar was an input surface on the same player the
 * channel drives as an output surface — and the IFrame API will not say what
 * caused a state change, so a follower could not tell somebody's thumb from
 * the echo of its own command. Every arrangement built to separate the two
 * separated them by time, and each one traded a misread against a swallowed
 * press; the last swallowed every scrub.
 *
 * `controls: 0` took the surface away. Nothing here reads the player as an
 * instruction any more — it is told things and nothing else — so the only
 * state worth keeping is whether it has done the last thing it was told.
 *
 * - **`watching`** — the player is where the channel wants it, and there is
 *   nothing to say.
 * - **`sending`** — it has been told something and has not arrived yet. This
 *   is not about intent: it is what stops the same correction being issued
 *   every tick while the player is still on its way, which is the seek storm.
 */
type Doing =
  | { phase: 'watching' }
  | { phase: 'sending'; want: Desired; since: number };

/**
 * Keeps a player in step with the channel.
 *
 * **The rules are not here.** `followInstructions` decides what to say to a
 * player and `hasArrived` says when it has done it; this owns the clock and
 * the one thing neither may keep, which is whether an instruction is still
 * outstanding.
 */
export function useFollow(
  watch: WatchState,
  port: PlayerPort | null,
  /** Paused when this device is not meant to be showing anything. */
  active: boolean
): void {
  const doing = useRef<Doing>({ phase: 'watching' });
  const latest = useRef({ watch, port });
  latest.current = { watch, port };

  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const { watch: current, port: player } = latest.current;
      if (!player) return;
      const reading = player.read();
      if (!reading) return;
      const now = Date.now();
      const want = desiredFor(current, now);
      if (!want) return;

      /*
        **An advert is a different video in the same frame.** Nothing is said
        to a player that is not showing the film: its clock is the advert's,
        so correcting it would seek the advert. They end by themselves. See
        `showingTheFilm`.
      */
      if (!showingTheFilm(current, reading)) return;

      const state = doing.current;
      if (state.phase === 'sending') {
        if (hasArrived(reading, state.want)) {
          doing.current = { phase: 'watching' };
          return;
        }
        // The fuse, for a player that is never going to arrive — an embed
        // that has lost its way, or one still fetching long past a stall.
        // See `WATCH_OBEDIENCE_MS`.
        if (now - state.since <= WATCH_OBEDIENCE_MS) return;
        doing.current = { phase: 'watching' };
      }

      if (hasArrived(reading, want)) return;

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
