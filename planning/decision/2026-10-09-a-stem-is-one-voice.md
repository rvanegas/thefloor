# A stem is one voice

Every transcript line is labelled with the display name of whoever's stem it
came from — the name frozen in `participant_names` with the run, or *Played
audio* for the shared track — and nothing about it is editable. This reverses
two things decision/2026-08-25-transcripts.md settled: `speaker_labels` on
every stem (decided 2026-08-24), and the voice declarations that sat on top of
the letters it produced.

**The rule: a stem holds exactly one voice.** It is one microphone, so whose
stem it is answers who said it, and the provider is never asked. Taken as an
assumption across all transcription, batch now and real-time when it comes, so
that the second inherits a simple commitment rather than the first's
machinery. Rodrigo, setting it: diarisation stays, but as identifying voices
with microphones rather than as voice analysis.

What went:

- **`speaker_labels`** in the AssemblyAI request. Its default is `false`
  (checked against their docs the same day). Lines were already built from
  words by `intoLines`, so the only change there is that a line no longer
  breaks on a change of letter.
- **The voice editor** — *Name the voices* on the transcript screen, the
  `PUT /recordings/:id/transcript/voices` route, `voiceRoster`, `voiceKey`,
  `multiVoiceStems` and `voiceName` in `core/transcript.ts`, and the
  "a letter beside a name means…" note.
- **Letters on screen, in exports and in search results.** `Played audio (B)`
  is `Played audio`.

**What it cost, measured before deciding.** Production held 27 declarations
across 7 transcripts, all renames and no removals, so no hidden line reappears.
Almost all of them gave a member's two or three letters back the member's own
name — undoing the provider's split, which is exactly what this now does
without being asked. Two were real information: the people inside a played
track (*Fareed* and *Mustafa*; *Host* and *Alex*). Those two transcripts now
read *Played audio* throughout. That is the price of the rule, paid knowingly.

**Bleed is credited to the microphone's owner.** On a speakerphone a stem
carries the other party faintly; the provider used to give that a second
letter, and the editor could remove it. Now it is a line under the owner's
name. The confidence on each line is still stored, which is where a fix would
start if it turns out to matter. This is a headphones-first app, and the floor
exists so that one person talks at a time.

**Kept, unread:** the `transcript_voices` table with its rows, and the
`transcript_lines.speaker` column, NULL for anything transcribed from today.
Dropping either deletes what people typed or what the provider returned, which
is a separate decision from no longer showing it.

**Older builds need no shim.** They draw the editor's button only when the
response carries a `voices` roster of more than one entry, and the letter note
only from a line's `speaker`; the server now sends neither, so both disappear
on their own. An editor somebody already had open gets a 404 on Save.
