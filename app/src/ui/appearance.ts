import { Appearance, Platform } from 'react-native';

/**
 * Light, dark, or whatever the phone is set to.
 *
 * `Appearance.setColorScheme` sets the *window's* override, which is the trait
 * collection `DynamicColorIOS` resolves against — so choosing a scheme needs
 * nothing else in the app to know about it. No context, no re-render, no
 * second source of colour: the same mechanism that follows the system setting
 * carries the override too.
 *
 * `null` is the system, and is what `setColorScheme` wants for "stop
 * overriding" — so the stored value and the platform call agree, and there is
 * no third representation to convert between.
 */
export type ColorSchemePreference = 'light' | 'dark' | 'system';

export const APPEARANCE_KEY = 'thefloor.appearance';

export function isPreference(value: unknown): value is ColorSchemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * Applies a preference to the window.
 *
 * Guarded like the palette itself: Android is not built, and the whole scheme
 * there is the dark one regardless of what is stored.
 *
 * **The web has the same shape by a different mechanism.** `theme.ts` resolves
 * every colour to a CSS custom property there, so the override is an attribute
 * on the root element and the browser repaints from it — which is exactly what
 * `setColorScheme` does to the trait collection `DynamicColorIOS` reads. In
 * both cases nothing else in the app learns that a scheme changed, and the
 * same mechanism that follows the system setting carries the override.
 *
 * Removing the attribute rather than setting it to something is how `system`
 * is expressed, so that `prefers-color-scheme` is consulted again — the same
 * reason iOS passes `null`. See `ui/cssVariables.web.ts` for the three states.
 */
export function applyPreference(preference: ColorSchemePreference): void {
  if (Platform.OS === 'web') {
    try {
      const root = globalThis.document?.documentElement;
      if (!root) return;
      if (preference === 'system') root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', preference);
    } catch {
      // A document that will not be written to is one where nothing renders.
    }
    return;
  }
  if (Platform.OS !== 'ios') return;
  Appearance.setColorScheme(preference === 'system' ? null : preference);
}
