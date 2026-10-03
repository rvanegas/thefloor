# The task directory is singular

`planning/tasks/` became `planning/task/` on 2026-10-02, so that it agrees in
number with `backlog/` beside it — the pair read as a mistake. Singular rather
than plural because *backlog* has no plural that means the same thing, and
because `bin/task` was already singular: `bin/note new task` now spells the
directory the way the shortcut does.

Every reference outside `decisions/archive/` was rewritten, dated decisions
included, so the paths in them still lead somewhere; the archive is frozen and
keeps `tasks/`. A quoted *title* never depended on the directory name —
`bin/note find` resolves by slug — so citations by title were unaffected.

**`decisions/` stays plural**, which leaves the three directories still mixed.
It was out of the ask, and renaming it touches every dated cross-reference
between decisions; it is the obvious next step if the mismatch still grates.
