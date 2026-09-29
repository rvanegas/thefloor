import { useEffect, useRef, useState } from 'react';
import { hasMicrophone, isScreening } from '../../../core/micNeeded';
import type { ChannelState, UserId } from '../../../core/types';
import { onRouteChange, type RouteSnapshot } from '../../modules/audio-route';
import { chimePlay } from '../audio/chime';
import { recordEvent } from '../audio/diagnostics';
import { filmProbeKeepsMicrophone } from '../audio/probe';
import { HANDOVER_MS } from '../audio/useFilmHandover';

/**
 * **A film started on this device gives up the microphone before it plays, not
 * after.**
 *
 * The device showing the film releases its microphone for the run, so the
 * session falls from `playAndRecord` to `playback` — see `isScreening` in
 * core/micNeeded.ts. Until 2026-09-29 that release was driven by the server's
 * snapshot, and the player was told to play on the same snapshot or, under
 * `debug`, at the press. Either way the category change landed while the film
 * was starting, and on build 312 a player that had begun to buffer before
 * `Playback` arrived stuck there until something told it to play again: three
 * of four resumes, five seconds each. The ones where the player waited for the
 * category started 90 to 290ms after it landed.
 *
 * So a press of Play on the device that will show the film is carried out here,
 * in order, before anybody hears back from the server:
 *
 * 1. **`chiming`** — the play chime, into the session it can still be heard in,
 *    and the microphone held for its length. `useFilmHandover`'s hold, moved to
 *    the press.
 * 2. **`releasing`** — the microphone let go, which `App.tsx` reads, and a wait
 *    for iOS to say the session is `Playback`. The route notification rather
 *    than a reading of the category, which flips the moment it is written and
 *    is ahead of the session by about 200ms.
 * 3. **`ready`** — the follower may tell the player to play. It stays `ready`
 *    for the run, because `App.tsx` reads the microphone off it.
 *
 * **Only for a press on the device that will show the film.** A press on a
 * second device, or on a phone not stepped in, starts nothing here; the device
 * showing the film then learns of the run from the snapshot, as it always did,
 * and `useFilmHandover` does the chime's hold there.
 *
 * **The room still decides.** This orders one device's session against its own
 * player and asserts nothing about the channel: a press the server never takes
 * up is let go after `UNCONFIRMED_MS`, and the microphone comes back.
 */
export type StartPhase = 'chiming' | 'releasing' | 'ready';

/**
 * How long to wait for iOS to report the session as `Playback` before playing
 * anyway.
 *
 * Measured from the release: 160ms on build 311 when nothing else was moving
 * the session, and about a second when the web view was taking it at the same
 * moment, which is what this change exists to stop. Two seconds is the
 * backstop for a notification that never comes — a route that did not move, a
 * module that did not link — and is logged when it is what started the film.
 */
export const START_SETTLE_MS = 2_000;

/**
 * How long a press may go without the room saying the film is playing before
 * the start is abandoned and the microphone given back.
 *
 * A round trip is about seventy milliseconds. Five seconds is a press that was
 * refused, or lost on the way.
 */
export const UNCONFIRMED_MS = 5_000;

let phase: StartPhase | null = null;
const phaseWatchers = new Set<() => void>();

/** Where a start on this device has got to, or null when there is none. */
export function readStart(): StartPhase | null {
  return phase;
}

/**
 * Whether a start on this device is still getting its session ready, which is
 * when the follower must not tell the player to play.
 */
export function startHolding(): boolean {
  return phase === 'chiming' || phase === 'releasing';
}

/** Subscribes to every change of phase. */
export function subscribeStart(watcher: () => void): () => void {
  phaseWatchers.add(watcher);
  return () => {
    phaseWatchers.delete(watcher);
  };
}

function setPhase(next: StartPhase | null, why?: string): void {
  if (phase === next) return;
  phase = next;
  if (why) recordEvent(`watch start ${next ?? 'over'} (${why})`);
  for (const watcher of phaseWatchers) watcher();
}

type PressListener = (status: 'playing' | 'paused') => void;

/** The start's own listener, which runs before any other. See `announcePress`. */
let planner: PressListener | null = null;
const pressListeners = new Set<PressListener>();

/**
 * A play or pause pressed on this device, announced as it leaves.
 *
 * The transport calls this for every press it sends. **The start is planned
 * first**, so that anything else hearing the press — the follower, under
 * `debug`, which acts on it at once — already knows whether the player has to
 * wait for the session.
 */
export function announcePress(status: 'playing' | 'paused'): void {
  planner?.(status);
  for (const listener of pressListeners) listener(status);
}

