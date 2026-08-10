import { isSilenced } from './floor';
import type {
  FinishedRun,
  FloorState,
  RecordingState,
  UserId,
} from './types';

export function initialRecordingState(): RecordingState {
  return {
    status: 'idle',
    runId: null,
    startedAt: null,
    accumulatedMs: 0,
    segmentStartedAt: null,
    failure: null,
  };
}

/** Total recorded audio so far, excluding time spent paused. */
export function recordedMs(recording: RecordingState, now: number): number {
  if (recording.status !== 'recording' || recording.segmentStartedAt === null) {
    return recording.accumulatedMs;
  }
  return recording.accumulatedMs + (now - recording.segmentStartedAt);
}

export function isRecordingActive(recording: RecordingState): boolean {
  return recording.status === 'recording' || recording.status === 'paused';
}

/**
 * What a run leaves behind, or null if it captured nothing.
 *
 * Nothing captured means the run did not happen: no row is filed and the
 * channel says nothing about it, so a failed start costs the next attempt
 * nothing.
 */
export function finishedRun(
  recording: RecordingState,
  now: number,
  failure: string | null = null
): FinishedRun | null {
  const durationMs = recordedMs(recording, now);
  if (recording.runId === null || durationMs <= 0) return null;
  return {
    runId: recording.runId,
    startedAt: recording.startedAt ?? now,
    endedAt: now,
    durationMs,
    failure: failure ?? recording.failure,
  };
}

/**
 * Pause and stop are withheld from a user who is being force-muted, so a
 * silenced party cannot cut off the record while they have no voice in the
 * channel. Outside an active floor claim nobody is silenced, so either user may
 * pause or stop freely.
 */
export function canPauseOrStopRecording(
  floor: FloorState,
  userId: UserId
): boolean {
  return !isSilenced(floor, userId);
}

export function startRecording(
  recording: RecordingState,
  runId: string,
  now: number
): RecordingState {
  return {
    status: 'recording',
    runId,
    startedAt: now,
    accumulatedMs: 0,
    segmentStartedAt: now,
    // Starting again clears whatever went wrong last time, so a stale reason
    // cannot outlive the recording it belonged to.
    failure: null,
  };
}

export function pauseRecording(
  recording: RecordingState,
  now: number
): RecordingState {
  return {
    ...recording,
    status: 'paused',
    accumulatedMs: recordedMs(recording, now),
    segmentStartedAt: null,
  };
}

export function resumeRecording(
  recording: RecordingState,
  now: number
): RecordingState {
  return { ...recording, status: 'recording', segmentStartedAt: now };
}

/**
 * Ends a run and returns the channel to idle, ready for the next one.
 *
 * What was captured is not thrown away — the caller pairs this with
 * `finishedRun`, which is what the channel reports and what the server files.
 */
export function stopRecording(
  recording: RecordingState,
  _now: number
): RecordingState {
  return initialRecordingState();
}

/**
 * Ends a run that could not be captured, and says why.
 *
 * A capture failure ends the whole run rather than continuing with whoever did
 * start: a channel recorded with one speaker missing is worse than no
 * recording, because it looks complete.
 *
 * Either way the channel returns to idle and may record again. What differs is
 * whether anything is left behind — see `finishedRun`, which files nothing for
 * a run that never captured a moment.
 */
export function failRecording(
  recording: RecordingState,
  reason: string,
  _now: number
): RecordingState {
  return { ...initialRecordingState(), failure: reason };
}
