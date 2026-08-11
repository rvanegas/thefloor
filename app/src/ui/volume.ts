/**
 * Where the Quieter and Louder buttons land next.
 *
 * A tenth at a time is right for most of the range, but not at the bottom of
 * it: music playing under a conversation lives below 10%, and there a single
 * step is the difference between a bed and silence. So the scale is coarse
 * above 10% and fine at or below it.
 *
 * This is how the controls behave, not a rule the server enforces — the
 * reducer takes any volume it is given and only clamps it — which is why it
 * lives here rather than in `core/`.
 */

const COARSE_STEP = 10;
const FINE_STEP = 1;

/** At and below this, in percent, the buttons move one point at a time. */
const FINE_AT_OR_BELOW = 10;

const toPercent = (volume: number) =>
  Math.min(100, Math.max(0, Math.round(volume * 100)));

/**
 * Steps land on multiples of the step size rather than adding blindly, so a
 * volume arrived at some other way — the 70% a track starts at, a value from
 * an older client — still walks a tidy grid.
 */
export function louder(volume: number): number {
  const percent = toPercent(volume);
  const step = percent < FINE_AT_OR_BELOW ? FINE_STEP : COARSE_STEP;
  return Math.min(100, (Math.floor(percent / step) + 1) * step) / 100;
}

export function quieter(volume: number): number {
  const percent = toPercent(volume);
  const step = percent <= FINE_AT_OR_BELOW ? FINE_STEP : COARSE_STEP;
  return Math.max(0, (Math.ceil(percent / step) - 1) * step) / 100;
}
