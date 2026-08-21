import { AudioDeviceModule, AudioEngineMuteMode } from '@livekit/react-native';
import { configureMuteMode, WANTED_MUTE_MODE } from '../muteMode';

/**
 * The mute mode is a one-line startup call with no visible effect until
 * somebody puts a Bluetooth headset on, which makes it exactly the kind of
 * thing a later reader deletes as redundant — the app already sets an audio
 * category and already avoids stopping the track on mute, so this looks like a
 * third go at the same idea.
 *
 * It is not. Those two operate above the audio engine; this decides *where in
 * the graph* a mute is imposed and whether iOS is involved in it at all.
 *
 * **These assertions deliberately do not pin the chosen value.** An earlier
 * version did, and it failed the moment the choice changed on evidence — which
 * is a test complaining about the thing it was supposed to allow. What is
 * pinned is the exclusion we have positively established on a device, and the
 * mechanics of the call.
 */

const module = AudioDeviceModule as unknown as Record<string, jest.Mock>;

describe('configureMuteMode', () => {
  beforeEach(() => {
    module.getMuteMode.mockReset();
    module.setMuteMode.mockReset();
    module.getMuteMode.mockReturnValue(AudioEngineMuteMode.VoiceProcessing);
    module.setMuteMode.mockResolvedValue(undefined);
  });

  it('asks for whatever the module has settled on', async () => {
    await configureMuteMode();
    expect(module.setMuteMode).toHaveBeenCalledWith(WANTED_MUTE_MODE);
  });

  // The one value ruled out by measurement rather than argument: build 62 read
  // `mode=0` with the engine running and recording throughout a mute, so no
  // restart is happening and asking for one would be a regression into a
  // mechanism already excluded.
  it('never asks for the one that restarts the engine', () => {
    expect(WANTED_MUTE_MODE).not.toBe(AudioEngineMuteMode.RestartEngine);
  });

  it('asks for a real mode rather than the unknown sentinel', () => {
    expect(WANTED_MUTE_MODE).not.toBe(AudioEngineMuteMode.Unknown);
    expect([
      AudioEngineMuteMode.VoiceProcessing,
      AudioEngineMuteMode.InputMixer,
    ]).toContain(WANTED_MUTE_MODE);
  });

  it('reports what it displaced, which is observable only here', async () => {
    module.getMuteMode.mockReturnValue(AudioEngineMuteMode.VoiceProcessing);
    await expect(configureMuteMode()).resolves.toBe(
      AudioEngineMuteMode.VoiceProcessing
    );
  });

  it('reads before it writes, or it would report its own value back', async () => {
    await configureMuteMode();
    const read = module.getMuteMode.mock.invocationCallOrder[0];
    const write = module.setMuteMode.mock.invocationCallOrder[0];
    expect(read).toBeLessThan(write);
  });
});
