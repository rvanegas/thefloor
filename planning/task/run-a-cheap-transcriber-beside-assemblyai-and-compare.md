# Run a cheap transcriber beside AssemblyAI and compare

Rodrigo's plan, stated on the call transcribed 2026-10-07: *"I'll keep
AssemblyAI up, but I'll implement a parallel transcription using the very
cheap one and then compare them. If they're comparable, then there you go …
If they're not, then maybe I can just keep both implementations alive."* The
one he had in mind was about 1/20th of the cost and popular. He did not name
it on the call.

AssemblyAI was chosen for diarisation, but here diarisation comes from the
stems: one track per microphone (decision/2026-08-25-transcripts.md). So a
provider without speaker separation loses little, and the comparison is about
word accuracy on our own audio. Rodrigo: *"it's useless to get the words
backwards"*. The seam is the provider interface that decision already
describes. Run both on the same stems and diff them. Whatever is learned also
feeds the provider question in `transcribe-as-the-conversation-happens.md`.

The digester is the other half of the cost, and that was decided on the call
too: **Sonnet first**, and tune down later. A digest can stand a little
degradation, since *"once you get the gist … you'll have your own sense of
what it was really about"*. Cost is judged against tomorrow's prices rather
than today's.
