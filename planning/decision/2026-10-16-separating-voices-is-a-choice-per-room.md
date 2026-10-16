# Separating voices is a choice, per room

Since 2026-10-16 the transcriber is asked which voice said what *within* one
stem in two cases, and in no others: **the shared track, always**, and **a
member's own microphone, while they have *Several voices on my microphone*
on** — a switch on the *Record* tab under *Audio* and *Text*, for one room.
Everything else stays as decision/2026-10-09-a-stem-is-one-voice.md left it:
a stem is one voice, named by whose stem it is. This narrows that decision
rather than reversing it. Rodrigo, setting it: a user must be able to enable
it for the track he contributes, in case it carries more than one voice; the
played audio always; a toggle per room; bare letters; live and batch both.

**Why it came back.** The 10-09 decision named its own price — the two
transcripts whose played interviews collapsed into one *Played audio*
(*Fareed* and *Mustafa*; *Host* and *Alex*) — and a phone two people talk into
is the same loss on a member's stem. Nobody owns the shared track to switch it
on, and an interview is the commonest thing played, so that one is always.

**Bare letters, never renamed.** A separated stem that came back with more
than one voice reads `Played audio (A)`, `Played audio (B)`; one that came
back with one voice reads as before, unlettered (`lettered` in
`core/transcript.ts`). The voice editor that 10-09 deleted stays deleted.

**Per room, and only your own.** `ChannelState.diarize`, set by `SET_DIARIZE`
for the actor and nobody else (`canSetDiarize`: a member here — the guest page
has no such switch), cleared by `settleEmpty`, not persisted: a restart ends
the LiveKit room, so it ends the choice with it. Drawn on its own line of the
pinned bar because a third switch on the first does not fit 375 points.

**How each form hears of it.**

- *Live.* Each session is opened asking or not (`StreamingOptions.diarize`,
  `speaker_labels=true`); a switch flipped mid-session closes it, keeping its
  last turn, and the next frame opens one asking the other way. A turn carries
  `speaker_label`, `PENDING` read as none; the letter is stored in
  `live_lines.speaker` and travels as `LiveLine.speaker`, beside a
  `displayName` frozen without it, and the app letters where it gathers a
  segment's lines.
- *Batch.* The sitting is over long before anybody asks for a transcript, so a
  recording running while somebody has it on notes them in
  `recordings.diarized` (`noteSeparatedVoices`), and only ever adds — a minute
  of it asks for that stem, there being one transcript of a stem and not one
  per minute. The job records what it asked in `transcript_jobs.diarize`, so a
  resumed job asks the same, and `linesFor` returns a letter only from a job
  that asked: the letters every stem was given before 10-09 stay off screen.
  The route and the exports send the letter in the name and drop the bare
  field, because builds from before 10-09 drew a note from any line's
  `speaker`.

**What it costs, and what is not metered.** AssemblyAI's streaming
diarisation is +$0.12/hr per stream (planning/task/transcribe-as-the-conversation-happens.md);
the live `media` stream now always pays it, and *free minutes* count a
session's open time, not the surcharge. Whether batch diarisation carries a
surcharge was not checked today; it was asked of every stem from 2026-08-24 to
10-09, and is now asked of the `media` stem and the noted ones.

**Known limits, accepted.** A live letter is the session's: a session closes
after `IDLE_MS` of silence, and the next one's `A` is whoever it hears first,
so letters across a pause need not agree. Batch letters are one file's and do
agree. Not on guests.

**No shim.** `SET_DIARIZE` is new; a server that predates it refuses it, and
an app that predates it never sends it. `LiveLine.speaker` is optional and
ignored by older builds, which draw the plain name.
