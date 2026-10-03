# A cohort seat goes to somebody who can be told

2026-09-15. Amends `2026-09-15-a-new-account-does-not-arrive-alone.md`, which
is the feature this narrows.

## What it was

A *getting-started channel* was given at signup, inside `POST /auth/verify`, to
any new account that arrived with nobody here. The gate was three refusals and
a reach walk: no host configured, you are a host, you are already in one, you
can already reach `COHORT_REACH_FLOOR` people.

Nothing in that asked whether the person could be reached. A cohort is five
seats, **spent once each and never returned** — `cohort_seats` counts seats
spent rather than places occupied, deliberately, so that a cohort which closed
stays closed. And the whole of what the channel offers is that somebody may
speak into it later: nobody is notified of the placement itself, by design, so
the first thing that ever happens in that room is somebody walking into it and
the others being told. A member whose phone cannot be told is a seat that can
never answer, held for good, in a room of five where one in five is already
the host.

## What it is

The gate gains a fifth refusal — **no registered device token, no placement** —
and the placement moves to the moment that refusal stops applying: `POST
/devices`, on the registration that brings an account its *first* address.
`Devices.hasToken` is asked before the write, because afterwards it is always
true, and only the first address places anybody; that request runs on every
launch for the rest of the account's life and the question is about an event.

An account that never turns notifications on is never placed, spends no seat,
and is otherwise unaffected. One that turns them on three weeks later is placed
then, into whichever cohort is open.

## The gate could not simply be added, and that is the interesting half

Applied at signup it refuses everybody. Nobody has been asked about
notifications ten seconds into an install — the app deliberately stopped asking
there on 2026-09-08, iOS granting one dialog per install and that being the
worst moment to spend it.

Worse, it closes a loop. The app declines to raise the notification question
at all unless `somebody` is true — a contact, an invitation, or a channel —
on the correct reasoning that a dialog about being reachable is a dialog about
nothing when nobody could reach you. For an arrival with nobody, **the cohort
placement is the only thing that would ever have made `somebody` true.** So:
no placement, no channel, no reason to ask, no permission, no placement. The
feature would have refused precisely the population it was built for, and
silently.

So the server tells the app the one fact that breaks it. `HomeView.cohortEligible`
is `wouldPlaceInCohort` — the gate with the reachability half taken off — and
`worthAsking` takes it as a **second way of having a reason** rather than as a
bypass: the launch count still has to be satisfied, so the install itself
carries no dialog. For that reader the permission is not a word about a
hypothetical, it is what fetches them four people and a host, and the
explanation screen says so in a card only they see.

**The policy was not loosened, and that distinction is the whole of why this
shape was chosen.** The alternative was to drop `somebody` to "signed in, two
launches", which is one line and makes the existing argument false without
replacing it — it would put the pitch in front of everybody with an empty Home,
including everybody the server was never going to place, which is the
dialog-about-nothing that argument exists to prevent. Handing over a fact keeps
the policy true and lets the copy be specific.

## What was considered and not done

**A freshness bound on late placements** — refusing somebody who grants weeks
after signing up, on the worry that they would land in a room whose
introductions happened long ago. Dropped: placement always targets the *open*
cohort, which by definition is still filling, so a late arrival never lands in
one that closed. The hazard `cohort_seats` guards against is a closed cohort
reopening, which this cannot cause. The residue — a half-filled cohort that sat
idle while arrivals were slow — is identical under signup-time placement and is
not made worse here.

**Reclaiming the seat of somebody who goes unreachable later.** A seat is spent
by being sat in once, and that rule is load-bearing. This gate is about who
gets one, not about taking one back.

## What it costs, and what it buys

It seeds more slowly: fewer arrivals are placed, and some are placed later.
That is the real price and it is worth naming, because the feature exists to
seed activity.

What it buys is that every placed account is reachable, which is the
precondition for the room producing anything at all. MARKETING.md's level 4 —
*heard it work* — is measured over placed accounts, so the denominator is now
people who could hear about it; and levels 3 and 4 of that funnel stand in a
real order rather than an incidental one, since the placement is now made *on*
the permission.

## How it ends

Unchanged, and this adds nothing to switching the feature off: emptying
`COHORT_HOST_IDENTIFIERS` still stops every placement and withdraws the privacy
page's section in the same restart. `wouldPlaceInCohort` returns false for
everybody with no host configured, so `cohortEligible` goes false in the same
breath and the app stops mentioning cohorts in the notification pitch without
anything being deployed.
