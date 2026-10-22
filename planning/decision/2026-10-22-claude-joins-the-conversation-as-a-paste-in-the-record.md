# Claude joins the conversation as a paste in the Record

Built 2026-10-22, from the task *Integrate Claude into Conversation*, whose
file this replaces. Rodrigo's ask was five steps: a client for Claude, a
prompt from the channel's record of transcripts with an instruction to
contribute, a card for Claude on *People*, a button on it in the ping's style
labelled *prompt*, and the response put directly into the Record. What was
built is that, with the label changed, and the reasons for each choice that
looks like it could have gone the other way are below.

## The reply is a paste, not live lines

**`PASTE_CLIP`, applied on the presser's behalf with `clip.authorId =
CLAUDE_ID`.** The reducer guards the acting user (`canPasteClip`), who is
present; it does not tie the author to the actor, which is what lets the
server post as Claude without a new kind of segment. Going through the reducer
is what makes the reply *arrive*: `Pastes.follow` writes the row, the snapshot
carries a new `clip.id`, and every open *Record* refetches on that key. Every
build since 2026-10-15 draws it under Claude's name with no change, which is
why there is no wire change and no shim.

Live lines were the alternative and are wrong for it: lines are speech and
belong to a text segment, so a reply made while nothing is being kept would
have nowhere to go. A paste is an instant that breaks nothing.

If the presser has left by the time the answer comes it is posted as whoever
is still present, and with nobody present it is written straight to `pastes`
— a paid answer is not lost because one person stepped out.

## The prompt is the whole Record, capped from the oldest end

Rodrigo chose the whole *Record* over the current room. Live lines, recordings'
batch transcripts and pastes, laid out in rooms oldest first, with Claude's
earlier replies labelled *Claude* so a second press continues rather than
repeats. A batch transcript is headed by its recording's start rather than
given a time per line, because its offsets are recorded time, which pauses,
and would be wrong as wall-clock times.

**90,000 tokens of Record**, counted as 3.5 characters a token. The number is
Haiku 5.5's price cliff: a prompt past 100K tokens costs five times as much,
and 90K leaves headroom for the instructions. It is about seven hours of talk,
which is most channels' entire Record. Whole rooms are dropped first, then
lines from the front of the oldest kept, and the prompt says it begins partway.
`claude_usage.input_tokens` is what calibrates the 3.5, which matters for
Spanish. The same budget for both grades, so the prompt is the same whichever
model reads it.

## The length is an instruction, and nothing trims

Rodrigo's call, over a sentence-boundary trim. The limit — at most 100 words,
two to four sentences — is stated as a hard one, with its reason, in the
system prompt and again as the last line after the Record, where 90K tokens
of transcript would otherwise be the last thing read. Neither says a longer
reply will be cut, because it will not be.

Two consequences, both deliberate: a reply over `MAX_CLIP_LENGTH` is not
posted (the reducer refuses rather than trims) and is reported as *too long*,
paid for and producing nothing; and a reply stopped by `max_tokens` is posted
as it came back. `claude_usage.stop_reason` counts the second, which should
stay near zero; if it does not, the fix is the allowance or the instruction.
**There is no retry of a press** — one press is one request.

## The model is a channel setting, both grades at low effort

*Response model*, *Standard* or *Pro*: Haiku 5.5 with `max_tokens` 1,024, and
Sonnet 5.5 with 4,096, both at **low effort**. Pro was Opus at first, then
Sonnet at medium, and Rodrigo settled on Sonnet at low: thinking is generated
before the reply, so every thinking token adds to the wait under
*Responding…*, and a turn in a conversation is judgement rather than a chain
of reasoning. Pro's gain is meant to come from the larger model. Its 4,096 is
headroom, which costs nothing since only generated tokens are billed. About a
cent a press on *Standard* at the cap, about 19 cents on *Pro*.

**The channel's, whoever presses**, for the transcription model's reason, and
written to the ledger at the press. **Settable only by `debug`**, the same
check as the transcription model — Rodrigo accepted that flag as the gate
rather than one of its own, knowing it means *whoever holds `debug`*. **Shown
to everybody**, the one difference from the transcription model: which model
is answering in a channel is something everybody in it may know. No
environment override, so a file on the box cannot contradict what the app
shows. *Pro* carries the server-side refusal fallback in its `"default"` form,
the only one Sonnet 5.5 accepts; Haiku has none, so a refusal there is
reported.

## The indicator is channel state

`ChannelState.claude`, set by `CLAUDE_ASKED` and cleared by `CLAUDE_ANSWERED`,
both raised by the server, because everybody present has to see
*Responding…* — and the guard that greys every screen's button is the one that
refuses a second press with 409. It is cleared in a `finally`, on the answer,
the failure, the 60-second timeout, and on restore, since a card stuck on
*Responding…* would refuse every press after it.

## The label is Respond

*Prompt* in the ask. On a card named *Claude* a bare verb is addressed to the
card, as *Ping* is, so *Ask Claude* would say the name twice; *Respond*
translates one to one into *Responder*, where *prompt* has no Spanish verb that
is not *ask* or wrong. The busy label is *Responding…* / *Respondiendo…*.

## The meter is the reports that already exist

`claude_usage`, one row per press with token counts and **no text** — the
reply is in `pastes` and the prompt is the Record, so a copy there would be a
second store of the conversation. A ledger, outliving the account:
`UsageMeter.forget` nulls who pressed and keeps the spend. `bin/usage
transcripts` prices it beside transcription, split by grade, rather than in a
report of its own, at Rodrigo's request.

## What it discloses, and when

`/privacy` names Anthropic only where `ANTHROPIC_API_KEY` is set — the
AssemblyAI gate — with a section of its own and the two sentences it makes
false rewritten, and a later *last updated* date shown only there. **Nothing
is said about what Anthropic does with its copy, or where it processes it**:
that is not checkable from here, which is the page's rule since the
transcription section learned it. If those are ever to be stated, they are
read from Anthropic's terms on the day, not from memory. So the order is the
ordinary one with no shim: deploy with the key unset, upload the build, then
set the key and `bin/env-push`.

## Not built

- **Renaming *People***, which now holds one card that is not a person. Kept,
  Rodrigo's call; *Table* / *Mesa* is the candidate if it moves.
- **Who else may choose *Pro*** — widening it is one check.
- **Prompt caching**, until the meter shows repeated presses in one channel.
- **A Record drawing that sets Claude's replies apart**, a glyph rather than a
  colour.
- **Speaking the reply.** Text-to-speech into the room is a different
  feature, with the floor's rules to answer to.
- **Guests in a browser** cannot press: the route needs an account, and a
  guest's page has no *People* tab.
