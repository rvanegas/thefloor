# Choose what Claude reads

Rodrigo, 2026-11-17. *Ask Claude* reads the channel's *Record* by a fixed
rule: newest first, up to `RECORD_BUDGET_TOKENS` (about seven hours of
talk), or, where it consults the channel's library, the newest room and
`LIBRARY_RECORD_BUDGET_TOKENS` in full with older filed segments as a line
each (`composeLibraryRecord`, `server/src/claude.ts`). What is in that window
is all in it, so an unrelated earlier stretch can distract the reply. **Asked:
deciding by hand what is included and what is left out.**

**Why, in order** (Rodrigo, 2026-11-18): **distraction first**; then
**redundancy**, since a segment already filed in the channel's library is
there for Claude to read and need not be sent as well; then **cost**, whose
cheaper answer is `cache-the-prompt-ask-claude-sends.md`. Where the three
point different ways, distraction decides.

**Done**: `2026-11-18-a-paste-is-part-of-the-segment-it-was-made-in.md`, the
step before; and **`2026-11-19-a-segment-may-be-hidden-from-claude.md`**, the
*Record* half — a segment hidden for everybody until shown, its pastes with
it, Claude told nothing. That decision says how the unit, whose mark, and
what Claude is told were answered. What is left, as Rodrigo decided it
2026-11-20 — four rules, then what each changes and what is still open.

## The four rules

Rodrigo, 2026-11-20, settling the two questions this task held open — the
default (raised on the 2026-11-18 call with Rochelle, chat
`2026-11-18-claude-audio-feature-development-and-costs`) and guiding the
library:

1. **By default a press sends the segments of the last two hours**; more or
   less can be chosen by hand.
2. **Claude does not read a library document it can be determined it already
   has as a segment.**
3. **Claude decides which documents are most relevant, then asks the room to
   confirm before reading them.**
4. **A document read for *Ask Claude* stays in what later presses send for
   two hours**, or for as long as the segment its reply belongs to is sent.

## What each one changes

**1. The window is time, not tokens.** `composeRecord` and
`composeLibraryRecord` today fill a budget newest first: about seven hours
plain, three in full beside the library. The default becomes every segment
that **ended** within two hours of the press — the one still being kept
always — with `RECORD_BUDGET_TOKENS` kept as the ceiling, since two hours of
four people can still be long. *By hand* is the hidden mark grown into three
states: *as the default*, *hidden*, and **included**, the last being the new
half — **Show to Claude** on a segment older than the window. Still a
segment's mark, everybody's until changed, on *Name voices*' terms; still
told nothing, the mark deciding only what is sent.
`segments.hidden_from_claude` becomes a three-valued column, migrated by a
script; `SegmentView` carries the third state as a new optional field, so an
older build draws an included segment as not hidden, which it isn't
(`CLIENTS.md` before writing it).

**2. Determined means by filename, which is already kept.** Filing a
segment stores the document's filename on it, `segments.filed_file` (with
`filed_title`), updated when a segment is refiled
(`server/src/channelLibraries.ts`); Rodrigo asked for exactly that,
2026-11-20, and it is there. The rule becomes the server's rather than the
prompt's: a document proposed under 3 whose filename is a sent segment's
`filed_file` is dropped from the proposal, and so never read. Sameness by
content — the same conversation imported into somebody's own library under
another name — is not attempted.

**3. Reading becomes two requests, which Rodrigo accepted 2026-11-20; the
connector cannot pause inside one.** Anthropic's servers run the whole tool loop in one call
(`libraryRequest`); nothing pauses it for a person. So:

- **The press searches only.** `read_file` and `read_document` are off in
  `LIBRARY_TOOLS` for it; Claude searches, and either replies, or ends with
  the documents it wants, each with the reason — in a form the server parses,
  never as prose in the room.
- **The room confirms**: a card where the reply would be — *Claude wants to
  read: …*, each document ticked, **Read** and **Answer without** — which
  anybody present may press, on *Name voices*' terms.
- **Confirmed, a second request answers** with the chosen documents. The
  recommendation is that **the server fetches them itself**, from noesis with
  the owner's token it already holds, and puts them in the prompt: then what
  is read is exactly what was confirmed rather than what Claude was asked to
  stick to, rule 2 is a filter before the fetch, and rule 4 has the text to
  keep. The other way, the connector with `read_file` on and an instruction,
  can be checked against `workingSteps` afterwards but not held to.
- **This supersedes the *read this / leave this* marks** this task used to
  carry on the steps under a reply. It no longer waits on
  `claude-s-working-is-kept-with-its-reply.md` step 2 — the card is its own
  thing — though the steps drawn under a reply are where a confirmed read
  then shows.

**4. A read now keeps the document.** `keptOf` keeps none of it today, since
it can be read again. Kept for two hours means its text stored with the
reply's paste — a `paste_documents` row, say, with when it was read — and
rendered above the reply while it is within two hours of being read, **or**
while the reply's segment is sent at all (rule 1's included segment brings
its documents with it, as a paste goes with its segment). Past both, the
reply keeps today's line, *read in full: N words*. The privacy page says
what is kept of the lookups, and changes in the same commit. A document
resent on every press for two hours is what `cache-the-prompt-ask-claude-sends.md`
is cheapest against.

## Still open

- **The card when nobody answers it.** Recommended: it stays until somebody
  does or the next press replaces it; a channel nobody is in answers nothing.
- **An older build in the room** cannot draw the card. Recommended: the card
  is a new wire message older builds ignore, and a newer build present is
  enough; a room of only older builds gets *Answer without*, since reading
  without confirmation is what rule 3 rules out.
- **Whether the window is wall-clock or the channel's own**: two hours
  before the press, or the last two hours of talk, which in a channel that
  meets weekly is the end of last week's call. Wall-clock is what was said.

## Before prompt caching

Rodrigo asked, 2026-11-20, which comes first; **this task**, with its
prompt laid out for caching, then `cache-the-prompt-ask-claude-sends.md`.
Most of what that task measured as caching's saving is trimming at the 90K
cap, 162 of 295 presses; a two-hour window is about 25K tokens and is never
there, so this task takes that saving itself. What it does to the prefix
instead: the window drops a whole segment as it ages out rather than a line
a press, so the prefix holds between drops; and the second request of a
confirmed press repeats the first's system prompt and *Record*, which caching
makes nearly free. So write this one's prompt with the stable parts first —
system prompt, then the *Record* oldest first, kept documents with their
replies, the proposal and what changes per press last — and caching is a
breakpoint after it.
