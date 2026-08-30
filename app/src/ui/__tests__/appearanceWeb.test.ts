/**
 * @jest-environment jsdom
 */

/**
 * Choosing a scheme, in a browser.
 *
 * The reported bug was that the web app was dark whatever Settings said, and
 * it had two halves: `theme.ts` handed web the dark palette outright, and
 * `applyPreference` returned early on anything that was not iOS, so the
 * setting had nothing to act on even once the palette could vary.
 *
 * This is the second half. `Platform` is mocked to `web` rather than the suite
 * being run under that platform, since the preset does not offer one.
 */

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
  Appearance: { setColorScheme: jest.fn() },
}));

import { applyPreference } from '../appearance';

describe('choosing a scheme in a browser', () => {
  const root = () => document.documentElement;

  beforeEach(() => {
    root().removeAttribute('data-theme');
  });

  it('writes the choice onto the root element', () => {
    applyPreference('dark');
    expect(root().getAttribute('data-theme')).toBe('dark');

    applyPreference('light');
    expect(root().getAttribute('data-theme')).toBe('light');
  });

  /**
   * `system` removes the attribute rather than naming a scheme, so
   * `prefers-color-scheme` is consulted again — the same reason iOS passes
   * `null` to `setColorScheme`. Setting it to the string "system" would match
   * neither selector and leave the app on whatever bare `:root` carries,
   * which is light, whatever the operating system says.
   */
  it('stops overriding rather than naming a third scheme', () => {
    applyPreference('dark');
    expect(root().getAttribute('data-theme')).toBe('dark');

    applyPreference('system');
    expect(root().hasAttribute('data-theme')).toBe(false);
  });

  it('is idempotent', () => {
    applyPreference('light');
    applyPreference('light');
    expect(root().getAttribute('data-theme')).toBe('light');
  });
});
