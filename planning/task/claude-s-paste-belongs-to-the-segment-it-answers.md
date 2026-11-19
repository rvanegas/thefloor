# Claude's paste belongs to the segment it answers

Decided at the prompt, 2026-11-18: **a paste *Ask Claude* posts in response to
text in a segment becomes part of that segment, and is deleted with it.** A
paste is a segment of its own today and never deleted (GLOSSARY § *Paste*;
`deleteSegmentText` skips them), which leaves Claude's commentary on a
conversation standing after the conversation is gone.

Open before building: which segment a reply belongs to when it is asked for
after the segment ended, or reads several (it reads the whole *Record*) — the
segment running when it was asked, else the last one with text, is the
obvious first answer. A person's paste is unchanged by this, and pastes
outside any segment are `a-paste-outside-a-segment-can-be-deleted.md`.

The glossary's *Paste* and *Ask Claude* change in the same commit as the code.
`one-delete-for-a-segment-with-what-goes-checked.md` takes these pastes once
this ships.
