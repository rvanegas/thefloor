# A pause banks a position the player has not reached

`watchPause` banks what the room's clock says at the moment the press arrives.
The player stops **its own latency later** — 350ms with the microphone held,
1,100ms on the shipped path, measured on build 305 — so it comes to rest that
much further into the film than the number the room kept. Every pause is a
little wrong, and always in the same direction.

**It is the mirror of the bug `WATCH_STARTUP_GRACE_MS` fixes**, at the other end
of the same run, and it went unnoticed for as long as it did because the two used
to cancel: the clock ran early at the press and banked early at the pause, and the
errors partly met in the middle. Fixing the start exposed the stop.

**On the hardware it was measured on, nothing about this is reachable.** A pause
error of 350 to 1,100ms is inside `WATCH_DRIFT_MS`, and the play-side report
repairs it anyway — a player reporting where it really is pulls the room's clock
to agree, which is why `WATCH_REPORT_SLACK_MS` is five seconds rather than the
drift tolerance.

**Where it bites is a player slower than the grace.** Its report arrives after
the deadline has already started the clock, so the repair never happens; the
banked position is then wrong by more than the tolerance; and the resume seeks
the player *backwards* to a position it has already passed, which re-buffers,
which puts it further out. In the harness at a latency of 2,300ms: nine
instructions and a picture that never settles. There is a test that pins that
limit rather than hiding it — `transport.test.tsx` § *a resume*.

**The seeking half of that is fixed and the cause is not**, 2026-09-28. The
instructions were six rather than nine when measured —
`seek:6700 play seek:7400 play play seek:12200`, ending `buffering` at 7.6s under
a room at 9.7s — and they came from the *lead* rather than from this entry: a
player ahead by its own latency failed `adrift`, which is judged against the
un-led want, and the led target was then the position it already held.
`followInstructions` declines that seek now, so the same case is one instruction
and a settled picture. See
decisions/2026-09-28-a-seek-to-where-the-player-already-is.md.

**What is left is this entry, undisturbed**, and it is now a number rather than a
symptom: the player comes to rest 1.7s ahead of the room and stays there for the
length of the film, players running at 1.0× so the gap never closes. The test
asserts that figure, bounded below by `WATCH_DRIFT_MS` and above by
`WATCH_REPORT_SLACK_MS`, so a stop-side report can be seen to close it. The
repair is unchanged and so is the open question — what stops a late or repeated
report ratcheting the position forward.

**The repair is the mirror of the one that shipped.** A player reports where it
stopped, the way it now reports where it started, and the banked position moves
forward to meet it — bounded by the same slack, and monotone so that a stale
report cannot drag a paused film backwards. What has to be decided is what stops
a late or repeated report from ratcheting the position forward: the play side
gets that for free from the grace window, which the pause has no equivalent of,
so it needs either a window of its own or a rule that only the first report after
a pause counts.

Worth doing when a real player is seen to be slower than two seconds, or when the
pause's own second is attacked — see
decisions/2026-09-28-the-film-waits-for-the-audio-session.md, where 700ms of the
pause is this application retaking the microphone and is the half that *is* ours.
