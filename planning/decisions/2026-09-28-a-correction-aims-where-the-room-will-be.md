# A correction aims where the room will be

The follower judged a player against a wall clock and corrected it to a position
that clock had already left. A seek is not instant — 400 to 700ms on a phone, a
play from a pause 1.2 seconds — so a correction to *where the room is* lands
exactly that late, and the drift it was issued for is still there when it
arrives. **A player slower than `WATCH_DRIFT_MS` could therefore never arrive at
all**, and was seeked once per fuse for as long as the party lasted.

Predicted in the harness on 2026-09-27 and found on a phone the same night: four
of ten resumes at 1,304ms against a tolerance of 1,500, each seeked about half a
second after the picture started. What somebody sees is the wait and then a jump.

## The fix is a lead, and it is measured

`drive.ts` now keeps how long this player took to do the last thing it was told —
per kind, a seek and a play differing by a factor of two — and
`followInstructions` aims that far ahead of the wanted position. One correction
lands in step instead of ten landing behind.

| the player's own latency | before | after |
| --- | --- | --- |
| 1,500ms — inside the tolerance | in step at once, one command | unchanged |
| 1,600ms | **never in step**, 8 seeks in 20s | in step at 4.1s, **one seek** |
| 1,800ms | **never in step**, 9 seeks | in step at 4.3s, **one seek** |
| 2,500ms | **never in step**, 8 seeks | in step at 5.5s, **one seek** |

**It is learnt from the player obeying, not from it arriving**, and that is the
whole of why it works at 2,500ms. A player that far behind can never satisfy
`hasArrived` — its position is hopeless whatever it does — so a lead learnt from
arrivals could never be learnt for precisely the players that need it. What is
measured instead is narrower and always available: how long until the player
reached the state it was asked for, which is a fact about the player rather than
about where the room has got to.

**One measurement, no averaging.** The interesting case is a player whose latency
has just changed, and a mean is the slowest possible way to notice one. The first
correction after a cold start is led by the play's 1.2 seconds and overshoots by
about half of it — a player half a second *ahead* of the room rather than a second
behind it — and the next correction has the right number.

**Not a wider tolerance**, which was the other way to make the seeking stop. Every
device plays the film's own audio, so two screens in a room a second apart is
worse than one that jumps once and then agrees.

## The gentle knock, beside it

`WATCH_STALL_MS` is ten seconds because the instruction it releases is a seek, and
a seek discards a part-filled buffer. But the same reading covers a case it was
not written for — a player told to play that went to `buffering` and never came
out — and for that one, ten seconds is ten seconds of a still frame while the room
watches the film. Build 304 wedged one for 10.5 seconds and skipped thirteen
seconds of film when the rescue came.

So a player buffering **from a standstill** is told again after
`WATCH_COLD_NUDGE_MS`, and told the one thing that cannot cost it anything: `play`
again, with no seek beside it. Nothing is discarded, so none of the caution the
long window is built from applies. The long window is untouched and still the
backstop. `drive.ts` knows which case it is because it can see what the player was
doing when the buffering began; the rule cannot, so it is told.

This does not cure the wedge, it shortens it —
backlog/a-play-inside-the-pause-can-wedge-the-player.md is still open, and whether
the second `play` is enough to unstick a wedged embed is the thing the next run
finds out.

## What is still wrong in the log

`hasArrived` is asked in the `sending` branch against the target as it was when the
instruction went out, so a playing player eventually passes a position the room
wanted two seconds ago and the wait ends in a satisfied `watch playing after Nms`
whatever actually happened. Harmless now that the divergence it used to hide is
gone, and still a line that says the wrong thing. Comparing against the live target
was tried on 2026-09-27 and silences it; it is left alone here because this commit
is a fix to behaviour and that is a fix to a log, and the two want separate
readings.
