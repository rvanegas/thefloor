/**
 * In-app browsers, on a platform that is not in one.
 *
 * A phone running the installed app is not inside anybody's `WKWebView` and
 * never can be, so the answer here is a constant. `embedded.web.ts` is the
 * sibling that does the work, and `core/embedded.ts` is the rule both sides
 * share.
 *
 * A no-op rather than an absence, on the same reasoning as `useRoute.ts`:
 * `AuthView` calls it unconditionally and carries no platform test. `Platform.OS`
 * in a shared view is a thing that has to be right in two builds at once, and
 * this is a file Metro picks instead.
 */

export function inEmbeddedBrowser(): boolean {
  return false;
}

/**
 * The address of this page, for putting on the clipboard.
 *
 * Here so that `window` stays out of `AuthView.tsx`, which is shared and must
 * still typecheck against react-native's globals. Empty on a phone, which has
 * no address bar and no caller — nothing reads this unless
 * `inEmbeddedBrowser()` was true.
 */
export function currentLink(): string {
  return '';
}
