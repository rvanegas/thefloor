# Watch every route for excess instead of guarding each one

**Count what every account does, and look only when an account does far more
of something than anybody does.** Proposed 2026-10-03, out of reviewing
`backlog/the-accept-route-says-whether-a-username-exists.md`: rather than give
that route a guard of its own, and the next route its own, and so on, measure
everything and let an excess be the thing that gets a human's attention.

## Why rather than another guard

**A guard per route is a budget per route, and each one is argued and tuned
alone.** `invite_guesses`, `link_accepts`, the send budget — each is right for
its route and none of them sees the account. The accept route showed the gap: a
guard that was there still let unknown usernames through free, because what the
route leaks is in its refusals and the budget counted acceptances. A monitor
that counts *every* answer, refusals included, does not need to have guessed in
advance which of them is the leak.

**It suits what is actually exposed.** What the routes give away by answering
is thin — that a username is held, that an address has an account. The harm is
in volume, and volume is what a monitor sees. Somebody walking usernames looks
like one account drawing hundreds of `unknown`s, which no honest user does.

## What it is not

**It does not replace a guard on a secret.** Detection comes after the fact,
and what was learned stays learned. A pin, a sign-in code or a token has to be
protected *before* it is guessed, so `invite_guesses` and the sign-in code
throttle stay. A budget that limits harm rather than information —
`link_accepts`, which stops one account making unlimited contacts and
standings — stays too. Monitoring replaces the guards nobody has written yet
and the ones that only protect information.

## The shape, as proposed

- **Attribution first.** Fastify's request lines in the journal carry no
  account, since `requireAccount` runs inside each handler. An `onResponse`
  hook recording `(account or address, route pattern, status class)` is the
  smallest change that makes every route countable — the route *pattern*
  (`/i/:username`), never the URL, for the reason `log-url.ts` exists.
- **Counted in memory, in windows**, the way `usage.ts` meters things nothing
  in the application reads. Refusals counted separately from successes; that
  is where enumeration shows up.
- **Excess is relative, not a constant.** Against what accounts ordinarily do
  on that route, so that nobody has to choose twenty, and a route nobody
  thought about is covered the day it ships.
- **When something trips, it says so once, and nothing else happens.** No
  automatic refusal — evaluating is a human's job, which is the point. How it
  reaches somebody is open: a push to a debug account, an email, or a line
  that `bin/health` surfaces.
- **A `bin/` report to read it back**, as `bin/usage` and `bin/diagnostics` do,
  since a box operation gets a script rather than an ssh line.

## Open

- The channel for an alert, above.
- What "far more than anybody" is when "anybody" is a few dozen accounts — a
  baseline needs a population, and this one is small. A generous floor under
  the relative test is probably needed until it grows.
- Unauthenticated routes are counted by address, which a phone on mobile
  data shares with strangers. Probably fine for flagging and wrong for
  refusing, which is one more reason this only flags.
