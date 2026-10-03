# 2026-09-10: A root is not a founder

`bin/growth` called every account at depth 0 a **founder** — in the `founders`
report, in `founders_on_it`, and in `founders_who_brought_nobody`. It is now
**root**, everywhere, and the report is `bin/growth roots`.

The reason is a marketing campaign. Every install it produces arrives with no
inviter, so every one of them lands at depth 0, and the box has no way to tell
a campaign arrival from a friend passing a link on — the header says so
outright now, because after the campaign the temptation to read that class as
growth will be strong and wrong. *Founder* is a claim about having started
something. For the eight people who had arrived on their own by today it read
true; for eight hundred arriving from an advertisement it will not, and most of
them will be trees of one.

**Root claims nothing beyond position.** It is where somebody sits in the
invitation forest — the top of a tree, whatever grew under them — and it is
already what the code called it: `root` is the column `generation` labels each
person with, and has been since the script was written. So the word and the
schema now agree, which is the state AGENTS.md asks for and the state a
disagreement between them is a bug against.

The report already separated the two populations and still does: a row each for
the roots something grew under, and `roots_who_brought_nobody` as a single
count at the bottom. **The fix was a word and not a query** — no number in any
report changed.

## What did not change

**The three class names.** *Alone*, *first circle* and *onward* were named by
depth rather than by how somebody arrived, which is exactly what makes them
survive a campaign. *Alone* has never claimed to know how somebody got here.
See 2026-09-10-growth-is-a-depth-in-a-forest.md for why depth is the
classification.

**The command is `bin/growth`.** It was renamed to `bin/founders` earlier the
same day, on a prompt that was then retracted; that rename is undone and the
decision file written for it is deleted. The objection it raised is real — the
largest class in a script called *growth* will swell when you buy advertising —
but it is answered by the header paragraph and by this rename, not by renaming
the tool. GLOSSARY.md's term is still *growth classes*.

Two things from that commit are kept, because neither depends on the name: the
temp view the reports are built over is `arrival` rather than `growth`, which
is what it always held, and the per-report functions are `report_` rather than
`growth_`.
