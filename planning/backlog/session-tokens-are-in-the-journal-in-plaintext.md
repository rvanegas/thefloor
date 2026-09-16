# Session tokens are in the journal in plaintext

Back to 2026-08-09 and still being written. Split out of
`why-one-phone-could-not-hold-a-socket-is-diagnosed-not-observed.md` on
2026-09-15 when that entry was settled and deleted; it was found alongside that
investigation and is nothing to do with it.

`server/src/index.ts` passes a bare `logger: true`, so Fastify's default
serializer logs `request.url`, and `/ws` is the one route that carries a
credential in a query parameter — it has to, because neither React Native's
WebSocket nor the browser's carries custom headers. Anyone who can read
`journalctl -u thefloor` can sign in as any account that has connected.

**The fix is a `req` serializer, not `redact`.** Pino's `redact` replaces a
whole value, so `redact: ['req.url']` takes `build`, `client` and `device` with
it — which the build census and the `socket closed` diagnostics both read. A
custom serializer that strips `token=` and restates the other four default
fields keeps them. CREDENTIALS.md § on the session token points here.

**Clearing the back catalogue is a separate decision, and not an obvious one.**
Vacuuming the journal would also destroy the reconnect history that
decisions/2026-09-15-a-cadence-that-was-inferred-and-the-line-that-will-not-need-inferring.md
and
decisions/2026-09-15-twenty-seconds-is-chrome-parking-a-timer-not-a-socket-dying.md
both rest on — the evidence a diagnosis was right, which is not recoverable
once gone. The alternative that keeps it is signing out the affected sessions,
which makes what is written there worthless without deleting it.
