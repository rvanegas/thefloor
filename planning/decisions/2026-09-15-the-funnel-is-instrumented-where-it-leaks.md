# 2026-09-15 — The funnel is instrumented where it leaks

MARKETING.md § *What is still not measured* named three gaps and gave a
direction: two small pieces of instrumentation, first-party and server-side,
with `/privacy` amended in the same commit. This is that work, plus the cohort
split APPLECAMPAIGN.md blocks its campaign on. Three of the fourteen levels
were invisible; two are not any more, and the third turns out not to be the
same kind of problem.

## What was built

**Levels 9 and 10 — the ping, and whether it worked.** A `pings` table, owned
by `UsageMeter` alongside `usage_spans` and `usage_bytes`, written by
`ChannelRegistry.ping` after every guard has passed and read back only by
`bin/growth pings`. The answer is written from the presence transition in
`commit`, beside `consume`, for everybody who has just stepped in or declared
themselves nearby.

**Level 3 — whether the app may reach anybody.** `accounts.notifications`,
carried as `x-thefloor-notify` on HTTP and `?notify=` on the websocket, in the
app's own three answers. Written only when it changes.

**The cohort split.** `channels`, `talking` and `groups` in `bin/growth` now
read `channels.cohort`: the funnel's rows exclude cohorts and each report
carries a cohort block beneath it.

## The decisions inside that, which are the point of this file

**The ping record is not a span, though it looks exactly like one.** Sent and
answered are two timestamps and the obvious move is a `usage_spans` row of
kind `'ping'`. It is wrong in the one way that matters: an unanswered ping is
the interesting case and would sit there as a null `ended_at`, which that
table's sweep deliberately leaves alone as the signature of a leak. The most
ordinary outcome of the thing being measured must not look like a defect in
the thing measuring it.

**The words are not stored, and that is the design rather than a shortfall.**
`with_text` says whether there were any. It is enough to ask whether a written
ping is answered more often, and it is the most this table could hold and
still be describable on `/privacy` — what somebody writes to summon a friend
is conversation content, and the page's claim is that content is never
recorded.

**One arrival answers one ping, the newest.** Three people taking turns
pinging somebody produce three rows and one arrival; crediting all three would
make the answer rate climb with the number of people asking, which is the one
way this number could have been made to flatter itself. And only inside
`PING_INTERVAL_MS` — somebody who wanders in the next day has not answered
anything, and counting them would turn level 10 into a slow restatement of
level 8.

**The rate limiter was left alone.** `lastPingedAt` is still an in-memory Map
and still the only authority on whether a ping may be sent; the record is
written after it has decided, never consulted before. A restart still forgives
everybody, which is right for a limit and was useless as a record — that gap
is exactly what the table is for, and closing it by making the limiter durable
would have changed behaviour to get a measurement.

**Level 3 is a header, on `BUILD_HEADER`'s terms, because the same two reasons
apply.** It is one field on requests already being made, and somebody sitting
in a channel for an hour makes almost no HTTP calls — which is why the build
number was mirrored onto the websocket and why this is too. Read once at
connect there and never again: nothing on a live socket can update it, so a
write per message would restate the value the connect carried.

**Absent is a fourth answer and not a fourth state.** Every build shipped
before the field omits it, so silence has to keep meaning *unknown* and must
never overwrite an answer a phone gave. The web client omits it deliberately,
and the server ignores it from a web client even if sent: a browser has no
such permission to grant, and filing its `denied` would put a population that
was never eligible into the row for one that refused. The same reasoning is
why an unrecognised value records nothing rather than defaulting — `claimedBuild`
can safely read a garbled value as *old*, because every silent client
genuinely is old, and there is no equivalently safe default here.

**Not backfilled from `device_tokens`.** Tempting, and wrong: an address
proves the permission was granted at the moment it was minted and says nothing
about now. Writing `granted` from one would manufacture exactly the
reassurance this column exists to replace.

**The cohorts are split, not excluded**, which MARKETING.md specified and is
worth restating because an exclusion is the obvious implementation. The funnel
has a level that wants the discarded half: a cohort is level 4, the app having
been *heard to work*, and every level from 5 down is about having people to
work it with. `groups` is where the contamination mattered, level 11 being the
conversion, so its cohort block is labelled as not one.

## What was deliberately not done

**Guests stay invisible.** No account, so no contact edge, no `pair` span and
no ping row. This was listed as the third gap and it is not the same kind of
thing as the other two: closing it means giving a guest an identity that
outlives their link, which is a product decision about what a guest *is*. It
was never going to be closed by a field on an existing request.

**Nothing was installed and nothing leaves the box.** § *The line worth
drawing: first-party yes, third-party no* held without being tested — every
number here is a column or a table on this server, read by a script from
outside, exactly as `usage.ts` argues for. `/privacy` therefore still says
*there is no third-party analytics*, and now names three measurements where it
named one.

**`PRIVACY_UPDATED` did not move**, which looks like an oversight and is not:
the substance changed on 15 September 2026 and the page already said so.

## What it is worth

Level 10 is one of the three levels MARKETING.md says are worth all the
attention, and the failure mode it watches is already documented as observed
rather than suspected — somebody pings and then puts the phone away as though
a call were coming. Level 3 is the one the same file says to instrument if
only one ever is, because a decline breaks the product silently and the
failure is attributed to the app rather than to the setting. Both are now
rates that can be read rather than arguments that can be had.

The kill rule for the Apple Search Ads campaign is untouched by any of it and
that is not luck: it is judged on *first circle* and *onward*, which come from
`invited_by`, and none of this writes one.
