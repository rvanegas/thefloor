/**
 * @jest-environment jsdom
 */

import { palettes } from '../theme';

/**
 * The stylesheet the web build paints from.
 *
 * `theme.ts` resolves every colour to `var(--floor-<token>)` on web, so these
 * declarations are the colours — a missing or misnamed one is not a wrong
 * shade but a token that resolves to nothing at all. Nothing in this repository
 * can open a browser, so what is checked here is that every token the app asks
 * for is defined, in both schemes, and that the three states are arranged so a
 * chosen scheme beats the operating system's.
 */

const load = (): typeof import('../cssVariables.web') => {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../cssVariables.web') as typeof import('../cssVariables.web');
};

/** The stylesheet as installed, read back off the element. */
function css(): string {
  document.head.innerHTML = '';
  load().installThemeVariables();
  return document.getElementById('thefloor-theme')?.textContent ?? '';
}

describe('the web palette reaches the document', () => {
  it('defines every token the app asks for', () => {
    const text = css();
    for (const token of Object.keys(palettes.dark)) {
      expect(text).toContain(`--floor-${token}:`);
    }
  });

  it('carries both schemes, with the light one on bare :root', () => {
    const text = css();
    // A browser told nothing gets light; dark arrives only by preference or
    // by choice. Asserted on a token whose two values are far apart.
    const root = text.slice(text.indexOf(':root {'), text.indexOf('@media'));
    expect(root).toContain(`--floor-bg: ${palettes.light.bg};`);
    expect(text).toContain(`--floor-bg: ${palettes.dark.bg};`);
  });

  /**
   * The bug this replaces, stated as a rule: choosing Light in Settings must
   * survive an operating system set to dark. Without the `:not` the media
   * query would win, and the setting would appear to do nothing — which is
   * exactly how it was reported.
   */
  it('lets a chosen scheme beat the operating system', () => {
    const text = css();
    expect(text).toContain('@media (prefers-color-scheme: dark)');
    expect(text).toContain(':root:not([data-theme="light"])');
    expect(text).toContain(':root[data-theme="dark"]');
    expect(text).toContain(':root[data-theme="light"]');
  });

  it('paints the page behind the app, so there is no white band', () => {
    expect(css()).toContain('background-color: var(--floor-bg)');
  });

  it('installs once however many times it is called', () => {
    document.head.innerHTML = '';
    const { installThemeVariables } = load();
    installThemeVariables();
    installThemeVariables();
    installThemeVariables();
    expect(document.querySelectorAll('#thefloor-theme')).toHaveLength(1);
  });

  /**
   * Every value is a colour rather than `undefined` stringified — the failure
   * a generated stylesheet is prone to, and one that reads as a blank page
   * rather than as an error.
   */
  it('writes no empty or undefined values', () => {
    const text = css();
    expect(text).not.toContain('undefined');
    expect(text).not.toMatch(/--floor-[a-zA-Z]+:\s*;/);
  });
});
