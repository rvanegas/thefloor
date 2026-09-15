# A new account does not arrive alone, for as long as that is needed

2026-09-15.

## What it was

Home is two lists and a two-rung ladder. An account that signs up without an
invitation sees both lists empty and both rungs undone, and every control on
every other screen is about a conversation it has no way to have. Nothing in
this application can be tried by one person: the floor needs somebody to take
it from, the chime needs somebody to arrive, a recording of one person alone
is a voice memo. The ladder's answer — *get somebody here* — is correct and is
also the entire problem, because somebody who cannot see what this is has no
reason to go and fetch a friend to find out.

## What it is

A new account with nobody here is placed, at signup, into one channel named
*Getting Started Cohort 1* — then 2, and so on — with up to three others who
arrived around the same time and one **cohort host**, an account named by
sign-in address in `COHORT_HOST_IDENTIFIERS`. Five people, one of whom is
there to answer.

It is an ordinary channel. It can be renamed, written in, recorded in, and
left from its settings screen, and nothing about it is special to any other
part of the server. What marks it is two columns — `channels.cohort` and
`channels.cohort_seats` — and a card below the tabs that says why the people in
it are there.

## It is a growth hack, and this file is where its ending is written down

**The condition that ends it: growth that no longer needs seeding.** When
arrivals bring their own people, the reason for this is gone.

Emptying `COHORT_HOST_IDENTIFIERS` is the whole of switching it off. It stops
new placements and withdraws the privacy page's section about it in the same
restart — no deploy, no build, no code. **Channels already made are left
standing**, deliberately: by then they are ordinary channels with conversations
in them, and retiring a feature is not a reason to take a conversation away
from anybody. That is also why the privacy gate asks two questions rather than
one — see below.

Written here because a growth hack nobody wrote an ending for is one that
outlives its reason, and because the person who will want to turn this off is
not necessarily the person who turned it on.

## Why the proposition was left alone

*The Floor is for talking with people you already know* is false of this one
channel, and it is what the listing, the manual, both invitation emails and the
top of the privacy page say. All of them stayed as they were.

The alternative was to qualify the opening sentence, and it is the wrong trade.
The sentence is what the application is for; this is scaffolding for a young
one that cannot demonstrate itself to somebody who arrives alone. A permanent
qualification of what the app is would outlive the temporary thing that
prompted it, and a store listing that advertises being put in a room with
strangers sells an application nobody here wants to have built. **The honest
move is to name the exception as an exception, say it is temporary, and mean
it** — which is a checkable claim in a way that a softened sentence is not.

## The gate: only somebody who arrives with nobody

Placement is refused when the account can already reach `COHORT_REACH_FLOOR`
people — four — through contacts. Somebody who signed up on an invitation into
a working group has what a cohort would have given them, and adding a room of
strangers on top of it is the application doing something nobody asked for.

**Pending rows count as edges, and getting this wrong would have inverted the
feature.** At signup `resolveInvitesFor` writes the invitation that brought
somebody here as a *pending* contact and credits `invited_by`; nothing is
accepted and nothing will be until they tap it. A walk over accepted edges
would therefore measure every invited arrival as an island of one — and hand a
cohort to exactly the people the gate exists to exclude, while the gate
appeared to work.

So this measure is **not** `bin/growth`'s *island*, which walks accepted edges
alone and is right to: an island is a claim about agreement. This one asks
which island somebody is *about* to be on. Both are correct about their own
question, they will disagree, and they have separate names in GLOSSARY.md for
that reason. The bound — it stops at the limit rather than computing a
component — is not an optimisation either: the closure is quadratic in an
island, which is fine in a report and not on the signup path.

Four rather than two, so that a pair who each know nobody else are still
seeded. That is the case a cohort helps most.

## Seats are spent, not occupied

`cohort_seats` counts how many people a cohort has **ever** held, the host
included, and a cohort closes at `COHORT_SIZE`.

Counting live participants instead would reopen a closed cohort the moment
anybody left, and drop somebody who signed up today into a room whose
introductions happened last week — which is the one experience this whole
feature exists to prevent. A seat is spent by being sat in once.

Five of a possible six, so a member can still bring somebody of their own in.
That is the act this channel most wants to lead to, and a channel born full
forecloses it.

## Nobody is notified

`create` pushes to its invitees; this path does not. A placement is bookkeeping
rather than somebody waiting for you in a room, and four *you have been
invited* notifications per cohort — one to everybody already in it, every time
anybody signs up — is the application inventing an event out of its own
records. The roster gains a name.

## What is deliberately not done

- **No rotation.** One host, the first named in a list that can hold more. The
  list is ordered so that a second host is configuration rather than a change
  to any code. Every cohort accumulates on that host's Home, which is a real
  cost and is the reason the list exists; it has not been paid yet.
- **A vacated seat is never refilled.** See above.
- **Somebody who leaves is not placed again.** It happens once, at signup, and
  leaving is a decision rather than an accident to be corrected.
- **Somebody placed and then invited into a large island keeps their cohort.**
  Placement is decided on what was true at signup and is not revisited.
- **The marker is not derived from the name.** A member can rename the channel
  from its settings screen, and a feature that stopped recognising its own
  channel because somebody retitled it would have a trapdoor in it.

## Consequences

- `ChannelView` carries `cohort`, optional on the wire. **Additive, so no
  shim** — an old build ignores it and draws no card. What an old build cannot
  do is explain the channel, which is why the variable stays unset until a
  build that draws the card is out; the boot backfill then places everybody who
  signed up in the meantime. That ordering is in `server/.env.example`.
- The privacy page gains a section gated on `cohorts`, true when a host is
  configured **or any cohort channel is still standing**. One condition would
  have been the transcripts trap in the other direction: the page falling
  silent about channels still on people's screens.
- `Accounts.establish` reports `created`. It is the one moment the answer is
  knowable, and both available inferences — `created_at === now`, or "has no
  contacts and no channels" — are wrong, the second because it describes a
  state somebody can return to.
- A boot backfill beside `backfillPairChannels`, on the same reasoning: the
  accounts that predate this are exactly the ones it was written for.
