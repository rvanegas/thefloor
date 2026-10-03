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

## Second pass: the start is positioned rather than corrected

Measured on a phone the same night, build 305, ten resumes with the lead in.
**The jumping did not stop, and the reason is that the lead fixed the wrong half
of it.** No press was corrected more than once — which is what the lead was for,
and it held — but five of ten were still corrected *once*, alternating, and the
other five simply ran a second behind the room for the rest of the film. The
alternation is the tell: a corrected resume ends exactly in step, which leaves
the next one just inside the tolerance, which leaves the one after just outside.
A coin landing on the 1,500ms boundary.

Neither half is acceptable, and the second is worse than it looks: every device
plays the film's own audio, so a screen that is quietly a second behind is two
phones in a room disagreeing audibly, for the length of the film.

**So a player about to be started is positioned with the play.** The seek was
conditional on the drift having already happened; it is now also issued for a
player being started from a pause, led by what that player is known to cost.

| the player's cost | picture at | drift when it started | corrections after the picture |
| --- | --- | --- | --- |
| 600ms | 900ms | −100ms | **none** |
| 1,150ms — the phone's | 1,450ms | −50ms | **none** |
| 1,300ms | 1,600ms | −400ms | **none** |

The picture arrives at the same moment it always did — trip plus the player's own
cost, and nothing here touches that — but it arrives **in step**, and nothing is
said to it afterwards. The second of film that used to be skipped visibly, half a
second in, is skipped before there is a picture to see it in.

**Played first, then positioned**, which is the opposite of the correction and is
not a style choice: `seekTo` leaves a paused player paused, so a seek issued ahead
of the play leaves the play to undo the pause — and a play landing while the seek
is in flight can be dropped altogether, which is a party whose picture never
starts. The harness models that rule and caught it.

**Not for a player that has never started.** A fresh party begins at zero with a
clock that has barely moved, the cold start being 705ms, so leading it would skip
the opening of the film to correct a drift nobody would have seen.

**And then it was done, the same night**, which retires the section above rather
than completing it: the room's clock no longer runs while players start, so a
starting player is in step by construction and there is nothing to lead. The seek
at the start lasted about an hour. See
2026-09-28-the-rooms-clock-starts-when-a-player-does.md, where *whose player
defines the start* is answered — the first to report, with a two-second deadline
behind it.

**What survives from this entry is the lead on a mid-film correction**, where a
player really has fallen behind and a seek to where the room is now would still
land its own latency late.

## What is still wrong in the log

`hasArrived` is asked in the `sending` branch against the target as it was when the
instruction went out, so a playing player eventually passes a position the room
wanted two seconds ago and the wait ends in a satisfied `watch playing after Nms`
whatever actually happened. Harmless now that the divergence it used to hide is
gone, and still a line that says the wrong thing.

**And the positions in it were rounded to whole seconds**, which is why build
305's alternating corrections could not be explained from the log at all: a pair
of positions rounded to seconds leaves a drift anywhere between 100ms and 1.9s,
and the question was whether it had passed 1,500. They now carry ten
milliseconds. Comparing against the live target
was tried on 2026-09-27 and silences it; it is left alone here because this commit
is a fix to behaviour and that is a fix to a log, and the two want separate
readings.
