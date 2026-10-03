# A seek to where the player already is

The lead added this morning — a correction aimed at where the room *will* be
rather than where it is — could issue a seek to the position the player already
held. `adrift` is measured against the **un-led** want at `core/watch.ts`, and
the instruction is aimed at the **led** target a hundred lines below. So a player
*ahead* of the room by roughly its own latency failed the first test and was sent
to the place it was already at.

That is the seek storm the long comment in `followInstructions` exists to
prevent, re-entered through a parameter added four days after it was written. The
seek does not merely fail to help: it throws away a part-filled buffer, which is
the whole reason a buffering player is told nothing at all.

**The coincidence is structural rather than bad luck.** `watchPause` banks what
the clock said and the player runs on for its own latency, so every resume begins
with the player ahead by very nearly the figure the lead leads by. The two
numbers are the same number for the same reason, which is why this reproduces
rather than appearing now and then.

## Measured, at the latency the harness already models

A 2,300ms player, resumed from a pause, told:

| | instructions | end state |
| --- | --- | --- |
| before | `seek:6700 play seek:7400 play play seek:12200` | **`buffering` at 7.6s** under a room at 9.7s |
| after | `play` | `playing`, 1.7s ahead |

Six instructions and a picture that never settled, against one and a picture
that does. The `seek:12200` is the tell: two and a half seconds past where the
room was, at a player that had not reached the room yet.

## The rule

A seek is declined when its target is already within `WATCH_DRIFT_MS` of where
the player is. A player genuinely *behind* is untouched — its led target is
further from it than the tolerance, so the correction goes out exactly as it did,
and the table in
2026-09-28-a-correction-aims-where-the-room-will-be.md is unaffected.

## What it is not

**It is not a repair for the offset, and the offset does not close by itself.**
Players run at 1.0×, so a gap acquired at the start of a run is constant for the
length of the film: what is left is a player sitting 1.7s ahead of the room,
inside `WATCH_REPORT_SLACK_MS`, for as long as the film lasts. The cause is
backlog/a-pause-banks-a-position-the-player-has-not-reached.md — the pause
banking a position the player has not reached — and the repair for that is a
stop-side report, the mirror of `WATCH_STARTED`. This only stops the client
making it worse.

The first draft of the comment in the code claimed the room would catch up. It
will not, and the test written to demonstrate the fix is what caught the claim.
The number is now asserted in `transport.test.tsx` § *a resume* rather than
described, so a stop-side report can be seen to close it.