/** Registered by `drive.ts` while a follower is running. */
export function onPress(listener: PressListener): () => void {
  pressListeners.add(listener);
  return () => {
    pressListeners.delete(listener);
  };
}

/**
 * Whether a press of Play here would make this device the one showing the film.
 *
 * `isScreening` asks the same of a run already under way, and a run is enforced
 * exactly when somebody showing it has a microphone — `anyScreenInTheRoom` in
 * core/channel.ts — so for the person pressing, the two are one question: am
 * I watching here, and do I have a microphone to give up.
 */
export function wouldScreen(channel: ChannelState, me: UserId): boolean {
  if (!channel.watch?.party) return false;
  if (channel.watch.status === 'playing') return false;
  return (
    (channel.watchingHere ?? []).includes(me) && hasMicrophone(channel, me)
  );
}

/**
 * Runs a start for this device, and returns where it has got to.
 *
 * Mounted once, in `App.tsx`, beside the session it orders. The phase lives at
 * module level because three other readers need it and none of them is below
 * `App` — the follower is in `Picture`'s layer and the chime hook beside this.
 */
export function useFilmStart(
  live: ChannelState | null,
  me: UserId,
  sound: () => void = chimePlay,
  routes: (listener: (snapshot: RouteSnapshot) => void) => () => void = onRouteChange
): StartPhase | null {
  const [, bump] = useState(0);
  useEffect(() => subscribeStart(() => bump((n) => n + 1)), []);

  const liveRef = useRef(live);
  liveRef.current = live;
  // Read through a ref, so that a caller handing a fresh function on every
  // render does not re-plan — and so cancel — a start already under way.
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const routesRef = useRef(routes);
  routesRef.current = routes;
  /** When the press was, for `UNCONFIRMED_MS`. */
  const pressedAt = useRef(0);
  /** Whether the room has said `playing` since the press. */
  const confirmed = useRef(false);

  useEffect(() => {
    planner = (status) => {
      if (status === 'paused') {
        if (phase) setPhase(null, 'pause pressed');
        return;
      }
      const channel = liveRef.current;
      if (!channel || !wouldScreen(channel, me)) return;
      pressedAt.current = Date.now();
      confirmed.current = false;
      soundRef.current();
      setPhase('chiming', 'play pressed');
    };
    return () => {
      planner = null;
      setPhase(null);
    };
  }, [me]);

  // Chimed, so let the microphone go — unless the film probe is keeping it, in
  // which case nothing is released and there is nothing to wait for.
  useEffect(() => {
    if (phase !== 'chiming') return;
    const timer = setTimeout(() => {
      const channel = liveRef.current;
      const keeps = channel ? filmProbeKeepsMicrophone(channel, me) : false;
      setPhase(keeps ? 'ready' : 'releasing', keeps ? 'microphone kept' : 'chimed');
    }, HANDOVER_MS);
    return () => clearTimeout(timer);
  }, [phase, me]);

  useEffect(() => {
    if (phase !== 'releasing') return;
    const from = Date.now();
    const off = routesRef.current((snapshot) => {
      if (snapshot.category !== 'AVAudioSessionCategoryPlayback') return;
      setPhase('ready', `playback after ${Date.now() - from}ms`);
    });
    const timer = setTimeout(
      () => setPhase('ready', `no playback after ${START_SETTLE_MS}ms, playing anyway`),
      START_SETTLE_MS
    );
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [phase]);

  /*
    **The run is the room's, and so is its end.** Confirmed when the snapshot
    says `playing`, over when it says anything else afterwards. A run the room
    confirmed without this device showing it — the server deciding otherwise —
    hands the microphone back to `microphoneNeeded` at once.
  */
  const status = live?.watch?.status ?? null;
  const screening = live ? isScreening(live, me) : false;
  useEffect(() => {
    if (!phase) return;
    if (status === 'playing') {
      confirmed.current = true;
      if (!screening) setPhase(null, 'not screening here');
      return;
    }
    if (confirmed.current) {
      setPhase(null, 'run ended');
      return;
    }
    const left = UNCONFIRMED_MS - (Date.now() - pressedAt.current);
    const timer = setTimeout(() => setPhase(null, 'never confirmed'), Math.max(0, left));
    return () => clearTimeout(timer);
  }, [phase, status, screening]);

  // A different room, or none, is not the run this was started for.
  const channelId = live?.id ?? null;
  const startedIn = useRef(channelId);
  useEffect(() => {
    if (startedIn.current !== channelId) {
      startedIn.current = channelId;
      setPhase(null, 'left the channel');
    }
  }, [channelId]);

  return phase;
}
