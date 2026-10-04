import { useEffect, useRef } from 'react';
import { recordEvent } from '../audio/diagnostics';
import { forgetDrift, publishDrift } from './drift';
import { onPress, startHolding, subscribeStart } from './filmStart';
import {
  desiredFor,
  followInstructions,
  hasArrived,
  showingTheFilm,
} from '../../../core/watch';
import type {
  Desired,
  PlayerReading,
  WatchInstruction,
} from '../../../core/watch';
import {
  WATCH_DRIFT_MS,
  WATCH_OBEDIENCE_MS,
  WATCH_STALL_MS,
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

/*
  **This file rebuilt a player that would not obey, between 2026-09-23 and the
  same evening, and does not any more.**

  It was written when *stuck, will not resume, rotating unsticks it* had no
  explanation: rotating was the only known cure, rotating rebuilt the player,
  so the follower was taught to rebuild one after three ignored instructions.
  It was a guess at a cure for a fault nobody had found.

  The fault was then found, and it was two of this file's own rules serving
  patience to a person instead of to a player — see `urgent`. With those
  fixed, nineteen presses across two routes produced no ignored instruction at
  all, so the rebuild was machinery standing over a fault that no longer
  happens, waiting to fire on a false positive. The one thing that still
  rebuilds a player is `onContentProcessDidTerminate`, which is iOS announcing
  a death rather than this file guessing at one.
*/

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
  active: boolean,
  /**
   * What time the room thinks it is, which is **not** this device's wall clock.
   *
   * `watch.startedAt` is stamped by the server, so deriving a position from
   * `Date.now()` compares two clocks with no conversion between them and is
   * wrong by exactly this device's skew — unbounded, settable by hand, and
   * different on every phone. What that bought was a follower steering two
   * screens *apart* by their clock difference while the scrubber a component
   * away read correctly, both of them answering one question: `Picture.tsx` and
   * `ChannelView.tsx` have always used `app.serverNow()` here.
   *
   * It defaults to `Date.now` for the harness, where the channel is reduced off
   * the same fake clock and the two are the same number by construction. That
   * default is also why the fault survived: a test with one clock cannot see a
   * disagreement between two.
   */
  clock: () => number = Date.now,
  /**
   * Which room this is, published with every reading so an instrument can tell
   * a stale one from a current one. Omitted where nothing is watching.
   */
  channelId?: string
): void {
  /*
    **Every player follows presses, and none is kept to the room's clock**,
    since 2026-10-03 — what an account with `debug` alone had until then. See
    planning/decision/2026-10-03-nobody-corrects-drift.md.

    - **A press on this device tells this player at once**, before the server
      has heard of it — see `onPress` below, and the hold that stops the
      follower undoing it while the room catches up.
    - **Nothing keeps it to the room's clock.** It is not seeked for drift, nor
      for a pause that banked a position it had not reached. It plays and
      pauses where it is, and arrival is judged by state alone. Drift is
      published, for a `debug` account's readout, and acted on by nobody.

    **What is still seeked is a seek somebody asked for** — a scrub, ±15s, a
    replay, which move the room's position rather than letting it run — **a
    player that has never been placed**, one arriving at a party under way or
    rebuilt, **and a player rescued from a stall that has outlived
    `WATCH_STALL_MS`**, that `seek+play` being the one thing that has ever
    moved a wedged player.
  */
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
   * When this buffering player was last given a cold nudge, or null.
   *
   * **A second clock, so that a nudge does not reset the first.** The nudge
   * comes every `WATCH_COLD_NUDGE_MS`, and while it restarted `buffering` the
   * stall window never closed: on build 327 a wedged player got `play` five
   * times in 23 seconds and never the `seek+play` backstop.
   */
  const knocked = useRef<number | null>(null);
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
  /**
   * How long this player last took to obey, per kind of instruction.
   *
   * **The one thing a correction needs and nothing measured until now.** A
   * seek lands where it was aimed a latency ago, and the transport is a wall
   * clock that ran the whole time — so a correction to *where the room is*
   * arrives exactly this far behind it, which is why a slow player was seeked
   * once a fuse for ever and never arrived. `followInstructions` takes it as a
   * lead; the rule decides what to do with it and this file is what may keep a
   * clock.
   *
   * Kept per kind rather than as one number because the two differ by a factor
   * of two, and the lead is spent on a seek. Null until this player has
   * demonstrated something: nothing here guesses, and a lead of zero is the
   * behaviour that shipped.
   */
  const lag = useRef<{ play: number | null; seek: number | null }>({
    play: null,
    seek: null,
  });
  /**
   * Whether the buffering this player is doing began from a standstill.
   *
   * A stall mid-film is filling a buffer it will finish; a player that was told
   * to play and went straight to `buffering` may never have started at all, and
   * the two are the same reading. Recorded when the buffering begins, which is
   * the only moment the difference is visible. See `WATCH_COLD_NUDGE_MS`.
   */
  const standstill = useRef(false);
  /** The last state read, which is how `standstill` knows what came before. */
  const seen = useRef<PlayerReading['state'] | null>(null);
  /**
   * The last thing said to this player, until it does it.
   *
   * Cleared the moment the player reaches the state it was asked for, which is
   * when `lag` learns what that cost. See where it is set.
   */
  const told = useRef<{
    at: number;
    status: Desired['status'];
    kinds: Array<WatchInstruction['do']>;
  } | null>(null);
  // The clock rides here with the other two so that the loop, which is keyed on
  // `active` alone, cannot close over a stale one — and so that a caller passing
  // a fresh closure on every render does not have to be stable for this to work.
  /**
   * Seeks issued since this run began, which is what the instrument draws.
   *
   * Reset when the room asks for `playing` having wanted something else — one
   * press, one count — so the number answers *did this resume need correcting*
   * rather than *has this party ever been corrected*. See `DriftReading`.
   */
  const seeks = useRef(0);
  /**
   * The player that has been put where the room is, or null.
   *
   * **What separates positioning a player from correcting one**, the second
   * being what nothing does any more. Cleared when the room's position jumps,
   * and set when a seek is sent or the player is seen in step — so a new
   * player, a rebuilt one or a scrub each get one seek, and nothing after it
   * does. One rather than *until it arrives*: a seek that lands a little off
   * and is followed by another is exactly the drift correction that was
   * retired.
   */
  const placed = useRef<PlayerPort | null>(null);
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
   * A press this device has already carried out on its own player, until the
   * room agrees with it.
   *
   * **Without it the follower undoes the press.** The player is told at once
   * and the room hears a round trip later, so for that long a tick sees a
   * playing player under a paused room and pauses it — the press flickering
   * on and off. Held for `WATCH_OBEDIENCE_MS` at most: a press the room never
   * takes up (refused, or lost on the way) is then followed back, since the
   * room is still what every other screen is showing.
   */
  const pressed = useRef<{ status: Desired['status']; at: number } | null>(
    null
  );
  const latest = useRef({ watch, port, clock, channelId });
  latest.current = { watch, port, clock, channelId };
  /** The running loop's own tick, so a press can ring it. See below. */
  const run = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const { watch: current, port: player, clock: roomNow } = latest.current;
      if (!player) return;
      const reading = player.read();
      if (!reading) return;
      const now = roomNow();
      /*
        Kept before every early return below, and deliberately: a player that
        is buffering while the follower is deaf — waiting out an instruction,
        or holding off an advert — is still buffering, and a clock that only
        ran when somebody was looking would never reach the threshold it is
        for.
      */
      const wasPlaying = seen.current === 'playing';
      seen.current = reading.state;
      if (reading.state !== 'buffering') {
        buffering.current = null;
        knocked.current = null;
      } else if (buffering.current === null) {
        buffering.current = now;
        standstill.current = !wasPlaying;
      }
      /*
        **How long this player takes to obey, measured wherever it lands.** One
        reading per instruction and no averaging: the interesting case is a
        player whose latency has just changed — a route moving, a film
        starting — and a mean is the slowest possible way to notice one.
      */
      const said = told.current;
      if (said && reading.state === said.status) {
        const took = now - said.at;
        for (const kind of said.kinds) {
          if (kind === 'play' || kind === 'seek') lag.current[kind] = took;
        }
        told.current = null;
      }

      const want = desiredFor(current, now);
      if (!want) return;

      /*
        **A jump in the room unplaces the player; the clock running does not.**
        Compared only when the transport itself changed, since between presses
        the want moves with the clock by construction — and at the end of a film
        it stops while the clock does not, which is not a jump either.
      */
      const key = `${current.status}|${current.startedAt}|${current.positionMs}`;
      const before = previous.current;
      if (before && before.key !== key) {
        const expected =
          before.want.positionMs +
          (before.want.status === 'playing' ? now - before.at : 0);
        if (Math.abs(want.positionMs - expected) > WATCH_DRIFT_MS) {
          placed.current = null;
        }
      }
      previous.current = { key, want, at: now };
      /*
        **Arrival, which is a state and not a place.** A player playing when
        the room plays has arrived, wherever it is — unless it has never been
        placed, or the room has jumped since, in which case the one seek owed to
        it is still to come.
      */
      const settled = (to: Desired) =>
        reading.state === 'ended' ||
        (reading.state === to.status && placed.current === player);
      /*
        **Seen in step is placed, except at the end of the film.** `hasArrived`
        is true for an ended player whatever it was asked, and that is right
        about waiting; read as *placed* it re-placed a finished player in the
        very tick a replay had unplaced it, so the seek back to the start was
        removed as a correction and the player was told only to play — which
        replays it from its end, where it ends again, for ever.
      */
      if (reading.state !== 'ended' && hasArrived(reading, want)) {
        placed.current = player;
      }

      /*
        **Published before every early return below**, so an instrument is live
        on a party that is working rather than only on one that is not. Nought
        seeks and a drift inside the tolerance is the reading that says the
        machinery is doing its job, and a tick that decides to say nothing to the
        player would never produce it — which is how the seek storm came to be
        legible only in the next day's journal.
      */
      const report = () => {
        const where = latest.current.channelId;
        if (where === undefined) return;
        publishDrift({
          channelId: where,
          driftMs:
            reading.positionMs === null
              ? null
              : reading.positionMs - want.positionMs,
          playerState: reading.state,
          wantStatus: want.status,
          bufferingForMs:
            buffering.current === null ? 0 : now - buffering.current,
          lagPlayMs: lag.current.play,
          lagSeekMs: lag.current.seek,
          seeksThisRun: seeks.current,
          at: now,
        });
      };
      report();

      /*
        **An advert is a different video in the same frame.** Nothing is said
        to a player that is not showing the film: its clock is the advert's,
        so correcting it would seek the advert. They end by themselves. See
        `showingTheFilm`.
      */
      /*
        **And the film coming back is a player to be placed again**, since
        2026-10-03. The room's clock ran through the advert and the film resumes
        wherever it was, so a screen that sat through a pre-roll comes back that
        far behind — which was drift, and corrected, until nothing corrected
        drift. It is not drift: it is an interruption nobody in the room asked
        for, the same as a rebuild, and is met the same way, with one seek.
      */
      if (!showingTheFilm(current, reading)) {
        placed.current = null;
        return;
      }

      /*
        A press this device has already acted on is not argued with while the
        room catches up. See `pressed`.
      */
      const ahead = pressed.current;
      if (ahead) {
        if (want.status === ahead.status) pressed.current = null;
        else if (now - ahead.at <= WATCH_OBEDIENCE_MS) return;
        else pressed.current = null;
      }

      /*
        **Nothing plays while this device is getting its session ready for the
        film.** A press of Play here releases the microphone first and waits for
        iOS to say `Playback` — see `filmStart.ts`, and build 312, where a
        player that began before the category landed stuck in `buffering` for
        five seconds. The room may say `playing` before that; the player waits,
        and the change of phase rings this tick again.
      */
      if (want.status === 'playing' && startHolding()) return;

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
      // A run beginning is where the seek count starts from. `urgent` is the
      // same edge the rules are told about, so the two cannot drift apart.
      if (urgent && want.status === 'playing') seeks.current = 0;
      wanted.current = want.status;

      const state = doing.current;
      // A correction asked for by hand is as urgent as a press, and for the
      // same reason: it is somebody's answer, not a wait worth serving.
      // Not when the room has come round to what this player was already told
      // at the press, though: that instruction is the one everybody now wants.
      if (
        state.phase === 'sending' &&
        urgent &&
        state.want.status !== want.status
      ) {
        // Abandoned rather than waited out: what it was sent for is no longer
        // what anybody wants, so its arrival would prove nothing and its
        // fuse is time spent on a question that has been withdrawn.
        doing.current = { phase: 'watching' };
      } else if (state.phase === 'sending') {
        if (settled(state.want)) {
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
          return;
        }
        // The fuse, for a player that is never going to arrive — an embed
        // that has lost its way, or one still fetching long past a stall.
        // See `WATCH_OBEDIENCE_MS`.
        if (now - state.since <= WATCH_OBEDIENCE_MS) return;
        doing.current = { phase: 'watching' };
        /*
          **An instruction that was not acted on, written down and nothing
          more.**

          `hasArrived` is false for `unstarted` and for `buffering`
          unconditionally, and rightly: neither is where anything was asked to
          be. But neither is a refusal either — a cued player has not begun,
          and a buffering one is on its way — so saying *ignored* about them
          would be calling two ordinary things a fault. What is left is a
          player reporting a settled `playing` or `paused` that contradicts
          what it was told, which is worth a line: it is how WebKit pausing
          the media element under a moving audio session was first seen, on
          build 277, rather than inferred.

          It is a diagnostic and not a trigger. Nothing counts these any more
          — see the note at the top of this file on what used to.
        */
        if (
          reading.state !== 'unstarted' &&
          reading.state !== 'buffering'
        ) {
          recordEvent(
            `watch ignored ${state.want.status} (player ${reading.state})`
          );
        }
      }

      /*
        **An ended player is the one reading this may not be the last word
        on.**

        `hasArrived` answers true for `ended` whatever was asked, and that is
        right where it is asked above: a player at the end of a film will
        never arrive anywhere else without being restarted, so waiting out an
        instruction to it is waiting for ever. Read as *nothing to do* here,
        it swallowed the restart — `followInstructions` has the narrower rule
        and has had since it was written, leaving an ended player alone only
        **while the channel agrees it is over** and seeking it back and
        starting it when the transport has gone back. Both halves were
        tested; the line between them was not, and it never let the second
        one run.

        What it cost is the end of every party. The film runs out, the
        channel comes to rest, somebody presses Play — which `watchPlay`
        reads as a replay and puts the transport back to zero — and every
        screen stays on the last frame with nothing in the application that
        will ever speak to it again. Rebuilding a player was the only cure,
        which is why rotating the device worked.

        An ended player that nothing wants moved still costs nothing: the
        rule returns no instructions and the tick ends a line below.
      */
      /*
        Where it is, not merely what it is doing: a player in the right state
        and the wrong place goes on to the rule, whose seek is then removed
        below unless it is owed.
      */
      if (reading.state !== 'ended' && hasArrived(reading, want)) return;

      let instructions = followInstructions(
        current,
        reading,
        now,
        buffering.current === null ? 0 : now - buffering.current,
        urgent,
        // The seek's own latency where there is one, the play's as the next
        // best thing, and zero — which is what shipped — until this player has
        // shown either. A first correction led by a play's 1.2 seconds
        // overshoots by about half of it, which is a player half a second ahead
        // of the room rather than a second behind it, and the next correction
        // has the right number.
        lag.current.seek ?? lag.current.play ?? 0,
        standstill.current,
        buffering.current === null
          ? 0
          : now - Math.max(buffering.current, knocked.current ?? 0)
      );
      /*
        **Drift is not corrected, so a placed player's seeks are removed** —
        unless it has been buffering past `WATCH_STALL_MS`, where the
        `seek+play` is a rescue and not a correction: the one instruction that
        has ever moved a wedged player (builds 304 and 327).
      */
      const rescuing =
        buffering.current !== null && now - buffering.current >= WATCH_STALL_MS;
      if (
        !rescuing &&
        placed.current === player &&
        instructions.some((i) => i.do === 'seek')
      ) {
        instructions = instructions.filter(
          (i) =>
            i.do !== 'seek' &&
            /*
              The pause that follows a seek on a cued or ended player is there
              only because the seek would start it. Without the seek it stops
              nothing, and a player that never reports `paused` would be sent
              it once a fuse for ever.
            */
            !(
              i.do === 'pause' &&
              reading.state !== 'playing' &&
              reading.state !== 'buffering'
            )
        );
      }
      if (instructions.length === 0) return;
      // The stall clock restarts with the instruction, so a player that is
      // never going to play is prodded once a window rather than every tick.
      // A cold nudge restarts only its own clock. Restarting the stall clock
      // too is what starved the backstop; see `knocked`.
      if (buffering.current !== null) {
        if (instructions.some((i) => i.do === 'play' && i.knock)) {
          knocked.current = now;
        } else {
          buffering.current = now;
          knocked.current = null;
        }
      }
      doing.current = { phase: 'sending', want, since: now };
      /*
        **What was said and when, kept apart from the phase above.** The lead
        has to be learnt from the slowest players, and a slow player is exactly
        the one that never *arrives* — its position is hopeless whatever it
        does — so the phase, which is about arrival, is the wrong thing to hang
        this on. What is measured here is narrower and always available: how
        long until the player *did what it was told*, which is a fact about its
        state and not about where the room has got to.
      */
      told.current = {
        at: now,
        status: want.status,
        kinds: instructions.map((i) => i.do),
      };
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
          /*
            **Two decimals, because the question is a boundary.** Whole seconds
            were enough while the question was *what is it doing*; they are not
            enough for *is this drift over 1,500ms*, where a pair of positions
            rounded to seconds leaves the answer anywhere between 100ms and
            1.9s. Build 305's alternating corrections could not be explained
            from the log for exactly that reason. Ten milliseconds of resolution
            costs three characters a line.
          */
          `(player ${reading.state} at ${(
            (reading.positionMs ?? 0) / 1000
          ).toFixed(2)}s, want ${want.status} at ` +
          `${(want.positionMs / 1000).toFixed(2)}s)`
      );
      for (const instruction of instructions) {
        if (instruction.do === 'play') player.play();
        else if (instruction.do === 'pause') player.pause();
        else {
          // Counted here rather than from the list, so the number is seeks this
          // player was actually told to make and not seeks that were decided on.
          seeks.current += 1;
          placed.current = player;
          player.seek(instruction.positionMs);
        }
      }
      // The count has moved, so an instrument is told now rather than at the
      // next tick — a seek that appeared half a second after the stutter it
      // caused would be the wrong half-second to be looking at.
      report();
    };
    run.current = tick;
    const timer = setInterval(tick, FOLLOW_TICK_MS);
    /*
      **A press on this device, carried out on this player before the round
      trip**, for every account since 2026-10-03. The room still decides: this is the same
      instruction the follower would give a round trip from now, given early,
      and `pressed` is what keeps the follower from contradicting it in the
      meantime.
    */
    /** A play pressed here, waiting for the session. */
    let waitingToPlay = false;
    const carryOut = (status: 'playing' | 'paused') => {
      const { port: player, clock: roomNow } = latest.current;
      if (!player) return;
      const reading = player.read();
      if (!reading || reading.state === 'ended') return;
      const now = roomNow();
      pressed.current = { status, at: now };
      if (reading.state === status) return;
      if (status === 'playing') player.play();
      else player.pause();
      // Outstanding like any other instruction, so the follower waits for it
      // rather than repeating it when the room's answer arrives mid-flight.
      doing.current = {
        phase: 'sending',
        want: { status, positionMs: reading.positionMs ?? 0 },
        since: now,
      };
      told.current = {
        at: now,
        status,
        kinds: [status === 'playing' ? 'play' : 'pause'],
      };
      recordEvent(
        `watch tell ${status === 'playing' ? 'play' : 'pause'} at the press ` +
          `(player ${reading.state})`
      );
    };
    const unpressed = onPress((status) => {
      waitingToPlay = false;
      /*
        The start has already been planned by the time this runs — see
        `announcePress` — so a press that is releasing the microphone first is
        held here, and carried out when the session is ready. The room's answer
        must not be contradicted in the meantime either, hence the hold.
      */
      if (status === 'playing' && startHolding()) {
        waitingToPlay = true;
        pressed.current = { status, at: latest.current.clock() };
        recordEvent('watch play waits for the session');
        return;
      }
      carryOut(status);
    });
    const unstarted = subscribeStart(() => {
      if (startHolding()) return;
      if (waitingToPlay) {
        waitingToPlay = false;
        carryOut('playing');
      }
      tick();
    });
    tick();
    return () => {
      clearInterval(timer);
      unpressed();
      unstarted();
      pressed.current = null;
      run.current = null;
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
