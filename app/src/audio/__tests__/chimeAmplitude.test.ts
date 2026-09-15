import {
  CHIME_AMPLITUDES,
  DEFAULT_ACCOUNT_SETTINGS,
  isChimeAmplitude,
} from '../../../../core/settings';
import { CHIME_AMPLITUDE } from '../../../modules/audio-route';

/**
 * The three copies of the peak the app plays at, kept equal.
 *
 * It is written down in `core/settings.ts` as the untouched account's answer,
 * in `app/modules/audio-route/index.ts` as the default argument every caller
 * that says nothing gets, and in `AudioRouteModule.swift` as what the renderer
 * bakes in for a call that carries no peak. **Two of the three are reachable
 * from jest and this is the assertion about them**; the Swift is not, and the
 * audio lab's *ships at* readout is what compares a running binary to this.
 *
 * The cost of them disagreeing is not a crash but a shrug: the settings screen
 * would show *Quietest* selected while the chime played at something else, and
 * nothing anywhere would say so.
 */
describe('the peak the app plays at', () => {
  it('is the same number in core and in the native module', () => {
    expect(DEFAULT_ACCOUNT_SETTINGS.chimeAmplitude).toBe(CHIME_AMPLITUDE);
  });

  /**
   * The default has to be on the ladder, or the settings screen opens with
   * none of its five buttons lit for somebody who has never chosen.
   */
  it('is one of the five somebody can choose', () => {
    expect(isChimeAmplitude(DEFAULT_ACCOUNT_SETTINGS.chimeAmplitude)).toBe(
      true
    );
  });

  it('accepts nothing off the ladder', () => {
    expect(CHIME_AMPLITUDES.length).toBe(5);
    expect(isChimeAmplitude(0.42)).toBe(false);
    expect(isChimeAmplitude(0)).toBe(false);
    expect(isChimeAmplitude('0.18')).toBe(false);
    expect(isChimeAmplitude(undefined)).toBe(false);
    // Rendering at a peak above full scale is a clipped sine, and the native
    // half clamps it — which would make the setting and the sound disagree.
    expect(isChimeAmplitude(1.5)).toBe(false);
  });
});
