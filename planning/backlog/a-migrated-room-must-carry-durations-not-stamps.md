# A migrated room must carry durations, not stamps

Every rule uses a caller-supplied `now`, which is the server's wall clock. This
entry used to say that a clock change on the box would skew live countdowns and
that a monotonic source would be sounder. It would not be, and the concern does
not survive the argument against it.

**Timing here divides, and neither half is exposed.** Where a margin is small —
`FLOOR_CLAIM_MS` at sixty seconds, `HEARTBEAT_TIMEOUT_MS` at five,
`WATCH_DRIFT_MS` at 1.5 — every party to the comparison is on one server, so
both stamps come from one clock and whatever that clock's error is cancels in
the subtraction. Where a second clock is involved — `apns-expiration` in
`push.ts`, evaluated against Apple's, or SigV4's fifteen-minute skew window —
the margin is five minutes, or fifteen, or thirty days, and an error that would
matter is one no synced box reaches. A crystal drifts a few seconds a day at
50 ppm and a guest on `kvm-clock` far less; accumulating the five minutes that
would break a presence push takes about seventy-five days without NTP.

The one event that defeats the division is a **step** — a clock corrected by
jumping rather than slewing, which leaves one server's before-stamps and
after-stamps incomparable. A step needs an accumulated error to correct, so it
needs NTP absent for days, or a discontinuity: a snapshot restored hours later,
a long stop/start. A live migration's blackout is sub-second and `kvm-clock`
resyncs from the host, so that is not one of them. The rest are ours to
schedule, and the standing intention is to wind a server down by waiting for
its LiveKit rooms to end before any maintenance.

**Which is where the outstanding work is.** Draining preserves the whole
argument: the unit of clock affinity is the room, and a channel that lives
entirely on one server never compares two clocks. Sharding keeps that.
**Migrating a live room from one LiveKit server to another does not** — a floor
claim stamped `claimedAt` by A and evaluated against `now()` on B is two clocks
inside a sixty-second margin, the first small-margin comparison here with no
structural guarantee behind it, only the sync quality between two boxes.

So if room migration is ever built, hand over **remaining durations rather than
absolute stamps** — forty-seven seconds left on the claim, not `claimedAt` — and
let the receiving server re-anchor against its own clock. That makes the
handover clock-independent by construction and costs nothing at the moment the
migration code is written. It is expensive to retrofit, which is the only reason
this entry still exists.

Argued 2026-09-15, which is also when the entry stopped asking for a monotonic
clock.
