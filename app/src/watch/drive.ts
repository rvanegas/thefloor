import { useEffect, useRef } from 'react';
import { recordEvent } from '../audio/diagnostics';
import { forgetDrift, publishDrift } from './drift';
import { onPress, startHolding, subscribeStart } from './filmStart';
import {
  RUNG_NAMES,
  desiredFor,
  giveUp,
  inPlace,
  initialFollow,
  showingTheFilm,
  stepFollow,
} from '../../../core/watch';
import type {
  Desired,
  Follow,
  PlayerReading,
  Rest,
  WatchInstruction,
} from '../../../core/watch';
import { WATCH_DRIFT_MS, WATCH_PRESS_HOLD_MS } from '../../../core/constants';
import type { WatchState } from '../../../core/types';

/**
 * How often a follower re-reads its player and the clock.
 *
 * Twice a second, well inside every deadline on the ladder. What this catches
 * is not drift — nothing corrects that — but a player that stalled to buffer,
 * which nothing reports, a deadline running out, which nothing announces, and
 * a duration turning up.
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
 * API has loaded, after it has gone away, or when its last reading is too old
 * to believe. A follower that goes on getting null rebuilds the page.
 *
 * `recover` rebuilds the page, and answers whether it did: a rebuild is
 * rationed, and refused outright for a video YouTube has refused. Absent where
 * a player cannot be rebuilt, and then the ladder gives up a rung sooner.
 */
export interface PlayerPort {
  read: () => PlayerReading | null;
  play: () => void;
  pause: () => void;
  seek: (positionMs: number) => void;
  recover?: () => boolean;
}

/**
 * Keeps a player in step with the channel.
 *
 * **The rules are not here.** `stepFollow` in core/watch.ts decides, on each
 * tick, whether the follower may rest and what to say when it may not — the
 * ladder of planning/decision/2026-10-03-the-follower-rests-only-on-agreement.md.
 * This file owns what the rule may not keep: the clock, the player, which
 * player has been placed, a press made here, and the instrument.
 *
 * **Every player follows presses, and none is kept to the room's clock**,
 * since 2026-10-03 — planning/decision/2026-10-03-nobody-corrects-drift.md.
 * A press on this device tells this player at once, before the server has
 * heard of it. Drift is published, for a `debug` account's readout, and acted
 * on by nobody; a player is seeked only to be *placed* — arriving at a party,
 * rebuilt, back from an advert, or after the room jumped — and to be rescued
 * on the ladder's third rung.
 */
