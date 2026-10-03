# 2026-09-14: One task, one file, and one backlog item too

`TASKS.md` § *Do Tasks With FS* asked for it in two sentences — "Each task in
its own file. Easier to edit and merge from worktree." `BACKLOG.md` was split in
the same pass, having the same shape and the same fault, and the entry did not
ask for that; it was asked for at the prompt while the work was being planned.

**It is § *One decision, one file* applied two directories over**, a week later.
The argument is unchanged and is in `2026-09-07-one-decision-one-file.md`: two
worktrees that both finish something edit one file in the same place, so they
conflict every time, and the conflict is file surgery performed by whoever has
just finished thinking about something else. `BACKLOG.md` carried the second
symptom the decision volumes had as well — a hand-maintained `## Contents`,
added 2026-09-07, which is a second place to keep true and was the first thing
to go.

Twenty-eight task files and thirty-one backlog files, from 409 and 1,669 lines.
The bodies moved verbatim; a reconstruction was diffed against the originals
rather than read, because fifty-nine hand-moved passages is fifty-nine chances
to drop a paragraph nobody would miss until they needed it.

## No date in the name, which is where it differs from decisions

A decision is dated history and its date is part of its identity. A task is
outstanding work: it gets rewritten in place, sometimes years after it was
written down, and a filename asserting 2026-08-15 about a paragraph edited last
week is a small lie that accumulates. `ls` sorts alphabetically here and
chronologically there, and that is the right difference.

**The ordering `BACKLOG.md` had is gone**, deliberately. It read *roughly by
size, the substantial pieces first*, and `## Contents` preserved it. Nothing
consumed that order, it was rough by its own admission, and preserving it would
have meant numeric prefixes — which is renaming files to insert one, and a
shared edit point reintroduced by the back door.

## Matching is on the slug

The AGENTS.md quoting convention used to match a quoted string against a `##`
heading. It now slugifies the quotation and matches a filename: `"Track Usage"`
and `"track-usage"` are the same reference, and a shortened quotation counts
when it prefixes exactly one file. That prefix rule is not a convenience — it is
what keeps the citations already in the tree alive, since they routinely shorten
a title (`BACKLOG.md § *The FCM credential is the wide one*` for an entry whose
full title runs another nine words).

**The convention now covers backlog items too**, which it explicitly did not
before: AGENTS.md carried the caveat "Items in `BACKLOG.md` are named explicitly
instead, until this convention is extended to cover them." This is that
extension, and deleting that sentence paid for most of the words the new rule
cost — the file came back to 549 lines against its 550 cap.

## The two lists stayed whole

`known-defects.md` (10) and `untested-behaviour.md` (7) are numbered lists, not
prose entries. They were not exploded into seventeen files. The items are three
to eight lines each; the ordering is content, explicitly so in the second case
("by how likely they are to be wrong"); and they are cited as a group and by
number, from `app/src/ui/ChannelSettingsView.tsx` and `planning/HANDOVER.md`
among others. A file per line would have buried twenty-nine real entries under
seventeen paragraphs and broken every one of those references.

## What was not rewritten

About thirty citations of the form `TASKS.md § *Title*` in `planning/` and in
source comments were left exactly as they are, on the precedent this collection
already set for `DECISIONS.md` citations: the title is the durable half, it
resolves under the slug rule, and rewriting them churns thirty-odd files for a
filing change. Each new `README.md` carries the § *Resolving an old-style
reference* section that says so.

**Bare pointers were the exception and were fixed** — a dozen places said only
"see planning/BACKLOG.md" with no title to resolve by, including `bin/deploy`.
Those would have become dead ends rather than resolvable references, which is a
different thing from a citation that still works.
