# Claude reads the last two hours and asks before reading a document

Decided 2026-11-20, Rodrigo's, the rest of what was the task *Choose what
Claude reads* — the *Record* half having been
`2026-11-19-a-segment-may-be-hidden-from-claude.md`. Four rules, in his
words' order:

1. **By default a press sends the segments of the last two hours**; more or
   less can be chosen by hand.
2. **Claude does not read a library document it can be determined it already
   has as a segment.**
3. **Claude decides which documents are most relevant, then asks the room to
   confirm before reading them.** Two requests a press, where it asks, was
   accepted the same day.
4. **A document read for *Ask Claude* stays in what later presses send for
   two hours**, or for as long as the segment its reply belongs to is sent.

**Why, in order** (2026-11-18): distraction first, then redundancy, then
cost. The question that opened it was the 2026-11-18 call with Rochelle (chat
`2026-11-18-claude-audio-feature-development-and-costs`): a press cost about
50 cents, mostly because it carried the whole conversation so far, and
wondering whether none of the *Record* should be sent by default. Two hours is
the answer between none and all.

## The window

`CLAUDE_READS_MS` in `core/constants.ts`, and **`claudeReads` in
`core/channel.ts`, which both ends ask**: a segment is read when it ended
within two hours of the press or is still being kept, unless hidden; an older
one only when shown. Each with what was pasted into it, as before. Wall-clock
hours before the press, not the last two hours of talk: in a channel that
meets weekly, a press at the start of a call reads nothing of last week's
until somebody shows it.

**By hand is the hidden mark with an opposite number**, not a third state on
one column: `segments.shown_to_claude` beside `hidden_from_claude`, never both
set, `SegmentView.shownToClaude` beside `hiddenFromClaude`. **A mark is kept
only against the default** (`SegmentLog.hide`): the route stays `PUT
.../hidden` with `{ hidden }`, now meaning *whether Claude should leave it
out*, and the server clears both marks wherever that is what the window says
anyway. So build 441, which sends `hidden: false` to *Show to Claude* a hidden
segment, gets what it always got, and a newer build's *Show to Claude* on an
older segment marks it shown. **The menu's word is whether Claude reads the
segment now**, and the muted line under it is only ever a mark — *Hidden from
Claude* or *Shown to Claude* — never the window's own edge, which every older
segment is past. Claude is told the window (`userMessage`) and still not the
marks.

**`RECORD_BUDGET_TOKENS` stays, as a ceiling**: two hours is about 25K
tokens, so it bites only on a long stretch shown or on documents read.
`LIBRARY_RECORD_BUDGET_TOKENS` and `composeLibraryRecord` are gone, folded
into `composeRecord(…, { library })`: beside the channel's own library every
older filed segment not hidden is still a line naming its document, the index
of everything said here — **kept** because it is what Claude finds the
channel's past by, and a line is cheap. The trim cuts whole rooms from the
oldest end, then lines; the library composer's newest-first fill went with
it.

**An empty window refuses the press** with *There is nothing from the last two
hours in the Record for Claude to read.* — the sentence for an empty
*Record*, which this now is.

## Asking before reading

**The connector cannot pause for a person**: Anthropic's servers run the
whole MCP tool loop inside one request (`libraryRequest`). So a press that
consults a library **searches only** — `LIBRARY_TOOLS` lost `read_file` and
`read_document` — and is offered a tool of this server's own,
**`ask_to_read`** (`ASK_TO_READ`), which stops the request (`tool_use`). At
most five documents, each a name, a library, a title where given and a reason
in a sentence the room reads.

**The card** (`ChannelView.claudeProposal`, a `ClaudeProposal`) goes up on
every screen and *Responding…* ends: *Claude wants to read these before it
replies:*, each document a box ticked by default — a confirmation's boxes
start ticked (STYLE.md § *Checkbox*) — then *Read* and *Answer without*.
**Anybody who could have pressed may answer** (`canAskClaude`), not *Name
voices*' terms, which the task had proposed: the answer is the second half of
a press, and a press is anybody present's. **It stays until answered or the
next press replaces it**; held in memory, so a restart drops it with the
request it continues. An answer to a card already replaced is refused with
*Claude is no longer asking that.*

**The server reads the chosen documents itself** (`readDocument`): one MCP
`tools/call` of `read_file` at noesis, stateless so no handshake, with the
token the press consulted it by. Chosen over turning `read_file` back on for
the second request with an instruction, because then what Claude reads is
exactly what was chosen rather than what it was asked to keep to, rule 2 is a
filter before any fetch, and rule 4 has the text in hand. They go to Claude
as the result of its `ask_to_read` — the first request's blocks sent back, the
same conversation — with what was declined and what could not be read, and
**`tool_choice: none`**, so the second request replies rather than asking
again. **Each document goes whole**: a 30,000-token budget shared among them
was built and lifted the same day, Rodrigo's call; the *Record*'s own ceiling
is what a long one meets, on a later press.

**A press from a build before it** says nothing of `confirms`, so it is
offered no `ask_to_read`: it searches and answers from the summaries, reading
nothing, since reading without asking is what rule 3 rules out. Additive on
the wire — an optional field, a new route, a body flag — so **no shim**.

**The ledger** has a row per request: `proposed` for the first of two, then
the second's own outcome, both under whoever pressed. `bin/usage` counts
presses without the `proposed` rows and those as `asked`.

## Already held, and kept

**Rule 2 is by name** (`heldIn`): a filed segment keeps its document's file
name (`segments.filed_file`), which is what Rodrigo asked for and was already
so, and a read document its own. A name Claude asks for is matched as
`read_file` takes one — file, stem, slug or title, any folder before it —
against every filed segment the *Record* sends whole and every document a
reply there read. Those, and anything named in a library this press did not
consult, are answered at once without asking anybody, told so in the result.
The same conversation in somebody's own library under another name is not
caught, and is not tried.

**Rule 4 is the reply carrying them** (`pastes.documents`, `KeptDocument`):
each document read, whole, kept beside the reply and set above it in the
*Record* (`renderDocuments`), so it is sent for as long as the reply is — the
last two hours, or longer where its segment is shown. A reply that failed
keeps nothing, there being no paste to keep it on.

**A hidden segment's documents are offered back, unticked** — Rodrigo's
correction the same day to their simply going with the reply. They are not
sent: hiding is the room saying not this. But the next time a press asks to
read, the card lists them beside what Claude asked for, each saying *Read
before, then hidden from Claude* in place of a reason and **unticked by
default** (`ProposedDocument.hidden`, `ComposedRecord.hiddenDocuments`).
Only a segment within the two hours, the window rule 4 keeps them for; one
Claude asked for itself is its ask, ticked. Chosen, one is read from what was
kept rather than from noesis, and left unticked it is not mentioned to Claude,
which never asked for it. A press that asks nothing shows no card, and sends
none of them.

**`/privacy` says so**: the library paragraph and the Claude section's
window, both dated 20 November 2026.

## Prompt caching comes after

Rodrigo asked which first; this, then
`planning/task/cache-the-prompt-ask-claude-sends.md`, whose measurement made
most of the saving the trim at the 90K cap — 162 of 295 presses — which a
two-hour window no longer reaches. The prompt is laid out for a cache: the
system prompt, then the *Record* oldest first with the documents beside their
replies, the length rule last; and the second request repeats the first's
whole prefix.
