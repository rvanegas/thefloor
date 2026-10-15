/**
 * The shape both invitation pages share since 2026-10-15: one button, with the
 * install as its prerequisite rather than its rival.
 *
 * The *invite page* (`invite.ts`) and the *community page*
 * (`community-page.ts`) each ask a stranger for one thing — *Accept invite*,
 * *Join community* — and both need the app for it on an iPhone. So the install
 * is a small *Get the app* in a bar across the top, as Telegram's `t.me` page
 * carries *Download*, and on iOS one line above the button says to install
 * first and come back. See
 * `decision/2026-10-15-the-invite-page-asks-for-one-thing.md`.
 *
 * **What the button does depends on the platform**, decided in the page
 * because iPadOS presents itself as a Mac to the server. On iOS it hands the
 * app the page's scheme form — the Smart App Banner's own argument. Everywhere
 * else there is no app, and the button is the plain anchor beneath: the web
 * app where the box has one, the store where it does not.
 *
 * **The scheme is fired on a tap, never on load**, which is the half of
 * Telegram's page that was not taken. Without the app it is still an *Allow*
 * prompt that errors, or Safari calling the address invalid — but only after
 * the page has said to install first, and the page then points at the install.
 *
 * **Neither page tells anybody to find the link again.** An install used to
 * lose it; the tab is still open with the credential in its address, so coming
 * back to it is the way back.
 */

import { CTA_STYLE, MARK } from './html';

/**
 * The rules `CTA_STYLE` does not carry, because only these two pages want them.
 *
 * `.bar` is the strip across the top and `.get` its install, outlined rather
 * than filled so that the one button is the one filled thing on the page —
 * until `needs-app`, set when a tap on iOS found no app, fills it. `color:
 * inherit` rather than a colour, for `CTA_STYLE`'s warning — both pages are
 * `light dark`, and the text has to be whatever the ground makes legible.
 *
 * `.ios-only` and `.not-ios` follow the class `PLATFORM` puts on `<html>`
 * before first paint. Without script nothing is iOS, which is the browser
 * flow — the one that works everywhere.
 */
export const ACCEPT_STYLE = `${CTA_STYLE}
  .bar {
    display: flex; align-items: center; gap: 0.6rem;
    padding-bottom: 0.9rem; border-bottom: 1px solid rgba(127, 127, 127, 0.25);
  }
  .bar .mark { width: 1.75rem; height: 1.75rem; border-radius: 0.4rem; }
  .bar .name { font-weight: 600; flex: 1; }
  .bar a.get {
    padding: 0.35rem 0.9rem; border-radius: 999px; font-size: 0.9rem;
    font-weight: 600; text-decoration: none; color: inherit;
    box-shadow: inset 0 0 0 1.5px #5B6478;
  }
  .needs-app .bar a.get { background: #5B6478; color: #fff; }
  .prereq { margin: 2rem 0 -1.25rem; }
  .missing { display: none; font-weight: 600; margin: 0 0 1rem; }
  .needs-app .missing { display: block; }
  .ios.needs-app .prereq { display: none; }
  .ios-only { display: none; }
  .ios .ios-only { display: block; }
  .ios .not-ios { display: none; }
  .ends { font-size: 0.9rem; opacity: 0.7; margin: 2rem 0 0; }
`;

/**
 * Marks `<html>` as iOS before first paint, so neither copy flashes.
 *
 * In the page rather than from the request's `User-Agent`, because iPadOS
 * Safari asks for desktop pages and calls itself a Mac; a touch screen on a
 * "Mac" is the tell, since no Mac has one.
 */
export const PLATFORM = `<script>
(function () {
  var ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
    document.documentElement.classList.add('ios');
  }
})();
</script>`;

/** The strip across the top. `store` is escaped already, or empty. */
export function appBar(store: string): string {
  return `<header class="bar">${MARK}<span class="name">The Floor</span>${
    store ? `<a class="get" href="${store}">Get the app</a>` : ''
  }</header>`;
}

/**
 * The prerequisite, the one button and the line under it.
 *
 * `href` is where the button goes without script, escaped already. `verb` is
 * what the prerequisite says to come back and do — *accept*, *join* — and
 * `label` the button, which the app-missing line names again.
 */
export function acceptBlock(options: {
  href: string;
  label: string;
  verb: string;
  store: string;
  aside: string;
}): string {
  const prereq = options.store
    ? `<p class="prereq ios-only">Install The Floor on this iPhone first — it’s free — then come back here and ${options.verb}.</p>\n`
    : '';
  return `${prereq}<p class="cta"><span class="missing">The Floor isn’t on this iPhone yet. Get the app, then tap ${options.label} again.</span><a id="accept" href="${options.href}">${options.label}</a>
<span class="aside">${options.aside}</span></p>`;
}

/**
 * The button's click, on iOS the app.
 *
 * `remember` is a `sessionStorage` write made on the click, for a page whose
 * credential is a seat a mere look must not take — the invite page's pin.
 * `value` is a JavaScript expression, escaped already for a script element.
 *
 * **On iOS the click goes to the app**, by the scheme rather than the anchor.
 * If the page is still in front a moment later, nothing took it, so the page
 * says so and fills *Get the app*; if the page is hidden, the app opened, and
 * a late verdict is withdrawn — Chrome's *Allow* prompt can hold the hand-off
 * for longer than the wait.
 */
export function acceptScript(options: {
  scheme: string;
  remember?: { key: string; value: string };
}): string {
  const remember = options.remember
    ? `\n    try { sessionStorage.setItem(${JSON.stringify(options.remember.key)}, ${options.remember.value}); } catch (e) {}`
    : '';
  return `<script>
(function () {
  var link = document.getElementById('accept');
  if (!link) return;
  var root = document.documentElement;
  var left = false;
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { left = true; root.classList.remove('needs-app'); }
  });
  link.addEventListener('click', function (event) {${remember}
    if (!root.classList.contains('ios')) return;
    event.preventDefault();
    left = false;
    location.href = ${JSON.stringify(options.scheme).replace(/</g, '\\u003c')};
    setTimeout(function () { if (!left) root.classList.add('needs-app'); }, 1500);
  });
})();
</script>`;
}
