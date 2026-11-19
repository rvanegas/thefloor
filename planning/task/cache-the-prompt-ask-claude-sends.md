# Cache the prompt Ask Claude sends

Rodrigo, 2026-11-18, out of reviewing
`choose-what-of-the-record-claude-reads.md`. **Set aside**: filed so the cost
question has a cheaper answer on record than sending less of the *Record*, and
not to be started until asked.

**Nothing asks for prompt caching.** There is no `cache_control` in
`server/src`; the ledger records `cache_creation_input_tokens` and
`cache_read_input_tokens` (`resumed`, `server/src/claude.ts`) and both are
always zero. Yet two presses in one room send nearly the same prompt, and a
press that consults a library re-reads the whole of it on every model turn
and every `pause_turn` resumption. `ts usage transcripts`, 2026-11-18: a *Pro*
press averages 94K–125K input tokens — past the 90K `RECORD_BUDGET_TOKENS`
because of those re-reads — and $0.19–0.25, about $64 of the $66 Claude has
cost. A cache read is a tenth of the input price.

What stands between the request and a stable prefix, to settle first:

- **The system prompt carries the reply length** (`systemPrompt(length, …)`,
  `limitRule`), so *Brief* after *Medium* shares nothing. Moving the limit to
  the end of the user message, where `lengthRule` already restates it, would
  make the system prompt per-channel rather than per-press.
- **The user message opens with a sentence that changes** once the *Record* is
  trimmed or summarized (`userMessage`); a breakpoint after `</record>` only
  helps if what precedes the record holds still.
- **The *Record* stops being append-only at its budget**: past 90K tokens the
  oldest room is cut from the front, and with the channel library the full
  window's edge slides, so every press past that point writes a new cache
  rather than reading one. Whether to cut in steps — drop an hour at a time
  rather than a line — so the prefix holds for a while, is part of the design.
- **The TTL**: five minutes covers the re-reads inside one press and presses
  in quick succession; an hour costs twice the write and covers a sitting.
  Measure the gap between presses in a room before choosing.

Done is `ts usage transcripts` showing cache reads on library presses and the
per-press cost falling, with the reply unchanged. No shim: nothing on the wire
changes.
