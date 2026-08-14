import { deviceRegion } from '../region';

/**
 * The app reports where the device says it is and makes no decision about it.
 * What matters here is only that it reports something usable, and that it
 * cannot throw — the server reads an absent answer as "hide the donate link",
 * so failing quietly is the correct and safe behaviour.
 */

describe('deviceRegion', () => {
  it('reports a locale and a timezone', () => {
    const region = deviceRegion();
    // Shapes rather than values: the test runner's own region is not the
    // subject, and asserting on it would fail on somebody else's machine.
    expect(region.locale).toMatch(/^[a-z]{2}/i);
    expect(region.tz).toContain('/');
  });

  it('reports nothing rather than throwing when Intl is unavailable', () => {
    const scope = globalThis as { Intl?: unknown };
    const real = scope.Intl;
    // Some engine builds ship without Intl, and a settings screen that threw
    // on open would be a much worse fault than a missing donate button.
    scope.Intl = undefined;
    try {
      expect(deviceRegion()).toEqual({});
    } finally {
      scope.Intl = real;
    }
  });
});
