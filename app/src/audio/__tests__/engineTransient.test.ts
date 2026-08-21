import { AudioDeviceModule } from '@livekit/react-native';
import { engineLine, engineSnapshot, watchTransition } from '../engineState';

/**
 * The two things the first reading could not see.
 *
 * Build 59 reported `microphoneMuted: false -> true` and nothing else, which
 * reads as decisive and is not. A before/after comparison is blind to a field
 * that moves and moves back, and prints nothing at all about a field that never
 * moves — and one of those, `muteMode`, is the one that says whether the fix in
 * build 58 actually took.
 */

const module = AudioDeviceModule as unknown as Record<string, jest.Mock>;

describe('engineLine', () => {
  it('shows every field, including the ones that never change', () => {
    const line = engineLine(engineSnapshot());
    // `mode` is the point: a diff can never surface it, and a silently failed
    // configureMuteMode looks exactly like a successful one without it.
    expect(line).toContain('mode=');
    expect(line).toContain('rec=');
    expect(line).toContain('run=');
    expect(line).toContain('prep=');
  });

  it('says so rather than pretending when there is no engine', () => {
    expect(engineLine(null)).toBe('no engine');
  });
});

describe('watchTransition', () => {
  afterEach(() => {
    module.isRecording.mockReturnValue(true);
  });

  it('catches a field that moves and moves back', async () => {
    const before = engineSnapshot();
    // Stopped, then running again — an engine restart, which is invisible to a
    // comparison taken after it has completed.
    module.isRecording
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValue(true);

    const seen = await watchTransition(before, 60, 10);
    expect(seen).toContain('recording->false');
  });

  it('is empty when nothing moved, which is the finding it must not fake', async () => {
    const before = engineSnapshot();
    await expect(watchTransition(before, 40, 10)).resolves.toBe('');
  });

  it('is empty rather than throwing with no engine to compare', async () => {
    await expect(watchTransition(null, 40, 10)).resolves.toBe('');
  });
});
