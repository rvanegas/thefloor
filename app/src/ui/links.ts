import { Alert, Linking, Platform } from 'react-native';
import type { Strings } from '../i18n';

/**
 * What the app does with a URL somebody else wrote.
 *
 * **This file was `markdown.tsx` until 2026-09-13**, and was mostly a
 * hand-rolled inline Markdown parser and renderer for the channel notepad —
 * bold, italic, code, strikethrough and links, with a live preview beside the
 * field. The notepad is plain text now, so the parser had nothing left to
 * parse and went with it; what stayed is the pair the *clipboard* still needs,
 * which never had anything to do with markup.
 */

/** Schemes a link may use. Everything else is left as inert text. */
const SAFE_SCHEMES = ['http:', 'https:', 'mailto:'];

/**
 * Whether a URL is safe to hand to the OS.
 *
 * The check is an allowlist rather than a denylist because the interesting
 * attacks are the ones nobody thought of. What this guards is text one member
 * of a channel put on the clipboard and the others are offered a button to
 * open, so it is untrusted input from a person you may know only slightly —
 * and `Linking.openURL` will hand anything to the system, including schemes
 * that open other apps with arguments. `javascript:` is the famous one; it is
 * not the only one.
 */
export function isSafeUrl(url: string): boolean {
  try {
    return SAFE_SCHEMES.includes(new URL(url).protocol);
  } catch {
    // Not a parseable absolute URL. A bare "example.com" is a plausible thing
    // to type, but resolving it would mean guessing a scheme on the reader's
    // behalf, so it stays text.
    return false;
  }
}

/**
 * Hands a URL to the system, saying so when the system will not take it.
 *
 * `isSafeUrl` above is the other half and callers owe it — this asks no
 * questions about what it is given. Links leave the app: they open in the
 * system browser rather than a web view, so what is shown carries the
 * browser's own address bar and the reader can see where a link from another
 * member led.
 *
 * noesis's web client opens here too — the list of somebody's libraries, one
 * library, a file filed there — in whichever browser they have chosen, as an
 * app of its own beside The Floor. From 2026-11-09 to 2026-11-10 it opened in
 * the system sheet instead, which shares Safari's cookies and so the session
 * at auth that signed somebody in to The Floor; the default browser may know
 * nobody (Chrome did) and ask them to sign in once more. That was undone:
 * what is wanted is their own browser, independent of the app — and the
 * sign-in with it, which `openNoesis` below carries.
 */
export async function openUrl(
  url: string,
  words: Strings['links']
): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    // Nothing in the app can fix this, and failing silently would look like a
    // dead link rather than a refusal by the OS.
    Alert.alert(words.couldNotOpenLink(), url);
  }
}

/**
 * Opens noesis's web client in the person's own browser, signed in: `link`
 * (AppProvider's `noesisLink`) trades the URL for one through auth's
 * `/handoff`, which signs that browser in on its way, since 2026-11-10, so
 * noesis does not ask for an address and a code. Where the server cannot make
 * one, the URL itself, and noesis asks. On the web, the URL itself: the tab
 * opens in the browser that signed in to The Floor, whose session it shares.
 */
export async function openNoesis(
  url: string,
  words: Strings['links'],
  link: (url: string) => Promise<string>
): Promise<void> {
  return openUrl(Platform.OS === 'web' ? url : await link(url), words);
}
