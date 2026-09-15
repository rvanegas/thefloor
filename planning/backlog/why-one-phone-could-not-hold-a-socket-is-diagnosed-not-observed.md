# Why one phone could not hold a socket is diagnosed, not observed

**Status:** the phone is now observed and the diagnosis held. What is
outstanding is a different client with the same symptom — the web app, which
reconnects every twenty seconds and has been doing so since at least
2026-09-02 — and a log line that will say why, written but not yet deployed.

**The title is kept deliberately, though "one phone" is now the historical
half.** The question it names is the one still open, with the browser where the
phone used to be, and the filename is cited from `ws.ts`'s `logClose` and from
the commit that added it. Renaming would dangle both, and the README's rule for
resolving an old citation — slugify the title, match a filename by prefix —
would not recover either.

## What was settled, on 2026-09-15

The phone half is answered and has moved to
decisions/2026-09-15-a-cadence-that-was-inferred-and-the-line-that-will-not-need-inferring.md,
which carries the histogram and what it proves. In one line: the journal
retained the 2026-08-24 window all along, 451 of the 490 gaps between that
token's 491 opens were nine or ten seconds — the backoff cap, dead on — and the
mechanism that fit was the mechanism. It has not recurred on any native device.

**The evidence lives there and not here**, because this file deletes itself when
the rest is done.

## What is outstanding: the web app, at twenty seconds

Every high-volume device since the fix is `client=web` — 2,000 opens on
2026-09-08, 1,512 on 09-05, 1,351 on 09-03, 858 on 09-13. The one running on
2026-09-15 held **one device id and one token, reconnecting 157 times at twenty
seconds and 144 times at nineteen**, and nothing else.

**This is not the August fault wearing a new hat.** Twenty seconds is not the
backoff cap, and there is no twenty-second constant anywhere in the tree. Since
a successful open resets the backoff to half a second, a uniform twenty-second
gap means the socket *opens, lives about nineteen and a half seconds, and dies*.
Something is killing a healthy connection on a fixed cycle.

Two things are ruled out. Caddy is not doing it — there is no idle or stream
timeout in the Caddyfile, and `reverse_proxy` defaults to none. And it is not
confined to one machine or one account: it recurs across distinct device ids on
different days.

The account currently doing it is `Rtest1`, a test account, **which is why
nobody has felt this and is not a reason to leave it.** The client code is
shared, so a real web user gets the same twenty-second cycle — and the symptom
is the one this entry has always been about: every control taking seconds or
silently doing nothing while the screen says the app is connected.

The leading suspect is the tightened heartbeat. `HEARTBEAT_TIMEOUT_MS` is five
seconds against a two-second ping, so a browser that throttles timers in a
hidden tab starves the ping and the sweep terminates the socket; the client's
own watchdog, at `app/src/api/socket.ts`, applies the same five seconds from the
other end. Either fits a kill-and-reconnect loop. **Neither obviously produces
nineteen and a half seconds**, which is why this is a suspect and not a finding.

## What remains to be done, and it needs a deploy first

The next thing this entry asked for was a log line at the close, "because the
question is which end is closing and nothing on the box answers it." That is
written and committed on `worktree-ws-close-diagnostics`. **It is not landed and
not deployed, so none of it is answering anything yet.**

Confirmed while writing it: the lifetime of a socket was genuinely
unrecoverable, not merely unlogged. A websocket upgrade is hijacked before
Fastify completes the request, so `/ws` emits no `request completed` line and
carries no `responseTime`. No query against the existing journal could have
produced it.

The line carries `ageMs`, `sinceLastSeenMs` and `endedBy` beside the device,
build and client. `endedBy` is recorded at the moment a server-side rule fires
rather than inferred at the close, because the close code cannot carry it: the
sweep's `terminate` produces an abnormal 1006, which is character for character
what a transport dying on its own produces.

**After the deploy, one read settles it**, filtering the new `socket closed`
lines to `client=web`:

- `endedBy: "silence"` with `sinceLastSeenMs` past five seconds — this server's
  sweep did it, and the web client's ping is being starved. The fix is on the
  client or in the budget, and SHIMS.md gets an entry if the budget moves.
- `endedBy: null`, a small `sinceLastSeenMs`, code 1000 or 1005 — the client hung
  up on a connection that was answering, meaning its own watchdog fired. The fix
  is in `socket.ts`.
- `endedBy: null` with code 1006 — the transport died between the two ends, and
  the next question is what sits in the path that Caddy does not.

`ageMs` clustering near 19,500 also confirms the socket is opening and being
killed rather than failing to open, which is the one step still inferred above.

**Then delete this file.** Nothing needs moving to decisions/ first — the
2026-08-24 account is already there, and what is left here is only the web
fault and the read that settles it.

## Two things found alongside, neither of them this

**Session tokens are in the journal in plaintext**, back to 2026-08-09 and still
live. `server/src/index.ts` passes a bare `logger: true`, so Fastify's default
serializer logs `request.url`, and `/ws` is the one route that carries a
credential in a query parameter. A custom `req` serializer that strips
`token=` and restates the other four default fields is the fix; `redact` is the
wrong reach, since it drops the whole URL and takes `build`, `client` and
`device` with it. The back catalogue is a separate decision — vacuuming the
journal would also destroy the reconnect history the section above rests on.

**A number in the 2026-08-24 write-up does not mean what it appears to.** "448
times in six hours" is one per forty-eight seconds, not the ten-second cadence
the sentence puts beside it. It is consistent with roughly seventy-five minutes
spent at the cap out of those six hours, which the histogram above confirms —
but read as a continuous six-hour cadence it is wrong.
