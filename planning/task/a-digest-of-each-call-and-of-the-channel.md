# A digest of each call and of the channel

Todd's, 2026-09-30. When a call ends, the people who were on it are sent a
short **distillation** of what was said. Over time these add up to a journal
of the channel. Somebody who joins later gets **a distillation of all the
distillations**: what this channel talks about, beyond its name.

Todd sees two uses. It is a nice touch for the people who were on the call.
And it helps a newcomer get up to speed, which also answers the complaint from
a couple of users that The Floor is no different from a phone call. A
channel's accumulated memory is something a phone call does not have.

It depends on transcripts, either automatic ("Transcribe automatically in
chosen channels") or text-only ("Keep the transcript and let the audio go").
Open questions: which model writes the summaries, and who pays for it; how the
digest reaches people (push, or the channel); whether a newcomer may read
digests of calls from before they joined, which is a consent question like
publishing (`decision/2026-09-21-nothing-is-published-until-everybody-in-it-has-agreed.md`);
and what happens to a digest when its recording or transcript is deleted.

**The call transcribed 2026-10-07 answered two of these and specified the
prompt.** The model is Sonnet first (`run-a-cheap-transcriber-beside-assemblyai-and-compare.md`).
Who pays is `free-to-talk-paid-to-transcribe-and-digest.md`. Rodrigo's
context, stated as steps: the **full transcript of one uninterrupted
conversation** plus the **digests of earlier ones**, each capped in length.
Todd's refinement, which Rodrigo took up: rather than every past digest, one
**running preamble**, like a season recap, regenerated as the history grows.
It is hidden by default and exists to give the next digest its context. It
may be offered to a newcomer, but it is not shown in the history. What the
user sees is the sequence of digests. On length: *"pick a number and then
tune it up or down"*. Rodrigo did not want the model judging how dense or
valuable an hour was. And participants want the raw transcript out too, to
paste into their own tools, as Todd does with Otter. The history this builds
up is `the-channel-is-one-long-conversation.md`.
