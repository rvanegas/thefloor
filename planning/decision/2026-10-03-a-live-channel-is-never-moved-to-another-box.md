# A live channel is never moved to another box

**Moving an occupied channel from one server box to another — its people,
its floor claim, a recording in flight, handed from A to B without anybody
leaving — is not supported, and will not be built.** This replaces the backlog
entry *A migrated room must carry durations, not stamps*, which was a caution
for whoever built it. Nobody will.

## What it commits us to

**A live channel has one owner for its whole occupancy, and that owner runs
on one clock.** That is what lets every small-margin rule here stay
clock-safe without anyone having to think about it. `FLOOR_CLAIM_MS` (sixty
seconds), `DISCONNECT_GRACE_MS` and `SELF_UNMUTE_GRACE_MS` (a minute each) and
`HEARTBEAT_TIMEOUT_MS` (five) all subtract one of the owner's stamps from the
owner's `now()`, so whatever error that clock has cancels out. Moving a channel
mid-conversation is the one event that would put `claimedAt` from A against
`now()` on B inside a sixty-second margin. With nothing stopping the sixty
seconds from becoming fifty, that comparison would rest only on how well two
boxes happen to be synced.

**What stays allowed is everything that is not a live handover:**

- **Restarting the owner on the same box**, including the handover file that
  *Carry a live channel across a restart* designs as stage 1. One box, one
  clock, so absolute stamps in that file are fine.
- **Two processes on one box**, which is that task's stage 2. It drains a
  process instead of handing anything over, and both processes share the clock.
- **Re-hosting the server**, MIGRATION.md's kind of move. A database moved to
  a new box arrives with no conversation in it: `revive()` in
  `server/src/channels.ts` resets the floor, `selfUnmutedAt`,
  `disconnectedAt` and the recording, and brings watch and playback back
  paused at a position (`positionMs`, `startedAt: null`). That is a duration,
  not a stamp, so nothing compares two clocks inside a small margin. Keep
  `revive()` that way: it is what makes this kind of move safe.
- **Moving the LiveKit side.** The stamps that matter are taken by the
  `thefloor` process that owns the channel, not by the media server. A room
  that changes LiveKit node under the same owner is still on one clock.

Phones aren't part of this. They re-learn the server's offset from every
`pong`, so every two seconds, and follow whichever server they are talking to.
That keeps `WATCH_DRIFT_MS`'s check on the phone safe without any of this.

## Why commit rather than leave the caution in the backlog

The backlog entry asked nothing to be done today. It asked a future builder to
hand over remaining durations rather than absolute stamps, because that is
cheap to do when the code is first written and expensive to retrofit. **That
is a constraint on a design nobody has proposed, and the one design on the
table rejects it**: stage 2 is built specifically so that no live-state format
crosses between processes, since that format would be an internal version
boundary between old code and new code. A caution about building something
that has already been ruled out only adds reading. Recording the refusal
takes the question off the table.

**If this is ever reopened**, the backlog entry's rule is the place to start:
hand over remaining durations rather than absolute stamps (forty-seven seconds
left on the claim, not `claimedAt`) and let the receiving box re-anchor
against its own clock. The recording state's `accumulatedMs` plus
`segmentStartedAt` already has that shape. That entry's argument for why no
monotonic clock is needed is in git history, as of 2026-09-15.
