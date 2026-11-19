# A paste is part of the segment it was made in

Rodrigo, 2026-11-18, as the step before
`choose-what-of-the-record-claude-reads.md`. **Asked: every paste is part of a
segment, at a time offset that places it; a paste made while no segment is
being transcribed is a segment of its own, holding only it.**

**Today a paste is a segment in name only.** It is a row in `pastes`, and
`Rooms.forChannel` lists each one among a room's segments as an instant of
its own (`withPastes`, `server/src/rooms.ts`), which is what the app draws
from (`segment.paste`, `RecordTab.tsx`). Two readers then disagree about
where it belongs:

- **The channel library files it with its segment**: `channelLibraries.ts`
  pulls every paste inside a transcript's span into that document.
- **`composeLibraryRecord` sends it on its own, in full**, since an instant
  segment is never filed. A paste inside a segment that went as one line
  naming its document is sent twice — once whole, once inside the document
  Claude may read — which is the redundancy the choosing task means to
  remove. Claude's own replies are pastes, so this covers every one of them.

And choosing by segment needs the paste inside the unit chosen: leaving out a
stretch of talk has to leave out what was pasted into it, Claude's reply to
it included.

**What changes:**

- **A paste belongs to the segment being transcribed when it is made**: the
  segment's id and its offset from the segment's `started_at` are kept on it.
  "Transcribed" is the segment's `text`; one keeping audio alone does not
  take it, as asked, so a paste during an audio-only stretch stands alone.
- **Otherwise it is a segment of its own**: a `segments` row of one instant,
  no recording, holding that paste and nothing else.
- **The log should look the same.** The 2026-10-15 decision already draws a
  paste among its segment's lines at its moment; what moves is the data under
  it, and a lone paste's line stays a line.
- **Existing pastes are migrated by a script**, each placed in the text
  segment whose span holds it, or given a segment of its own.

**Open:**

- **Whether a lone paste's segment is filed** in the channel library, so it
  too can go as a line. Probably not: it is short, and a line naming a
  document would be about as long.
- **A paste at a segment's boundary**, made in the instant a Pause ends one
  segment and Resume begins the next: `withPastes` puts one at a segment's
  start after it, which is the rule to keep. Filing matches by span with both
  ends inclusive, so today such a paste goes into both documents; a segment
  id on the paste ends that.

**This is a wire change, so two steps** (`CLIENTS.md`): installed builds read
each paste as its own entry with `paste` on it. Step one sends both shapes,
the new one alongside, with an entry in SHIMS.md for the old; step two drops
the old once the floor passes the last build that reads it. Read the
2026-10-15 decision, `a-paste-is-a-segment-of-the-record.md`, before
starting, and change GLOSSARY *Paste* and *Segment* in the same commit, since
both say a paste is a segment of its own.
