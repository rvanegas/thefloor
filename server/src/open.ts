import { escapeHtml } from './html';

/**
 * The one door into the web app, and the only place that decides which train.
 *
 * **The problem it exists for is that a channel has no train.** `/app` is what
 * the App Store release is and `/beta` is what TestFlight has, but a channel,
 * a contact and a guest link belong to neither — so every address that wants
 * to send a browser *into* the app has to answer a question none of them is
 * holding the answer to. Four of them tried: the landing page's redirect and
 * its link, the guest page's way out, and the hand-over after a guest accepts.
 * Three named `/app` outright, which on a box serving only `/beta` is a 503
 * whose JSON body a phone offers to save as a file — twice found that way, by
 * the same person, a day apart.
 *
 * So they all link here instead, and the rule lives once.
 *
 * **It has to be a page rather than a redirect**, which is the one structural
 * fact worth knowing before changing it. The best answer is in `localStorage`
 * — see below — and this server cannot read that: the token is not a cookie
 * and neither is this. A 302 would have to guess where a script can look. The
 * cost is a paint of a blank document, which is the same trade `landing.ts`
 * already makes for the same reason.
 *
 * There are deliberately **no cookies anywhere in this application**, and this
 * is where one would have been convenient. It stays out: what a cookie would
 * buy is a correct plain `<a href>`, and what it would cost is a header on
 * every request, a line in the privacy policy, and a property this codebase
 * has kept from the beginning.
 */

/** Where the app is, in the order somebody with no history should be sent. */
export interface Trains {
  /** Prefixes of the trains this box actually serves, best first. */
  available: string[];
}

/**
 * The script, inline in `<head>` so it runs before paint.
 *
 * Three rules, in order:
 *
 * - **What this browser last used**, if that train is still here. `thefloor.train`
 *   is written by the web app itself on boot, so it is evidence rather than a
 *   guess — it says which bundle this person actually uses, which is the whole
 *   point of the exercise. Validated against `available` rather than trusted:
 *   a train can be retired, and a remembered prefix that no longer exists is
 *   exactly the 503 this page was built to stop.
 * - **Otherwise the first available**, which is stable where stable exists.
 *   That is right for somebody with no history: the referential client is the
 *   one the population is on, and a first visit to the web app from a guest
 *   page is not the moment to put anybody on a beta bundle.
 * - **Otherwise nothing**, and the page below says so in a sentence. A box
 *   with no web app deployed at all is an ordinary state — stable is cut from
 *   `released` and cannot exist until a release contains the web app.
 *
 * Wrapped in `try`, because Safari with storage blocked *throws* on
 * `localStorage` rather than answering null, and a person with cookies off
 * should get the preference order rather than a broken page.
 *
 * `replace` rather than `assign`, so Back from the app does not bounce through
 * here and land where it started.
 */
function script(available: string[], path: string): string {
  return `
<script>
try {
  var trains = ${JSON.stringify(available)};
  var remembered = null;
  try { remembered = localStorage.getItem('thefloor.train'); } catch (e) {}
  var base = trains.indexOf(remembered) >= 0 ? remembered : trains[0];
  if (base) location.replace(base + ${JSON.stringify(path)});
} catch (e) {}
</script>`;
}

/**
 * `/open`, and `/open/c/:id` for a particular channel.
 *
 * `path` is what follows the train's prefix — `''` for the app's home, or
 * `/c/<id>`. Built by the caller rather than parsed here, so nothing in this
 * file has an opinion about the app's own routes; `webRoute.ts` owns those.
 */
export function openPage(trains: Trains, path: string): string {
  const body =
    trains.available.length > 0
      ? `<p>Opening The Floor…</p>
<p class="muted"><a href="${escapeHtml(trains.available[0] + path)}">Continue</a>
if this page does not move on by itself.</p>`
      : // Said plainly rather than redirected, and it is not an error: a box
        // serves the web app only once one has been deployed to it, and the
        // phone is the referential install in any case.
        `<p>The Floor is not available in a browser on this server yet.</p>
<p class="muted">The app on a phone is the one that can reach you when you are
not looking at it. <a href="/">More about The Floor</a>.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>The Floor</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.5 system-ui, sans-serif; margin: 3rem auto; max-width: 32rem; padding: 0 1.25rem; }
  .muted { opacity: 0.7; }
</style>
${trains.available.length > 0 ? script(trains.available, path) : ''}
</head>
<body>
${body}
</body>
</html>
`;
}
