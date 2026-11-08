# Caddy Logs The Session Token Unredacted

The server keeps credentials out of its journal with its `req` serializer
(`logSafeRequest`, `server/src/log-url.ts`), because several addresses carry
one in the URL, `/ws?token=…` among them. Caddy, in front of it, does not.
Found 2026-11-07: during the 03:12:57Z deploy's restart, `journalctl -u
caddy` recorded the 502s for `/ws` with the token in full in
`request.uri`. Caddy logs errors only here, not access, so a token reaches
that journal whenever the upstream is unreachable, which means every deploy,
and on any other proxy error.

Redact the query in Caddy's log, either with the `log` directive's `filter`
encoder (`query` with `replace token REDACTED`, on `request.uri`) or by
dropping `request.uri` from the error log. The Caddyfile is not in this
repository. `ts provision` restores it from the backup, so the change has to
reach both the box and the backup. Read CREDENTIALS.md first, since the
session token is one of the credentials it covers. Then decide whether the
tokens already in the journal call for anything beyond letting journald
rotate them out.
