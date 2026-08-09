import { isSilenced } from './floor';
import type { FloorState, RecordingState, UserId } from './types';

export function initialRecordingState(): RecordingState {
  return {
    status: 'idle',
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
 * Pause and stop are withheld from a user who is being force-muted, so a
 * silenced party cannot cut off the record while they have no voice in the
 * session. Outside an active floor claim nobody is silenced, so either user may
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
  now: number
): RecordingState {
  return {
    status: 'recording',
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

export function stopRecording(
  recording: RecordingState,
  now: number
): RecordingState {
  return {
    ...recording,
    status: 'stopped',
    accumulatedMs: recordedMs(recording, now),
    segmentStartedAt: null,
  };
}

/**
 * Ends a recording that could not be captured, and says why.
 *
 * A capture failure ends the whole recording rather than continuing with
 * whoever did start: a session recorded with one speaker missing is worse than
 * no recording, because it looks complete.
 *
 * Where it ends up depends on whether anything was ever captured. A recording
 * that never got going did not happen, so it returns to idle and may be
 * started again — a failed attempt must not consume the session's one
 * recording. One that had already captured something keeps it, and stops.
 */
export function failRecording(
  recording: RecordingState,
  reason: string,
  now: number
): RecordingState {
  // Time accumulated before this run is the only evidence that capture ever
  // actually worked; the current segment's elapsed time proves nothing, since
  // it is measured from the request rather than from any audio arriving.
  if (recording.accumulatedMs === 0) {
    return { ...initialRecordingState(), failure: reason };
  }
  return { ...stopRecording(recording, now), failure: reason };
}
