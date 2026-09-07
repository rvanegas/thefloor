# The cap was on the file that was not growing — 2026-09-07

The token cost of an ordinary session had been climbing, including sessions
that had done nothing yet. The obvious suspect was AGENTS.md, which is loaded
in full before anybody types. It was innocent: 38.5KB on 2026-08-15 and 38.5KB
now, held flat by its own 650-line rule the whole time.

What had grown was everything it points at. `planning/` went from nine files
and 237KB to forty-three and 1.65MB in three weeks — seven times over — and
`decisions/` from two volumes to twelve, about a megabyte across 181 entries.

**A fixed instruction costs whatever its target has grown to since somebody
wrote it.** That is the whole finding. AGENTS.md said to grep
`planning/decisions/DECISIONS*.md` rather than the live volume alone, which was
sound advice about a corpus a tenth the size; measured now, `grep channel`
across the set returns 1,076 lines and 82KB — twenty thousand tokens in one
tool result, more than the preamble and every other routine read put together.
`grep deploy` returns seven thousand. Nobody added a line to make that true.
The rule that was supposed to prevent exactly this governed the one artifact
that had stopped moving, and measured it in lines of itself.

So four changes, in the order they matter.

**`DECISIONS` is archaeology now, and is not consulted as a matter of course.**
It is enough to know the volumes are there, for the case where a comment in the
code is inexplicable and the reasoning would change what you do. The
`## The deploy history` running record is the exception, still written to on
every deploy. When somebody does go in, grep the headings rather than the
prose. The alternative considered and rejected was an index of all 181 entry
titles: it would have cut the cost of the sweep, but the sweep itself was the
thing that did not need doing, and an index is a file to keep correct forever
in exchange for making a rare operation cheaper.

**RELEASING.md is read when executing a deploy-related verb, and not
otherwise.** Forty-four kilobytes of procedure for a day most sessions never
have. It had an unconditional *read it before `bin/upload-ios`*, which is fine,
next to a description that invited reading it to find out whether it applied.

**GLOSSARY.md goes the other way, because it is the terms of communication.**
Demoting it was the first instinct and it was wrong: a session that has not
read the vocabulary and one that has are not having the same conversation, and
this project's nouns are ordinary English used narrowly, which is how the
adjacent thing gets built. What was actually wrong was the price — forty-two
kilobytes to learn that *present* means something specific. So the terms are
front-loaded: § *Every term, in one line each*, sixty-seven terms at a clause
apiece, seven kilobytes, enough on its own for ordinary work. The entries below
keep the reasoning, the contrast and the history, and you go down to one when
the line will not settle it. Adding a term is now two edits, and the file says
so — a term missing from the list is, for most sessions, a term that does not
exist.

**And AGENTS.md was cut by a fifth anyway**, 649 lines to 520, because much of
it was inessential to most work. The box inventory, the two media settings that
fail silently, what it can carry and the known rough edges left whole as
INFRASTRUCTURE.md — the third split on the *who needs it* seam after
RELEASING.md and CREDENTIALS.md. The three artifacts that disagree about
entitlements went to RELEASING.md, being a check you only run while making a
build; `APNS_ENV` stayed, being one that bites somebody testing push locally.
The cap came down to 550 with it, since leaving 650 in place would have handed
back the gain over the following fortnight.

The standing rule that replaces the old one: **a `planning/` document over
about 20KB carries its own index, and a pointer in AGENTS.md says when to read
the thing rather than merely that it exists.** STATES.md, BACKLOG.md and
RELEASING.md got contents tables in the same commit. An unconditional *read it*
aimed at a file that quadruples is a bill that grows on its own, and nobody
signs it.

Repaired while in there: the live volume's preamble had an entry spliced
through the middle of it — *Contact requests are in the contacts* had landed
inside the sentence naming the two running records, which broke off mid-clause
at `## Contact requests` and resumed thirty-five lines later at
`## The deploy history\`, which is newest-first`. A rollover did it. The entry
is intact and has been moved down among the dated ones.
