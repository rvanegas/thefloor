import { AudioDeviceModule } from '@livekit/react-native';
import { engineDiff, engineSnapshot } from '../engineState';

/**
 * The snapshot runs on the microphone edge, which carries live audio, so the
 * only behaviour worth pinning is that it cannot break anything: it reports
 * what moved, and it swallows a reader that has gone missing rather than
 * throwing into the transition.
 */

const module = AudioDeviceModule as unknown as Record<string, jest.Mock>;

describe('engineSnapshot', () => {
  it('reads the engine', () => {
    expect(engineSnapshot()).toMatchObject({
      engineRunning: true,
      recording: true,
      microphoneMuted: false,
    });
  });

  // The readers are newer than the rest of the module and none of them is
  // load-bearing, so an SDK bump that renames one must cost a log line rather
  // than a call.
  it('returns null rather than throwing when a reader has gone', () => {
    const original = module.isRecording;
    module.isRecording = jest.fn(() => {
      throw new TypeError('isRecording is not a function');
    });
    expect(() => engineSnapshot()).not.toThrow();
    expect(engineSnapshot()).toBeNull();
    module.isRecording = original;
  });
});

describe('engineDiff', () => {
  it('names only what moved, so it is not ten unchanged booleans', () => {
    const before = engineSnapshot();
    module.isRecording.mockReturnValueOnce(false);
    const after = engineSnapshot();
    expect(engineDiff(before, after)).toBe('recording: true -> false');
  });

  it('says so when nothing moved, which is itself a finding', () => {
    // If a self-mute moves the Bluetooth profile while the engine reports no
    // change at all, then the engine is not what moves and three of the four
    // fixes attempted on 2026-08-20 were aimed at the wrong layer entirely.
    expect(engineDiff(engineSnapshot(), engineSnapshot())).toBe(
      'nothing moved'
    );
  });

  it('is honest when there is no engine to compare', () => {
    expect(engineDiff(null, engineSnapshot())).toBe('no engine');
  });
});
