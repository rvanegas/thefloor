# Usernames are backfilled

2026-10-28.

## What changed

`2026-09-12-derived-names-at-signup.md` gave every new account a username
derived from its display name, and said **nothing is backfilled**: accounts
that predated it kept whatever they had, because handing them one would rename
people without asking. That half is reversed. `bin/backfill-usernames` gives
every account still without a username the one signup would have given it, by
the same rule, and the rule itself is untouched.

## Why

Asked for at the prompt, after `bin/people` gained a `username` column and
showed people who are actually here with none — Erta and Theral among them. An
account with no username has no *invite link*, since the link is
`/i/<username>/<pin>`; the Contact screen was the way to get one, and most
people never went there. The 2026-09-12 entry already knew that was the cost;
what moved is the judgement that it was worth paying to avoid naming people.

## How it stays the rule signup uses

The candidates come from `server/scripts/derive-usernames.ts`, which calls the
`core/derivedNames.ts` functions `Accounts.deriveUsername` calls, in its order
and with its fallback from the display name to the address. The number of
tries is read out of `accounts.ts`. What could not be shared is the loop:
`deriveUsername` writes and lets the unique index refuse, and a SQL script has
no try-and-catch, so each candidate is a guarded `UPDATE` that applies only
while the account is still unnamed and nobody holds the name. The two agree
because the guard is the index's own test, case folded.

**Oldest first.** Where two accounts derive the same name the one that has been
here longer gets it bare and the other a number, which is the order signup
would have handed them out in had it existed when they arrived.

## What it cannot tell apart

A username that was never set and one its owner cleared are the same null, and
nothing records which. The 2026-09-12 entry promised that somebody who cleared
theirs would not be given one back at the next sign-in; that still holds for
sign-in, but the backfill cannot honour it, and anybody who gave theirs up is
handed one again. It is a preview by default, so that is visible before
anything is written.

## Consequences

- An account with no username is now reachable only on purpose — cleared on
  the Contact screen after the backfill, or a name that yields no stem and an
  address that yields none either, or the eleventh of a name.
- It is a script rather than a migration, so it runs when somebody runs it and
  not on the next restart. Run again, it names whoever has fallen into the
  null since, and nobody else.
