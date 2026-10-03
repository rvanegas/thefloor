# The press is apportioned in the harness

Measured 2026-09-27, and it corrects one sentence of
2026-09-27-the-teardown-was-never-on-the-critical-path.md — the one that says
`watch playing after Nms` is *the round trip plus the `WKWebView` starting
playback*. **The round trip is not in that number.** `drive.ts` starts the clock
at the instruction, which is issued after the snapshot has come back, and says so
in its own comment. So press-to-picture is the round trip *plus* the reported
figure, and the figure itself is the embed's own time plus up to a
`FOLLOW_TICK_MS` of this application noticing.

**Nothing new was measured on a phone.** What was new is that
`transport.test.tsx` already contained a simulator with both latencies in it —
a laggy player and a round trip — and had never been asked the one question the
whole argument turns on: what does this application do as a function of how slow
its player is. Four assertions now hold it, under § *how long a press takes, and
where it goes*, with the player's latency a parameter instead of a constant.

| player's own latency | picture moves | in step | the log says |
| --- | --- | --- | --- |
| 200ms | 500ms | at once | `after 200ms` |
| 600ms | 900ms | at once | `after 700ms` |
| 1,000ms | 1,300ms | at once | `after 1200ms` |
| 1,400ms | 1,700ms | at once | `after 1700ms` |
| 1,500ms | 1,800ms | at once | `after 1700ms` |
| **1,600ms** | 1,900ms | **never** | `after 1700ms`, then `2000ms` seven more times |
| 1,800ms | 2,100ms | never | `after 2000ms`, repeatedly |
| 2,500ms | 2,800ms | never | nothing at all |

A 300ms round trip throughout; *picture moves* is measured from the press.

## What it settles

**The follower costs the picture nothing.** One `play` leaves on the snapshot and
the picture moves at the round trip plus the embed's own time, every time. The
tick's 0–500ms window is in the *knowing* — so closing it would sharpen the log
and would not shorten the wait by a millisecond. This was worth settling because
the opposite was about to be believed.

**The reported figure overstates the embed by up to a tick and omits the round
trip.** Both directions at once, which is why it cannot be read as either.

**There is a cliff at `WATCH_DRIFT_MS` exactly**, and build 303's presses
straddle it. A player slower than the tolerance it is judged against is adrift
the instant it starts and so is every correction sent to it;
decision/2026-09-28-a-correction-aims-where-the-room-will-be.md is that entry, with the
two ways the log hides it.

## What is instrumented, and what it is for

`WatchPlayer.tsx` now records every state its player passes through, stamped, one
line per transition. That is the seam the log never had: between *told to play*
and *arrived* there was a second and a half with nothing in it, so the figure
could be reported and never apportioned. A press that reads `paused → buffering →
playing` names its own wait; a press that reads `paused → playing` was never
buffering, which is the answer three weeks of audio work needed and did not have.

Transitions only, because the page reports four times a second and on every state
change — writing every reading down would bury the audio session's own lines,
which are what these have to be read against.

**The web player is deliberately not instrumented.** The subject is the
`WKWebView`, and the diagnostic log has no reader on the web.

## What generalises

The harness for this existed, was written for a neighbouring question, and was
never asked this one. Three weeks of stopwatches on components, and the thing
that apportioned the delay in an afternoon was a simulator already in the tree
with a constant where the interesting variable belonged.
