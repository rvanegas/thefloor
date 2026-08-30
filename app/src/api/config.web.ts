/**
 * Where the server is, from a browser: wherever this page came from.
 *
 * The native file has to be told, because a phone is not the machine running
 * the server and there is no address to infer. A browser is the opposite case
 * — it already fetched this bundle from the server it wants to talk to — and
 * inferring is not merely convenient here but *required*: this server has no
 * CORS of any kind, so a cross-origin call is refused by the browser before it
 * is made. Same origin is the design rather than a default. See
 * planning/WEB.md.
 *
 * `EXPO_PUBLIC_API_URL` still wins when set, which is what makes
 * `npx expo start --web` against a server on another port work at all — but
 * only because such a server is a local one somebody has arranged; it is not a
 * thing production can do.
 */

const configured = process.env.EXPO_PUBLIC_API_URL?.trim();

/**
 * The origin this page was served from, spelled out rather than left empty.
 *
 * **It was empty, and that was a bug.** Relative paths are the obvious way to
 * say "same origin" — `fetch('/home')` resolves against the document — and the
 * first version of this file did exactly that. But an empty `API_URL` already
 * means something in this codebase: *no server has been configured at all*,
 * which on a phone is a real state with its own screen. Four call sites test
 * for it — `request` in `http.ts`, both exports in `download.ts`, the upload,
 * and the privacy link in `HomeSettingsView` — and every one of them refuses
 * to do anything. So the web app threw "No server configured." at the first
 * person who typed an email address, having never made a request.
 *
 * Naming the origin fixes all of them at once and changes nothing else: an
 * absolute same-origin URL and a relative path reach the same place, and this
 * is derived from `location` so it cannot name anywhere else.
 *
 * The empty string survives only where there is no `location` — jest — and
 * that is the one place the old meaning is still the right one.
 */
function origin(): string {
  if (configured) return configured;
  return globalThis.location?.origin ?? '';
}

export const API_URL = origin();

/**
 * The websocket, which cannot be relative — `new WebSocket('/ws')` is not a
 * valid URL, so this is the one place the origin has to be spelled out even
 * when everything else could have been relative.
 *
 * The scheme is switched on the page's own: `wss` from `https`, `ws` from
 * `http`. A page on https may not open an insecure socket, which is a browser
 * rule rather than a preference.
 */
function socketUrl(): string {
  if (configured) return configured.replace(/^http/, 'ws') + '/ws';
  const secure = globalThis.location?.protocol === 'https:';
  const host = globalThis.location?.host ?? 'localhost:8787';
  return `${secure ? 'wss' : 'ws'}://${host}/ws`;
}

export const WS_URL = socketUrl();

/**
 * Never missing in a browser, since the origin is always knowable — the whole
 * failure this reports on native cannot arise here. Kept so the two files have
 * one shape and `AuthView` can call it without a platform test.
 */
export function describeMissingConfig(): string | null {
  return null;
}
