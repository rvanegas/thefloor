# 2026-09-10: Growth is a depth in a forest

`bin/growth` was asked for as a classification of users into classes: those who
installed without being invited, those invited by one of them, and those
invited by anyone else. All three turn out to be one number already in the
database — depth in the forest `accounts.invited_by` describes — so the script
computes that once, as a temp view, and every report is a `GROUP BY` over it.

Naming them by depth rather than by how the invitation arrived is the decision
worth writing down. There are two ways an edge gets written: an address
resolving at sign-up, and `creditInviter` when somebody makes an account inside
a room to accept a member's ask. It is tempting to treat the second as a
different kind of arrival, because it comes through a guest link rather than an
invitation. It is not: both are one person here because another person asked,
which is the only thing any of these classes is about. The classes are in
GLOSSARY.md as *alone*, *first circle* and *onward*.

## The fourth class was not described, so it is labelled rather than invented

The request named four classes and described three. The only other population
this box knows about is `pending_invites` — people asked who have not signed in
— so that is what the fourth number is, and it is printed under its own heading
outside the shares rather than folded in as a class. It is not comparable with
the other three: the table is swept at thirty days, so it is a backlog and not
a history, and bin/invites is the report that is really about it. If the fourth
class was meant to be something else, this is the line to change.

## What it deliberately does not count

**Installs.** There is no install count in this repository and no join to one.
The box hears about somebody when they sign in, so every number here is
arrivals; an install that never signed in is invisible, and App Store Connect
holds the other half. Calling the classes "users who installed" would have been
a claim the data cannot support.

**Guests.** Somebody who opened a guest link and talked for an hour has no
account and no class. If they later made one, `creditInviter` put them in first
circle or onward, and that edge is the only trace of the route.

**Tombstones and the two App Review accounts**, which are excluded from every
count — with the totals printed, so the exclusion is visible rather than
silent. The walk still passes *through* a tombstone, exactly as `invitedCount`
does and for the same reason: dropping the subtree under a deleted account
rewrites a third party's history on somebody else's decision.

## The classes move, and the script says so

`creditInviter` can name an inviter for an account that has been here for
weeks. The moment it does, that person stops being *alone* and everybody under
them drops a class — so a week in the time reports can change after the week is
over. This is not a defect to be designed around; it is what the edge means.
It cannot happen twice to one account, since an account keeps the inviter it
has.

## Depth is capped at 32

The forest is acyclic by construction for every edge except the one
`creditInviter` writes, and that function checks the ancestry itself. The cap
is the guard for the case where it is wrong anyway: `UNION ALL` down a cycle
produces rows forever. Capped, the walk produces a wrong number instead, and
the `defects` report shows anybody sitting at the cap. The same trade
`invitedCount` makes.
