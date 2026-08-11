import { createChannel, reduce } from '../../../../core/channel';
import type { ChannelState } from '../../../../core/types';
import { microphoneNeeded } from '../micNeeded';

/**
 * When the microphone is worth holding open.
 *
 * The cost of getting this wrong is asymmetric. Held open needlessly, a
 * Bluetooth speaker sits on the mono hands-free profile and other apps go
 * silent — annoying, and visible. Closed when it was needed, a recording
 * captures nothing and says nothing, which is the one this is tested for.
 */

const ME = 'user-me';
const THEM = 'user-them';
const T0 = 1_700_000_000_000;

const alone = () =>
  createChannel({ id: 'c1', initiator: ME, invitees: [THEM], now: T0 });

const together = () =>
  reduce(alone(), { type: 'ENTER', userId: THEM }, T0 + 1_000);

const recording = (state: ChannelState) =>
  reduce(
    state,
    { type: 'START_RECORDING', userId: ME, runId: 'run_1' },
    T0 + 2_000
  );

describe('whether the microphone is needed', () => {
  it('is not, alone in a channel with nothing running', () => {
    expect(microphoneNeeded(alone(), ME)).toBe(false);
  });

  it('is, the moment somebody else is present', () => {
    expect(microphoneNeeded(together(), ME)).toBe(true);
  });

  it('is while recording alone, which is a thing one may do', () => {
    // The failure this exists for: a rule written as "alone means closed"
    // records silence and reports success.
    const s = recording(alone());
    expect(s.present).toEqual([ME]);
    expect(microphoneNeeded(s, ME)).toBe(true);
  });

  it('is while a solo recording is merely paused, not stopped', () => {
    // Paused is still a run — resuming must not have to wait for the audio
    // session to be retaken.
    const s = reduce(
      recording(alone()),
      { type: 'PAUSE_RECORDING', userId: ME },
      T0 + 3_000
    );
    expect(microphoneNeeded(s, ME)).toBe(true);
  });

  it('is not once a solo recording has stopped', () => {
    const s = reduce(
      recording(alone()),
      { type: 'STOP_RECORDING', userId: ME },
      T0 + 4_000
    );
    expect(microphoneNeeded(s, ME)).toBe(false);
  });

  it('is when others are there even if you have stepped out yourself', () => {
    // Not a state this app reaches — it only asks about a channel you are
    // present in — but the predicate should not depend on that.
    const s = reduce(together(), { type: 'STEP_OUT', userId: ME }, T0 + 5_000);
    expect(microphoneNeeded(s, ME)).toBe(true);
  });
});
