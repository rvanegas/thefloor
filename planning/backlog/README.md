# Backlog

Everything known and not done: work deliberately deferred, defects found and
left, behaviour nobody has tested. Every entry here is outstanding — if it has
shipped, it has moved to decisions/, and if it is about how to operate the
thing, it is in AGENTS.md.

The neighbours worth knowing about. **tasks/** is the roadmap: features, audits
and open questions, at a paragraph each, which is a different question from work
that is specified and pending. One of them large enough to need a design gets a
file of its own in `planning/`, and that file is where it lives while it is
being designed and built, until it ships and whatever survives moves to
decisions/. **decisions/** holds what was built and why, including the choices
that were considered and declined — several of which read like missing features
until you find the reasoning.

**SHIMS.md** is the third, and took three entries from here on 2026-09-08: code
that exists only to answer an older install, each with the build number that
retires it. They are outstanding work like everything else here, but they become
actionable on one event rather than by being chosen — the compatibility floor
moving — so they are indexed by the build that frees them rather than by size.
Nothing gated on `MIN_SUPPORTED_BUILD` belongs here any more.

## One item, one file

Adopted 2026-09-14, the same split `planning/decisions/` made on 2026-09-07 and
for the same reason; decisions/README.md § *One decision, one file* has the
argument, and `2026-09-14-one-task-one-file.md` has why it reached here.
**The name is the title, slugified** — lowercased, every run of
non-alphanumerics collapsed to a hyphen:

    the-output-picker-is-on-probation.md

with the full title as the `#` heading inside. `ls` is the index. Finishing an
item deletes its file, exactly as it used to delete the entry.

**Do not compute the slug by hand.** `bin/note new backlog "Some Title"` makes
the file, `bin/note rename` retitles one and moves it to match, and `bin/note
find "..."` says which file a quoted reference means. The slug is implemented
once, in `bin/note`; `bin/note check` runs in the test suite and is what stops
this file's prose and the directory drifting apart.

**One file is a list rather than entries.** `untested-behaviour.md` holds a
numbered list of small things ordered by how likely each is to be wrong. It
stays whole because that ordering is the content; add to the list inside rather
than making a file per line.

`known-defects.md` was the other, and was exploded into its nine entries on
2026-09-15 — `2026-09-15-known-defects-becomes-nine-files.md` has why. **A
defect is an item like any other**, so it gets a file, and there is no longer a
list to append one to.

**The ordering this file had is gone.** It used to read *roughly by size, the
substantial pieces first*, with a hand-maintained `## Contents` preserving it.
`ls` is alphabetical and nothing else records the old order. It was rough by its
own admission and nothing read it, but do not go looking for it.

## Resolving an old-style reference

Comments in the code and passages in `planning/` cite entries as
`BACKLOG.md § *Some title*`, and often shorten the title — `BACKLOG.md § *The
FCM credential is the wide one*` for an entry whose full title runs another
nine words. **The title is the durable half.** Slugify it and match a filename
here: exactly, or as a prefix where the citation was shortened. There is no
need to rewrite the citations, and rewriting them would churn thirty-odd files
for a filing change.
