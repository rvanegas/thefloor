import { Alert, Linking } from 'react-native';

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
 */
export async function openUrl(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    // Nothing in the app can fix this, and failing silently would look like a
    // dead link rather than a refusal by the OS.
    Alert.alert('Could not open link', url);
  }
}
