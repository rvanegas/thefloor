# One decision, one file — 2026-09-07

Landing a worktree kept involving fumbling in the `DECISIONS` files, and the
rollovers were the worst of it. The complaint was about friction; the audit
found the friction was a symptom.

**The scheme coupled three things that have nothing to do with each other:**
writing one decision, filing it into a volume, and a 2,000-line read limit. The
first is a small independent act. The second and third are bookkeeping that
only exists because the first was being done to the tail of a single shared
file.

What that produced, measured across the twelve volumes:

**Every landing collided at the same place.** An append-only file has one
insertion point, so two worktrees finishing in the same week both edit the last
line of the same file and always conflict. No amount of care changes that; it
is the data structure.

**The rollover was hand surgery interleaved with unrelated work.** Of the
commits that created a volume, only `6daee10` was a dedicated rollover. The
rest — `1227b27`, `207eaa1`, `eaa55f1`, `0346b16` — were feature commits that
had to stop mid-task and perform a rename, a header rewrite and an index-table
edit.

**And the surgery went wrong, in both directions.** `bcd328b`, an ordinary
feature commit, appended its entry *inside the live volume's preamble*: the
sentence naming the two running records broke off mid-clause at `## Contact
requests` and resumed thirty-five lines later. It sat that way for two days.

**Worse, the rollover copied the running records forward instead of moving
them.** `## The deploy history` ended up in three volumes at once, two of them
closed and supposedly never edited again — and they had diverged, the
`2026-08-31-to-09-04` copy missing the 2026-09-06 deploy. Anyone grepping the
set for what was on the box could get a stale answer. At ~930 lines a copy, the
duplication also added ~1,900 lines to the set, inflating the volumes that then
tripped the cap that triggered the next rollover. **The scheme was feeding
itself.**

**And the cap was barely the real trigger anyway.** No volume ever reached
2,000 lines. The largest is 1,911 and four rolled between 963 and 1,127.

## So: one file per decision

`planning/decisions/<date>-<title>.md`. Two branches never touch the same file,
so landings stop conflicting. There is no volume to choose, no cap to check and
no rollover to perform, so there is no surgery to get wrong. The running
records are their own files, edited in place and never copied, so the
duplication is structurally impossible rather than merely discouraged. `ls` is
the index and the names sort chronologically.

The 2,000-line read limit still exists — it is a reason to prefer many files,
not a thing to police in one.

## What was not done, and why

**The eleven closed volumes were not migrated.** They are frozen in `archive/`
in the shape they were written in. Splitting them would mean inventing dates:
the first three volumes carry none in their headings at all, and git blame on
an append-only file attributes an entry to whichever commit last touched the
region. Since `DECISIONS` became archaeology earlier the same day, an archive
in the old shape costs nothing — it is greppable, and that is all it needs to
be. Two repairs were made to it, the duplicated running records, and they are
the only edits it will ever get.

**The ~38 citations in source comments were not rewritten.** They read
`DECISIONS.md § *Some title*` and were never precise about the container
anyway — most name `DECISIONS.md` for an entry that had already moved to a
dated volume. The title is the durable half, and it survives the change intact
as the filename. Rewriting them would churn thirty-odd source files for a
filing decision. `planning/decisions/README.md` says how to resolve one.

**An index file was considered and rejected**, as it was for the archaeology
change earlier the same day. A generated index of 180 entry titles is a file to
keep correct forever in exchange for making a rare operation slightly cheaper,
and `ls` over dated filenames already answers the question an index would.
