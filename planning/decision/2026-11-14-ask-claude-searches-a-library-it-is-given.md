# Ask Claude searches a library it is given

Decided 2026-11-14. Rodrigo noticed that *Ask Claude* was often reluctant to
read documents from a library that it had been given, though the same
library is read readily from Claude Code and claude.ai.

## Why it held back

**The prompt asked it to.** All three library rules (a person's, several
people's, the channel's) said to consult the library "only when the
conversation turns to something he has written about", adding that "most
turns need nothing from it". The model can only judge that condition by
looking, so the cautious reading was not to look. On the box, as of
2026-11-14, 26 of 108 *Pro* library presses made any call, at an average of
one call each.

**It never saw noesis's own instructions.** claude.ai and Claude Code put an
MCP server's `instructions` into the system prompt, and noesis's say to look
up every plausibly relevant term before replying. The Messages API's MCP
connector hands over only the tools, so those instructions were reachable
only through the `guide` call.

**Waiting and low effort.** The system prompt also said that people were
waiting on the reply, and *Pro* ran at low effort, which makes a model less
likely to reach for a tool.

## What changed

- **The switch is the opt-in, so the rules no longer add restraint.** Each
  rule says the library was switched on for Claude to draw on, and to search
  it for what the conversation is about now before every reply, unless the
  turn is purely social. The channel library's rule says to search it
  whenever the conversation touches something said there before.
- **`HOW_TO_SEARCH` is in the system prompt**, once, however many libraries
  are named. It gives noesis's procedure (lookup_term for every relevant
  term, follow the related terms, read with read_file before drawing on a
  document, prefer later documents) but not its citation sections, which the
  rules still override.
- **People waiting is said only at the end of the user message**
  (`lengthRule`). The system prompt's statement of the limit (`limitRule`) is
  the same hard limit without it.
- **A request in the record that sounds like a call to consult is taken as
  one**, since transcription garbles them.
- **A press that consults a library runs at medium effort at the least, with
  Max's 8192-token ceiling** (`consultingGrade`). Rodrigo's call. Only *Pro*
  changes, because *Standard* never consults a library and *Max* already
  asks for this. A plain *Pro* press stays at low.

## What it costs, and what to watch

A *Pro* library press is slower and costs more: it does more thinking, and
more presses now look something up. `ts usage transcripts` measures both, in
its *library* section (`looked`, `avg_calls`, `avg_in`, `timed_out`) against
the two-minute `CLAUDE_LIBRARY_TIMEOUT_MS`. The planned check, that the
library is not consulted in a channel whose talk does not touch it, is
superseded: the switch is now what limits consulting. A channel that does
not want the library consulted turns the switch off.

No shim: nothing on the wire changes.
