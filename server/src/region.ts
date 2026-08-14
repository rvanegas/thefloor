/**
 * Whether somebody may be shown the donate link.
 *
 * App Review Guideline 3.1.1(a) permits buttons and external links to payment
 * mechanisms other than in-app purchase **in the United States storefront**,
 * and prohibits them in every other one. The app ships worldwide, so something
 * has to decide, per person, which of those two situations they are in.
 *
 * This lives on the server rather than in the app deliberately. The client
 * reports facts about the device; the policy that reads them is here, so
 * tightening it — or switching to a different signal entirely — is a restart
 * rather than a new build that takes a week to reach anybody. The same reason
 * `KOFI_URL` is not in the binary.
 *
 * **It is an approximation, and it is the wrong one on purpose.** The
 * authoritative signal is the App Store storefront, which only StoreKit can
 * report and which would cost a native module to read. What is used instead is
 * where the phone says it is. So the failure modes are asymmetric by design:
 * showing the link to somebody outside the US storefront is a guideline
 * violation, while hiding it from somebody inside it costs one donation. Every
 * ambiguous case therefore resolves to hidden, and the per-account override on
 * `accounts.donations_allowed` is how a case somebody actually knows about gets
 * corrected.
 */

/**
 * IANA zones in the United States, including the territories that share its
 * App Store storefront — Puerto Rico, Guam, the US Virgin Islands, American
 * Samoa and the Northern Mariana Islands.
 *
 * A list rather than a prefix test, because `America/` spans Canada, Mexico and
 * most of South America: `America/Toronto` and `America/Sao_Paulo` would both
 * pass a prefix check, and both are the exact case this exists to exclude.
 */
const US_TIME_ZONES = new Set([
  'America/New_York',
  'America/Detroit',
  'America/Kentucky/Louisville',
  'America/Kentucky/Monticello',
  'America/Indiana/Indianapolis',
  'America/Indiana/Vincennes',
  'America/Indiana/Winamac',
  'America/Indiana/Marengo',
  'America/Indiana/Petersburg',
  'America/Indiana/Vevay',
  'America/Indiana/Tell_City',
  'America/Indiana/Knox',
  'America/Chicago',
  'America/Menominee',
  'America/North_Dakota/Center',
  'America/North_Dakota/New_Salem',
  'America/North_Dakota/Beulah',
  'America/Denver',
  'America/Boise',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/Juneau',
  'America/Sitka',
  'America/Metlakatla',
  'America/Yakutat',
  'America/Nome',
  'America/Adak',
  'Pacific/Honolulu',
  // Territories on the United States storefront.
  'America/Puerto_Rico',
  'America/St_Thomas',
  'Pacific/Guam',
  'Pacific/Saipan',
  'Pacific/Pago_Pago',
]);

/**
 * Reads the region out of a BCP 47 tag: `en-US` and `es-US` both give `US`,
 * `en-GB` gives `GB`, and a tag with no region at all gives null.
 *
 * Deliberately tolerant of the shapes a device may send — script subtags
 * (`zh-Hant-TW`), underscores from an older API (`en_US`), and extensions
 * (`en-US-u-ca-gregory`) all appear in the wild.
 */
export function regionOf(locale: string | undefined): string | null {
  if (!locale) return null;
  for (const part of locale.replace(/_/g, '-').split('-').slice(1)) {
    // A region subtag is two letters or three digits; a script subtag is four
    // letters, and skipping it is why this scans rather than taking [1].
    if (/^[A-Za-z]{2}$/.test(part)) return part.toUpperCase();
    if (/^[0-9]{3}$/.test(part)) return part;
  }
  return null;
}

/**
 * Both signals must agree, and either being absent means no.
 *
 * Requiring both is what makes the common false positive unlikely: somebody
 * outside the US who has set their phone to US formatting still reports a
 * timezone where they actually are. The cost is a false negative for a US
 * person travelling, whose timezone follows them abroad — which is precisely
 * the case a human can recognise, and precisely what the override is for.
 */
export function donationsVisibleFor(
  locale: string | undefined,
  timeZone: string | undefined
): boolean {
  if (!locale || !timeZone) return false;
  return regionOf(locale) === 'US' && US_TIME_ZONES.has(timeZone);
}
