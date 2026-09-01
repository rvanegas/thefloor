/**
 * Whether this page is inside somebody else's browser.
 *
 * **The failure it exists for.** A guest followed a link from inside Telegram
 * on iOS, was prompted for the microphone, granted it, and was heard by
 * nobody; the same link in Chrome on the same phone was fine, which is what
 * made it findable at all. Every in-app browser on iOS is a `WKWebView` owned
 * by the host app, and the host app owns the audio session with it — so the
 * sequence that produces silence has no failure in it anywhere. `getUserMedia`
 * resolves, the track is live and unmuted, `publishTrack` succeeds, the SFU
 * forwards, and what arrives at the other end is digital silence. Apple's
 * forums carry the same shape of report against several host apps and several
 * iOS versions, and every fix in them is a change to the *embedding app*,
 * which is not us. So a page cannot fix this, and can only say so.
 *
 * **The test is by exclusion, because in-app browsers are not obliged to
 * identify themselves and the interesting one does not.** A real iOS browser
 * always announces itself — Safari with `Version/… Safari`, everything else
 * with its own token — so a WebKit page on iOS carrying neither is inside
 * something. The named checks in front are for the platforms where the host
 * app does say, and cost nothing.
 *
 * **It is wrong in both directions and is meant to be.** It misses an unnamed
 * Android WebView, which announces nothing and is not on iOS, and it will
 * accuse a browser that would have worked. That is the trade a warning at the
 * door makes: the cure is to open the link somewhere else, and the moment to
 * say so is before the seat or the session has been paid for. What is *not* a
 * guess is listening to the published track — `watchCapture` in
 * `server/web/guest.ts`, which is the measurement this is only the warning
 * for.
 *
 * Pure, and in `core/` rather than beside either caller, because both ends
 * need it: `server/web/guest.ts` for the guest page, `app/src/ui/embedded.web.ts`
 * for `/app` and `/beta`. Two copies would drift the next time a host app
 * joins the list.
 */

/**
 * What a browser knows about itself, as arguments rather than globals.
 *
 * Read from `navigator` and `window` by the callers. Passing them in is what
 * makes this testable at all — `server/web/guest.ts` says nothing in this
 * repository can test that file, and this is the half of it that can be wrong.
 */
export interface BrowserFacts {
  userAgent: string;
  /** `navigator.platform`. Deprecated, and still the only way to spot iPadOS. */
  platform: string;
  maxTouchPoints: number;
  /** `'TelegramWebviewProxy' in window`. */
  telegramProxy: boolean;
  /** `navigator.standalone` — added to the home screen. */
  standalone: boolean;
}

export function isEmbeddedBrowser(facts: BrowserFacts): boolean {
  const ua = facts.userAgent;
  if (/FBAN|FBAV|Instagram|Line\/|MicroMessenger|Telegram/i.test(ua)) return true;
  if (facts.telegramProxy) return true;

  const ios =
    /iPhone|iPad|iPod/.test(ua) ||
    (facts.platform === 'MacIntel' && facts.maxTouchPoints > 1);
  if (!ios) return false;
  // Added to the home screen is not embedded, and has no Safari token either.
  if (facts.standalone) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS|Version\/[\d.]+.*Safari/.test(ua);
}
