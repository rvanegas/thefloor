import { DISCONNECT_GRACE_MS, FLOOR_CLAIM_MS } from '../constants';
import { recordedMs } from '../recording';
import {
  canPauseRecording,
  canResumeRecording,
  canStartRecording,
  canStopRecording,
  createChannel,
  reduce,
} from '../channel';
import type { ChannelAction, ChannelState } from '../types';

const A = 'user-a';
const B = 'user-b';
const T0 = 1_700_000_000_000;

function joined(now = T0): ChannelState {
  return reduce(
    createChannel({ id: 's1', initiator: A, invitees: [B], now }),
    { type: 'ENTER', userId: B },
    now
  );
}

function apply(
  state: ChannelState,
  steps: Array<[ChannelAction, number]>
): ChannelState {
  return steps.reduce((s, [action, at]) => reduce(s, action, at), state);
}

describe('starting a recording', () => {
  it('is not automatic', () => {
    expect(joined().recording.status).toBe('idle');
  });

  it('is available to one person alone in the channel', () => {
    // A channel is a place you can talk into before anyone else arrives.
    const alone = createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 });
    expect(alone.present).toEqual([A]);
    expect(canStartRecording(alone, A)).toBe(true);

    const s = reduce(alone, { type: 'START_RECORDING', userId: A }, T0);
    expect(s.recording.status).toBe('recording');
  });

  it('requires the person starting it to be present', () => {
    // Not merely a head count: nobody starts a recording of a room they are
    // not in. B is a member here and has never entered.
    const alone = createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 });
    expect(canStartRecording(alone, B)).toBe(false);
    expect(reduce(alone, { type: 'START_RECORDING', userId: B }, T0)).toBe(alone);
  });

  it('is unavailable once the channel is empty', () => {
    // The same condition at both ends: a run starts only while somebody is
    // here, and stops the moment nobody is.
    const empty = reduce(joined(), { type: 'STEP_OUT', userId: A }, T0);
    const alsoEmpty = reduce(empty, { type: 'STEP_OUT', userId: B }, T0 + 1);
    expect(alsoEmpty.present).toEqual([]);
    expect(canStartRecording(alsoEmpty, A)).toBe(false);

    const back = reduce(alsoEmpty, { type: 'ENTER', userId: A }, T0 + 2);
    expect(canStartRecording(back, A)).toBe(true);
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

  it('does not end the channel', () => {
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
  it('keeps running while one person is still there alone', () => {
    const s = apply(joined(), [
      [{ type: 'START_RECORDING', userId: A }, T0],
      [{ type: 'STEP_OUT', userId: B }, T0 + 10_000],
      [{ type: 'TICK' }, T0 + 40_000],
    ]);
    expect(s.recording.status).toBe('recording');
    expect(recordedMs(s.recording, T0 + 40_000)).toBe(40_000);
  });

  it('stops the moment the last person steps out', () => {
    // The channel no longer ends when it empties, so this is what bounds a
    // recording: capture needs somebody to capture. It used to come for free,
    // via the empty-channel timer ending the channel a minute later — which
    // is why the old assertion here was 20s plus that whole extra minute.
    const s = apply(joined(), [
      [{ type: 'START_RECORDING', userId: A }, T0],
      [{ type: 'STEP_OUT', userId: A }, T0 + 10_000],
      [{ type: 'STEP_OUT', userId: B }, T0 + 20_000],
    ]);
    expect(s.status).toBe('active');
    expect(s.recording.status).toBe('stopped');
    expect(recordedMs(s.recording, Infinity)).toBe(20_000);
  });

  it('stops when the last person is dropped by the grace period', () => {
    const s = apply(joined(), [
      [{ type: 'START_RECORDING', userId: A }, T0],
      [{ type: 'STEP_OUT', userId: A }, T0 + 10_000],
      [{ type: 'DISCONNECTED', userId: B }, T0 + 20_000],
      [{ type: 'TICK' }, T0 + 20_000 + DISCONNECT_GRACE_MS],
    ]);
    expect(s.recording.status).toBe('stopped');
    // The grace period is inside the recording: an abrupt end leaves up to a
    // minute of silence on the tail.
    expect(recordedMs(s.recording, Infinity)).toBe(20_000 + DISCONNECT_GRACE_MS);
  });

  it('finalizes when the last member leaves the channel', () => {
    const s = apply(joined(), [
      [{ type: 'START_RECORDING', userId: A }, T0],
      [{ type: 'LEAVE_CHANNEL', userId: A }, T0 + 30_000],
      [{ type: 'LEAVE_CHANNEL', userId: B }, T0 + 30_000],
    ]);
    expect(s.status).toBe('ended');
    expect(s.recording.status).toBe('stopped');
    expect(recordedMs(s.recording, Infinity)).toBe(30_000);
  });
});
