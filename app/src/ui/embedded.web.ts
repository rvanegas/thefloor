import { isEmbeddedBrowser } from '../../../core/embedded';

/**
 * Whether this browser is somebody else's, and what to hand somebody who wants
 * out of it.
 *
 * `/app` and `/beta` open the same microphone through the same `livekit-client`
 * that the guest page does, so they inherit its worst failure: an in-app browser
 * on iOS grants the microphone and delivers digital silence, with nothing in the
 * WebRTC API reporting it. `core/embedded.ts` carries the whole account and the
 * rule; this is the browser-reading half, which is all that cannot be pure.
 *
 * `server/web/guest.ts` has a function of exactly this shape for exactly this
 * reason. They are two readers of one rule rather than two rules.
 */

export function inEmbeddedBrowser(): boolean {
  return isEmbeddedBrowser({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    telegramProxy: 'TelegramWebviewProxy' in window,
    standalone: (navigator as { standalone?: boolean }).standalone === true,
  });
}

/**
 * The address to copy, when the menu that would open this elsewhere cannot be
 * found — which is the fallback the guest page offers and the reason a copy
 * button is in the notice at all. `href` rather than anything assembled: it is
 * where this person already is, including whichever train served them.
 */
export function currentLink(): string {
  return window.location.href;
}
