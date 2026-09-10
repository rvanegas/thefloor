# 2026-09-10: The tool is named for the roots, not for growth

`bin/growth` is `bin/founders`, hours after it was written and before anybody
had the old name in their fingers. The reason is a marketing campaign: it will
produce installs nobody was invited to, and every one of those accounts lands
at depth 0 — in the class the script calls *alone* — because the box knows of
no invitation and has no way to tell a campaign arrival from a friend passing
a link on.

**So the largest class was about to become the one that measures spend rather
than spread, under a name that claimed the opposite.** A script called
`bin/growth` whose headline number goes up when you buy advertising is a name
that argues for the wrong conclusion every time somebody runs it. What the
reports can honestly count is the shape of the forest: who is at the top of a
tree, and what grew under them. `founders` is that, and it is already the name
of the report that answers it.

## What did not change

The three class names — *alone*, *first circle*, *onward* — were named by
depth rather than by how somebody arrived, which is exactly what makes them
survive this. *Alone* has never claimed to know how somebody got here; the
header now says so outright, because after the campaign the claim will be
tempting and wrong. See 2026-09-10-growth-is-a-depth-in-a-forest.md for why
depth is the classification.

The temp view the reports are built over was called `growth` and is now
`arrival`, which is what it always held: one row per person who counts, with
their class. The per-report functions lost the `growth_` prefix for `report_`,
so `bin/founders founders` does not become `founders_founders` internally.

## Two names left standing that a campaign will strain

Neither is changed here, both on the grounds that the request was to rename a
command and vocabulary is a separate decision, and both should be settled
before the campaign rather than after somebody quotes a number from them:

- **GLOSSARY.md still calls them *growth classes*.** The command references in
  it were updated in the same commit as the rename, per AGENTS.md; the term
  was not. It is the same objection this file is about, one level up.
- **The `founders` report and the `founders_on_it` column call every depth-0
  account a founder.** For eight accounts on 2026-09-10 that reads true. For
  eight hundred arriving from an advertisement it will not: a founder is
  somebody a tree grew under, and most of them will be trees of one. The
  report already separates them — `founders_who_brought_nobody` is the count
  at the bottom — so the fix, if it is wanted, is a word rather than a query.
