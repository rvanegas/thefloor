/**
 * What this device says about where it is.
 *
 * Reported to the server, which decides what to do with it — the app makes no
 * judgement of its own. That split is the point: the rule this feeds is an App
 * Store compliance rule, and a rule compiled into a binary takes a release and
 * a week of people updating to change, while one on the server takes a restart.
 *
 * `Intl` is built into Hermes, so this costs no dependency and no native
 * module. It is also not the App Store storefront, which is the thing the rule
 * is really about and which only StoreKit can answer — see the server's
 * region.ts for why an approximation is acceptable here and which way it is
 * deliberately wrong.
 */
export interface DeviceRegion {
  /** A BCP 47 tag, e.g. `en-US`. Undefined if the platform will not say. */
  locale?: string;
  /** An IANA zone, e.g. `America/Los_Angeles`. */
  tz?: string;
}

/**
 * Never throws, and reports nothing rather than guessing.
 *
 * `Intl` is present everywhere this runs today, but it is the kind of thing a
 * JS engine flag can remove — and the server reads an absent answer as "hide
 * the link", so the failure mode of this whole function is a missing donate
 * button rather than a broken settings screen or a compliance problem.
 */
export function deviceRegion(): DeviceRegion {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions();
    return { locale: resolved.locale, tz: resolved.timeZone };
  } catch {
    return {};
  }
}
