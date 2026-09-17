/**
 * What a request's address is allowed to say in the journal.
 *
 * `logger: true` gives Fastify's default `req` serializer, which writes
 * `request.url` verbatim. Several of this server's addresses carry a
 * credential in that string — `/ws` and `/gws` because no WebSocket
 * implementation the clients run on carries custom headers, and `/g/:token`,
 * `/i/:username/:pin` and the two `:token` paths because a link somebody is
 * *sent* is its own credential and has nowhere else to put it. So every one of
 * them was signing the reader in.
 *
 * **Reading the journal needs root, which is the same bar as `server/.env`**,
 * and that is why this was a defect rather than an emergency. What made it
 * worth fixing is where a journal goes that a mode-600 file does not: it is
 * greppable, long-lived, and routinely pasted into a terminal by somebody
 * debugging something else. A live token reached a transcript exactly that way
 * on 2026-09-15, out of a question about reconnect cadence that had nothing to
 * do with credentials.
 *
 * **A serializer rather than pino's `redact`.** `redact` replaces a whole
 * value, so `redact: ['req.url']` would take `build`, `client`, `device` and
 * `notify` with it — the fields the build census and the socket diagnostics
 * both read off that same URL. This keeps them and removes the rest.
 */

/**
 * What replaces a credential. A word rather than an ellipsis so that somebody
 * who greps the journal for a token they are holding and finds nothing can
 * grep for this instead and see that the address was there and was scrubbed —
 * the alternative is concluding the request never arrived.
 */
const REDACTED = '[redacted]';

/**
 * The query parameters that survive, and **this is an allowlist on purpose.**
 *
 * A denylist of the credentials known today (`token`, `secret`, `link`) is
 * correct today and silently wrong the first time somebody adds a parameter
 * without thinking about this file — which is how the original leak happened,
 * one parameter at a time, each obviously fine. An allowlist fails the other
 * way: a new diagnostic parameter is missing from the log until somebody adds
 * it here, which is a line in a review rather than a credential on disk.
 *
 * Two of the omissions are deliberate rather than accidental. `q` is what
 * somebody typed into transcript search and `name` is the filename of a track
 * they uploaded; neither is a credential and both are theirs, and a log is not
 * where either belongs.
 */
const LOGGED_PARAMS = new Set([
  // Read at connect by `/ws` — the build census counts somebody who is merely
  // sitting in a channel, and the socket diagnostics compare reconnects by
  // device. See ws.ts.
  'build',
  'client',
  'notify',
  'device',
  // A guest's id, which is not the guest's credential — `secret` is, and it is
  // not on this list. The id is what makes two `/gws` lines the same page.
  'guest',
  // Which donation copy to show, and which representation was asked for.
  'locale',
  'tz',
  'format',
]);

/**
 * Paths whose last segment is a credential rather than an identifier.
 *
 * Matched on the segments before it, so `/g/seat` and `/g/assets/<file>` —
 * which are ordinary addresses that happen to live under the same prefix as a
 * link token — come through untouched and keep saying which asset 404'd.
 */
const isCredentialPath = (segments: string[]): boolean => {
  // `/g/<token>`, the address a guest link *is*. Exactly two segments: the
  // longer `/g/assets/<file>` and the fixed `/g/seat` are not tokens.
  if (segments.length === 2 && segments[0] === 'g' && segments[1] !== 'seat') {
    return true;
  }
  // `/i/<username>/<pin>`. The username is public and stays; the pin is the
  // whole of what the link proves.
  if (segments.length === 3 && segments[0] === 'i') return true;
  // `/devices/<token>` — a push address rather than a sign-in, but still an
  // addressable secret, and nothing reads it in a log.
  if (segments.length === 2 && segments[0] === 'devices') return true;
  // `/channels/<id>/guest-links/<token>`, the link being revoked.
  if (
    segments.length === 4 &&
    segments[0] === 'channels' &&
    segments[2] === 'guest-links'
  ) {
    return true;
  }
  return false;
};

/**
 * A request target with every credential in it replaced, ready to log.
 *
 * Takes and returns the raw string Fastify holds — path and query, no origin —
 * and is total: anything it cannot parse comes back as the bare path with the
 * query dropped entirely, on the grounds that a URL this cannot read is the
 * one most likely to be carrying something it should not.
 */
export const sanitiseLogUrl = (raw: string): string => {
  const cut = raw.indexOf('?');
  const path = cut === -1 ? raw : raw.slice(0, cut);
  const query = cut === -1 ? '' : raw.slice(cut + 1);

  const segments = path.split('/').filter((segment) => segment !== '');
  const safePath = isCredentialPath(segments)
    ? '/' + [...segments.slice(0, -1), REDACTED].join('/')
    : path;

  if (query === '') return safePath;

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(query);
  } catch {
    return safePath;
  }

  const kept: string[] = [];
  for (const [key, value] of params) {
    kept.push(
      `${key}=${LOGGED_PARAMS.has(key) ? encodeURIComponent(value) : REDACTED}`
    );
  }
  return kept.length === 0 ? safePath : `${safePath}?${kept.join('&')}`;
};

/**
 * The `req` serializer to hand pino. The five fields beside `url` are Fastify's
 * own defaults restated — there are five, not four, and `version` is the one a
 * count made by hand keeps dropping.
 */
export const logSafeRequest = (request: {
  method?: string;
  url?: string;
  headers?: Record<string, unknown>;
  host?: string;
  ip?: string;
  socket?: { remotePort?: number };
}): Record<string, unknown> => ({
  method: request.method,
  url: request.url === undefined ? undefined : sanitiseLogUrl(request.url),
  version: request.headers?.['accept-version'],
  host: request.host,
  remoteAddress: request.ip,
  remotePort: request.socket?.remotePort,
});
