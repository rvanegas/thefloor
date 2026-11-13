# Alternate between AssemblyAI credentials

Asked 2026-11-13: take two or more AssemblyAI keys and alternate between them,
**written so it can be taken out again cleanly** — a stopgap, not a design.

Today there is one, `ASSEMBLYAI_API_KEY`, read once in `server/src/index.ts`
and handed to both `AssemblyAiTranscription` (batch, `transcription.ts`) and
`AssemblyAiStreaming` (live, `streaming.ts`), each of which keeps it as
`apiKey` and sends it as the `authorization` header. `bin/transcribe` and
`server/scripts/transcribe.ts` read the same variable.

Keep it removable by confining it to one place: a small module (say
`server/src/assemblyKeys.ts`) that reads the keys, from a comma-separated
`ASSEMBLYAI_API_KEY` or numbered `ASSEMBLYAI_API_KEY_2`, … — choose one — and
hands out the next on each call; the two providers take a `key: () => string`
in place of `apiKey: string`. Taking it out is then that module, the two
constructor lines in `index.ts`, and back to a string. Mark every site with
the same greppable comment naming this task.

To settle while building it: whether to alternate per request or per
recording, since a batch job's polls and its deletion (`DELETE` on the
transcript, which `/privacy` promises) must use the key that made it — so the
key travels with the job, not the call; that a live session keeps its key for
its whole socket; and what a key rejected or out of balance does (fall to the
next, or fail as now). `planning/CREDENTIALS.md` § AssemblyAI, the
`server/.env.example` entry and `bin/usage` change with it, and `/privacy`
names one processor however many keys there are.
