# Credit follows the first contact, and says that it guessed

Built 2026-09-23. **This supersedes a paragraph of
`archive/DECISIONS-2026-08-21-to-2026-08-23.md` § *Invite credit is one edge per
account*,** which is the entry to read first: it decided that nothing would be
reconstructed from the contact graph, on the grounds that doing so "would credit
whoever happened to be earliest in a table that was never keeping score". That
sentence was in `db.ts` as well, above the migration, and both have been
rewritten to point here. **The old reasoning was not wrong about blind
reconstruction. It is superseded because the reconstruction here is not blind.**

## The hole

An invite link is `/i/<username>/<pin>`, and redeeming one writes both halves of
the relationship: an accepted `contacts` row and the credit. The page offers two
ways to take it up — accept in this browser, or install the app — and `invite.ts`
has warned in its own body text for as long as it has existed that the second
loses the invitation, because the address does not survive a trip through the
App Store. There is no deferred deep linking on iOS to fix that with, and the
page's warning does not stop people taking the route.

So the most plainly invited person in the database can arrive owing nobody: the
pin is never redeemed, nobody wrote to their address, and `invitedCount` stops
at the member who actually brought them. Two of those were found by hand on
2026-09-23 and corrected with `bin/db --write`. A third and fourth were visible
in the same query. That is a small number on a base of thirty-one, and not a
small share.

## The rule

When a contact edge becomes accepted, credit the arrival to the counterpart if
all of these hold. Both directions are tried; at most one can pass.

1. The arrival has no inviter — nothing is overwritten, ever.
2. **The edge is the arrival's only accepted contact.** Only the edge that could
   have brought them is evidence; a second contact is somebody making friends.
3. **The counterpart already had one.** The islands rule, and the load-bearing
   half.
4. The edge is inside `INFERRED_CREDIT_WINDOW_MS` of the arrival signing up.
5. Neither end is a tombstone, and the edge would not close a cycle.

**Condition 3 is what makes this defensible**, and it came from the person
asking for the feature rather than from the design. Without it the two accounts
that added each other in the first two minutes of this application's life each
qualify as the other's arrival, `creditInviter`'s cycle check refuses whichever
fires second, and the standings record an inviter chosen by the order two rows
were written. Requiring the counterpart to be somebody the network already holds
makes the rule asymmetric, which is what the truth is: one of them was here and
one of them arrived. A pair who are both new get nothing, permanently, and
nothing later can tell which of them brought the other.

**Backtested before it was built.** Against every account whose inviter was
already known by a record, the rule reproduced that inviter exactly — twenty-one
agreements, no disagreements — and would have added six more. That is weaker
evidence than it looks: `resolveInvitesFor` dates its contact rows at
`account.created_at`, so an invitation by address is always the first edge by
construction and those rows cannot disconfirm anything. What it does establish
is the absence of the failure the 2026-08-22 entry feared — there is no account
anywhere in the data credited to one person but first connected to another.

## What it costs, which is a meaning

`invited_by` used to mean *there is a record that this person was asked here*.
It now also means *this looked like an arrival*. Those are different claims, and
`bin/growth` is built on the first — its whole purpose is measuring how much
growth is invitation-driven, and a rule that manufactures invitation edges
inflates precisely the number somebody would be watching.

**`accounts.invited_via` is the price of admission**: `email`, `link`,
`guest_ask`, `inferred`, with the first three records and the fourth a guess.
The `credit` report in `bin/growth` reads it. Without that column the two
meanings merge on the first write and no later query can separate them — which
is the specific, irreversible damage, and the reason the column shipped in the
same commit rather than when somebody wanted the report.

Null means the edge predates the column. Deliberately not backfilled to
`email`: most of them were, but `link` and `guest_ask` rows are in there too and
nothing distinguishes them after the fact. Inventing provenance on the rows the
column exists to keep honest is the one thing it must not do.