export function useFollow(
  watch: WatchState,
  port: PlayerPort | null,
  /** Paused when this device is not meant to be showing anything. */
  active: boolean,
  /**
   * What time the room thinks it is, which is **not** this device's wall clock.
   *
   * `watch.startedAt` is stamped by the server, so deriving a position from
   * `Date.now()` compares two clocks with no conversion between them and is
   * wrong by exactly this device's skew — unbounded, settable by hand, and
   * different on every phone. `Picture.tsx` hands `app.serverNow()` here.
   *
   * It defaults to `Date.now` for the harness, where the channel is reduced off
   * the same fake clock and the two are the same number by construction. That
   * default is also why the fault survived as long as it did: a test with one
   * clock cannot see a disagreement between two.
   */
  clock: () => number = Date.now,
  /**
   * Which room this is, published with every reading so an instrument can tell
   * a stale one from a current one. Omitted where nothing is watching.
   */
  channelId?: string,
  /**
   * Told when the ladder reaches its top and when it leaves it, so the
   * picture can say that this device has stopped trying. Rung 4 is the one
   * rest that is not agreement, and it is never silent.
   */
  onGiveUp?: (given: boolean) => void
): void {
  /** Where the follower is on the ladder. See `Follow`. */
  const follow = useRef<Follow>(initialFollow());
  /**
   * The player that has been seen where the room is, or null.
   *
   * Cleared when the room's position jumps and when the frame shows an
   * advert, and set only by observing the player in place (`inPlace`) — never
   * by having sent the seek, since a seek can be lost. A new port is a new
   * player and is unplaced by being a different object.
   */
  const placed = useRef<PlayerPort | null>(null);
  /**
   * How many times the room's position has jumped, which is half of the
   * ladder's key: a scrub, ±15s or a replay starts the climb again with the
   * seek it owes, and a play or a pause, which move nothing, do not.
   */
  const jumps = useRef(0);
  /**
   * The transport and where it put the room, at the last tick, so that a jump
   * can be told from the clock running. A play or a pause changes the
   * transport without moving the room; a scrub or a replay moves it.
   */
  const previous = useRef<{
    key: string;
    want: Desired;
    at: number;
  } | null>(null);
  /**
   * A press this device has carried out on its own player, until the room
   * agrees with it or `WATCH_PRESS_HOLD_MS` passes.
   *
   * **The room is what the follower follows, and this stands in for it while
   * the room catches up.** The player is told at the press and the room hears
   * a round trip later, so for that long the press *is* what is wanted here;
   * without it the next tick would see a playing player under a paused room
   * and pause it. A press the room never takes up — refused, or lost on the
   * way — expires, and the room's answer is followed back.
   */
  const pressed = useRef<{ status: Desired['status']; at: number } | null>(
    null
  );
  /**
   * How long this player last took to obey, per kind of instruction, for the
   * readout. Nothing steers on it any more — it was the lead on a drift
   * correction — but it is still the number that says whether a slow resume
   * is the embed or the session.
   */
  const lag = useRef<{ play: number | null; seek: number | null }>({
    play: null,
    seek: null,
  });
  /** The last thing said to this player, until it does it. */
  const told = useRef<{
    at: number;
    status: Desired['status'];
    kinds: Array<WatchInstruction['do']>;
  } | null>(null);
  /**
   * Seeks issued since this run began, which is what the instrument draws.
   * Reset when the room asks for `playing` having wanted something else — one
   * press, one count.
   */
  const seeks = useRef(0);
  /** The status asked for at the last tick, for the reset above. */
  const wanted = useRef<Desired['status'] | null>(null);
  /** Whether rung 4 has been reported, so `onGiveUp` hears each edge once. */
  const given = useRef(false);
  const latest = useRef({ watch, port, clock, channelId, onGiveUp });
  latest.current = { watch, port, clock, channelId, onGiveUp };
  /** The running loop's own tick, so a press can ring it. See below. */
  const run = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const { watch: current, port: player, clock: roomNow } = latest.current;
      const now = roomNow();
      const room = desiredFor(current, now);
      if (!room) return;
      /*
        **No port is no reading**, but only once a climb is under way: a page
        being rebuilt has no port until it is ready again, and the ladder's
        deadline has to go on running under it. A page that has never been
        ready is not the follower's to judge.
      */
      if (!player && follow.current.rung === null) return;
      const reading = player ? player.read() : null;

      if (reading) {
        const said = told.current;
        if (said && reading.state === said.status) {
          const took = now - said.at;
          for (const kind of said.kinds) {
            if (kind === 'play' || kind === 'seek') lag.current[kind] = took;
          }
          told.current = null;
        }
      }

      /*
        **A jump is the room's position moving other than with its clock.**
        Compared only when the transport itself changed, since between presses
        the position moves with the clock by construction — and at the end of a
        film it stops while the clock does not, which is not a jump either.
      */
      const roomKey = `${current.status}|${current.startedAt}|${current.positionMs}`;
      const before = previous.current;
      if (before && before.key !== roomKey) {
        const expected =
          before.want.positionMs +
          (before.want.status === 'playing' ? now - before.at : 0);
        if (Math.abs(room.positionMs - expected) > WATCH_DRIFT_MS) {
          jumps.current += 1;
          placed.current = null;
        }
      }
      previous.current = { key: roomKey, want: room, at: now };

      /*
        **What is wanted here: the room, or a press made here that the room
        has not caught up with.** The press is spent when the room agrees, or
        when it has waited long enough that the room plainly never will.
      */
      const ahead = pressed.current;
      if (ahead && (room.status === ahead.status || now - ahead.at > WATCH_PRESS_HOLD_MS)) {
        pressed.current = null;
      }
      const want: Desired = pressed.current
        ? { status: pressed.current.status, positionMs: room.positionMs }
        : room;
      if (want.status === 'playing' && wanted.current !== 'playing') {
        seeks.current = 0;
      }
      wanted.current = want.status;

      const advert = reading !== null && !showingTheFilm(current, reading);
      /*
        **The film coming back from an advert is a player to be placed
        again.** The room's clock ran through it and the film resumes wherever
        it was, so a screen that sat through a pre-roll comes back that far
        behind. That is not drift but an interruption nobody in the room asked
        for, met as a rebuild is, with one seek.
      */
      if (advert) placed.current = null;
      if (reading && player && !advert && inPlace(reading, want)) {
        placed.current = player;
      }

      const step = stepFollow(follow.current, {
        want,
        key: `${want.status}|${jumps.current}`,
        reading,
        advert,
        placed: player !== null && placed.current === player,
        holding: startHolding(),
        canRebuild: player?.recover !== undefined,
        now,
      });
      follow.current = step.follow;

      if (step.climbed) {
        recordEvent(
          `watch rung ${step.climbed.to} (${RUNG_NAMES[step.climbed.to]}): ` +
            step.climbed.why
        );
      }
      /*
        **The one line that measures a press**, and the walk's pass mark:
        `watch playing after Nms`, from the first instruction to the player
        observed agreeing. Written in the same words since 2026-09-23 so that
        a journal from before the ladder reads against one from after it.
      */
      if (step.agreedAfterMs !== null) {
        recordEvent(`watch ${want.status} after ${step.agreedAfterMs}ms`);
      }
      if (step.rebuild && !(player?.recover?.() ?? false)) {
        follow.current = giveUp(follow.current, now);
        recordEvent(`watch rung 4 (${RUNG_NAMES[4]}): the rebuild was refused`);
      }

      const atTop = follow.current.rung === 4;
      if (atTop !== given.current) {
        given.current = atTop;
        latest.current.onGiveUp?.(atTop);
      }

      if (player && step.instructions.length > 0) {
        told.current = {
          at: now,
          status: want.status,
          kinds: step.instructions.map((i) => i.do),
        };
        /*
          **Said only when something is said**, so this is quiet on an ordinary
          party and loud exactly when somebody is complaining. It interleaves
          with the audio session's own lines in `diagnostics.ts`, and that
          interleaving is the measurement: a command issued in the same instant
          as a category change is the thing to look for. Positions to ten
          milliseconds, since whole seconds leave a drift anywhere between
          100ms and 1.9s.
        */
        recordEvent(
          `watch tell ${step.instructions.map((i) => i.do).join('+')} ` +
            `(player ${reading?.state ?? 'silent'} at ${(
              (reading?.positionMs ?? 0) / 1000
            ).toFixed(2)}s, want ${want.status} at ` +
            `${(want.positionMs / 1000).toFixed(2)}s)`
        );
        for (const instruction of step.instructions) {
          if (instruction.do === 'play') player.play();
          else if (instruction.do === 'pause') player.pause();
          else {
            seeks.current += 1;
            player.seek(instruction.positionMs);
          }
        }
      }

      publish(reading, want, step.rest, now);
    };

    /*
      **Published on every tick, healthy or not**, so an instrument is live on
      a party that is working rather than only on one that is not.
    */
    const publish = (
      reading: PlayerReading | null,
      want: Desired,
      rest: Rest | null,
      now: number
    ) => {
      const where = latest.current.channelId;
      if (where === undefined) return;
      const f = follow.current;
      const buffering = f.bufferingSince;
      publishDrift({
        channelId: where,
        driftMs:
          reading?.positionMs == null ? null : reading.positionMs - want.positionMs,
        playerState: reading?.state ?? 'unstarted',
        wantStatus: want.status,
        bufferingForMs:
          reading?.state === 'buffering' && buffering !== null ? now - buffering : 0,
        lagPlayMs: lag.current.play,
        lagSeekMs: lag.current.seek,
        seeksThisRun: seeks.current,
        rung: f.rung,
        rest,
        rungForMs: f.rung === null ? 0 : now - f.since,
        at: now,
      });
    };

    run.current = tick;
    const timer = setInterval(tick, FOLLOW_TICK_MS);
    /*
      **A press on this device is wanted here at once**, before the round trip.
      The room still decides: `pressed` stands in for it until it answers, and
      the tick that follows carries the press out — or, for a Play that is
      releasing this device's microphone first, waits for the session, which
      `subscribeStart` rings it again for.
    */
    const unpressed = onPress((status) => {
      pressed.current = { status, at: latest.current.clock() };
      tick();
    });
    const unstarted = subscribeStart(() => {
      if (!startHolding()) tick();
    });
    tick();
    return () => {
      clearInterval(timer);
      unpressed();
      unstarted();
      pressed.current = null;
      run.current = null;
      follow.current = initialFollow();
      if (given.current) {
        given.current = false;
        latest.current.onGiveUp?.(false);
      }
      // A reading nobody is producing any more must not go on being drawn: a
      // stale drift is indistinguishable from a settled one.
      forgetDrift();
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
