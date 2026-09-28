# A play inside the pause can wedge the player

Pressing Play while the pause before it is still landing leaves the player in
`buffering` and it does not come out. Seen twice out of two on build 304, against
none of the seventeen ordinary presses in the same two runs, so the rate is
suggestive rather than established — but one of the two is the worst single press
anybody has logged.

**The bad one, in full.** Pause pressed at 00:02:43.736; the player reported
`paused` at 00:02:44.165; **Play was pressed in that same millisecond**, 429ms after
the pause press. Three `PlayAndRecord` category changes followed in two seconds —
the session being fought over rather than moved — and the player entered
`buffering` at +2,172ms, which is already twice the ordinary 1,220. Then it sat
there. **For ten and a half seconds**, until `WATCH_STALL_MS` expired and the
follower issued the `seek+play` that is written for a stall with no end, which
restarted it at 111s against the 98s it had been paused at. The film played on the
other device in the room the whole time; on this one it showed nothing, and then
skipped thirteen seconds.

The other rapid press, 399ms after its pause, did not wedge but took 2,180ms
against a median of 1,271 — so both rapid presses were anomalous and neither was
ordinary.

**What it says about the machinery is good news.** The stall nudge is the only
reason that press ever recovered, and it is the rule added on 2026-09-20 for
exactly this — a buffering player with nothing on the far side of it. Without it
the picture would have stayed dark until somebody pressed something. It is also
ten seconds, which is a long time to look at a still frame while the room watches
the film.

**The mechanism is a guess and the cheap test is not.** A pause restores
`PlayAndRecord` and starts the engine (about 700ms, and it is ours — see
decisions/2026-09-28-the-film-waits-for-the-audio-session.md), and a Play landing
inside that window asks `WKWebView` to take a session that is mid-move. Whether the
resume request is then dropped, or the media element left in a state no command
reaches, is not knowable from these lines: what is missing is what the *page* was
doing, and the transitions only say what it reported.

Two things to try, in order. **Reproduce it deliberately** — ten presses of Play
issued as fast as possible after a pause, which is a minute and settles the rate.
Then, if it holds, **consider whether the transport should refuse a press it cannot
serve**, which is the question the whole of `drive.ts` § *urgent* is about and which
was answered *never make somebody wait for a fuse* on 2026-09-20. A refusal is not
obviously better than a wedge that recovers in ten seconds; a shorter stall window
for a player that has never started might be.
