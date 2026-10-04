# No migration for the duration of a room

**A channel is not moved between servers while its room lasts, and that will
not be built.** A *room* here is LiveKit's: the one a channel's audio flows
through, named after the channel. It exists from the first person joining until
the last one leaves, so it lasts exactly one occupancy. Handing an occupied
channel from one server to another, with its people, its floor claim and a
recording in flight, without anybody leaving, is what this rules out.

**Between rooms, channels will move freely, and that takes no work of its
own.** Before there is more than one server, a database shared by the cluster
will replace today's SQLite. An unoccupied channel then has no state outside
that database, so any server can pick it up for the next room. Migration
exists only at the boundary between rooms, where there is nothing live to
carry.

This replaces the backlog entry *A migrated room must carry durations, not
stamps*, which cautioned whoever built live migration. Nobody will.

## What it commits us to

**A room has one owner for its whole life, and that owner runs on one
clock.** That is what lets every small-margin rule here stay clock-safe
without anyone having to think about it. `FLOOR_CLAIM_MS` (sixty seconds),
`DISCONNECT_GRACE_MS` and `SELF_UNMUTE_GRACE_MS` (a minute each) and
`HEARTBEAT_TIMEOUT_MS` (five) all subtract one of the owner's stamps from the
owner's `now()`, so whatever error that clock has cancels out. Moving a channel
mid-room is the one event that would put `claimedAt` from server A against
`now()` on B inside a sixty-second margin. With nothing stopping the sixty
seconds from becoming fifty, that comparison would rest only on how well two
boxes happen to be synced.

**What stays allowed is everything that is not a handover during a room:**

- **Restarting the owner on the same box**, including the handover file that
  *Carry a live channel across a restart* designs as stage 1. One box, one
  clock, so absolute stamps in that file are fine.
- **Two processes on one box**, which is that task's stage 2. It drains a
  process instead of handing anything over, and both processes share the clock.
- **Re-hosting the server**, MIGRATION.md's kind of move. **It is a stop and a
  start, not a handover, and it ends every room in progress**: connections
  drop, the floor and any recording are lost exactly as on a deploy (the
  recording is marked failed), and the audio stops too, since LiveKit runs on
  the same box. It is safe only in the sense this decision cares about: no
  short timer comes to depend on two clocks. `revive()` in
  `server/src/channels.ts` resets the floor, `selfUnmutedAt`,
  `disconnectedAt`, the present list and the recording, and brings watch and
  playback back paused at `positionMs` with `startedAt: null`. That is an
  amount, not a timestamp, and means the same on any clock. The stamps it does
  carry have long windows: `lastPresentAt` (rounded to the minute), invite
  expiries, `createdAt`/`endedAt`, and retention windows of seven to thirty
  days. Keep `revive()` that way: it is what makes this kind of move safe.
- **LiveKit on a different box from the server.** The server reads no
  timestamps from LiveKit, and every stamp on a channel is the server's own
  `now()`. The only thing that crosses the two clocks is the join token,
  which LiveKit checks against its own clock. The token lasts an hour
  (`tokenTtlSeconds` in `server/src/media.ts`), so the boxes would have to
  disagree by minutes before anyone noticed.

Phones aren't part of this. They re-learn the server's offset from every
`pong`, so every two seconds, and follow whichever server they are talking to.
That keeps `WATCH_DRIFT_MS`'s check on the phone safe without any of this.

## Why commit rather than leave the caution in the backlog

The backlog entry asked nothing to be done today. It asked a future builder to
hand over remaining durations rather than absolute stamps, because that is
cheap to do when the code is first written and expensive to retrofit. **That
is a constraint on a design nobody needs**: once the database is shared,
moving a channel between rooms is free, and moving one during a room buys
only the chance to avoid waiting for that room to end. A caution about building
something that has been ruled out only adds reading. Recording the refusal
takes the question off the table.

**If this is ever reopened**, the backlog entry's rule is the place to start:
hand over remaining durations rather than absolute stamps (forty-seven seconds
left on the claim, not `claimedAt`) and let the receiving server re-anchor
against its own clock. The recording state's `accumulatedMs` plus
`segmentStartedAt` already has that shape. That entry's argument for why no
monotonic clock is needed is in git history, as of 2026-09-15.
