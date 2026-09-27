import { AudioSession } from '@livekit/react-native';
import { CALL } from '../session';
import { PROBES, PROBE_GROUPS, WRITE_PROBES, runProbe } from '../probe';

/**
 * The write probes, pinned for the two properties that make them usable as an
 * instrument rather than as five buttons.
 *
 * Neither assertion is about the audio session, and that is the point: nothing
 * under jest has one. What can be checked at a desk is that each press is one
 * write, and that a destructive press cannot be reached by sweeping a list of
 * readers. The reading itself is taken on a phone — see
 * `planning/tasks/a-film-in-stereo-needs-no-teardown.md`.
 */
const applied = AudioSession.setAppleAudioConfiguration as jest.Mock;

describe('the write probes', () => {
  beforeEach(() => applied.mockClear());

  /**
   * One press, one write. The whole harness rests on the same rule the readers
   * above it follow: a button that wrote twice would name the wrong half of
   * `SCREENING`, which is the distinction the experiment exists to make.
   */
  it('makes exactly one session write per probe', async () => {
    for (const probe of WRITE_PROBES) {
      applied.mockClear();
      const log: string[] = [];
      await runProbe(probe, (text) => log.push(text));
      // The raw probe goes through this app's own native module rather than the
      // SDK, which is absent under jest and returns null — so it writes nothing
      // here, and that is the one exception.
      const viaSdk = !probe.name.includes('raw');
      expect(applied).toHaveBeenCalledTimes(viaSdk ? 1 : 0);
      expect(log).toEqual([`probe ${probe.name} →`, `probe ${probe.name} ✓`]);
    }
  });

  /**
   * **Each write changes one thing, or the reading cannot separate them.**
   * Build 296 changed the mode and the options together and that is precisely
   * why its measurement could not say which of the two stopped the engine.
   */
  it('changes one thing at a time, against the configuration in force', async () => {
    const write = async (name: string) => {
      applied.mockClear();
      const probe = WRITE_PROBES.find((p) => p.name.startsWith(name));
      await runProbe(probe!, () => {});
      return applied.mock.calls[0][0];
    };

    expect(await write('write CALL unchanged (livekit)')).toEqual(CALL);

    const options = await write('write options only');
    expect(options.audioCategory).toBe(CALL.audioCategory);
    expect(options.audioMode).toBe(CALL.audioMode);
    expect(options.audioCategoryOptions).toContain('allowBluetoothA2DP');

    const mode = await write('write mode only');
    expect(mode.audioCategory).toBe(CALL.audioCategory);
    expect(mode.audioCategoryOptions).toEqual(CALL.audioCategoryOptions);
    expect(mode.audioMode).toBe('default');

    // The control is the one that changes both, being what shipped.
    const control = await write('write SCREENING as it was');
    expect(control).toEqual({
      audioCategory: 'playAndRecord',
      audioCategoryOptions: ['allowBluetoothA2DP'],
      audioMode: 'default',
    });
  });

  /**
   * A write may not be reachable from a reader sweep. `PROBE_GROUPS` exists to
   * be pressed without thinking about what is in it; one known engine-killer
   * inside that would destroy the reading it was taking.
   */
  it('is not reachable from the reader list or its groups', () => {
    const names = new Set(PROBES.map((p) => p.name));
    for (const probe of WRITE_PROBES) expect(names.has(probe.name)).toBe(false);
    for (const group of PROBE_GROUPS) {
      for (const probe of group.probes) expect(names.has(probe.name)).toBe(true);
    }
  });
});
