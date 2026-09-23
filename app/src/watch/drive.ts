import { useEffect, useRef } from 'react';
import { recordEvent } from '../audio/diagnostics';
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
  /**
   * Build this player again, for a frame that has stopped answering.
   *
   * **The gesture somebody had to discover for themselves, wired up.** The
   * only reliable cure for a picture that will not resume has been to rotate
   * the phone — which expands or collapses it, and mounts a fresh player on
   * the way — and a cure that is a rotation is a cure nobody finds twice.
   *
   * Optional because *how* to rebuild is the platform's business and one of
   * them may not be able to: the web player owns an element it did not make.
   * When to is decided here, which is `DEAF_AFTER` below.
   */
  recover?: () => void;
}

/**
 * How many instructions may be ignored in a row before the player is rebuilt.
 *
 * **An instruction ignored once is ordinary and three times is a fault.** A
 * player that is merely slow answers inside one `WATCH_OBEDIENCE_MS`; a player
 * that is buffering is told nothing at all, so it cannot reach this at any
 * speed — `followInstructions` returns nothing while a stall is settling, and
 * the fuse is only spent on a player that is reporting a state it has been
 * told to leave. Three of those is a frame that is hearing and not acting.
 *
 * Three fuses is around six seconds, which is long enough that no ordinary
 * embed reaches it and short enough that somebody who has pressed Play is
 * still looking at the screen when the picture comes back.
 */
