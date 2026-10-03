# Keep the transcript and let the audio go

Todd's proposal, 2026-09-30, and Rodrigo said he would do it: *"granola
style"*. The call is captured and transcribed, and **by default only the
transcript is kept**. Keeping the audio is something somebody chooses to do.
The reasoning is Todd's. The audio is the source, the thing that could be
evidence. A transcript is an abstraction that can be wrong, so keeping only
that is a lighter record of a conversation. The text still gives what people
want from it: a journal, and a way for somebody new to catch up.

Rodrigo's objection on the call still holds and belongs here. **If audio
exists at all, even briefly, there is a recording, and people have to be told
about it.** The red indicator stays whatever happens. Three things decide
whether this is a policy or just a setting:

- **How briefly.** With batch transcription the stems sit in S3 until the job
  finishes. With streaming they need never be written at all. That question is
  its own task, "Transcribe as the conversation happens".
- **Who deletes.** `decision/2026-09-23-the-server-may-not-delete-recordings-and-a-person-does-it-instead.md`
  keeps `s3:DeleteObject` away from the server on purpose. Letting the audio go
  by default means either deleting unattended, which reopens that decision, or
  never writing the audio in the first place.
- **Consent.** `backlog/two-party-consent-has-not-been-reviewed.md` has to be
  answered either way. Keeping the text and not the audio changes what is
  held, but not whether people were recorded.

Read TRANSCRIPTS.md first. Its design assumes a recording exists and a
transcript is *attached to* it, and this proposal turns that around.
