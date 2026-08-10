import { PLAYBACK_DEFAULT_VOLUME } from './constants';
import type { PlaybackState, PlaybackTrack } from './types';

/**
 * Shared playback of a file one party supplied, heard by everyone at once.
 *
 * The shape deliberately mirrors RecordingState: a position banked at the last
 * transition plus the moment the current run began, from which the live
 * position is derived. Two features measuring elapsed time two different ways
 * would be two places to get it wrong.
 *
 * What this does *not* contain is any record of why playback is where it is —
 * no note of who paused it or whether the floor was involved. A floor claim
 * does not pause anything; it decides who may act, which is a guard in
 * session.ts and not state here. See `canControlPlayback`.
 */

export function initialPlaybackState(): PlaybackState {
  return {
    track: null,
    status: 'idle',
    positionMs: 0,
    startedAt: null,
    volume: PLAYBACK_DEFAULT_VOLUME,
    failure: null,
  };
}

/**
 * How far into the track playback has reached.
 *
 * Clamped to the track's length, because the position is derived from elapsed
 * wall clock and nothing stops that clock at the end of the file. Without the
 * clamp a finished track reports a position past its own duration, which a
 * scrubber renders as an overrun.
 */
export function playbackPositionMs(
  playback: PlaybackState,
  now: number
): number {
  if (playback.status !== 'playing' || playback.startedAt === null) {
    return playback.positionMs;
  }
  const elapsed = playback.positionMs + (now - playback.startedAt);
  return Math.min(elapsed, playback.track?.durationMs ?? elapsed);
}

/** Whether a playing track has run out and should come to rest. */
export function hasReachedEnd(playback: PlaybackState, now: number): boolean {
  if (playback.status !== 'playing' || !playback.track) return false;
  return playbackPositionMs(playback, now) >= playback.track.durationMs;
}

/**
 * Loads a track, replacing whatever was there.
 *
 * The volume survives, being a property of how the pair are listening rather
 * than of any one file — having set it once, nobody expects the next track to
 * arrive at a different level.
 */
export function setTrack(
  playback: PlaybackState,
  track: PlaybackTrack
): PlaybackState {
  return {
    track,
    status: 'paused',
    positionMs: 0,
    startedAt: null,
    volume: playback.volume,
    failure: null,
  };
}

export function clearTrack(playback: PlaybackState): PlaybackState {
  return { ...initialPlaybackState(), volume: playback.volume };
}

/**
 * Starts or resumes playback. Playing a track that has run to its end starts it
 * again from the beginning, which is the only reading of "play" available at
 * that position and saves a seek nobody would think to make.
 */
export function play(playback: PlaybackState, now: number): PlaybackState {
  if (!playback.track) return playback;
  const atEnd = playback.positionMs >= playback.track.durationMs;
  return {
    ...playback,
    status: 'playing',
    positionMs: atEnd ? 0 : playback.positionMs,
    startedAt: now,
    failure: null,
  };
}

export function pause(playback: PlaybackState, now: number): PlaybackState {
  if (!playback.track) return playback;
  return {
    ...playback,
    status: 'paused',
    positionMs: playbackPositionMs(playback, now),
    startedAt: null,
  };
}

/**
 * Moves the position, leaving playback running if it was running. Seeking is
 * the same operation as resuming as far as the pump is concerned — both restart
 * decoding at a position — so keeping the status untouched here is what lets
 * one code path serve both.
 */
export function seek(
  playback: PlaybackState,
  positionMs: number,
  now: number
): PlaybackState {
  if (!playback.track) return playback;
  const clamped = Math.max(0, Math.min(positionMs, playback.track.durationMs));
  return {
    ...playback,
    positionMs: clamped,
    startedAt: playback.status === 'playing' ? now : null,
  };
}

export function setVolume(
  playback: PlaybackState,
  volume: number
): PlaybackState {
  return { ...playback, volume: Math.max(0, Math.min(1, volume)) };
}

/**
 * Playback could not be started or kept running, and says why.
 *
 * It comes to rest where it got to rather than resetting, so the position the
 * pair had reached is not lost to a transient decode failure — pressing play
 * again is a retry from where they were.
 */
export function failPlayback(
  playback: PlaybackState,
  reason: string,
  now: number
): PlaybackState {
  return { ...pause(playback, now), failure: reason };
}
