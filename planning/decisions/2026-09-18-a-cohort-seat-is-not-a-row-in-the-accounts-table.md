# A cohort seat is not a row in the accounts table

The first backfill of *getting-started channels* ran on 2026-09-15, the day a
`COHORT_HOST_IDENTIFIERS` was first set, and swept the whole accounts table
through one filter: the two App Review accounts, by identity. Three days later
`bin/cohorts` showed what that produced. Cohort 1 was closed at all five seats
and held two `erased:acct_…` tombstones. Cohort 2 held `rtest2@rvanegas.co`.
Of the seven people across both, one had ever entered — the host, who is in
both by construction.

**None of this was the signup path misbehaving.** Every placement came from
that single sweep, which is why nothing about it was visible as it happened:
`cohortCandidates` was a candidate list and `placeInCohort` was meant to be the
verdict, and the verdict had nothing in it about who somebody *is*.

## Three gates, and one of them is a different kind

- **Erased accounts.** A tombstone cannot sign in, be told anything, or answer.
  Both of these were erased *weeks before cohorts existed* — 2026-08-16 and
  2026-08-29, against cohorts opened on 09-15 — so `removeMember` on the
  `/me` path never had a channel to take them out of. The backfill then put
  them into one. `Accounts.erase` touching no channel is correct and is not
  what was wrong here.
- **Every address on `rvanegas.co`.** The demo accounts were excluded one
  identity at a time, which missed `rtest1@` and `rtest2@` and would have
  missed the next rig made. The domain is the honest rule.
- **An explicit `granted`**, replacing a device token used as a proxy for the
  permission. The two come apart in both directions, and the direction that
  did the damage is that `accounts.notifications` is null for every build
  before 213 — null meaning *unknown*, which was being read as yes.

**The first two are a different kind of gate from everything already there,
and that is why they live in `Accounts` rather than beside the others.** The
four existing refusals — host, already placed, arrived into a working group,
unreachable — are about somebody's *situation*, and every one of them can stop
being true; the last is deliberately one the person can undo, which is the
whole of what *cohort-eligible* tells the app. These two are about identity and
cannot. `cohortExcluded` is asked on both paths, which is the point of it being
a method: the first version filtered only the candidate list, and a test rig
registering a phone would have walked straight past it.

## Reading unknown as yes is the bug that generalises

`markNotifications` refuses to overwrite a phone's real answer with a browser's
silence, and that is right. What was wrong was a second reader treating the
resulting null as permission. **The cost of tightening it is real and was taken
deliberately**: the backfill now passes over every account on a build that
predates the header. For a feature whose entire premise is the arrival who can
be *told*, refusing somebody for a reason they can undo — and whose next build
will say so — is the better failure.

## Tightening a gate repairs nothing

A placement is a channel, and channels are not re-derived from the gate on
boot. `repairCohorts` runs beside the two existing boot passes and before the
backfill, so a returned seat is refilled on the same restart.

**It removes only the members refused on identity, and gives the seat back.**
That is the sole exception to `cohort_seats` being spent rather than occupied —
and the rule survives intact, because it is about somebody who was rightly
given a seat and walked out, where this is about a seat that should never have
been spent. Without it cohort 1 stays full of nobody forever.

**It evicts nobody for the notification gate**, and the line is deliberate:
that gate decides who a seat is *spent* on. Reading it as grounds for removal
would take a real person out of a room already on their Home, over a permission
they can still grant. Three such members were left where they are.

## The number was a disclosure

Every cohort was named *Getting Started Cohort <n>*. With `COHORT_SIZE` at
five, that tells a stranger that between six and ten people have ever arrived
here alone — on the Home screen of precisely the people being asked to believe
the place is worth staying in. A member is in at most one and has nothing to
tell it apart from.

The host is in all of them, so their channels list is the one screen a
discriminator was ever for. It reaches them as `RejoinableView.cohort`, **sent
only to a host and absent from everybody else's snapshot** — withheld on the
wire rather than hidden in the client, since the point was not to put the same
number one `console.log` away.

Date was considered and rejected. It reads as *people who joined around the
same time*, which is what the explanatory card already says, and it gives the
host an ordering they would want anyway — but it ages, so a room named for
September is one a reader meets in December as visibly stale. An opaque label
from a word list leaks nothing and invites a question with no answer.

## What it will do to the live box, computed before deploying

Repair should remove three of the seven — two tombstones and `rtest2@` — and
return three seats, leaving host plus two and host plus one. The backfill
should then place **nobody**: the five accounts that have granted
notifications are all within *reach* of twenty-five people, far past
`COHORT_REACH_FLOOR`.

**Three real people stay where they are** with no grant recorded, which is the
eviction line above, applied. `bin/cohorts` and the `cohorts repaired` log line
are the check; a second restart repairing nothing is the honest one.
