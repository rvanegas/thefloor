# Read Claude's reply aloud with AssemblyAI's speech instead of the phone's

Asked 2026-11-13: use AssemblyAI's new text-to-speech in place of the voice
built into iOS (`app/modules/read-aloud`, `AVSpeechSynthesizer`), which reads
Claude's paste in the Record as it lands —
decision/2026-10-28-claudes-reply-is-read-aloud-on-arrival.md.

**First, refresh the guide.** `planning/ASSEMBLY_PROMPT.md` is AssemblyAI's
guidance for coding agents as it stood when transcripts were built. Fetch the
latest (`https://www.assemblyai.com/docs/llms.txt` and the agent prompt it
points to), replace the snapshot below our header, and note in the header the
date it was taken. Read it for what is new: the speech service itself (models,
voices, languages, formats, streaming or not, price), and anything that
changes what transcription uses today — newer speech models than the
`universal-2` default (decision/2026-10-09-transcripts-default-to-universal-2-and-pro-is-a-debug-setting.md)
and changes to the streaming API `streaming.ts` speaks. Whatever bears on
existing code becomes its own task or backlog item rather than riding along.

Then the design questions: the server would synthesise (the key never reaches
a phone), once per paste rather than once per phone, and serve the audio to
every phone present; what happens to the language detection and the voice
card in *Floor Settings*, which exist for the installed voices; whether the
phone's voice stays as the fallback when there is no key or the request fails;
Android, which reads aloud with its own voice too; and `/privacy`, which would
newly say that Claude's reply text goes to AssemblyAI.