## A guess may not overturn a judgement

`acceptGuestAsk` decides the same question with better evidence — it compares
the account's `created_at` against the seat's `admitted_at`, so it knows whether
the account was made *during the visit*, which the inference cannot see. For an
account that signed up minutes before being asked, the inference would credit an
asker that `acceptGuestAsk` had just deliberately refused to credit.

So it passes `infer: false`, and there is a test from before this change —
*credits nobody for somebody who was already here* — that fails without it. That
test's own clock advances only sixty seconds while its prose imagines somebody
"signing in for a year", so the fiction is thin and the collision is real rather
than an artefact. Suppression was the fix; widening the test's clock to make the
prose true would have been rewriting a test to suit a change.

## The window, and the reading it settles

`INVITE_TTL_MS` — the same constant, not merely the same thirty days. It is the
only condition separating *arrived because of this person* from *eventually made
a friend*: conditions 2 and 3 alone would credit somebody who signed up from a
store listing, sat alone indefinitely, and was then added by an established
member.

**Whether the clock should exist at all was put to the person asking for this,
twice, because the answer depends on what the column is for.** Under *who
caused this signup* the window is essential. Under *who connected you to the
network* it is noise — The Floor is useless alone, so a first contact is an
entry whenever it happens, and the person on the other end is why somebody is
here in the only sense the database can see.

It was built at an hour, on the first reading, arguing that `bin/growth` was
already a metric about what caused signups. **It was then set to a month, which
is a decision for the second reading**, and the widening is a real change of
meaning rather than a loosened tolerance: every observed case fell inside 230
seconds, so nothing between four minutes and a month has ever been seen, and
what the month admits is precisely the case the hour was chosen to exclude.

What makes it defensible at a month is that it stops being an arbitrary number.
An invitation does not outlive thirty days — `pending_invites` and
`invite_pins` are both swept at `INVITE_TTL_MS` — so beyond the window there is
no invitation left in the database that this edge could be standing in for.
Crediting past it would reconstruct an act that had already expired, and *an
expired invitation credits nobody* is a rule older than this one. The window is
now the lifetime of an invitation rather than a guess at how fast people move.

**Which is why it is that constant and not a copy of its value.** The first
draft spelled thirty days out again, on the grounds that the two answer
different questions. That was wrong in the way duplicated constants usually
are, and worse here than usual: the justification above *is* the invitation's
lifetime, so a later change to `INVITE_TTL_MS` would leave this reasoning
silently false while both numbers still looked deliberate.

**The cost lands on `invited_via`, which is why that column is not optional.**
A month-wide window puts more weight on the guess than an hour-wide one did, so
the ability to read the standings without the inferred rows stops being a nicety
and becomes the thing that keeps the classes honest. If `inferred` ever becomes
the largest row in the `credit` report, the standings have quietly become a
count of first contacts; that is a statement to make out loud, not to discover.

## Rochelle and Golf stay roots, which is a fiction and is deliberate

**Not an oversight, and not a bug to fix.** Both would be credited to Rodrigo by
a backfill — Golf on the rule as stated, Rochelle only if the islands rule were
ever relaxed, since she and Rodrigo are the first edge in the database. They are
left uncredited because the standings are a game among people who know each
other, and a game where the person who built the thing owns every subtree is not
one. The leaderboard keeps more than one tree in it.

**No backfill shipped**, which is what makes this cost nothing to maintain: the
rule fires on contacts made from now on, so everybody already here keeps what
the record says and the fiction holds itself up. A backfill was written and
deleted before landing. **If one is ever written, this section is the reason
those two accounts must be excluded from it** — there is no exclusion list in
the code to find, because there is no code to put one in.

One account worth an eye rather than a rule: `acct_e_bPDNzkwRA3`, a test account
of Rochelle's, would be credited by any future backfill and inflate her count by
one. A test account in production is a thing to delete, not to write a special
case around.
