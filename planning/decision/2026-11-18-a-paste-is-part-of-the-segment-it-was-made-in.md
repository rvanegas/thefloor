# A paste is part of the segment it was made in

Decided 2026-11-18, Rodrigo's, as the step before
`choose-what-of-the-record-claude-reads.md`: **every paste is part of a
segment, at an offset that places it; one made while no segment is being
transcribed is a segment of its own, holding only it.** Until then each paste
was an instant segment of its own (`2026-10-15-a-paste-is-a-segment-of-the-record.md`),
and the readers placed it three ways:

- **The app** drew it inside the first drawn segment whose span held it,
  audio-only ones included.
- **The channel library** filed it with every segment whose span held it,
  both ends inclusive, so one made at a Pause/Resume seam went into two
  documents.
- **Claude's *Record*** read it after the whole of the segment it was made
  in, since `withPastes` orders by start, and in full even when that segment
  went as one line naming its document — every reply of Claude's included.

## What changed

- **`pastes.segment_id`**, written with the paste by `pasteHomeSql`: the
  segment with `text` set whose span holds the moment, and at a seam the one
  beginning there. Null for a moment nothing was kept or audio alone was —
  "being transcribed", as asked. A migration placed every existing paste by
  the same rule once; one whose segment's text had since been deleted finds
  none and stands alone.
- **On the wire it stays an instant**, carrying `segmentId` and `offsetMs`
  where it has a segment listed in the same room. Additive, so **no shim**:
  builds before this one ignore the fields and place it by its moment, as
  they did. Considered and not built: nesting pastes inside `SegmentView`,
  which is the cleaner shape and would have needed both shapes sent and a
  SHIMS.md entry until the floor passed every build that reads the old one.
- **The offset is not stored.** It is `pasted_at` less the segment's start,
  and a second column saying the same could disagree with the first; it is
  computed where the wire carries it.
- **The app places a paste by `segmentId`**, so a paste made during audio
  alone is now an item of its own rather than drawn inside that segment —
  the one change anybody sees.
- **The library files a segment's pastes by id**, ending the seam's double.
- **Claude reads a paste inside its segment, after the lines said by its
  moment** (`withTheirPastes`, `renderSegment`), as the log draws it, and a
  filed segment given as one line takes its pastes with it.

Not decided, and left to the choosing task: whether a lone paste's segment is
filed. It is short, and a line naming a document would be about as long.
