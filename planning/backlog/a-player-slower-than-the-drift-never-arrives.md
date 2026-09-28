# A player slower than the drift never arrives

`hasArrived` compares a player's position against `watchPositionMs`, which is a
wall clock that has been running the whole time the player was obeying. So when
a player finally starts it is behind by **exactly its own latency**, and the
tolerance it is judged against is `WATCH_DRIFT_MS`. A player quicker than 1,500ms
is in step the instant it starts. A player slower than that is adrift the instant
it starts — and so is every correction sent to it, which is stale by the same
margin when it lands. There is no convergence on the far side.

What it looks like is a picture that plays a second or two, jumps, plays a second
or two, jumps, for as long as the party lasts, with a seek going out once per
`WATCH_OBEDIENCE_MS`. Measured in `transport.test.tsx` §  *how long a press takes,
and where it goes*: a lag of 1,500ms settles at once with a single command, and a
lag of 1,600ms never settles at all and had issued eight seeks by twenty seconds.

**Two things make it hard to see, and both are in the log.** A player just over
the cliff is *reported as arriving*, repeatedly — `hasArrived` is asked against
`state.want`, the target as it was when the instruction went out, and a playing
player always eventually passes a position the room wanted two seconds ago. A
player well over it goes silent instead: nothing satisfies the check, the fuse
abandons the wait, and no line is written. So the same instrument lies in one
band and says nothing in the next, which is most of why three weeks of readings
could not be reconciled.

Comparing against the *live* target was tried in the harness on 2026-09-27. It
silences the false arrivals and does not cure the divergence — the player is
still slower than the tolerance — so it is a fix to the log and not to this.

**It is reached on a phone, and by every resume.** Measured the same evening on
build 304: ten resumes of a paused party, at 1,304ms from press to picture, and
**four of the ten were seeked within four seconds** — a jump about half a second
after the picture started. None of the eight cold starts was, at 705ms. So the
boundary predicted from the harness that afternoon is where the application
actually lives, and which side of it a press falls on is decided by the audio
session rather than by anything anybody chose.
decisions/2026-09-28-the-film-waits-for-the-audio-session.md is the run.

A cure has to give the follower some notion that its player is slow: seek *ahead*
of the wanted position by the latency last observed, or widen the tolerance for a
player that has demonstrated it cannot meet it. Both are guesses until there is a
reading from a phone.
