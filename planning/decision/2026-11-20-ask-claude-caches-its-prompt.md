# Ask Claude caches its prompt

Built 2026-11-20, when Rodrigo asked for the task *Cache the prompt Ask Claude
sends*, filed 2026-11-18 as the cheaper answer to what a press costs. Until
then no request asked for prompt caching and the ledger's two cache columns
were always zero, while two presses in one room sent nearly the same prompt
and a library press re-sent all of it on every resumed `pause_turn`.

**What stood between the request and a stable prefix, and what became of it:**

- **The system prompt carried the reply's length**, so *Brief* after *Medium*
  shared nothing. The number is now said only by `lengthRule`, the user
  message's last sentence; the system prompt says there is a hard limit and
  why, and that it is stated at the end (`LIMIT_RULE`). **This is the one
  change a reply could notice**: the number was stated twice since
  2026-10-22 and is now stated once, with the rule and its reason still twice.
  A mid-conversation system message would have kept the old words exactly,
  and was not used because *Pro*'s refusal fallback goes to Sonnet 5, which
  refuses that message.
- **The opening said whether the *Record* was trimmed**, so reaching the
  ceiling changed the first sentence. That sentence now follows `</record>`.
- **The *Record* was one text block**, and a cache entry is matched only at
  block boundaries, so a *Record* grown by one line shared nothing past the
  system prompt — the obstacle the task did not name. It is now cut into
  blocks of about 2,000 tokens at line ends (`recordChunks`), each cut
  depending only on the text before it, so appending leaves every block but
  the last byte for byte. A breakpoint on the last whole block is what the
  next press finds; one on the last block is what a resumed pause reads. With
  the system prompt's, three of the API's four.
- **Trimming at the ceiling a line at a time** was most of the saving the
  task measured. Since the same day's two-hour window, a press reaches the
  ceiling only with a long stretch shown or documents read, so it was left as
  it is: what the window does instead is drop a whole segment from the front
  as it ages out, which re-writes the cache once and then holds.

**The second request of a press that asks the room what to read writes
nothing past the system prompt.** It sends `tool_choice: none`, and a
`tool_choice` change drops the messages' cache, so it can read neither its
first request's *Record* nor leave one the next press could read. Marking it
would be a 1.25× write nobody reads. Lifting `tool_choice: none` so the two
share a cache would let the second request ask again, and was not done.

**Five minutes, the default.** The task measured 180 of 278 *Pro* presses
within five minutes of the channel's previous one, and a hit refreshes the
entry; an hour's 2× write never paid for itself in that replay.

**`ts usage` prices the cache since the same change**: `input_tokens` is then
only the uncached part, a write 1.25× the input price, a read a tenth on
Haiku 5.5 and a twentieth on Sonnet 5.5. `avg_read` and `avg_write` are
columns of *Who spent it*, and `avg_read` of *consulting the library*.

**Not yet seen working.** The task's test of done is `ts usage transcripts`
showing cache reads on library presses and the per-press cost falling, with
replies unchanged — which needs a deploy and a day of presses. The task's
upper bound, from the old prompt shape, was 30–40% off; with Sonnet 5.5's
reads at a twentieth rather than a tenth, and the window in place of the
ceiling, the number wants measuring rather than carrying forward.
