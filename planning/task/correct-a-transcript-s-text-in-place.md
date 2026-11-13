# Correct a transcript's text in place

Rodrigo, 2026-11-13. When a line in the *Record* tab was transcribed wrong (a
name, a term, a misheard phrase), a member can fix it where it is drawn, and
the fix shows wherever that line is read.

**What it is built on.** Lines live in two tables, both written once and never
changed: `transcript_lines` (a *transcript*, placed by recording position) and
`live_lines` (the *live transcript*, placed by wall clock). The `transcript_fts`
index in `db.ts` has an insert trigger and a delete trigger, and says it needs
no update trigger because lines are never edited. That stops being true here.
*Name voices* (decision/2026-11-13-a-separated-voice-may-be-named.md), shipped
the same day, is the closest precedent. It is a per-segment change that has to
reach every place the text is read, and it already worked out how to.

**The design, as proposed:**

- **Keep what the provider wrote; store the correction beside it.** Use a
  nullable `corrected_text` on each table, or a table of corrections keyed by
  line, rather than overwriting `text`. That makes a correction reversible
  (clearing the field goes back to the original), and it keeps the original for
  comparing transcription models
  (`run-a-cheap-transcriber-beside-assemblyai-and-compare.md`), where an
  overwritten line would score the edit, not the model.
- **One line at a time, edited as a field where it is drawn.** A line is
  one speaker's turn and is the unit already tapped, seeked to and searched.
  Word timings are not kept, so an edit cannot misalign anything: the line's
  start and end stay as they are. Only finished lines can be edited. A live line
  still being spoken is not a line yet.
- **The server sends the corrected text in `text`.** Every older build then
  shows the correction without knowing it is one, so no shim is owed.
  Whether a line was corrected travels as a field of its own, for a marker
  if STYLE.md wants one.
- **Where the correction has to reach**: the same places *Name voices* lists.
  That means the *Record*, *Share text*, the transcript export, the published
  episode's VTT, *Ask Claude*, and the channel library's document, which
  is then owed a fresh filing, on the same mechanism and within the same
  week-long limit as a voice name (`voices_named_at`, `OWED_FOR_MS`). Search
  also needs an update trigger on `transcript_fts`, plus whatever indexes
  `live_lines`, if anything does. A *digest* already sent is not changed.

**Open, and the user's to answer:**

- **Who may correct whose words.** *Name voices* is on a recording's rename's
  terms: anybody in the channel, no record kept of who. Changing what
  somebody is recorded as having *said* is a heavier act than naming a
  voice, so there are two plausible rules. One is the speaker only, for their
  own lines, plus anybody for a *Played audio* stem. The other is anybody, with
  who corrected it kept and shown. `live_lines` already freezes the speaker's
  name with the line, on the argument that nobody should appear to have said
  what they did not, and that argument applies here too.
- **A published episode's transcript.** A correction changes the VTT that a
  podcast app reads. A correction is not new content, so it probably does not
  reopen consent. But the rules in the 2026-09-21 publication decision should
  be checked before deciding that.

**Later, not now:** a channel's corrections are a vocabulary. They
can go back to the transcription provider as key terms (AssemblyAI takes a
list) so that the same name is spelled right the next time. That needs the
original kept, which is one more reason for the first point above.

Read STYLE.md before drawing the field, and GLOSSARY.md before naming the
action. It needs a Spanish string too, chosen for translation.
