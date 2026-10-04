# Excess is watched across every route rather than budgeted per route

**One monitor counts every answer the server gives, against whoever asked, and
writes a flag when somebody asks far more of one route than everybody else
does. It refuses nothing; a person evaluates.** Built 2026-10-03 in
`server/src/excess.ts`, out of reviewing the accept route's username leak,
which was a backlog entry of its own from 2026-09-25 until it was folded in
here on 2026-10-04.

## The leak it was built for

`POST /contacts/invite/accept` refuses an unknown username differently from
every answer it gives a held one, so a signed-in account can learn whether a
username is held. It was left when
`2026-09-25-an-invite-link-is-a-standing-door.md` made the page stop leaking;
`GET /i/:username` reads nothing, so a real username and an invented one
render identically. The route looks the username up and refuses an unknown one
before `acceptInviteLink` runs, and `link_accepts` is spent only inside that:

- **An unknown username costs nothing**, any number of times.
- **A held one, under budget, is accepted** — the pair become contacts, the
  owner is told, and the answer carries their display name. Loud, and the
  standing door working as designed rather than a leak.
- **Once the day's twenty are spent**, a held username answers `too_many` and
  an unknown one `unknown`, free and without limit until the window lapses.
  That is the oracle: twenty real acceptances buy a day of silent lookups.

What it yields is thin — that a username is held, which `core/username.ts`'s
rule about names being *looked up* does not quite reach. One walk of usernames
is a run of `unknown`s from one account, which is what the monitor flags;
`server/__tests__/excess.test.ts` § *the walk that asked for this* is that
case. **The leak itself is still there**, known and accepted.

**And since 2026-10-04 it has a measure of its own, `unbudgeted`.** The
floor of sixty refusals an hour misses a walk paced below it, and the leak
has an exact shape: an `unknown` to an account whose `link_accepts` are spent.
So the route flags the first of those an hour, with no floor and no median,
and `bin/usage excess` shows it beside the others. Still nothing is refused —
this is the leak reported, not closed. The false alarm is an account that took
up twenty links today and then mistyped a username, which is rare enough to
read past.

**Making the refusals agree was rejected** as worse for the person who
mistyped: answering an unknown username like a success tells them it worked,
and answering it like the budget tells them to come back tomorrow.

**The per-route fix comes back** — checking the budget before the lookup, so
that an exhausted account is told `too_many` whatever it names — if either of
these happens:

- **A username becomes worth enumerating**, the same trigger as
  `backlog/a-standing-door-has-no-lock.md`. A monitor only notices after.
- **The flags turn out to be noise**, so that nobody reads them. Then the leak
  is unwatched in practice, and the per-route fix is the cheap one.
- **`unbudgeted` flags start appearing at all.** Each is somebody using the
  oracle, or one rare mistype; a pattern of them is the case for closing it.

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