const DEAF_AFTER = 3;

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
  /**
   * When this player started buffering and did not stop, or null.
   *
   * **A clock, which is why it is here**: `core/watch.ts` decides what a long
   * stall means and this file is the only one that may keep how long one has
   * been going. It is cleared by any other state — a player that played for a
   * tick has demonstrably recovered — and restarted whenever a stalled player
   * is told something, so the nudge is one per `WATCH_STALL_MS` rather than
   * one per tick. See `followInstructions`, which is where the storm this
   * avoids is written down.
   */
  const buffering = useRef<number | null>(null);
  /**
   * How many instructions this player has been given and not acted on.
   *
   * Reset by any arrival, so it counts a *run* of refusals rather than a
   * tally: a player that obeys and later stumbles starts again from nothing.
   * See `DEAF_AFTER`.
   */
  const ignored = useRef(0);
  /**
   * What the room wanted at the last tick, so that a change can be seen.
   *
   * **The one thing a follower cannot read off a player.** Everything else
   * here is a fact about the embed; this is a fact about the people, and the
   * difference between a correction the follower decided to make and an
   * answer somebody just gave is the whole of what `urgent` means. See
   * `followInstructions`.
   */
  const wanted = useRef<Desired['status'] | null>(null);
  const latest = useRef({ watch, port });
  latest.current = { watch, port };
  /** The running loop's own tick, so a press can ring it. See below. */
  const run = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const { watch: current, port: player } = latest.current;
      if (!player) return;
      const reading = player.read();
      if (!reading) return;
      const now = Date.now();
      /*
        Kept before every early return below, and deliberately: a player that
        is buffering while the follower is deaf — waiting out an instruction,
        or holding off an advert — is still buffering, and a clock that only
        ran when somebody was looking would never reach the threshold it is
        for.
      */
      if (reading.state !== 'buffering') buffering.current = null;
      else if (buffering.current === null) buffering.current = now;
      const want = desiredFor(current, now);
      if (!want) return;

      /*
        **An advert is a different video in the same frame.** Nothing is said
        to a player that is not showing the film: its clock is the advert's,
        so correcting it would seek the advert. They end by themselves. See
        `showingTheFilm`.
      */
      if (!showingTheFilm(current, reading)) return;

      /*
        **A press spends every kind of patience this file keeps.**

        Two of them, and build 277 was caught by both at once. The stall
        window is one — see `urgent` in `followInstructions`. The other is
        right below: an instruction that has been sent and not arrived is
        waited out for `WATCH_OBEDIENCE_MS`, and that wait was being served
        even when the room had since asked for the opposite. Pressing Play
        within a fuse of a pause meant waiting out the pause's fuse first,
        for an instruction nobody wanted any more.
      */
      const urgent = wanted.current !== null && wanted.current !== want.status;
      wanted.current = want.status;

      const state = doing.current;
      if (state.phase === 'sending' && urgent) {
        // Abandoned rather than waited out: what it was sent for is no longer
        // what anybody wants, so its arrival would prove nothing and its
        // fuse is time spent on a question that has been withdrawn.
        doing.current = { phase: 'watching' };
        ignored.current = 0;
      } else if (state.phase === 'sending') {
        if (hasArrived(reading, state.want)) {
          /*
            **How long the player took, which is the number this is all
            about.** An impression of flakiness is not a measurement, and the
            two things that would change it — the tick that no longer waits
            for the interval, and whatever the audio session turns out to be
            doing — can only be judged against one. Measured from the
            instruction rather than from the press, the round trip being the
            server's business and visible in the log either way.
          */
          recordEvent(
            `watch ${state.want.status} after ${now - state.since}ms`
          );
          doing.current = { phase: 'watching' };
          ignored.current = 0;
          return;
        }
        // The fuse, for a player that is never going to arrive — an embed
        // that has lost its way, or one still fetching long past a stall.
        // See `WATCH_OBEDIENCE_MS`.
        if (now - state.since <= WATCH_OBEDIENCE_MS) return;
        doing.current = { phase: 'watching' };
        /*
          **Only a steady state counts as a refusal, which the first log from
          a phone corrected this on.**

          `hasArrived` is false for `unstarted` and for `buffering`
          unconditionally, and rightly: neither is where anything was asked
          to be. But neither is a refusal either — a cued player has not
          begun, and a buffering one is on its way — so counting them made
          two ordinary things look like disobedience. A party paused with a
          freshly built player sits at `unstarted` for as long as nobody
          presses anything, and a resume that takes longer than the fuse
          spends another. Build 276 reached two inside twenty seconds of an
          entirely healthy party, which is one short of rebuilding a picture
          that had nothing wrong with it, in front of somebody who had just
          pressed Play.

          What is left is the case this was written for: a player reporting a
          settled `playing` or `paused` that contradicts what it was told,
          which is the latched frame and nothing else.
        */
        const refusing =
          reading.state !== 'unstarted' && reading.state !== 'buffering';
        if (refusing) {
          ignored.current += 1;
          recordEvent(
            `watch ignored ${state.want.status} x${ignored.current} ` +
              `(player ${reading.state})`
          );
        }
        /*
          **Rebuilt, rather than told the same thing a fourth time.**

          Everything this follower can say to a player it has already said,
          and the one thing that has ever brought such a player back is a new
          one — see `PlayerPort.recover`. So the retry stops being a retry at
          `DEAF_AFTER` and becomes a rebuild, and the counter is cleared so
          the fresh player is judged on its own behaviour rather than on the
          one it replaced.

          The instruction is not issued in the same tick: there is nothing
          left to issue it to, and the next tick will find a player that has
          not begun and position it properly, which is the path a screen
          arriving at a party already takes.
        */
        if (refusing && ignored.current >= DEAF_AFTER && player.recover) {
          ignored.current = 0;
          buffering.current = null;
          recordEvent('watch rebuilding the player');
          player.recover();
          return;
        }
      }

      if (hasArrived(reading, want)) return;

      const instructions = followInstructions(
        current,
        reading,
        now,
        buffering.current === null ? 0 : now - buffering.current,
        urgent
      );
      if (instructions.length === 0) return;
      // The stall clock restarts with the instruction, so a player that is
      // never going to play is prodded once a window rather than every tick.
      if (buffering.current !== null) buffering.current = now;
      doing.current = { phase: 'sending', want, since: now };
      /*
        **One line per instruction, and they are rare.** Nothing is said to a
        player that is where it should be, so this is quiet on an ordinary
        party and loud exactly when somebody is complaining — which is the
        only shape of log worth shipping. It interleaves with the audio
        session's own lines in `diagnostics.ts`, and that interleaving is the
        measurement: a command issued in the same instant as a category change
        is the thing to look for.
      */
      recordEvent(
        `watch tell ${instructions.map((i) => i.do).join('+')} ` +
          `(player ${reading.state} at ${Math.round(
            (reading.positionMs ?? 0) / 1000
          )}s, want ${want.status} at ${Math.round(want.positionMs / 1000)}s)`
      );
      for (const instruction of instructions) {
        if (instruction.do === 'play') player.play();
        else if (instruction.do === 'pause') player.pause();
        else player.seek(instruction.positionMs);
      }
    };
    run.current = tick;
    const timer = setInterval(tick, FOLLOW_TICK_MS);
    tick();
    return () => {
      clearInterval(timer);
      run.current = null;
    };
  }, [active]);

  /*
    **The press, answered in the frame it lands in rather than at the next
    tick.**

    A press is not a command to your own player: it goes to the server, comes
    back as a snapshot, and only then is there anything for this follower to
    notice. Noticing it on the interval alone added the rest of a
    `FOLLOW_TICK_MS` window to every play and every pause — a quarter of a
    second on average and half a second at worst, on top of a round trip, for
    no reason other than that nothing woke the loop up.

    So the transport wakes it. `status`, `startedAt` and `positionMs` are the
    whole of what a press can change; anything else that moves is the
    interval's business. The tick is the same one, with the same guards, so
    this cannot say anything the loop would not have said half a second later.
  */
  useEffect(() => {
    run.current?.();
  }, [active, watch.status, watch.startedAt, watch.positionMs]);
}
