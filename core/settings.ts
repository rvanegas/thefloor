/**
 * The settings that belong to a person rather than to a phone.
 *
 * Here rather than in the server for the reason `notifications.ts` is here:
 * both ends need the same answer to "what does somebody who has never touched
 * this get". The server stores only the exceptions, so it reads the default
 * on every fetch; the app has to draw the screen before the server has said
 * anything at all, and a second table of defaults in the client is one that
 * can disagree with what the account actually holds.
 *
 * **Two of the three settings on the Home settings screen are here, and the
 * third deliberately is not.** Appearance and the tap are about the person:
 * somebody who has chosen dark has chosen it, and signing in on a second phone
 * to find it light is the app forgetting something it was told. `steadyHeadset`
 * is about the hardware in somebody's ears — the same person with AirPods on a
 * walk and a Bluetooth speaker on a desk may reasonably want opposite answers —
 * so it stays on the device, in the app's own storage, and never crosses this
 * wire. See `app/src/state/AppProvider.tsx`.
 */

/**
 * Light, dark, or whatever the phone is set to.
 *
 * `system` is a value rather than an absence, because the platform call that
 * applies it wants one — see `app/src/ui/appearance.ts`, where `system` is
 * translated to the `null` that means "stop overriding". Storing it as a
 * choice keeps the wire, the database and the platform in agreement about
 * there being three states rather than two and a gap.
 */
export type ColorSchemePreference = 'light' | 'dark' | 'system';

export function isColorSchemePreference(
  value: unknown
): value is ColorSchemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * Everything about this account that is a preference rather than a fact.
 *
 * Complete rather than partial on the way out — every field always present,
 * defaults filled in — so a client never has to know what the server's
 * defaults are in order to render a screen. Partial on the way *in*, which is
 * `POST /me/settings` and is a different shape for the reason `POST /me` is:
 * a screen saving one setting must not blank the other.
 */
export interface AccountSettings {
  appearance: ColorSchemePreference;
  /**
   * Whether tapping a channel on Home steps into it, or only opens its screen.
   *
   * Set, which is the default, a tap is arriving: the app enters and the
   * others can hear you. Unset, a tap is only looking.
   */
  tapToStepIn: boolean;
}

/**
 * What somebody who has never touched either setting gets.
 *
 * The tap defaults on because arriving is what a channel is for, and the
 * scheme defaults to the phone's because an app that has not been told
 * anything should look like the rest of the phone.
 */
export const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = {
  appearance: 'system',
  tapToStepIn: true,
};
