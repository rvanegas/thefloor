# The tab is *Invite*

2026-09-13. The channel screen's third tab was *Invite links* and is *Invite*.

## Why the old name was wrong rather than merely long

*Invite link* is a term with a meaning here: a link that makes whoever opens it
a **contact** of whoever sent it. It is generated on Home, under *Contacts*,
and has nothing to do with a channel. The tab named after it holds the two ways
into a **channel** — a contact who already has an account, and a *guest link*
for somebody who has not — and neither of those is an invite link. So the tab
was naming the wrong object, in the plural, on a screen where that object does
not appear. *Invite* is what the pane does.

## The heading under it moved with it

The first card was headed *Invite* and is headed *Contacts*. A section heading
that repeats the tab immediately above it names nothing; the pair *Contacts*
and *Guest link* says which of the two ways in each card is, which is the
distinction the pane exists to draw.

## What it cost: a tab and a button can now carry the same word

The contact rows on that pane each carry a button labelled *Invite*. Once the
tab was called *Invite* too, the test harness could not tell them apart —
`findButton` matched exact text before substring precisely so that pressing
*Invite* found the button and not the *Invite links* tab, and that pass stops
discriminating the moment the two labels are equal. The failure it prevents is
a green test: press *Invite*, switch tabs, invite nobody, assert nothing.

**So the seam is now the kind of control rather than its wording.** `Segmented`
puts `accessibilityRole="tablist"` on itself, and the harness reads it:
`findButton` searches outside every tablist, `findTab` searches inside them.
The role is honest on its own terms — a screen reader announces the set as one
switch rather than as six loose buttons — and it is the thing that makes the
distinction available to a test at all.

**It is found by the role and not by importing `Segmented`**, which was tried
first and broke ten suites. The harness is loaded from inside `jest.mock`
factories, which are hoisted above the imports of the file doing the mocking,
so a value import of anything reaching `AppProvider` runs the mock before the
module it mocks exists. A prop on the rendered tree costs nothing at load time.

Home's two-way *Channels* / *Contacts* switch is the same component, so its
segments became tabs by this definition too, and the four tests that pressed
them through `findButton` now use `findTab`. That is the right reading: they
are peers switching two views of one thing, which is what a tablist is.
