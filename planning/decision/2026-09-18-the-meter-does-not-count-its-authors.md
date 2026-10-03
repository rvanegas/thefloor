# The meter does not count its authors, 2026-09-18

`nav_counts` shipped this morning — see *Two ways out and two ways in, and a
counter that holds nobody* — and within the day it was counting the wrong
people. The question it exists to ask is whether a gesture is **found**. The
people who built the gesture found it by writing it, and they use this app more
than anybody does, so their taps are the one population certain to say nothing
about the question while being the loudest voice in the answer. On a build's
first day or two they are very nearly the whole of it.

**So `POST /nav` drops a tap from a `debug` account and answers 204 anyway.**

## Why at the door

Because there is nowhere else. The table holds no account, deliberately, which
means there is no `WHERE` clause that can take these rows out afterwards and
never will be. Either the row is never written or the bias is permanent — and
the route is the one moment in the whole path where anybody knows whose tap it
was. It is thrown away one line later, as it was before.

## Why `debug` and not a new column or a setting

Three candidates. A `USAGE_EXCLUDED_IDENTIFIERS` line in `.env`, on
`COHORT_HOST_IDENTIFIERS`' model, would have been changeable without a deploy —
but it is a second register of who the developers are, kept by hand, and the
one it duplicates is already in the database. A new hand-set column, `unmetered`
beside `debug` and `leaderboard`, has the cleanest semantics and costs a
migration for a column that would always hold exactly the rows `debug` holds.

`debug` was chosen because it already means *this is one of the people who built
the app* — that is what it has meant in practice since the audio panel needed a
gate — and the thing being excluded is precisely that population. **The cost is
that a display flag now has a silent second effect**, which is a real one: a
`debug` set casually for a tester, to let them read the audio panel back to you,
now also removes that tester from the report. The column's comment in `db.ts`
says so, and says not to do it. If that ever gets set for somebody whose
behaviour we want to read, the answer is the separate column, not a clause.

## What was not done

**The review accounts still count.** App Review walks APPREVIEWSCRIPT.md a few
times a year with a scripted hand, which is not a person choosing a control
either, and excluding `REVIEW_IDENTIFIER` alongside was considered and dropped:
it is a handful of taps against a build's whole life, the identifiers are a
second mechanism to maintain, and one of them is a contact account that barely
navigates. If a submission ever visibly moves a share, that is the moment to
reconsider, and the shape of the fix is the same three lines.

**/privacy is unchanged.** Nothing here collects anything new — it collects
strictly less — so the paragraph that replaced the old *no record of what you
tapped* clause is still exactly true.

**Nothing is retroactive.** The rows written between this morning and this
afternoon are the authors' own, and they cannot be identified to be removed.
They are in build 239's counts for good, which is the same argument as the
paragraph above about the first day of any build: read a build's early days as
nothing at all.

`server/__tests__/nav.test.ts` asserts both halves — that the four are dropped
for a `debug` account while somebody else on the same build and day still
counts, and that a fifth name is still refused with a 400, since the exclusion
is not a way in.
