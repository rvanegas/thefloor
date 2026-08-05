import { isSilenced } from './floor';
import type { FloorState, RecordingState, UserId } from './types';

export function initialRecordingState(): RecordingState {
  return {
    status: 'idle',
    startedAt: null,
    accumulatedMs: 0,
    segmentStartedAt: null,
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
