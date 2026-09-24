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
 * Appearance, the language, the tap and the control cards are about the person:
 * somebody who has chosen dark has chosen it, and signing in on a second phone
 * to find it light — or in the other language — is the app forgetting something
 * it was told.
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
 * Which language the app speaks: English, Spanish, or whatever the phone is
 * set to.
 *
 * **Shaped like `ColorSchemePreference` and for the same reason** — `system`
 * is a value rather than an absence, because it is a choice somebody can make
 * back again and because the alternative is a null that means two things. What
 * resolves it is `app/src/i18n/language.tsx`, which reads the device's tag
 * through `deviceRegion` and hands it to `stringsFor`.
 *
 * **The two languages, not every tag the catalogue could be asked for.** There
 * are two catalogues — `en.ts` and `es.ts` — and `stringsFor` answers English
 * for anything it does not recognise; a preference that could hold `fr` would
 * be a stored choice the app silently ignores. A third catalogue adds a member
 * here in the same commit, which is the check a typed union buys.
 */
export type LanguagePreference = 'en' | 'es' | 'system';

export function isLanguagePreference(
  value: unknown
): value is LanguagePreference {
  return value === 'en' || value === 'es' || value === 'system';
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
   * Which language this person is read to in.
   *
   * **The account's rather than the phone's**, on `appearance`'s reasoning
   * exactly: somebody who has chosen Spanish has chosen it, and signing in on
   * a second handset to be addressed in English is the app forgetting
   * something it was told. It is also the setting where getting that wrong
   * costs the most — a scheme you dislike is still readable.
   *
   * `system` is the default, so an app that has been told nothing speaks
   * whatever the rest of the phone does. See `LanguagePreference` above.
   */
  language: LanguagePreference;
  /*
   * `tapToLook` was here until 2026-09-21, and is now how the app always
   * behaves: a tap opens a channel's screen and never puts you in the room.
   * It is not a setting any more, so there is nothing to store and nothing to
   * default. See
   * `decisions/2026-09-21-a-tap-only-ever-looks.md`.
   *
   * `settings-wire.ts` still *sends* the name, as a constant, because builds
   * already on phones read it — and a build that stopped hearing it would
   * fall back to tapping as arriving, which is the behaviour being removed.
   */
  /**
   * Whether the channel screen has stopped drawing a card for each of the
   * controls pinned in its footer.
   *
   * **Nothing reads this as of 2026-09-13**, and it is here because taking it
   * out is a wire change and a migration rather than a deletion. It is still
   * accepted on `PATCH /settings`, still a column on `accounts`, still
   * mirrored into the app's state — and no screen asks it anything.
   *
   * What it used to govern: the channel screen drew the floor, the
   * microphone and the two departures as a card apiece further down the
   * screen as well as a slot in the bar, and setting this dropped the cards.
   * Every one of those cards has since been deleted outright or reduced to
   * the sentence a footer cannot carry, so there is no longer a screen for it
   * to switch between. The Home settings toggle went with them. See
   * `planning/decisions/2026-09-13-the-cards-a-footer-made-redundant.md`.
   *
   * **Retiring it is the wire two-step**, not a field deletion: the server
   * keeps accepting the name while any installed build still sends it, and
   * `settings-wire.ts` already carries an alias for the older `controlCards`
   * spelling that would go at the same time. SHIMS.md is where that gets
   * written down when somebody starts it.
   */
  hideControlCards: boolean;
  /**
   * Whether the experimental parts of the app are visible and usable at all.
   *
   * Unset, which is the default, this app is what it has always been: a
   * channel is voices, a clipboard, a shared track, a recording and a video
   * watched together. Set, transcripts appear on recordings and the control
   * that asks for one starts working.
   *
   * The watch party was behind this until 2026-09-18 and is not any more: it
   * had stopped being unfinished, and a feature nobody can reach is not being
   * tested by anybody. Labs is down to the one thing again.
   *
   * **It is a gate rather than a preference**, which is the one thing that
   * still sets it apart from the two above now that all three read the same
   * way round. They change how something already yours behaves; this one
   * decides whether something exists for you. That is also why it is enforced
   * at both ends: the app withholds the surfaces, and the server refuses the
   * action that begins the feature — asking for a transcript, which spends
   * money at a third party. A hidden control and a refused action must not
   * disagree, and here the refusal is the one that matters.
   *
   * It follows the person rather than the phone on the plainest reading of
   * the two above: having asked to see the unfinished parts of an app is
   * something you asked, not something a handset knows.
   */
  labs: boolean;
  /**
   * Whether we may write to this person about the application rather than to
   * sign them in — news, and how to use the thing.
   *
   * **The one setting here that is a permission rather than a preference**,
   * and the difference shows in two places. Its default is false because
   * nobody has said yes, not because false is the nicer behaviour; and it is
   * stored as the date it was granted rather than as a 1, since a consent is
   * something somebody may later have to be shown the date of. See
   * `accounts.marketing_email_at`, which is what this boolean is a reading of.
   *
   * **It is granted in two places and withdrawn in one.** The sign-in screen
   * offers it to somebody signing up, where it can only ever be a grant — that
   * screen is read before anybody is identified, so it cannot show an answer
   * already given and starts clear on every device. Floor Settings is behind a
   * session, can therefore show it in force, and is the only place it goes
   * both ways. See GLOSSARY.md § *Marketing email*.
   */
  marketingEmail: boolean;
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
 * **Nothing here is an exception to that any more.** `tabsAtFoot` was one for
 * a day — an account that had never said got a coin toss from the server
 * rather than a value from this object — and went on 2026-09-13 with the
 * choice it belonged to. See
 * planning/decisions/2026-09-13-the-channel-tabs-stay-at-the-top.md.
 *
 * **The chime's loudness was the one value here that was not a boolean**, and
 * it went on 2026-09-15, the day after it arrived: every rung of the ladder
 * sounded much the same through a phone's alert path, so the choice was five
 * words over one sound. It is a constant now — `CHIME_AMPLITUDE` in
 * `app/modules/audio-route/index.ts`, the top rung — and nothing about it
 * crosses this wire. See
 * planning/decisions/2026-09-15-the-chime-has-one-loudness-again.md.
 *
 * Labs defaults off because that is what the word means. Everything behind it
 * is unfinished by admission, and an experimental feature that arrives without
 * being asked for is not experimental — it has shipped.
 */
export const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = {
  appearance: 'system',
  /**
   * The phone's language, for the reason the scheme follows the phone's
   * palette: an app that has not been told anything should be the rest of the
   * handset.
   */
  language: 'system',
  hideControlCards: false,
  labs: false,
  /**
   * Nobody has given permission, which is the only value a default may take
   * here: every other false on this object is a behaviour that can be argued
   * about, and this one is the absence of somebody's yes.
   */
  marketingEmail: false,
};
