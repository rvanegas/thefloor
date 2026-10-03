# The chime queue says what it did with each chime

The *Chimes together* section shipped earlier today and was reported silent the
same afternoon. Nothing on the screen could distinguish the four things that
make a combination inaudible, and they are not the same fault:

- the peak row is set somewhere the room cannot hear;
- the binary has no `chime` at all, so nothing on the screen would sound;
- the speaker was still busy and the sound is coming a beat later;
- the queue threw the row away, `CHIME_STALE_MS` behind the present.

The last is the one the section invites. Auditioning means tapping rows one
after another, a three-kind row occupies the speaker for the better part of a
second, and a tap into a queue that is already more than a second deep is
**discarded entirely** — not crowded, not late, gone. The row's label still
said `· last`, so the screen reported a play that never happened, and the more
impatiently somebody taps the more completely silent the section becomes.

So `chime()` in `chime.ts` now returns `played`, `refused`, `queued` or
`dropped`, and `AudioLabView` prints one per kind beside the peak and a
reminder that the path and lead-in rows do not reach this section. The hooks
ignore the return — this exists for the ear that is trying to judge the gap and
needs to know whether there was one.

`chime.web.ts` carries the same type so the halves keep one signature, and
never answers `dropped`: Web Audio takes the start time as an argument and
cannot be late, where the native half schedules against `Date.now()` and
discards what has fallen behind.
