/**
 * The browser's version of the buzz: a mark on the tab.
 *
 * `useSilencedNudge` and `useKnockNudge` both take `fire` as a parameter and
 * both import `./cue`, so Metro's platform resolution puts this in front of
 * them and neither hook changes. The seam was already there — it was cut on
 * 2026-08-22 when `buzz` was extracted for a second caller.
 *
 * **This is weaker than what it replaces, and that is the design rather than a
 * gap.** The buzz is the vibration motor precisely because it reaches a
 * *locked* phone — "most of what a pocket is", confirmed on a device at build
 * 72 — and a browser tab has no equivalent. With notifications deliberately
 * skipped, nothing here reaches somebody who is not looking at the machine. A
 * tab marker is read by somebody who looks.
 *
 * That is the premise working as intended: the web app is a secondary
 * interface and the phone is the referential install, so the phone is what
 * carries an alert to a pocket. Do not close this gap by reaching for the
 * Notification API, and do not revive the tone into the audio session that
 * DECISIONS.md § *The buzz reaches a locked phone, so the tone is not built*
 * rules out — on web it would play over the very voice it was announcing, with
 * no locked phone to justify it.
 *
 * Nothing here needs a permission or a service worker. `navigator.setAppBadge`
 * would give a real badge, but it requires an installed PWA and does not exist
 * in Firefox, so it is a later enhancement rather than the mechanism.
 */

/** Prepended to the title. A dot rather than a count: this is not a queue. */
const MARK = '● ';

let marked = false;
let watching = false;

/** Kept so the favicon can be put back exactly as it was. */
let originalIcon: string | null = null;

function iconLink(): HTMLLinkElement | null {
  try {
    const existing = document.querySelector<HTMLLinkElement>(
      'link[rel~="icon"]'
    );
    if (existing) return existing;
    const link = document.createElement('link');
    link.rel = 'icon';
    document.head.append(link);
    return link;
  } catch {
    return null;
  }
}

/**
 * A dot over the favicon, drawn rather than shipped as a second file.
 *
 * Best-effort by construction: the whole cue still works from the title alone,
 * so every failure here — no canvas, an icon that will not load, a browser
 * that ignores a late `href` change — costs the dot and nothing else.
 */
function badgeIcon(): void {
  const link = iconLink();
  if (!link) return;
  if (originalIcon === null) originalIcon = link.href;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d');
    if (!context) return;

    const draw = () => {
      // `floor` from ui/theme.ts — the app's one accent, and the colour the
      // floor itself is drawn in, so the dot means the same thing as the
      // screen it is about.
      context.fillStyle = '#7C5CFF';
      context.beginPath();
      context.arc(23, 9, 8, 0, Math.PI * 2);
      context.fill();
      link.href = canvas.toDataURL('image/png');
    };

    if (!originalIcon) return draw();
    const image = new Image();
    image.onload = () => {
      try {
        context.drawImage(image, 0, 0, 32, 32);
        draw();
      } catch {
        // A tainted canvas cannot be exported. Same origin here, so this is
        // defence rather than an expected path.
      }
    };
    image.onerror = () => draw();
    image.src = originalIcon;
  } catch {
    // No canvas. The title still carries it.
  }
}

function clear(): void {
  if (!marked) return;
  marked = false;
  try {
    while (document.title.startsWith(MARK)) {
      document.title = document.title.slice(MARK.length);
    }
    const link = iconLink();
    if (link && originalIcon !== null) link.href = originalIcon;
  } catch {
    // Nothing to do, and a failed cue must not become an error in a
    // conversation — the same contract the native file holds itself to.
  }
}

/**
 * Marks the tab.
 *
 * **Idempotent, because the thing it reports is a state rather than an
 * event.** `fire()` is edge-triggered and `nudge.ts` will call it repeatedly
 * for as long as somebody keeps talking while silenced; a flash per call would
 * be noise, and a second mark on an already-marked title would be a bug. The
 * mark stays until the tab is looked at.
 */
export function buzz(): void {
  try {
    // Already here and looking. There is nobody to tell.
    if (document.visibilityState === 'visible') return;

    if (!watching) {
      watching = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') clear();
      });
      // A tab can be focused without a visibility change — another window
      // raised over it, then clicked back into — and the mark should go then
      // too.
      globalThis.addEventListener?.('focus', clear);
    }

    if (marked) return;
    marked = true;
    document.title = MARK + document.title;
    badgeIcon();
  } catch {
    // No document, or a browser refusing something. Not worth a throw on the
    // path that carries live audio.
  }
}
