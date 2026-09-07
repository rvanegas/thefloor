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
   * Whether tapping a channel on Home only opens its screen, rather than
   * stepping into it.
   *
   * Unset, which is the default, a tap is arriving: the app enters and the
   * others can hear you. Set, a tap is only looking.
   */
  tapToLook: boolean;
  /**
   * Whether the channel screen has stopped drawing a card for each of the
   * three controls pinned in its footer.
   *
   * Unset, which is the default, the screen is as it has always been: the
   * footer is a row of shortcuts and the floor, the microphone and the two
   * departures each keep a card further down, where the state is explained.
   * Set, the cards go and the footer is the whole of those three controls —
   * a channel screen that opens on who is in the room and what the room is
   * carrying, for somebody who has learnt what the three do and no longer
   * reads the sentences under them.
   *
   * It is a preference about how much a screen repeats itself, which is a
   * habit rather than a property of a handset, so it belongs to the person on
   * the same reasoning as the tap. See `app/src/ui/ChannelView.tsx`.
   */
  hideControlCards: boolean;
  /**
   * Whether the experimental parts of the app are visible and usable at all.
   *
   * Unset, which is the default, this app is what it has always been: a
   * channel is voices, a clipboard, a shared track and a recording. Set, two
   * more things appear — transcripts on recordings, and the watch party — and
   * the controls that begin them start working.
   *
   * **It is a gate rather than a preference**, which is the one thing that
   * still sets it apart from the two above now that all three read the same
   * way round. They change how something already yours behaves; this one
   * decides whether something exists for you. That is also why it is enforced
   * at both ends: the app withholds the surfaces, and the server refuses the
   * two actions that begin one of these features — starting a watch party and
   * asking for a transcript, the second of which spends money at a third
   * party. A hidden control and a refused action must not disagree, and here
   * the refusal is the one that matters.
   *
   * It follows the person rather than the phone on the plainest reading of
   * the two above: having asked to see the unfinished parts of an app is
   * something you asked, not something a handset knows.
   */
  labs: boolean;
}

/**
 * What somebody who has never touched any of these gets.
 *
 * The scheme defaults to the phone's because an app that has not been told
 * anything should look like the rest of the phone.
 *
 * **Every boolean here is false by default, and that is a rule rather than a
 * coincidence**, since 2026-09-07. Two of them used to default on and were
 * named for the behaviour they switched *off*, so half the settings on the
 * screen said "the untouched case is true" and half said the opposite — which
 * is a thing to get wrong in every layer at once: the column that stores it,
 * the read that fills a null in, the test that asserts a fresh account, and
 * the sentence on the card. Naming each of them for the departure from the
 * default — look rather than step in, hide the cards rather than draw them —
 * makes false the answer for somebody who has never said anything, everywhere,
 * and leaves nothing to remember per setting.
 *
 * So the tap defaults to arriving, because arriving is what a channel is for;
 * the cards default to being drawn, because they are what every build before
 * that setting drew and because they are where a refused control says why it
 * is refused — which is the thing somebody has to have read before they can
 * reasonably choose to stop being shown it. Both of those are now the false
 * case rather than the true one, and neither behaviour changed.
 *
 * Labs defaults off because that is what the word means. Everything behind it
 * is unfinished by admission, and an experimental feature that arrives without
 * being asked for is not experimental — it has shipped.
 */
export const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = {
  appearance: 'system',
  tapToLook: false,
  hideControlCards: false,
  labs: false,
};
