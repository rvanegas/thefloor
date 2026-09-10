# 2026-09-10: An island is not a tree

`bin/founders islands` was asked for on the premise that *founders define an
island of contacts, accounts mutually reachable by mutual contacts*. The second
half is the definition and it is exactly right: an island is a connected
component of the accepted-contacts graph, computed as a transitive closure
labelled by the smallest reachable id.

**The first half is false on this box, and the report is built to say so rather
than to assume it.** As of today, six of the eight accounts that arrived
uninvited sit on one island of nineteen. That is not a defect — it is what a
network working looks like — but a report that had assumed one founder per
island would have had nowhere to put them.

The reason the two structures come apart is worth stating once, because the
words invite the mistake: **an invitation is not a contact and nothing makes it
one.** Somebody can be invited, arrive, and never accept a single contact
request; they are an island of one hanging under a founder with a tree of
twelve. And two people who each came alone can become contacts afterwards,
which merges their islands while the invitation forest — where neither invited
the other — still shows two separate trees. So `founders_on_it` is printed as
a distribution, with both failure modes explained in the query: two or more
founders is a merge, none at all is a founder who erased their account or who
never accepted a contact with anybody they brought in.

## Pending requests are not edges

A contact is somebody you have **both** agreed to be in touch with, so an
island is a claim about agreement and a pending row is one person's ask and the
other's silence. Drawing islands with pending edges would put people in a
community nobody has agreed to. They appear once instead, as
`islands_if_all_accepted` — the map if every outstanding request were accepted,
which is the cheapest available measure of how close this is to being one
network. Unlike the invited backlog these are not swept, so a bridge can sit
there indefinitely.

## Erasure took the edges with it, which made the graph easy

`erase` deletes contacts rows in both directions — unlike `invited_by`, which
deliberately survives the person because it is somebody else's count. So a
tombstone brings no edges and the question that dogs the invitation forest,
whether a walk may pass through a deleted person, does not arise here.

The App Review accounts are the opposite case and are the reason `link`
restricts *both* ends to `person` rather than filtering afterwards: they are
contacts of each other and of whoever set them up, so left in they would bridge
islands through somebody who is not a user at all.

## The week series is a lower bound and says so

`contacts` is current state. A row is deleted when either person ends the
relationship, when a request is declined or cancelled, and when an account is
erased — so the week-by-week reconstruction draws each past week with the edges
that still exist today. It errs in one direction only: the past can look
sparser than it was, never denser. An island that has since broken up never
appears at all.

## The Monday bug, which moved four people

`date(t, 'weekday 1', '-7 days')` is the obvious way to write "the Monday of
this week" and it is wrong. `weekday 1` advances to the next Monday and is a
**no-op on a date that is already one**, so every Monday lands in the week
before its own. It was caught only because the islands week series and the
arrivals week series disagreed by one person, which is the argument for having
two things count the same population by different routes. The correct form is
`date(t, '-6 days', 'weekday 1')`, and the order is the whole of it.
