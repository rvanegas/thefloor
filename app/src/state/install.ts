import type { Strings } from '../i18n';

/**
 * Whether this page can be put on a home screen, and how it is done here.
 *
 * **Only the browser has anything to install.** A phone running the App Store
 * build is the thing the web app asks somebody to get closer to; there is no
 * rung for it there, and `useInstall.ts` is the stub that says so. The work is
 * in `useInstall.web.ts`, which reads the browser; this file is the rule both
 * ends share, kept pure so the wording can be tested without a `window`.
 *
 * **What an installed web app actually buys is a launcher and a window**, and
 * the copy here must not claim more. It is *not* notifications: this app has
 * no service worker and no web push at all, so an installed browser app is as
 * unreachable as a tab. The notice that asks somebody to get the real app —
 * `ui/installNotice.ts` — is the one that may talk about being reached, and
 * the two must not be confused with each other.
 */

/** What a browser says about itself, which is all this rule reads. */
export interface Browser {
  /**
   * Already launched from an icon: `display-mode: standalone` in a manifest
   * browser, `navigator.standalone` on iOS.
   */
  standalone: boolean;
  /** Safari on iOS or iPadOS, where the menu is the share sheet. */
  apple: boolean;
  /**
   * Chromium handed us a `beforeinstallprompt` and has not spent it.
   *
   * **Rarer than it looks, and that is why the menu case below exists.**
   * Chrome dropped the service-worker requirement for the *menu* item in 108
   * on mobile and 112 on desktop, but the event that offers a button of our
   * own still wants a `fetch` handler — and this app has no service worker at
   * all. So the button appears where a browser volunteers one and the rung
   * says where the menu is everywhere else.
   */
  prompt: boolean;
  /**
   * This browser has an install item somewhere in its own menus.
   *
   * The reader decides it; see `useInstall.web.ts`. It exists because desktop
   * Firefox has no such item at all, and an instruction to go and find one is
   * worse than saying nothing: a rung nobody can tick is the one failure mode
   * a checklist has.
   */
  menu: boolean;
  /**
   * Somebody else's in-app browser — see `core/embedded.ts`. There is no
   * *Add to Home Screen* in a `WKWebView`, so telling somebody to find one is
   * sending them hunting for a menu that does not exist.
   */
  embedded: boolean;
}

/** Nothing to offer, in the three ways there are of having nothing to offer. */
export interface NoOffer {
  offer: false;
}

export interface Offer {
  offer: true;
  /** What to do in *this* browser, named exactly rather than generically. */
  how: string;
  /** Whether the button can do it, rather than merely saying where it is. */
  prompt: boolean;
}

export type Install = NoOffer | Offer;

export const NOT_OFFERED: NoOffer = { offer: false };

/**
 * The offer, or nothing.
 *
 * Silence in every case where the answer is not clearly *no, and here is how*:
 * an install rung on a screen where installing is impossible is worse than no
 * rung, because the one thing a checklist item cannot do is be un-tickable.
 */
export function installOffer(
  browser: Browser,
  words: Strings['install']
): Install {
  if (browser.standalone || browser.embedded) return NOT_OFFERED;

  if (browser.prompt) {
    return {
      offer: true,
      how: words.fromHere(),
      prompt: true,
    };
  }

  if (browser.apple) {
    return {
      offer: true,
      // Named in Safari's words rather than described: the share sheet is a
      // square with an arrow, and somebody who has not found it is looking for
      // a menu.
      how: words.safari(),
      prompt: false,
    };
  }

  if (browser.menu) {
    return {
      offer: true,
      how: words.menu(),
      prompt: false,
    };
  }

  return NOT_OFFERED;
}
