# A segment has one title wherever it is shown

Erta, 2026-11-16, and Rodrigo had noticed it too. **Renaming a recording
changes the published episode's title and nothing in the *Record*.** They are
two different things today: the rename sets `recordings.name`, which only the
podcast reads (`publicTitle` in `server/src/app.ts`); the line under a
segment's hours in the *Record* is `segments.filed_title`, the title noesis
gave the document it filed. Erta reads that line as the segment's title and
uses it to keep track, in Erta's own words, of what a recording was for.

Rodrigo: they should probably be the same, and there are three places a title
does a job — the *Record*, the episode, and the noesis document's name. At the
least, both should be shown on the *Record* line so that a rename is seen to
happen. noesis's only requirement is that a slug be unique, and episode titles
want to be unique anyway. **Open**: one title, or the two kept and both
drawn; whether a rename refiles the document in the channel library under the
new name (the filename is the title's slug, `a-transcript-s-file-name-carries-its-time-of-day.md`
at noesis); and a title must not begin with a numeral, noesis's constraint.
Read GLOSSARY *Segment* and *Recording*, and STYLE.md before drawing it.
