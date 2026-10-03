# The planning directories are singular

`planning/tasks/` and `planning/decisions/` became `planning/task/` and
`planning/decision/` on 2026-10-02, so that all three agree in number with
`backlog/` — the mix read as a mistake. Singular rather than plural because
*backlog* has no plural that means the same thing, and because `bin/task` was
already singular: `bin/note new task` and `bin/note new decision` now spell the
directory the way the shortcut does, and the plural spellings are refused.

Every path outside `decision/archive/` was rewritten, dated decisions and code
comments included, so they still lead somewhere. **The archive's contents were
not**: it is frozen, so its internal references still say `decisions/` and
`tasks/`, and read as the paths they were when written. A quoted *title* never
depended on the directory name — `bin/note find` resolves by slug — so
citations by title were unaffected.
