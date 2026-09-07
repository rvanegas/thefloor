/**
 * Whether the browser has been told, once, that the app on a phone is the one
 * that can reach you.
 *
 * **The one thing a browser cannot do is the whole reason this exists.**
 * Everything else about the web app is a convenience with a real cost only to
 * the person choosing it; notifications are different, because what they cost
 * is other people's ability to reach you, and somebody who does not know that
 * has not chosen anything. So a new arrival is told — and told once, since a
 * standing banner about an install they have declined is an advertisement.
 *
 * `localStorage` directly rather than through `AppProvider`'s `storage`, which
 * is private to that module and wraps SecureStore for native. Nothing here is
 * native: the notice is drawn only in a browser, so the browser's own store is
 * the store, and there is no keychain question to answer. It is deliberately
 * *not* cleared on sign-out — the fact it records is about this browser rather
 * than about whoever is signed into it, and a second account on one laptop
 * being told again would be the app forgetting a conversation it has had.
 */
const INSTALL_DISMISSED_KEY = 'thefloor.install.dismissed';

/** Whether the notice has already been dismissed here. */
export function installNoticeDismissed(): boolean {
  try {
    return globalThis.localStorage?.getItem(INSTALL_DISMISSED_KEY) === 'true';
  } catch {
    // Safari with storage blocked throws rather than answering null. Treated
    // as *not* dismissed, which shows the notice to somebody who may have
    // dismissed it before — the wrong direction to be wrong in only if the
    // alternative is hiding it from somebody who has never seen it.
    return false;
  }
}

export function dismissInstallNotice(): void {
  try {
    globalThis.localStorage?.setItem(INSTALL_DISMISSED_KEY, 'true');
  } catch {
    // Nothing to do: it will be offered again next visit, which is a nuisance
    // rather than a fault, and the same browser is refusing every other
    // preference this app holds.
  }
}
