import { AudioSession } from '@livekit/react-native';
import { createChannel, reduce } from '../../../../core/channel';
import { isScreening, microphoneNeeded } from '../../../../core/micNeeded';
import type { ChannelAction, ChannelState } from '../../../../core/types';
import { CALL } from '../session';
import {
  PROBES,
  PROBE_GROUPS,
  WRITE_PROBES,
  filmProbeEngaged,
  filmProbeKeepsMicrophone,
  runProbe,
  setFilmProbe,
} from '../probe';

/**
 * The write probes, pinned for the two properties that make them usable as an
 * instrument rather than as five buttons.
 *
 * Neither assertion is about the audio session, and that is the point: nothing
 * under jest has one. What can be checked at a desk is that each press is one
 * write, and that a destructive press cannot be reached by sweeping a list of
 * readers. The reading itself is taken on a phone — see
 * planning/decisions/2026-09-27-the-film-stops-the-engine.md.
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

/**
 * The film probe, whose one hazard is the one it is tested for.
 *
 * It exists to keep a microphone through a film so that the engine is up when
 * the film's audio arrives — see the header in `probe.ts`. What it must never do
 * is open a microphone for somebody who has no business holding one, because it
 * is reached by a switch on a screen rather than by a rule anybody reads.
 */
const A = 'user-a';
const B = 'user-b';
const T0 = 1_700_000_000_000;

function apply(
  state: ChannelState,
  steps: Array<[ChannelAction, number]>
): ChannelState {
  return steps.reduce((s, [action, at]) => reduce(s, action, at), state);
}

/** A and B in a room, A showing the film on this device, playing. */
function screening(): ChannelState {
  return apply(
    reduce(
      createChannel({ id: 's1', initiator: A, invitees: [B], now: T0 }),
      { type: 'ENTER', userId: B },
      T0
    ),
    [
      [
        {
          type: 'START_WATCH',
          userId: A,
          videoId: 'dQw4w9WgXcQ',
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        },
        T0,
      ],
      [{ type: 'WATCH_READY', userId: A, durationMs: 600_000 }, T0],
      [{ type: 'WATCH_HERE', userId: A, watching: true }, T0],
      [{ type: 'WATCH_PLAY', userId: A }, T0],
    ]
  );
}

describe('the film probe', () => {
  afterEach(() => setFilmProbe(false, () => {}));

  it('is off until something turns it on, and says so when it moves', () => {
    const log: string[] = [];
    expect(filmProbeEngaged()).toBe(false);
    setFilmProbe(true, (t) => log.push(t));
    expect(filmProbeEngaged()).toBe(true);
    // Idempotent, so a second press writes no second line — a log that said a
    // thing twice would read as two experiments.
    setFilmProbe(true, (t) => log.push(t));
    setFilmProbe(false, (t) => log.push(t));
    expect(log).toEqual([
      'film probe on — keeping the microphone through the film',
      'film probe off — the film releases the microphone again',
    ]);
  });

  /**
   * The point of it: the one clause it adds back is the film's.
   */
  it('restores the microphone the film took, and only while on', () => {
    const state = screening();
    // The fixture is the state this exists for, or the test below proves nothing.
    expect(isScreening(state, A)).toBe(true);
    expect(microphoneNeeded(state, A)).toBe(false);

    expect(filmProbeKeepsMicrophone(state, A)).toBe(false);
    setFilmProbe(true, () => {});
    expect(filmProbeKeepsMicrophone(state, A)).toBe(true);
  });

  /**
   * **The hazard.** `hasMicrophone` is the guard, so the probe can add nothing
   * for somebody the room is not holding — and this is what would be broken by
   * somebody "simplifying" the guard to the bare flag.
   */
  it('adds nothing for somebody who is not in the room', () => {
    setFilmProbe(true, () => {});
    const out = reduce(screening(), { type: 'STEP_OUT', userId: B }, T0 + 1);
    expect(filmProbeKeepsMicrophone(out, B)).toBe(false);
    // And it is not a claim about this device either: a member who never
    // stepped in is the same answer.
    expect(filmProbeKeepsMicrophone(out, 'user-c')).toBe(false);
  });
});
