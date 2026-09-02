import { Appearance, Platform } from 'react-native';
import {
  isColorSchemePreference,
  type ColorSchemePreference,
} from '../../../core/settings';

/**
 * Light, dark, or whatever the phone is set to.
 *
 * The type is `core/settings.ts`'s, re-exported here rather than declared,
 * because the choice now crosses the wire: it belongs to the account, and two
 * declarations of what a scheme may be is exactly the drift `core/` exists to
 * prevent. What stays here is the half that is about *this* window.
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
export type { ColorSchemePreference };

/**
 * Where the last-known scheme is cached on this device.
 *
 * **A cache of the account's answer, not the answer itself**, since 2026-08-31
 * — it exists for the frames between a launch and the server's `hello`, which
 * is the gap a stored scheme was always covering. Written whenever the server
 * says something and cleared at sign-out, so one person's dark cannot paint
 * the next person's first screen. See `AppProvider`.
 */
export const APPEARANCE_KEY = 'thefloor.appearance';

/**
 * Kept as a name of its own, delegating, because this module is what the app
 * imports for anything to do with a scheme and a caller reaching past it into
 * `core/` for a guard would be reaching past the platform half as well.
 */
export function isPreference(value: unknown): value is ColorSchemePreference {
  return isColorSchemePreference(value);
}

/**
 * Applies a preference to the window.
 *
 * Guarded like the palette itself, and for the same reason it gives: where no
 * scheme can be resolved the answer is **light**, so on Android the whole app
 * is the light palette regardless of what is stored, and there is nothing for
 * a preference to change.
 *
 * **This said "dark" until 2026-09-01**, on the strength of nobody having built
 * Android to look at. `theme.ts` had already been changed to fall back to light
 * — deliberately, and it explains why — and this comment was not changed with
 * it. The first Android build settled it by rendering: light. Worth knowing as
 * a shape rather than a typo, since a guard whose comment describes the wrong
 * behaviour is how somebody "fixes" the guard.
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
