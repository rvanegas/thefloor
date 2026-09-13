import { useCallback, useEffect, useState } from 'react';
import { isEmbeddedBrowser } from '../../../core/embedded';
import { installOffer, NOT_OFFERED, type Browser, type Install } from './install';
import type { InstallState } from './useInstall';

export type { InstallState };

/**
 * What the browser will say about installing this page, and the one event that
 * has to be caught before React exists.
 *
 * **`beforeinstallprompt` is fired once and is gone.** Chromium raises it as
 * soon as the page qualifies, which can be before the first component mounts,
 * and the event is only useful if `preventDefault` was called on it — so the
 * listener is registered at module scope, on import, rather than in an effect.
 * The hook below subscribes to what this module caught.
 *
 * `ui/installNotice.ts` is the neighbour that must not be confused with this:
 * that one is about getting the App Store app, whose point is that it can be
 * *notified*. This one is about a browser putting the page on a home screen,
 * which buys an icon and a window and no notifications whatsoever — this app
 * has no service worker.
 */

/** The event Chromium raises, which TypeScript's DOM library does not carry. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

/**
 * Whether this page is already running as an installed app.
 *
 * Latched in a module variable rather than read fresh every render because
 * the `appinstalled` listener below is the other writer, and a query would answer *no* for
 * the tab the install was started from.
 */
let installed = false;

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of listeners) listener();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Without this the browser shows its own bar, and the event cannot be
    // replayed from a button of ours later.
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    announce();
  });
  // The rung goes when the deed is done, without waiting for a relaunch: an
  // installed page goes on running in the tab it was installed from, and
  // `display-mode` in *that* tab never changes.
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    announce();
  });
}

function standalone(): boolean {
  if (installed) return true;
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    // Chromium's other installed modes. `fullscreen` is what an installed app
    // gets on some Android launchers; `minimal-ui` is what a desktop window
    // reports when the manifest asked for it.
    if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
    if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
  } catch {
    // A browser with no `matchMedia` cannot install anything either.
  }
  return (navigator as { standalone?: boolean }).standalone === true;
}

/**
 * Which browser this is, in the three terms the rule asks about.
 *
 * User-agent sniffing, which is not defensible in general and is the only
 * thing on offer here: what is being asked is *where is the command in your
 * chrome*, and no API answers that. `core/embedded.ts` carries the same
 * argument at greater length for the same reason.
 */
function read(): Browser {
  const ua = navigator.userAgent;
  const ios =
    /iPhone|iPad|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // Safari rather than iOS: every browser on iOS is WebKit, but only Safari
  // has *Add to Home Screen* in its share sheet.
  const apple = ios && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  const chromium = /Chrome|CriOS|Edg|OPR|SamsungBrowser/.test(ua);
  // Safari on macOS 14 and later has *Add to Dock*, in the same share menu.
  const macSafari =
    !ios && navigator.platform === 'MacIntel' && /Safari/.test(ua) && !chromium;
  // Firefox on Android has *Add to Home screen*; on the desktop it has
  // nothing, which is the case this whole flag exists for.
  const firefoxAndroid = /Firefox/.test(ua) && /Android/.test(ua);

  return {
    standalone: standalone(),
    apple,
    prompt: deferred !== null,
    menu: chromium || macSafari || firefoxAndroid,
    embedded: isEmbeddedBrowser({
      userAgent: ua,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
      telegramProxy: 'TelegramWebviewProxy' in window,
      standalone: (navigator as { standalone?: boolean }).standalone === true,
    }),
  };
}

export function useInstall(): InstallState {
  const [install, setInstall] = useState<Install>(NOT_OFFERED);

  useEffect(() => {
    const update = () => setInstall(installOffer(read()));
    update();
    listeners.add(update);
    // The one way `display-mode` changes under a running page: a desktop
    // browser moving the tab into an installed window.
    const media = window.matchMedia?.('(display-mode: standalone)');
    media?.addEventListener?.('change', update);
    return () => {
      listeners.delete(update);
      media?.removeEventListener?.('change', update);
    };
  }, []);

  const promptInstall = useCallback(() => {
    const event = deferred;
    if (!event) return;
    // Spent either way: the browser refuses a second `prompt()` on the same
    // event, so keeping it would leave a button that silently does nothing.
    deferred = null;
    announce();
    void event.prompt();
  }, []);

  return {
    install,
    promptInstall: install.offer && install.prompt ? promptInstall : null,
  };
}
