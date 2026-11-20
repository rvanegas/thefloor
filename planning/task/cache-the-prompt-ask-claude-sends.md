# Cache the prompt Ask Claude sends

Rodrigo, 2026-11-18, out of reviewing what became
`decision/2026-11-20-claude-reads-the-last-two-hours-and-asks-before-reading-a-document.md`.
**Set aside**: filed so the cost question has a cheaper answer on record than
sending less of the *Record*, and not to be started until asked.

**Since that decision, most of what is measured below has gone** (Rodrigo
asked, 2026-11-20, which came first: that). A press reads the last two hours,
about 25K tokens, and so no longer reaches the 90K cap whose line-a-press trim
was most of the saving; what the window does to the prefix instead is drop a
whole segment as it ages out, so the prefix holds between drops. Two things
are new and favour a cache: **a press that asks the room what to read is two
requests**, the second repeating the first's system prompt and *Record*
whole; and **documents read stay above their reply** for as long as it is
sent, the same text on every press for two hours. The prompt was laid out for
it — system, *Record* oldest first, the length rule last — so the measurement
below wants redoing against presses since 2026-11-20 before anything is built.

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
- **The TTL is five minutes**, measured below: 180 of 278 *Pro* presses came
  within five minutes of the channel's previous one, and a hit refreshes the
  cache, so an hour's double write never pays for itself.

## What it would save

Rodrigo asked, 2026-11-18. Every *Pro* and *Max* press since 2026-10-23,
295 of them, replayed from `claude_usage` at `bin/usage`'s prices and the
API's cache rates (a read 0.1× input, a write 1.25× for five minutes, 2× for
an hour). The ledger keeps one input total per press, so each turn's prompt
is estimated as that total over one plus its lookups.

| | Total | Per press |
|---|---|---|
| As sent today | $66.25 | 22.5¢ |
| Cached within a press only | $61.28 | |
| Across presses, the *Record* still trimmed a line at a time | $56.86 | |
| **Across presses, all three fixes above, five minutes** | **$36.22** | **12.3¢** |
| The same with an hour | $41.04 | |

**Trimming at the cap is most of it**: 162 of the 295 presses were at the
90K budget, where cutting a line from the front each press means no reuse;
cutting in steps is worth about $20 of the $30. $36 is an upper bound, since
it credits every capped press with a hit and the press after each step
misses, so expect 30–40% off. Output was $1.04 of it; the saving is all
input.

Done is `ts usage transcripts` showing cache reads on library presses and the
per-press cost falling, with the reply unchanged. No shim: nothing on the wire
changes.
