# The journal stops being a place to sign in

2026-09-17. `server/src/log-url.ts` sanitises every request address before pino
writes it, and `app.ts` installs it as the `req` serializer instead of passing a
bare `logger: true`. The leak had been open since the box's first boot on
2026-08-09.

**It was five addresses, not one.** The backlog entry that asked for this said
"`/ws` is the one route that carries a credential in a query parameter", and
that was true when it was first written and false by the time it was split out
— three of the other four predate the split. `/gws` takes `secret`, which
`ws.ts:855` calls "the whole credential, and it is checked here and nowhere
else", and `link` beside it. `/g/:token`, `/i/:username/:pin`,
`/devices/:token` and `/channels/:id/guest-links/:token` carry theirs in the
**path**, where a query-parameter strip cannot reach them. Anyone implementing
the entry as written would have shipped, deleted it, and left four of the five
running. Recording that here because the failure was not in the fix but in a
one-line claim in a document, made once and never re-measured.

**A serializer rather than `redact`, which the entry had right.** Pino's
`redact` replaces a whole value, so `redact: ['req.url']` takes `build`,
`client`, `device` and `notify` with it — the fields the build census and the
2026-09-15 socket diagnostics both read off the URL of the very route that
leaked. Fastify merges a custom `req` over its own defaults
(`logger-factory.js:126`), so `err` and `res` are untouched.

**The query filter is an allowlist, and that is the load-bearing choice.** A
denylist of `token`, `secret` and `link` is correct today and silently wrong the
first time somebody adds a parameter without thinking about this file — which is
exactly how the original leak accumulated, one obviously-fine parameter at a
time. An allowlist fails the other way: a new diagnostic parameter is missing
from the log until somebody adds it, which is a line in a review rather than a
credential on disk. Two parameters are excluded deliberately rather than by
omission: `q`, what somebody typed into transcript search, and `name`, the
filename of a track they uploaded. Neither is a credential, both are theirs, and
a log is not where either belongs.

**The path rules match on the segments before the credential**, so `/g/seat` and
`/g/assets/<file>` — ordinary addresses that happen to live under a prefix that
is otherwise a token — come through whole and keep saying which asset 404'd.

**One test asserts something the others cannot**: that the serializer is the one
a built app actually logs through, via pino's `serializersSym`. Every other test
in that file is about a function. The half that was wrong for five weeks was not
the function — there wasn't one — and a `logger: true` restored by a later merge
passes all of them and fails that one.

**Two things this deliberately does not do.** It does not touch the back
catalogue: every credential written before today is still in the journal, and
what to do about it is a decision with a real cost either way, kept in
backlog/session-tokens-are-in-the-journal-in-plaintext.md. And it does not set a
retention policy — there is none, journald's defaults are size-based, and the
4 GiB cap is sixteen months out; that is
backlog/nothing-expires-the-journal-and-something-should.md.

**Also corrected here**: CREDENTIALS.md and the backlog entry both said a custom
serializer should restate "the other four default fields". There are five —
`method`, `version`, `host`, `remoteAddress`, `remotePort` — and `version` is
the one a count made by hand drops. Both also implied `/ws` could not take a
header, when `ws.ts:976` has accepted `Authorization: Bearer` all along; the
query parameter is what the two clients can send, not what the route can
accept.
