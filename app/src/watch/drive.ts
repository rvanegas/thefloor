import { useEffect, useRef } from 'react';
import { followInstructions } from '../../../core/watch';
import type { PlayerReading, PlayerState } from '../../../core/watch';
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
 * Keeps a player in step with the channel.
 *
 * **The rule is not here.** `followInstructions` decides what to do and this
 * only does it — which is the whole reason the arithmetic moved into core: a
 * shared clock followed by three implementations is one rule or it is three,
 * and it was on its way to being three.
 *
 * The seek bookkeeping is the one piece of state a follower keeps for itself.
 * It cannot live in core, which has no memory, and it must not live in the
 * channel, which would be six devices writing one field — so each follower
 * remembers when it last issued a correction, and `correctionFor` is told.
 */
export function useFollow(
  watch: WatchState,
  port: PlayerPort | null,
  /** Paused when this device is not meant to be showing anything. */
  active: boolean
): void {
  const seekedAt = useRef<number | null>(null);
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
      const full: PlayerReading = { ...reading, seekedAt: seekedAt.current };
      for (const instruction of followInstructions(current, full, now)) {
        if (instruction.do === 'play') player.play();
        else if (instruction.do === 'pause') player.pause();
        else {
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
