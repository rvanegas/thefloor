# A cadence that was inferred, and the line that will not need inferring

On 2026-08-24 a stale-socket fault was found, fixed, and written up in
archive/DECISIONS-2026-08-24-to-2026-08-27.md § *A tap that waits ten seconds,
and the socket that was nobody's*. The evidence was one session opening `/ws`
448 times in six hours where another opened it twenty times, and the write-up
was honest that this was **a mechanism that fits, not a reproduction** —
backlog/why-one-phone-could-not-hold-a-socket-is-diagnosed-not-observed.md
exists because of that gap. Nothing was instrumented on the device, so a
connection that opened and lived nine seconds and one that never opened at all
were indistinguishable in what was looked at.

## The evidence was there the whole time

`journalctl` on the box retains from 2026-08-09. Nobody had looked, because the
question was assumed to need instrumentation on a phone.

On 2026-08-24 the top token opened `/ws` 491 times. The gaps between those
opens:

    258 × 10s      193 × 9s      2 × 13s      then a handful of long idle gaps

**451 of the 490 gaps are nine or ten seconds**, which is `RECONNECT_MAX_MS`
dead on, sustained for about seventy-five minutes.

That is stronger than a cadence. `onopen` sets `reconnectAttempt = 0`, so a
socket that opens successfully puts the next attempt at half a second. Hundreds
of *consecutive* gaps at the cap mean the client counted no successful opens at
all — while the server logged and accepted every one of the 491. **The
discrepancy between those two counts is the fault itself**: an open socket the
client had disowned, each replacement torn down by its predecessor's `onclose`.
The mechanism that fit was the mechanism.

It has not recurred. Seven gaps in the nine-to-ten-second band across all of
September, scattered, with no runs; and no native device over seventeen opens in
a day since the fix.

**The lesson is not about sockets.** A question framed as needing new
instrumentation was answered by a query against a log that had been running the
whole time. The cost of the framing was three weeks of an open backlog entry.
Ask what is already recorded before deciding what to record.

## Why the count alone could never have settled it

The gaps settled it; the count could not have, and it is worth being precise
about why, because the count is what the original write-up leaned on.

448 opens in six hours is one per forty-eight seconds. Read as the ten-second
cadence the sentence puts beside it, it is wrong — it is consistent with about
seventy-five minutes at the cap out of six hours, which is what the histogram
shows, but nothing in the count says which. **A rate averaged over a window is
not a cadence**, and the difference is exactly the difference between a client
that cannot hold a connection and one that had a bad quarter of an hour.

## What was built: one line per close

The backlog entry named the right next step — a log line at the close, "because
the question is which end is closing and nothing on the box answers it". That
is now in `ws.ts` as `logClose`.

**Confirmed while writing it: the lifetime of a socket was unrecoverable, not
merely unlogged.** A websocket upgrade is hijacked before Fastify completes the
request, so `/ws` emits no `request completed` line and carries no
`responseTime` — every other route has one. No query against the existing
journal could have produced how long a socket lived, which is why `openedAt` is
now a field on `Connection` rather than something derived.

Three choices in it are not obvious:

**`endedBy` is recorded when a rule fires, not inferred at the close.** The
sweep ends a silent socket with `terminate`, which produces an abnormal 1006 —
character for character what a transport dying on its own produces. So the close
code cannot distinguish this server killing a connection from the network doing
it, and no amount of reading it more cleverly will. The flag is set at the two
places a member socket is ended from this side, and **null is the informative
value**: nothing here ended it, so the client or the path did.

**It is logged above the watch-scope early return.** A follower page that cannot
hold a socket is the same fault wearing a different scope, and the line that
would explain it is this one.

**No token and no account on the line.** `device` already tells one socket's
life from another's and is by construction not a credential, and a line written
once per close is exactly the kind that accumulates in a journal nobody is
guarding. Which turned out to be the live question — see below.

The ordering of the flag and the `terminate` is deliberate but **not
load-bearing, and the comment in the code says so.** `ws` emits `close` on a
later tick, so setting the flag afterwards happens to work; it is written the
other way because that is not a contract. A first draft of that comment claimed
the handler ran synchronously, and the test that was supposed to prove it passed
with the two lines swapped — which is how the claim was caught.

## What this did not settle, and where it went

The web app reconnects every twenty seconds and has since at least 2026-09-02.
That is **not** this fault: twenty seconds is not the backoff cap, no
twenty-second constant exists anywhere in the tree, and since a successful open
resets the backoff, a uniform twenty-second gap means the socket opens, lives
about nineteen and a half seconds, and is killed. It stays in the backlog entry,
which now carries what to read from `socket closed` once deployed and which of
three faults each reading names.

## The thing found on the way

**`/ws` writes a live session token into the journal**, and has since
2026-08-09. `logger: true` gets Fastify's default `req` serializer, which logs
`request.url`, and `/ws` is the one route taking a credential as a query
parameter — because neither React Native's WebSocket nor the browser's carries
custom headers, the same reason `build` and `device` are parameters.

It is in CREDENTIALS.md § *The credential this project issues* rather than here,
with the fix (a `req` serializer stripping `token=`; `redact` drops the whole
URL and takes `build`, `client` and `device` with it) and the back-catalogue
decision, which is not obvious — vacuuming the journal would destroy the
reconnect history this entry rests on.

Worth recording how it was found, because the reasoning generalises: it was not
found by auditing credentials. It was found because a routine diagnostic query
printed one, and the token then travelled into a transcript. **A log that is
safe where it sits is not safe where it is read**, and the journal is read by
pasting it somewhere else.
