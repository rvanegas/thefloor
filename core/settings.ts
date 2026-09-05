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
 * **Every setting on the Home settings screen is here, since 2026-09-05.**
 * Appearance, the tap and the control cards are about the person: somebody who
 * has chosen dark has chosen it, and signing in on a second phone to find it
 * light is the app forgetting something it was told.
 *
 * There was a fourth that deliberately was not — `steadyHeadset`, about the
 * hardware in somebody's ears rather than about the person, kept in the app's
 * own storage and never crossing this wire. It went when the playout fix made
 * its choice unreachable; see `channelHasAudio` in micNeeded.ts. **If a
 * device-scoped setting is added back, keep it out of here for that reason and
 * say so on the settings card**, since a screen where some settings follow the
 * account and others do not is only honest if it admits which is which.
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
  /**
   * Whether the channel screen still draws a card for each of the three
   * controls pinned in its footer.
   *
   * Set, which is the default, the screen is as it has always been: the
   * footer is a row of shortcuts and the floor, the microphone and the two
   * departures each keep a card further down, where the state is explained.
   * Unset, the cards go and the footer is the whole of those three controls —
   * a channel screen that opens on who is in the room and what the room is
   * carrying, for somebody who has learnt what the three do and no longer
   * reads the sentences under them.
   *
   * It is a preference about how much a screen repeats itself, which is a
   * habit rather than a property of a handset, so it belongs to the person on
   * the same reasoning as the tap. See `app/src/ui/ChannelView.tsx`.
   */
  controlCards: boolean;
}

/**
 * What somebody who has never touched any of these gets.
 *
 * The tap defaults on because arriving is what a channel is for, and the
 * scheme defaults to the phone's because an app that has not been told
 * anything should look like the rest of the phone. The cards default on
 * because they are what every build before this setting drew, and because
 * they are where a refused control says why it is refused — which is the
 * thing somebody has to have read before they can reasonably choose to stop
 * being shown it.
 */
export const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = {
  appearance: 'system',
  tapToStepIn: true,
  controlCards: true,
};
