import { AudioDeviceModule, AudioEngineMuteMode } from '@livekit/react-native';
import { configureMuteMode, WANTED_MUTE_MODE } from '../muteMode';

/**
 * The mute mode is a one-line startup call with no visible effect until
 * somebody puts a Bluetooth headset on, which makes it exactly the kind of
 * thing a later reader deletes as redundant — the app already sets an audio
 * category and already avoids stopping the track on mute, so this looks like a
 * third go at the same idea.
 *
 * It is not. Those two operate above the audio engine and this one is the
 * engine's own behaviour, which is why both of them left the tone in place.
 */

const module = AudioDeviceModule as unknown as {
  getMuteMode: jest.Mock;
  setMuteMode: jest.Mock;
};

describe('configureMuteMode', () => {
  beforeEach(() => {
    module.getMuteMode.mockReset();
    module.setMuteMode.mockReset();
    module.getMuteMode.mockReturnValue(AudioEngineMuteMode.RestartEngine);
    module.setMuteMode.mockResolvedValue(undefined);
  });

  it('asks for the mode that does not restart the engine', async () => {
    await configureMuteMode();
    expect(module.setMuteMode).toHaveBeenCalledWith(
      AudioEngineMuteMode.VoiceProcessing
    );
  });

  // Stated as its own case because it is the whole point. `RestartEngine`
  // stops and restarts the audio engine to mute, which tears the input down
  // and rebuilds it — and iOS hands a Bluetooth headset back from the
  // hands-free link to A2DP in the gap, which is the tone that has survived
  // two other fixes.
  it('never asks for the one that restarts the engine', () => {
    expect(WANTED_MUTE_MODE).not.toBe(AudioEngineMuteMode.RestartEngine);
  });

  it('reports what it displaced, which is observable only here', async () => {
    module.getMuteMode.mockReturnValue(AudioEngineMuteMode.RestartEngine);
    await expect(configureMuteMode()).resolves.toBe(
      AudioEngineMuteMode.RestartEngine
    );
  });

  it('reads before it writes, or it would report its own value back', async () => {
    await configureMuteMode();
    const read = module.getMuteMode.mock.invocationCallOrder[0];
    const write = module.setMuteMode.mock.invocationCallOrder[0];
    expect(read).toBeLessThan(write);
  });
});
