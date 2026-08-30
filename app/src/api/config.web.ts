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
 * Empty when same-origin, which is deliberate: every call is then a relative
 * path, and `http.ts` concatenates it onto the endpoint. A page served from
 * `https://thefloor.rvanegas.co/app` calls `/home`, and the browser resolves
 * it against the origin without this file naming the host at all.
 */
export const API_URL = configured ?? '';

/**
 * The websocket, which cannot be relative — `new WebSocket('/ws')` is not a
 * valid URL, so this is the one place the origin has to be spelled out.
 *
 * Built from `location` rather than from `API_URL` when that is empty, and the
 * scheme is switched on the page's own: `wss` from `https`, `ws` from `http`.
 * A page on https may not open an insecure socket, which is a browser rule and
 * not a preference.
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
