import { createChannel, reduce } from '../../../../core/channel';
import type { ChannelState } from '../../../../core/types';
import { anyMicrophoneOpen, microphoneNeeded } from '../micNeeded';

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

/**
 * The channel-wide question, which decides the audio session's configuration
 * for everybody rather than each person's microphone deciding their own.
 *
 * Every row of the decision table in planning/STATES.md, because the rule's
 * whole claim is that it moves exactly one of them — self-muted while somebody
 * else is still talking. A test covering only the row that changed would not
 * catch the rule quietly moving another.
 */

const mute = (state: ChannelState, who: string) =>
  reduce(state, { type: 'SET_SELF_MUTE', userId: who, muted: true }, T0 + 6_000);

describe('whether anybody present has an open microphone', () => {
  it('is not, alone and unmuted with nothing running', () => {
    // The row a literal reading of "everybody present is muted" gets wrong: it
    // is false here, which would take the session as a call and silence the
    // music somebody is sitting alone listening to.
    const s = alone();
    expect(s.selfMuted[ME]).toBe(false);
    expect(anyMicrophoneOpen(s)).toBe(false);
  });

  it('is, alone and recording', () => {
    expect(anyMicrophoneOpen(recording(alone()))).toBe(true);
  });

  it('is, with somebody else present and nobody muted', () => {
    expect(anyMicrophoneOpen(together())).toBe(true);
  });

  it('is, when I am muted and the other party is not', () => {
    // The one row that changes, and the bug it exists for: keyed on our own
    // microphone this was false, which handed the session back to `playback`
    // mid-conversation and lost a tester's Bluetooth route to the profile
    // switch. Somebody is still talking, so the session is still a call.
    const s = mute(together(), ME);
    expect(s.selfMuted[ME]).toBe(true);
    expect(anyMicrophoneOpen(s)).toBe(true);
  });

  it('is not, once everybody present is muted', () => {
    // Nobody is talking, so the only audio that matters is the channel's own
    // playback or another app's — both of which want the stereo profile.
    const s = mute(mute(together(), ME), THEM);
    expect(anyMicrophoneOpen(s)).toBe(false);
  });

  it('is again the moment one of them unmutes', () => {
    const quiet = mute(mute(together(), ME), THEM);
    const s = reduce(
      quiet,
      { type: 'SET_SELF_MUTE', userId: THEM, muted: false },
      T0 + 7_000
    );
    expect(anyMicrophoneOpen(s)).toBe(true);
  });

  it('ignores somebody who has stepped out', () => {
    // Presence is the gate: a departed participant cannot hold the channel in
    // a call on the strength of having been unmuted when they left.
    const s = reduce(together(), { type: 'STEP_OUT', userId: THEM }, T0 + 8_000);
    expect(s.present).toEqual([ME]);
    expect(anyMicrophoneOpen(s)).toBe(false);
  });
});
