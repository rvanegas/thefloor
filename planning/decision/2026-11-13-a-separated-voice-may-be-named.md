# A separated voice may be named

Rodrigo, 2026-11-13: *"Add an action to the segment menu to enable user to
rename voice attributions, in case there are multiple voices on one of the
stems."* A segment of the *Record* whose stem came back with more than one
voice — `Played audio (A)`, `Played audio (B)` — now has **Name voices** in its
menu, which opens a field per voice under the line; a name given reads in
place of the letter everywhere that segment's lines are read. This reverses
the one sentence of decision/2026-10-16-separating-voices-is-a-choice-per-room.md
that said *bare letters, never renamed*, and nothing else of it.

**Why the old editor's objection does not hold here.** The editor
decision/2026-10-09-a-stem-is-one-voice.md deleted was nearly all members
giving their own letters back their own name — undoing a split the provider
should never have made, which separating only on request now prevents. What it
was right to keep was the two played interviews (*Fareed* and *Mustafa*; *Host*
and *Alex*), and a separated stem is exactly that case again, so the action is
offered only where a stem holds several voices.

**A segment's, never wider** (`segment_voices`, keyed by segment, stem and
letter). A letter is one transcription's: a batch file's, or a live session's,
and a live session closes after half a minute's silence, so `A` in the next
segment — or after a pause in this one — need not be the same person. Naming
across segments would be naming a guess. Within a live segment the names
inherit the limit the letters already have: `lettered` treats one stem's `A`
as one voice across the segment, and so does its name.

**On a recording's rename's terms** (`nameVoices`): a name everybody in the
channel reads, so refused to somebody outside a conversation in progress and in
a channel only its owner runs; an empty field clears a name back to the letter.
No record of who named it is kept, as none is of who renamed a recording.

**Where the names go.** `SegmentView.voices` on the rooms, and `lettered` /
`readable` take them, so the *Record*, *Share text*, the transcript export, the
published episode's VTT, the channel library's document and *Ask Claude* all
say the same. Naming stamps `segments.voices_named_at`, which the snapshot's
`filedAt` carries, so every *Record* reads the rooms again; and it owes a filed
segment's filing again, the old document deleted once the new one is filed — the
title stays drawn meanwhile. *Ask Claude* reading a live segment lettered
nothing until today; it letters now, as the *Record* does.

**A batch line's letter travels as `voice`**, beside a `displayName` that
still carries `(B)`: not `speaker`, which builds from before 2026-10-09 (the
floor is 189) draw a note from. The app puts the given name in place where it
gathers the lines, as it already letters live ones, so clearing a name needs
no refetch of the transcript. The route itself applies no names, so a build
before this one reads the letters, as it always has.

**Known limits, accepted.** A segment past `OWED_FOR_MS` (a week) is not filed
again, and its document keeps the old names; nor is one whose channel no
longer has a Pro member connected. Search results carry no letters and no
names, as before. Not on guests, who have no menu.

**No shim.** The route and `voices` are new; an older build never sends one and
ignores the other.
