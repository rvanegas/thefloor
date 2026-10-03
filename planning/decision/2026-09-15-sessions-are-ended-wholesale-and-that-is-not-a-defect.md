# Sessions are ended wholesale, and that is not a defect

Decided 2026-09-15, closing a backlog entry that had been open since
2026-08-24 under the title *Sessions cannot be listed, only ended wholesale*.
It is filed here rather than deleted because it reads like a missing feature
and will go on reading like one: every other product with several devices per
account has a list of them, and a session's absence from ours looks like
something nobody got round to.

**Nobody is getting round to it.** Signing out one device of three is not a
thing this app owes anybody, and the whole of what it would cost is paid before
the first useful screen exists.

## What is there, and why it is enough

Three levers. `/auth/sign-out` ends the session in your hand.
`/auth/sign-out-others` ends every other one and keeps yours, sparing it by
hash. A token expires on its own after ninety days. The middle one is the one
that matters, because it is the only operation that reaches a credential you no
longer hold — which is the actual problem a lost phone poses, and it is solved.

What is missing is *selectivity*, and the case for it is thinner than it looks.
Somebody who has lost a phone wants everything else gone and does not care
which; they are not standing over a list weighing up the tablet. Somebody who
merely wants a tidy account has no complaint that costs them anything — the
worst outcome is signing in again by email code on a device they are holding.
The blunt lever is right for the urgent case and adequate for the idle one.

## What making it selective would actually cost

Not a screen. A session is a row in `tokens`: a hash, an account, two
timestamps, and since 2026-08-24 `last_seen_at` and `last_build`. **Nothing
records what presented the token** — no platform, no model, no origin — so a
list built today renders three rows of *signed in, build 56, last seen
Tuesday*, and nobody picks their lost handset out of that. The feature is not
the endpoint, it is recognisability, and recognisability is not in the schema.

Putting it there bundles three things, each small and only the first of them
merely work:

- a column on `tokens`, and the migration;
- a wire change, so the client sends it — which is the two-step in AGENTS.md §
  *Never ship a wire change to a server before the client can speak it*, plus
  an entry in SHIMS.md;
- **a privacy decision**, because the thing that would make a row recognisable
  is a record of where somebody signed in from, and what this server retains is
  something `/privacy` has to be able to claim.

The third is the one that settles it. A permanent log of sign-in locations is a
real cost to every user, levied to improve a case that was already handled by a
button. This app does not carry video and does not carry that either.

`device_tokens` is not the cheap way round it. It has `platform`, and since
2026-08-24 a `session_hash` joining the two tables, so the join is no longer
the obstacle — but it is a register of push **addresses**, and an install that
was never granted notification permission has a live session and no row there
at all. A device list built on it silently omits exactly the device somebody
would be hunting for.

## What would reopen this

Not tidiness, and not parity with other apps. Somebody actually stuck: a report
of a real account where signing out the others was the wrong tool and cost
something. Absent that, the vocabulary is now written down — GLOSSARY.md §
*Session (auth)* and § *Device token*, added the same day — and the shape of
the gap is recorded here, which is all a future reader needs to stop and check
before building it.
