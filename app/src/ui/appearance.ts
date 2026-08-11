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
 */
export function applyPreference(preference: ColorSchemePreference): void {
  if (Platform.OS !== 'ios') return;
  Appearance.setColorScheme(preference === 'system' ? null : preference);
}
