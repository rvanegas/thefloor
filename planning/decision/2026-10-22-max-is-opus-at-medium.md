# *Max* is Opus at medium

Added 2026-10-22, the same day as the *Response model* setting it extends
(`2026-10-22-claude-joins-the-conversation-as-a-paste-in-the-record.md`).
Rodrigo's ask: a third grade after *Pro*, *Max*, which is Opus with medium
reasoning, settable by `debug` accounts only, as the other two are.

## What it asks

**`claude-opus-5-5` at `effort: 'medium'`, with the refusal fallback's
`"default"` form, and `max_tokens` 8192.** Medium is Opus 5.5's own default,
sent anyway so `RESPONSE_MODELS` reads as the whole request. It is the one
grade that buys thinking as well as size — *Standard* and *Pro* stay at low
for the reason the original decision gives, that every thinking token is
added to the wait under *Responding…* — so its ceiling is the largest, and
only tokens generated are billed.

**About twice *Pro* a press, before the thinking**: $4 / $20 per million
tokens against Sonnet 5.5's $2 / $10 and Haiku 5.5's $0.10 / $0.50, at
medium rather than low. `bin/usage` prices Opus rows and gives *Max* its own
column, so what it costs is measured rather than this paragraph.

## What it does not change

**The 60-second `CLAUDE_TIMEOUT_MS` is the same for every grade.** Opus at
medium reading seven hours of *Record* for an *Extended* reply is the case
most likely to meet it, and is not measured yet; `claude_usage.outcome =
'timeout'` by grade is where it would show, and a per-grade timeout is the
fix if it does.

**No shim.** A build that predates *Max* is sent `responseModel: 'max'` in a
snapshot and draws neither suffix nor a highlighted grade in Channel
Settings — wrong by omission, not broken — and can never send it.
