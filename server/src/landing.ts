/**
 * The page somebody who has never heard of this lands on.
 *
 * `/` is the one address a person types or is sent, and until now this server
 * had nothing there. The web app lives at `/app` rather than at the root
 * precisely so this page can exist — and for a second, structural reason: the
 * single-page catch-all serves `index.html` for every unknown path under its
 * prefix, and a catch-all at the root would have to enumerate every API route
 * to avoid swallowing one. It would be wrong again the next time a route was
 * added. See planning/WEB.md.
 *
 * **Server-rendered, like `/privacy` and `/support`, rather than the web
 * bundle.** Shipping 400 KB of React to show a paragraph and three links to
 * somebody who is not a user is the wrong trade, and the pattern is already
 * here: `page()` in `html.ts` carries the viewport meta and a
 * `color-scheme: light dark` palette, so this is a fourth page rather than a
 * new kind of thing.
 *
 * **The App Store is the primary call to action**, because the phone is the
 * referential install and the browser is a convenience — WEB.md § *The
 * premise*. A stranger should be sent to the App Store, not into a web client
 * they cannot be notified through.
 */

import { escapeHtml, page } from './html';

/**
 * The redirect for somebody already signed in, inline in `<head>` so it runs
 * before paint and there is no flash of a page they did not want.
 *
 * Five things here are easy to get wrong and each is deliberate:
 *
 * - **`localStorage` is scoped to the origin, not the path**, so this reads the
 *   token `/app` wrote. That holds because this server serves both, which is
 *   the same same-origin property the whole design rests on — there is no CORS
 *   anywhere in this server.
 * - **Presence, not validity.** The token carries a ninety-day TTL and may have
 *   been revoked. Checking would mean a network round trip before paint; a
 *   stale one costs a redirect to `/app`, which restores, takes a 401 and lands
 *   on sign-in — where that person was going anyway.
 * - **`replace` rather than `assign`**, so no history entry is left and Back
 *   from `/app` does not bounce straight back here.
 * - **Wrapped in `try`**, because Safari with storage blocked *throws* on
 *   `localStorage` access rather than returning null, and the page must then
 *   simply render.
 * - **`?stay` defeats it**, or a signed-in person could never read this page at
 *   all — including to reach `/support` from it.
 *
 * The key is `thefloor.token`, which is `TOKEN_KEY` in the app's
 * `state/AppProvider.tsx`. It is repeated here rather than imported because
 * nothing in this server may import from `app/`, and a comment is the only
 * link the two ends can have.
 */
const REDIRECT = `
<script>
try {
  if (!location.search.includes('stay') && localStorage.getItem('thefloor.token')) {
    location.replace('/app');
  }
} catch (e) {}
</script>`;

export function landingPage(options: {
  /** From APP_STORE_URL. Absent on a box that has not been told. */
  appStoreUrl?: string;
  /**
   * Whether the stable train has been deployed — that is, whether `/app` is a
   * page rather than a 503.
   *
   * **Both the link and the redirect hang off this, and the redirect is the
   * one that matters.** The two trains ship separately and the stable one is
   * expected to lag: it is cut from `released`, so it cannot exist until a
   * release contains the web app. In between, this page is live and `/app` is
   * not — and sending somebody who is merely signed in to a 503 is worse than
   * offering them nothing, because they did not ask to go there.
   *
   * Checked per request rather than at boot, because `bin/deploy-web` adds the
   * bundle without restarting anything — which is deliberate, a restart
   * costing presence — so a value cached at startup would be wrong for exactly
   * as long as it mattered.
   */
  webAppReady: boolean;
}): string {
  // Offered only when there is something at `/app`. A link to a 503 is worse
  // than no link — the same graceful absence `supportPage` makes for a contact
  // address, and the App Store link below for an unset URL.
  const browser = options.webAppReady
    ? `<h2>Already have an account?</h2>
<p><a href="/app">Open The Floor in this browser</a>. It needs a microphone and
nothing else. It is a convenience rather than a replacement — the app on a
phone is the one that can reach you when you are not looking at it, so use the
browser as a second screen rather than as the only one.</p>`
    : '';

  // Omitted rather than rendered dead, on the same reasoning: this is the
  // page's main call to action and a dead one is worse than none.
  const store = options.appStoreUrl
    ? `<p><strong><a href="${escapeHtml(options.appStoreUrl)}">Get The Floor for iPhone</a></strong></p>`
    : '';

  return page({
    title: 'The Floor',
    heading: 'The Floor',
    standfirst: 'Talking with people you know, one at a time',
    body: `${options.webAppReady ? REDIRECT : ''}
<p>The Floor is a small application for talking with people you know. One
person speaks at a time, by taking the floor, and a conversation lives in a
channel that stays there between calls — so it is somewhere you go back to
rather than a call you place.</p>

<p>Nobody can reach you unless you have both agreed. There is no directory and
no search for strangers.</p>

${store}

${browser}

<h2>More</h2>
<p><a href="/support">Support</a> — how it works, and how to reach a person.<br>
<a href="/privacy">Privacy</a> — what is stored, why, and for how long.</p>
`,
  });
}
