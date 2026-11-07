# Claude's working is kept with its reply

Rodrigo's principle, 2026-11-07: **the tool calls a press makes, and something
of what each returned, are saved into the *Record*** — all of it read by the
next press, some of it shown in the app, the rest one tap away, as claude.ai
shows its own tool calls.

## Why: one evening of a library that Claude could not hold on to

The chat `2026-11-07-debugging-library-access-while-discussing-consciousness`,
seven Pro presses between 22:22 and 22:31 UTC, read against `claude_usage`:

- **22:25 found the document; 22:26 had lost it.** `lookup_term` returned its
  path and library, `replyText` kept only the prose after the last tool block,
  and the next press — a fresh request whose only history is the *Record* —
  guessed a name, and its one call failed.
- **22:28 described lookups it never saw.** Asked exactly what it had done, it
  made no call and gave a plausible account ("read_file and read_document with
  guessed names") that the ledger contradicts: 22:26 made one call, not two.
  Asked "am I wrong?", it agreed, having nothing to check against.
- **22:24 and 22:30:02 promised to look and did not**: zero calls, replies
  saying what it *would* do. Nothing tells it that the reply is its whole turn.
- **The library argument is what it lost.** With more than one library open on
  a server, noesis's `read_document` and `read_file` refuse a call without
  `library` ("name the library … the one a search gave"); the search that gave
  it was a press ago.

## The rule on top of the principle

**The server records what Claude did, from the response's own blocks; Claude
never narrates its own working.** A record written by the model is how 22:28
happened.

## What is kept

A list of steps on each Claude paste — a `working` column or a `paste_steps`
table, whichever the schema takes better. Each step:

- **the tool and the library**: `lookup_term` on `thefloor/artificial-intelligence-e9y8`;
- **what was asked**: the arguments as sent;
- **what came back, in short**: a search's hits as name, title and library; a
  read's name, title and length; **an error's text in full**, since it is
  short and it is the diagnosis.

**Never a document's body, and never a search's summaries** — Rodrigo's
correction, 2026-11-07: of what a lookup returns, only the documents' titles
enter the *Record*, with the name and library that let a later press read
one. Either can be fetched again, both would swell the *Record* that every
lookup round re-reads, and they are a library's, not the channel's. The test:
keep what lets the next press act and what explains a failure; drop what can
be fetched again.

## What the next press reads

**Lines in the *Record* above the reply, rendered by `renderSegment`** — not
the `mcp_tool_use`/`mcp_tool_result` blocks replayed as turns, which claude.ai
does because its prompt is a conversation. Ours is one *Record* in one user
message, and replaying blocks would mean inventing turns and carrying bodies:

    Claude, having consulted the library:
      looked up "artificial cognition" in thefloor/artificial-intelligence-e9y8 → 2026-11-07-mem-architecture-summary.document.md, "Mem Architecture Summary"
      read 2026/2026-11-07-mem-architecture-summary.document.md (thefloor/artificial-intelligence-e9y8): 4,200 words
    Claude: Rodrigo, I've now read…

The system prompt says, with it: these lines are the server's exact record of
what you did; pass the library a line names when you read from it; your reply
is the whole of your turn, so do any looking now; when somebody asks you to
consult the library, consult it. An older part that `composeLibraryRecord`
reduces to one line takes its steps with it.

## What the room sees

**A quiet line under the reply** — *Searched 1 term · Read 1 document* — that
opens to the steps in plain words: *Searched "artificial cognition"*, *Read
Mem Architecture Summary* (opening in noesis, as the *Library* card does),
*Couldn't open "…"* with the reason. Raw arguments only under `debug`. Every
word through i18n, Spanish included.

**Everything, for every library consulted.** Rodrigo's call, 2026-11-07:
**switching *Library* on in a channel is permission to show the room all of
what Claude did with it** — a personal library's search hits included, not
only what the reply cites. The per-viewer split, hits shown to the owner
alone, was proposed and declined. `privacy.ts` and the policy say so in the
same commit.

**A filed transcript carries the visible summary**, the line and its steps
as the room sees them, so the channel's library reads what the room read.

## Also

- **A press that posts nothing logs its steps** to the server log, so a
  failure leaves a trace too.
- **The paste gains an optional field on the wire**: `CLIENTS.md` before
  writing it, and a `SHIMS.md` entry if it turns out to be step one of two.
- **Prompt caching, which nothing sets today**: `cache_write_tokens` and
  `cache_read_tokens` were 0 on every row on 2026-11-07, so each lookup round
  pays for the whole *Record* again — 533K input tokens for one reply at
  21:42, five lookups. Steps lengthen the *Record*, which makes this matter
  more. Check how caching meets the MCP connector's server-side loop first.
- **`CHARS_PER_TOKEN` undercounts by about a third on this channel**: one
  pass came to ~124K tokens against a 90K budget.

## In this order

1. Storage, and the steps in the *Record* with the prompt's sentences — what
   fixes the evening above.
2. The app's line and its steps; the filed transcript; the policy.
3. Caching, measured in `claude_usage` before and after.
