# A decision is named once and titled freely

`decisions/README.md` § *One decision, one file* said the `#` heading inside a
decision was its filename's full title, date and all, and that this was "the
whole convention". `tasks/decisions-do-not-obey-the-convention-they-document.md`
had recorded on 2026-09-14 that 9 of the then 73 files were written that way,
and left the question open: move the README to the practice, or move a hundred
and fifty files to the README.

**The README moved.** Re-counting on 2026-09-22, the directory holds 187
entries and the stated rule describes 19 of them. 111 lead with a bare title
and no date, 51 with the date, and 6 repeat the filename slug verbatim as a
heading. The drift is not decay around a rule people are trying to follow; it
is a different rule, followed.

**The decisive fact was not the census.** `bin/note new decisions "..."` writes
`# <title>` — a bare title, no date — and has since the day it was written. The
script that creates every decision in this directory has been contradicting the
README for as long as both have existed, so the README was not describing the
practice and was not governing it either. Moving it to the practice is really
moving it to its own tool.

**And retitling is the one edit that breaks what currently works.** These are
history, cited by title from thirty-odd places in `planning/` and the source,
and `bin/note find` resolves a citation by matching filenames. Renaming 168
files to satisfy a checker would take every reference that resolves today and
make it a dead end, in exchange for nothing a reader ever sees — a decision is
read by being opened, not by being matched.

## What the rule is now

The filename identifies: `<date>-<title-slug>.md`, fixed when the file is made.
The heading is the decision's title in whatever form suits it, ordinarily bare
and undated because the name already carries the date. The two need not agree,
and in a good many entries they do not — a title sharpens while the thing is
being argued and the name does not follow it. `bin/note rename` puts them back
in step for anybody who wants that; nothing asks for it.

`bin/note check` is unchanged, and this is the point: it asked of a decision
only that it be dated and titled, and was marked in both the script and the
README as a checker describing practice rather than enforcing a rule. That
marking is what came out. The comment above `cmd_check` now says what the rule
is instead of apologising for the gap.

**What was not done.** The strict rule was not extended to *new* decisions
either, tempting as a going-forward cutoff is. 29 current entries have headings
that differ from their filenames in substance rather than shape —
`2026-09-12-derived-names-at-signup.md` is titled *A new account is named, and
has a username, before anybody types one* — and that freedom is exactly what is
being ratified. Enforcing it on new files would re-open the same gap in a year,
with the added confusion of two eras.

`tasks/` and `backlog/` keep the strict rule, where a filename is its heading's
slug exactly. They were made by the 2026-09-14 split and have never been
anything else, so there is no history to break; and a task is referred to by
quoting its title, which is the case the strict rule exists to serve.
