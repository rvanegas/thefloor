# Excess is watched across every route rather than budgeted per route

**One monitor counts every answer the server gives, against whoever asked, and
writes a flag when somebody asks far more of one route than everybody else
does. It refuses nothing; a person evaluates.** Built 2026-10-03 in
`server/src/excess.ts`, out of reviewing
`backlog/the-accept-route-says-whether-a-username-exists.md`.

## Why not another budget

The review found the accept route's budget did not bound its leak: an unknown
username is refused before `link_accepts` is consulted, so a walk of usernames
cost nothing. The per-route fix was obvious and small. It was set aside
because **a budget per route only counts what its author thought to count** —
this one counted acceptances while the leak was in the refusals — and each is
argued and tuned alone, so every new route is either given one or left bare.
A monitor counting every answer, refusals separately, does not need to have
guessed which answer leaks, and covers a route the day it ships.

## What it does not replace

**A budget on a secret stays**: `invite_guesses`, and a sign-in code's
`OTP_MAX_ATTEMPTS`. Noticing comes after the fact, and a pin or code once
guessed is guessed. **A budget that limits harm stays too**: `link_accepts`
stops one account making unlimited contacts and standings, which a flag
would only describe. The monitor stands in for budgets that protect
information and for the ones nobody has written.

## The shape

- **Counted against the account when signed in, else the address** — read
  from Caddy's `X-Forwarded-For`, believed only from loopback. `trustProxy`
  was not turned on: it would also start writing every caller's address into
  the journal, which holds only 127.0.0.1 today.
- **Route patterns only**, and only routes the server has: a 404 for an
  address that matches nothing reveals nothing, and scanners would bury
  everything else.
- **Counts in memory, one hour at a time**, thrown away when the hour ends.
  Only a flag is written, to `excess_flags`, swept at the usage tables'
  thirty days and removed with the account.
- **Excess is a floor and a multiple together**: 60 refusals or 3,600
  requests in the hour, and ten times the median of everybody else on that
  route. The floor exists because the population is small — against a route
  nobody else touched, ten times nothing is anything.

## Where a flag goes

**`bin/usage excess`, and nowhere else.** The report is last in the list, so
a bare `bin/usage` ends on it, and opens with a week's count so that nothing
is said as plainly as something. A warning in the journal is the only other
trace.

An email was built first and taken out the same day, on Rodrigo's word: the
flags belong with the meter, which is read from outside by `bin/usage` and by
nothing in the server — `usage.ts`'s rule that a figure the application can
see is one it will eventually decide something with. That ruled out an
`excessFlags` field on `/healthz` too, and a standalone `bin/excess`, which
would have been a second script nobody remembers to run. **What it costs** is
that a flag waits until somebody runs `bin/usage`; the trade is accepted
because nothing here acts on a flag anyway, and a walk of usernames still
running a day later is still in the table.

## Disclosed

The privacy page names it, and its date moved: counting what each account
asks of the server is a measurement, and that page said there were three.
