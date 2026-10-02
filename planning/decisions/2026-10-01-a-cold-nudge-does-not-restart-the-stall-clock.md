# A cold nudge does not restart the stall clock

Found on 2026-10-01 in the build 327 run against
`backlog/a-play-inside-the-pause-can-wedge-the-player.md`.

`WATCH_COLD_NUDGE_MS` (2026-09-28) tells a player that went to `buffering` from a
standstill to `play` again after four seconds. `drive.ts` restarted the stall
clock whenever it said anything to a buffering player, and that included the
nudge. So the clock went back to zero every four seconds and never reached
`WATCH_STALL_MS`, and the `seek+play` backstop never went out. In the run, a
wedged player got `play` five times in 23 seconds, did not move, and came out
only when somebody pressed Pause. Before the nudge, the same wedge cleared in ten
seconds.

**The nudge now has its own clock**: `knocked` in `drive.ts`, which reaches
`followInstructions` as `quietForMs` and spaces the nudges. The nudge is marked
`{ do: 'play', knock: true }`, so that `drive.ts` can leave the stall clock
running under it. Any other instruction restarts the stall clock as before.

The run also answered the question the nudge was added under: **a second `play`
does not unstick a wedged embed.** The nudge is kept because it costs nothing and
may help a player that was merely slow, but the backstop is what rescues a wedge.
