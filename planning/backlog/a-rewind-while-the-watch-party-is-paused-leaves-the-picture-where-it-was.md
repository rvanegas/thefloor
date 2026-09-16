# A rewind while the watch party is paused leaves the picture where it was

`follow()` corrects a paused transport only in the branch that has just paused a
playing player, so a `WATCH_SEEK` arriving while everything is already at rest
moves the readout and not the video: the footer says one time, the frame shows
another, and it stays that way until somebody presses Play, at which point the
correction runs and it catches up.

The fix is to correct on a paused transport whatever the player was doing, and
the ordering is the care it needs — correcting before pausing sends the player
somewhere it is about to be stopped at.

Noted 2026-08-29 while fixing the seek storm two lines away, decisions/ § *A
rewind that ate itself*, and kept separate from it because a fix that is not what
was reported is a fix nobody has watched. Re-read against the tree on 2026-09-15
and still holds. `server/src/watch-page.ts`.
