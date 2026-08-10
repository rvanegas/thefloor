import { EMPTY_SESSION_TIMEOUT_MS, FLOOR_CLAIM_MS } from '../constants';
import { recordedMs } from '../recording';
import {
  canPauseRecording,
  canResumeRecording,
  canStartRecording,
  canStopRecording,
  createSession,
  reduce,
} from '../session';
import type { SessionAction, SessionState } from '../types';

const A = 'user-a';
const B = 'user-b';
const T0 = 1_700_000_000_000;

function joined(now = T0): SessionState {
  return reduce(
    createSession({ id: 's1', initiator: A, invitees: [B], now }),
    { type: 'ENTER', userId: B },
    now
  );
}

function apply(
  state: SessionState,
  steps: Array<[SessionAction, number]>
): SessionState {
  return steps.reduce((s, [action, at]) => reduce(s, action, at), state);
}

describe('starting a recording', () => {
  it('is not automatic', () => {
    expect(joined().recording.status).toBe('idle');
  });

  it('waits until both parties have connected', () => {
    const alone = createSession({ id: 's1', initiator: A, invitees: [B], now: T0 });
    expect(canStartRecording(alone)).toBe(false);
    expect(canStartRecording(joined())).toBe(true);
  });

  it('stays available after one party leaves, once both have connected', () => {
    const s = reduce(joined(), { type: 'LEAVE', userId: B }, T0 + 1_000);
    expect(canStartRecording(s)).toBe(true);
  });

  it('can be initiated by either user', () => {
    for (const user of [A, B]) {
      const s = reduce(joined(), { type: 'START_RECORDING', userId: user }, T0);
      expect(s.recording.status).toBe('recording');
      expect(s.recording.startedAt).toBe(T0);
    }
  });
});

describe('pause, resume, and stop', () => {
  it('accumulates recorded time across pauses, excluding paused time', () => {
    const s = apply(joined(), [
      [{ type: 'START_RECORDING', userId: A }, T0],
      [{ type: 'PAUSE_RECORDING', userId: A }, T0 + 10_000],
      [{ type: 'RESUME_RECORDING', userId: A }, T0 + 40_000],
    ]);
    // 10s recorded, 30s paused, then running again.
    expect(recordedMs(s.recording, T0 + 40_000)).toBe(10_000);
    expect(recordedMs(s.recording, T0 + 45_000)).toBe(15_000);

    const stopped = reduce(s, { type: 'STOP_RECORDING', userId: A }, T0 + 45_000);
    expect(stopped.recording.status).toBe('stopped');
    expect(recordedMs(stopped.recording, T0 + 99_000)).toBe(15_000);
  });

  it('does not end the session', () => {
    const s = apply(joined(), [
      [{ type: 'START_RECORDING', userId: A }, T0],
      [{ type: 'STOP_RECORDING', userId: A }, T0 + 10_000],
    ]);
    expect(s.status).toBe('active');
  });
});

describe('floor restriction on recording controls', () => {
  it('withholds pause and stop from the silenced party during a claim', () => {
    const s = apply(joined(), [
      [{ type: 'START_RECORDING', userId: A }, T0],
      [{ type: 'CLAIM_FLOOR', userId: A }, T0 + 1_000],
    ]);
    expect(canPauseRecording(s, A)).toBe(true);
    expect(canStopRecording(s, A)).toBe(true);
    expect(canPauseRecording(s, B)).toBe(false);
    expect(canStopRecording(s, B)).toBe(false);

    const attempted = reduce(s, { type: 'STOP_RECORDING', userId: B }, T0 + 2_000);
    expect(attempted.recording.status).toBe('recording');
    expect(attempted).toBe(s);
  });

  it('leaves both parties free to pause and stop when no claim is active', () => {
    const s = reduce(joined(), { type: 'START_RECORDING', userId: A }, T0);
    expect(canPauseRecording(s, A)).toBe(true);
    expect(canPauseRecording(s, B)).toBe(true);
    expect(canStopRecording(s, A)).toBe(true);
    expect(canStopRecording(s, B)).toBe(true);
  });

  it('restores the silenced party’s controls when the claim ends', () => {
    const s = apply(joined(), [
      [{ type: 'START_RECORDING', userId: A }, T0],
      [{ type: 'CLAIM_FLOOR', userId: A }, T0 + 1_000],
      [{ type: 'TICK' }, T0 + 1_000 + FLOOR_CLAIM_MS],
    ]);
    expect(s.floor.holder).toBeNull();
    expect(canStopRecording(s, B)).toBe(true);
  });

  it('does not restrict resuming', () => {
    const s = apply(joined(), [
      [{ type: 'START_RECORDING', userId: A }, T0],
      [{ type: 'PAUSE_RECORDING', userId: A }, T0 + 1_000],
      [{ type: 'CLAIM_FLOOR', userId: A }, T0 + 2_000],
    ]);
    expect(canResumeRecording(s)).toBe(true);
    const resumed = reduce(s, { type: 'RESUME_RECORDING', userId: B }, T0 + 3_000);
    expect(resumed.recording.status).toBe('recording');
  });
});

describe('recording and presence', () => {
  it('keeps running while the session sits empty', () => {
    const s = apply(joined(), [
      [{ type: 'START_RECORDING', userId: A }, T0],
      [{ type: 'LEAVE', userId: A }, T0 + 10_000],
      [{ type: 'LEAVE', userId: B }, T0 + 20_000],
      [{ type: 'TICK' }, T0 + 40_000],
    ]);
    expect(s.status).toBe('active');
    expect(s.recording.status).toBe('recording');
    expect(recordedMs(s.recording, T0 + 40_000)).toBe(40_000);
  });

  it('finalizes when the empty session auto-ends', () => {
    const emptyAt = T0 + 20_000;
    const s = apply(joined(), [
      [{ type: 'START_RECORDING', userId: A }, T0],
      [{ type: 'LEAVE', userId: A }, T0 + 10_000],
      [{ type: 'LEAVE', userId: B }, emptyAt],
      [{ type: 'TICK' }, emptyAt + EMPTY_SESSION_TIMEOUT_MS],
    ]);
    expect(s.status).toBe('ended');
    expect(s.endedReason).toBe('empty-timeout');
    expect(s.recording.status).toBe('stopped');
    expect(recordedMs(s.recording, Infinity)).toBe(20_000 + EMPTY_SESSION_TIMEOUT_MS);
  });

  it('finalizes when the session is ended explicitly', () => {
    const s = apply(joined(), [
      [{ type: 'START_RECORDING', userId: A }, T0],
      [{ type: 'END', userId: B }, T0 + 30_000],
    ]);
    expect(s.recording.status).toBe('stopped');
    expect(recordedMs(s.recording, Infinity)).toBe(30_000);
  });
});
