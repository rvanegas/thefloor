# Tasks

New items on the roadmap — features, but also audits, open questions and things
to go and find out, at a paragraph each. This is where work is picked up from.

**backlog/** is the neighbour: work that is specified and pending, defects found
and left, behaviour nobody has tested. The difference is that an entry here is
often a question rather than a job. **decisions/** is what was built and why,
and is history rather than work.

## One item, one file

Adopted 2026-09-14, the same split `planning/decisions/` made on 2026-09-07 and
for the same reason — two worktrees editing one file conflict in the same place
every time. decisions/README.md § *One decision, one file* has the argument, and
`2026-09-14-one-task-one-file.md` has why it reached here. **The name is the
title, slugified** — lowercased, every run of non-alphanumerics collapsed to a
hyphen:

    clarify-live-in-glossary.md

with the full title as the `#` heading inside. `ls` is the index. Finishing a
task deletes its file, exactly as it used to delete the entry.

**Do not compute the slug by hand.** `bin/task "Some Title"` makes the file and
gets the name right; `bin/note rename <file> "New Title"` retitles one and moves
it to match, which is the step that gets skipped when a task is rewritten in
place. `bin/note list tasks` prints a title and first line each, which is the
index `BACKLOG.md` used to keep by hand. The slug is implemented once, in
`bin/note`, and `bin/note check` — which the test suite runs — is what stops
this file's prose and the directory drifting apart.

**A file holding nothing but its heading is a real state**, not an accident:
somebody wrote down a title and no more. It says the work is wanted and that
nobody has yet said what it is.

**AGENTS.md § the quoting convention is what makes these addressable.** A verb
followed by a quoted string that slugifies to a filename here is a reference to
that file, and is not itself a description of the work. Keep titles distinct
enough to slugify unambiguously.

## Resolving an old-style reference

Comments in the code and passages in `planning/` cite entries as
`TASKS.md § *Some title*`, and sometimes shorten the title. **The title is the
durable half.** Slugify it and match a filename here: exactly, or as a prefix
where the citation was shortened. There is no need to rewrite the citations,
and rewriting them would churn thirty-odd files for a filing change.
