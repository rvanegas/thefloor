import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import {
  followInstructions,
  intentFrom,
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
 * player and `intentFrom` decides what a player has just been told by its
 * owner; this only carries the memory neither of them may keep. That memory
 * is three things: when this follower last issued a correction, what the last
 * tick saw, and which press is still in the air.
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
  const previous = useRef<PlayerHistory | null>(null);
  const pending = useRef<{ intent: WatchIntent; at: number } | null>(null);
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
      const full: PlayerReading = { ...reading, seekedAt: seekedAt.current };
      const here: PlayerHistory = {
        state: reading.state,
        positionMs: reading.positionMs,
        at: now,
        status: current.status,
        channelPositionMs: watchPositionMs(current, now),
      };

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

      /*
        **A press is only a press while somebody is looking at it.** iOS stops
        a video the moment the app goes behind something else, and a phone
        going into a pocket reporting that as a pause would stop the film for
        the whole room. The same guard covers the web tab losing focus, which
        does the same thing for the same reason.
      */
      if (may?.mayControl && AppState.currentState === 'active') {
        const intent = intentFrom(current, full, previous.current, now);
        if (intent) {
          pending.current = { intent, at: now };
          previous.current = here;
          may.onIntent(intent);
          return;
        }
      }
      previous.current = here;

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
