/**
 * What the web app's shell needs in its head before a browser will let anybody
 * install it, and where the train's prefix gets into it.
 *
 * **The export cannot write these itself.** Expo emits one `index.html` and
 * copies `app/public/` beside it, and that one bundle is served at both `/app`
 * and `/beta` — so any absolute path written at build time would be right for
 * at most one train. `app/public/manifest.json` avoids the problem by using
 * only relative URLs, which resolve against whichever train's copy was asked
 * for; the tag that *points* at the manifest cannot, because the shell is
 * returned for every route the single-page app has and a relative href on
 * `/app/channels/<id>` would ask for `/app/channels/manifest.json`.
 *
 * So the server, which is the one party that knows both the HTML and the
 * prefix it is being served under, writes those two tags. It is string surgery
 * on generated HTML, which is not lovely; the alternatives are a build step
 * per train or a second copy of the bundle, and both are worse.
 *
 * **The rule that has to survive in `app/public/`, which has no room for a
 * comment:** every URL in `manifest.json` is relative, and nothing may be
 * added to that directory that is not meant to be served — it is copied
 * verbatim to the root of the export, so a note left there is a page on the
 * public web. The icons there are `app/assets/icon.png` resized (`sips -Z 192`
 * and so on), committed rather than generated because nothing processes that
 * directory.
 */

/** The name under the icon, matching `app.json`'s `CFBundleDisplayName`. */
const APP_NAME = 'The Floor';

/**
 * Everything a browser reads before offering to install, and nothing else.
 *
 * **No `theme-color`, deliberately.** The manifest already carries one, and
 * this app resolves every colour from `app/src/ui/theme.ts` against a scheme
 * the reader can override inside the app — a meta tag here would be a second
 * hardcoded copy of a colour that the override could not reach. The one copy
 * in `manifest.json` is the price of the manifest being a static file.
 *
 * The Apple tags are what a home-screen web app on iOS is launched by:
 * `apple-mobile-web-app-capable` is what makes the icon open standalone rather
 * than in Safari, which is also what `display-mode: standalone` — the app's
 * own test for whether it has been installed — answers to. Without it the
 * checklist rung on Home could never tick, however many people added the icon.
 */
function head(prefix: string): string {
  return [
    `<link rel="manifest" href="${prefix}/manifest.json" />`,
    `<link rel="apple-touch-icon" href="${prefix}/apple-touch-icon.png" />`,
    '<meta name="apple-mobile-web-app-capable" content="yes" />',
    '<meta name="mobile-web-app-capable" content="yes" />',
    `<meta name="apple-mobile-web-app-title" content="${APP_NAME}" />`,
    '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
  ].join('\n    ');
}

/**
 * The shell, with those tags in it.
 *
 * **Returns the HTML untouched when there is no `</head>`**, rather than
 * throwing or appending. A shell without a head is a bundle built by something
 * other than the Expo export this expects, and the failure that matters then
 * is not the missing manifest — refusing to serve the app over it would turn a
 * cosmetic surprise into an outage.
 *
 * @param prefix The train's prefix, `/app` or `/beta`, with no trailing slash.
 */
export function withInstallTags(html: string, prefix: string): string {
  const at = html.indexOf('</head>');
  if (at === -1) return html;
  return `${html.slice(0, at)}${head(prefix)}\n  ${html.slice(at)}`;
}
