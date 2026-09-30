# Transcribe as the conversation happens

Find out whether streaming transcription is viable. It came up on the call of
2026-09-30. Todd says AssemblyAI does real time, and uses it in another app.
TRANSCRIPTS.md chose **batch** on purpose, and in § *The provider is an
interface* it warns off the realtime API's `speech_model` shape.

It matters because of "Keep the transcript and let the audio go". If text can
come straight from the live media, the audio never has to exist as a stored
object. As Rodrigo put it, that is the only way transcript-only works. Things
to find out:

- whether their streaming API takes one track per speaker, so that
  identity-by-stem, which the whole design depends on, survives;
- what it costs per hour compared with batch (about 20¢ now);
- where it would connect: a LiveKit track egress or agent on the box, and what
  that costs the box (INFRASTRUCTURE.md § *What the box can carry*);
- how it handles the floor. A silenced speaker is captured today and gated
  only at export, so streaming would have to apply that gate while the call is
  running.

**The provider question comes with it.** Rodrigo expects to move off
AssemblyAI to something cheaper. His guess is that the price falls from 20¢ an
hour to 2¢ within a year, and that at that price it can be free. Todd pointed
out that Whisper-class models running locally already cost almost nothing. A
self-hosted streaming model on the media box is one of the answers to
evaluate, not just a footnote.
