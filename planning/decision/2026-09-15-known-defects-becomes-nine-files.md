# Known defects becomes nine files

`planning/backlog/known-defects.md` is gone, and its nine entries are nine files
in `planning/backlog/` under the ordinary slug rule. It was one of the two
numbered lists that `2026-09-14-one-task-one-file.md` § *The two lists stayed
whole* deliberately left intact a day earlier. `untested-behaviour.md` is still
intact, and the reason given there still holds for it: its order — by how likely
each item is to be wrong — is content, and a file per line would destroy it.

**The defects list had no such order.** It was roughly the sequence in which
things were noticed, which the dates inside each entry already carry, so
exploding it lost nothing. What it did have was the failure mode a numbered list
has and a directory does not: the 2026-09-15 re-read dropped the number-pad
entry — the floating "Go" key, fixed by `isKeypad` in
`app/src/ui/components.tsx`, whose comment now carries the account — and every
citation by number silently moved by one. `planning/HANDOVER.md` was already
wrong in two places when this split started, naming defect 6 for what had become
5 and defect 9 for what had become 8. Both now cite by title, which is the
durable half and resolves through `bin/note find`.

`app/src/ui/ChannelSettingsView.tsx` cited its defect by title already and only
needed the path corrected.

**The list's preamble is what is left over, and this is its home.** It said the
entries were "real, reproducible, and left alone", that resolved ones had been
dropped because the commits record them, and that every remaining entry was
re-read against the tree on 2026-09-15 and still held. The first is now the
backlog's own premise, the second is how finishing an item has worked since the
split, and the third is a fact about each entry, so each of the nine carries it
in its own last line rather than being asserted once over a list that no longer
exists.
