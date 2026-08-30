/**
 * Which build the web app is, and that it is the web app.
 *
 * **The number is the App Store build of the train this bundle was cut from**,
 * not a version of its own. `/app` is exported from `released` and `/beta`
 * from its `build/<n>` tag, so the number is correct by construction and there
 * is nothing to keep in step by hand — `bin/deploy-web` reads it out of
 * `app.json` at the tag and inlines it here as `EXPO_PUBLIC_BUILD`.
 *
 * **The native file reads the installed binary rather than `app.json`,
 * deliberately**, because Xcode's automatic build-number management has been
 * observed bumping `CFBundleVersion` while re-signing at export, and a field
 * meant to answer "what is really installed" must not inherit that. That
 * objection does not apply here: there is no signing step, nothing rewrites
 * this bundle after it is built, and the bundle *is* the artefact. Reading the
 * config is the honest answer on web rather than a shortcut.
 *
 * **Nothing is silent.** A client that declined to say its build is read by
 * the server as older than the header itself — "silent, and therefore old" —
 * which is the correct reading for a pre-37 phone and quite wrong for this.
 * Reporting a real number also earns the fast heartbeat, since
 * `heartbeatTimeoutFor` keys the 5s cadence on `build >= 110` and would
 * otherwise leave a browser on the legacy 12s path.
 */

const inlined = process.env.EXPO_PUBLIC_BUILD?.trim();

function readBuild(): number | null {
  if (!inlined) return null;
  const parsed = Number(inlined);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Resolved once, as on native, and for the same reason: it cannot change while
 * the page lives.
 *
 * Null only in development, where nobody sets `EXPO_PUBLIC_BUILD` — a served
 * bundle always has one because `bin/deploy-web` is the only thing that builds
 * it. That is worth knowing when reading `silentBuilds` off a local server.
 */
const build = readBuild();

export function appBuild(): number | null {
  return build;
}

export const BUILD_HEADER = 'x-thefloor-build';

/**
 * The header naming this as the web client, and the query parameter that
 * mirrors it — the websocket carries no custom headers in either a browser or
 * React Native, which is the same constraint `build` is under.
 *
 * The server reads anything else, absent included, as native. That default is
 * what lets this be added without touching a single installed client: the
 * entire existing population omits it, and the entire existing population is
 * native.
 */
export const CLIENT_HEADER = 'x-thefloor-client';
export const CLIENT_KIND = 'web';
