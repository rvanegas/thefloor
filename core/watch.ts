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
 * The room comes back unmuted, whatever the last party left behind. A mute is
 * for the thing being watched — somebody choosing quiet for *this* film — and
 * inheriting it would mean a channel that silently stopped carrying voices for
 * reasons nobody present was party to.
 */
export function startParty(party: WatchParty): WatchState {
  return {
    party,
    status: 'paused',
    positionMs: 0,
    startedAt: null,
    mutedAll: false,
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
  return { ...watch, mutedAll: muted };
}

export function stopParty(): WatchState {
  return initialWatchState();
}

/**
 * Starts or resumes. A video played from its own end starts again from the
 * beginning, which is the only reading of "play" available at that position —
 * the same rule shared playback follows.
 */
export function watchPlay(watch: WatchState, now: number): WatchState {
  if (!watch.party) return watch;
  const atEnd =
    watch.party.durationMs !== null &&
    watch.positionMs >= watch.party.durationMs;
  return {
    ...watch,
    status: 'playing',
    positionMs: atEnd ? 0 : watch.positionMs,
    startedAt: now,
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
