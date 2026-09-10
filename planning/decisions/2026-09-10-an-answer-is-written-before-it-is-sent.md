# 2026-09-10 — An answer is written before it is sent

`bin/help` used to answer a question in one move: `bin/help <id> "..."` wrote
the text and published it on the same keystroke. It now takes two — the write
puts the text in `answer_draft`, where only its author can read it, and
`bin/help publish <id>` is the move the asker ever sees. Ids may also be given
as any unique prefix.

Both changes are about the same failure. This is a private answer, written by
hand, to a stranger's question about their own account, sent by a command with
no undo — and the two ways to get it wrong were to send it to the wrong person
and to send it before it was finished.

## An id is any prefix that means one question

Ids are `q_` plus twelve characters of base64url. Typing one out to answer a
question is a transcription job whose failure is silent: a wrong character
updates zero rows, and the one thing standing between that and believing you
had answered somebody was reading the row that came back. Four characters are
unique among the handful of questions ever outstanding.

**Ambiguity is refused, never resolved.** A prefix matching two questions prints
both and does nothing. There is no "did you mean" that proceeds, because the
cost of a wrong guess here is not a wasted command — it is a private answer
delivered to somebody it was not written for.

**The prefix is matched with `substr(id, 1, n) = prefix`, not `LIKE`, and that
is load-bearing rather than stylistic.** base64url's alphabet contains `_`,
which is `LIKE`'s single-character wildcard, and every id's second character is
one. `LIKE 'q_kJ8%'` therefore matches every id whose second character is
anything at all — all of them — so under `LIKE` the longer and more specific
the prefix looked, the less it would have constrained. The uniqueness check
would have failed open into ambiguity on every invocation, which is at least
loud; what makes it worth writing down is that it is exactly the kind of
almost-working that survives a casual test against a database holding one
question.

## Writing and sending are two moves

The one-move form suits "yes, tap it twice" and badly misfits the answers that
are actually hard: a paragraph about somebody's account, composed in a shell
argument, with no way to read it back before it was gone. There is no undo —
nothing notifies the asker, so nothing can un-notify them either, and the row
is simply true from the moment it is written.

The draft is **not a workflow**. There is still no queue, no status, no routing
and no second person; the 2026-09-10 entry *Help is a question box* stands
unchanged. It is one gap, between finishing a sentence and standing behind it.

**Writing again replaces the draft, and there is no command to discard one.** A
better draft over the top is the whole of the edit, and a draft left unpublished
costs nothing sitting there — the question is genuinely unanswered either way,
and appears as such to everybody including the asker.

## Why the draft is its own column

`answer_draft` beside `answer`, rather than `answer` plus an `unpublished` flag.

Every read of this table asks `answer IS NULL`: the screen's list, the backlog
count that decides whether somebody may ask a sixth question, the state column
in `bin/help`. Keeping the draft in `answer` under a flag would have required a
second condition at every one of those sites, and the one that was missed would
show somebody a half-written sentence about their own account.

**The two shapes fail in opposite directions, and only one of them is
survivable.** Miss a site under this shape and a draft fails to appear, which is
what a draft is for. Miss one under the other and a draft appears to the wrong
person, which is the thing being prevented. Not one existing read had to learn
what a draft is.

A drafted question still counts against the backlog, and that falls out of the
shape rather than being arranged: nobody is less waiting on us because somebody
has started typing.

**Publishing moves the draft rather than copying it** — `answer_draft` is
cleared in the same statement that promotes it. Left behind as a copy, a draft
beside a published answer would be the state of every answered question there
had ever been, and would distinguish nothing; cleared, it means an edit in
progress and only that. It is one `UPDATE` reading its own row rather than a
read followed by a write of what was read, so there is no window in which the
answer could be improved and the improvement dropped.

The migration adds both columns null and backfills nothing. A question already
answered has been seen by the person who asked it, and inventing a draft for it
would offer to publish a sentence that is already out.

## What is tested, and what is not

`server/__tests__/help.test.ts` tests the columns rather than the script: that
a draft reaches nobody — asserted over the whole serialised view, since a leak
through some third key would satisfy a narrower test and still be the thing
that went wrong — that a drafted question goes on counting as unanswered, that
publishing moves the draft, and that the two publish failures are told apart.
`publish` returns `no-such-question` or `nothing-drafted` rather than `false`,
because the corrections are opposite: one wants the id checked, the other wants
the answer written, and a boolean sends you to look at the wrong one.

The script itself has no test and was exercised by hand against a seeded local
database — every path including both refusals, an answer containing
apostrophes, and a prefix that `LIKE` would have got wrong.

One thing found while doing that and **not** fixed, because it predates this and
belongs to `bin/db`: `bin/db --local` opens `-readonly`, and a read-only
connection cannot create the `-shm` file a WAL database needs, so any read of a
local database with no live writer fails with `unable to open database file
(14)`. It bites anyone running `bin/help --local` with the dev server stopped.
