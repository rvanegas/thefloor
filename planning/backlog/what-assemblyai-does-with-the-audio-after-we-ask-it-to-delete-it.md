# What AssemblyAI does with the audio after we ask it to delete it

**Status:** unanswered, and it gates the deploy that sets
`ASSEMBLYAI_API_KEY` — because that is the deploy where `/privacy` starts
making claims about a third party.

`Transcripts.forget()` calls `DELETE /v2/transcript/:id` twice over: when the
text lands here, and again when the transcript is deleted. What that does at
their end is not established. Three things are unknown and only the first is
strictly about wording:

1. **Whether it erases or marks.** If it schedules a sweep, the audio and the
   text sit with them for some window afterwards, and "asked to delete" is the
   most this page may say without naming that window.
2. **Whether it covers the uploaded audio or only the transcript row.** These
   are separate objects at their end and one call is meant to take both — which
   is the whole argument for uploading rather than presigning, TRANSCRIPTS.md §
   *The provider is an interface*. If it does not, the audio needs deleting by
   some other means, and the design's deletion story loses its teeth.
3. **What their own retention is for data we never delete** — a job that fails
   before we learn its id, say.

**This page briefly published a number nobody had a source for.** On
2026-08-25 `/privacy` said the copy was "removed within about 30 days", from a
sentence in conversation that was actually about *this* application's sweep,
not theirs. It was wrong for a few hours.

**The page now says nothing whatever about their side** — decided the same
day. Not the window, and not even that they are asked, which the wording fell
back to first: a claim about what a third party does with a copy is not
checkable against this repository, and this page's whole premise is that every
paragraph is. What it says instead is what this server does with its own
copies, which is a thing it can be held to. `privacy.test.ts` asserts the
absence, and `transcription.ts` § `forget` says not to put one back without a
source.

That is the honest floor rather than the goal. A reader deciding whether to tap
Transcribe would be better served by the real answer, and a submission
describing a third-party processor is better with it — which is what makes this
worth answering rather than merely worth working around.

The answer is unlikely to be in the API reference. It is a policy or DPA
question — their privacy documentation, their terms, or their support — which
is why this is here rather than as a code comment saying "check the docs".
`server/src/transcription.ts` § `forget` points here.
