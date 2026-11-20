# Claude's working is kept with its reply, and the room is shown it

Rodrigo's principle, 2026-11-07: **the tool calls a press makes, and something
of what each returned, are kept beside the reply** — read by the next press,
summed up in a line under the reply, the rest one tap away, as claude.ai shows
its own tool calls. Kept and read since 2026-11-07 (d53a4ce4); shown to the
room, filed and shared since 2026-11-20.

## Why: one evening of a library that Claude could not hold on to

The chat `2026-11-07-debugging-library-access-while-discussing-consciousness`,
seven Pro presses between 22:22 and 22:31 UTC, read against `claude_usage`:

- **22:25 found the document; 22:26 had lost it.** `lookup_term` returned its
  path and library, the reply kept only the prose after the last tool block,
  and the next press, whose only history is the *Record*, guessed a name and
  failed.
- **22:28 described lookups it never saw.** Asked what it had done, it made
  no call and gave a plausible account the ledger contradicts, then agreed
  when asked "am I wrong?", having nothing to check against.
- **22:24 and 22:30:02 promised to look and did not**: replies saying what it
  *would* do. Hence `LOOK_NOW`: your reply is the whole of your turn.
- **The library argument is what it lost**: with several libraries open,
  noesis refuses a read without `library`, and the search that gave it was a
  press ago.

## The rule on top of the principle

**The server records what Claude did, from the response's own blocks; Claude
never narrates its own working.** A record written by the model is how 22:28
happened. The same holds for what the room is shown: the line under a reply
is the server's record, never a sentence of Claude's.

## What is kept, and what never is

`pastes.working`, a list of steps (`workingSteps`, claude.ts): the tool and
library, the arguments as sent, and **for each hit everything noesis's
manifest returns for it** — path, title, word count, summary, and a lookup's
*Related* terms (Rodrigo's call, 2026-11-07, replacing titles only the same
evening); a read's length and heading; an error's text in full. **Never a
document's body** in the steps: it can be read again, and it would swell the
*Record* every lookup re-reads. Since 2026-11-20 the documents the room lets
Claude read are kept apart, whole, in `pastes.documents`
(`2026-11-20-claude-reads-the-last-two-hours-and-asks-before-reading-a-document.md`),
and **none of that text reaches the wire**: only each one's title, to name a
read.

## What the next press reads

Lines in the *Record* above the reply (`renderWorking`), not the
`mcp_tool_use`/`mcp_tool_result` blocks replayed as turns: ours is one
*Record* in one user message, and replaying blocks would mean inventing turns
and carrying bodies.

## What the room sees

**A quiet line under the reply** — *Searched 1 term · Read 1 document* — that
opens to the steps in plain words: *Searched "artificial cognition"* with each
hit's title and summary and the *Related* terms, *Read Mem Architecture
Summary* opening in noesis for somebody whose own library is connected, and
*Couldn't open "…"* with the error. The guide is left out, being the same
every time. The raw call only under `debug`. English and Spanish.

**Everything, for every library consulted.** Rodrigo's call, 2026-11-07:
switching *Library* on in a channel is permission to show the room all of
what Claude did with it, a personal library's hits included. **The
per-viewer split, hits shown to the owner alone, was proposed and declined.**
`/privacy` and the *Library* switch's note say so.

**The parsing is in core** (`shownSteps`, core/working.ts), reading noesis's
`lookup_term` and `list_documents` text as noesis writes it, so the server's
wire, the filed document and the app's share text agree. A line it does not
recognise is passed over rather than shown wrong. **A change to noesis's
output format is a change there.** The kept steps stay noesis's raw text, so
a parser fixed later reads every old reply again.

**A filed transcript and *Share text* carry the line and its steps**, so the
channel's library reads what the room read.

**A read links where noesis's web client opens it** (`?library=&file=`), added
by `GET /channels/:id/rooms` as a filed segment's link is, on the channel
libraries' origin for `thefloor/…` and the personal one's otherwise. Its path
comes from a search earlier in the same reply where Claude read by a bare name
or stem, since the web client opens only a path it holds.

## Not done here

- **No shim**: `PasteView.working` is optional and older builds ignore it.
- **Prompt caching**, once this task's third step, is
  `task/cache-the-prompt-ask-claude-sends.md`, set aside until asked.
- **`CHARS_PER_TOKEN` undercounted by about a third** on the 2026-11-07
  channel (~124K tokens against a 90K budget). The two-hour window of
  2026-11-20 keeps a press well under that budget, so it went unfixed.
