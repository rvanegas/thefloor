# Bias the transcriber toward the conversation's own words

Rodrigo, on the call with Erta, 2026-11-16. A difficult word — a name, a
term of art — that comes through wrong should come through right more often
as the conversation goes on, the transcriber working out from context what
the topic is. People from AssemblyAI told Rodrigo it is a feature they
already have, so this is most likely something not switched on rather than
something to build. **First, go and find out**: AssemblyAI's key-terms
prompting (`keyterms_prompt` when last looked) on both the streaming model
(`server/src/streaming.ts`) and batch (`server/src/transcription.ts`), against
the current docs — which models take it, how many terms, what it costs, and
whether a streaming session can be given new terms while it runs, which is
what "as time goes on" needs.

Where the terms would come from, cheapest first: the channel's name and
members' display names; words from the channel's earlier transcripts or its
library; and later, the corrections of `correct-a-transcript-s-text-in-place.md`,
whose *Later, not now* already names this. Compare before and after with
`run-a-cheap-transcriber-beside-assemblyai-and-compare.md`'s method rather than
by ear.
