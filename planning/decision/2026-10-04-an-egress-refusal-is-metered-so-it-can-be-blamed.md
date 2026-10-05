# An egress refusal is metered, so it can be blamed

The cap of "roughly ten simultaneous recorded participants" was arithmetic on
`track_cpu_cost` and had never been checked against anything. A load test was
proposed and turned down: run continuously on the one box, it would take
egress slots from real recordings and write fake rows into the usage tables
it was meant to inform. What was wanted instead was narrower — **when LiveKit
refuses a stem, to know what to blame.**

So every request for a stem now writes a row to `egress_starts`: the outcome
(`started`, `no-track`, `error`), how many stems were being asked for at that
moment with this one included, the box's load average and core count, and
LiveKit's error text with the room and identity cut out. `bin/usage egress`
reads it. Before this, a refusal reached the server log and nowhere else —
and for the starting cohort it silently ended the whole recording.

**What egress actually admits against**, read from `livekit/egress` v1.14.0
`pkg/stats/monitor.go` and `pkg/config/service.go` rather than assumed: a job
is accepted while `cores × max_cpu_utilization (default 0.8)` less what egress's
*own* jobs cost still covers it, each job charged the larger of its measured
CPU and its configured cost. On two cores at 0.15 that is 1.6 CPUs, ten stems
— which is where "roughly ten" came from. Two consequences shaped the table:

- **Nothing else on the box can cause a refusal.** An export's ffmpeg or the
  SFU does not enter egress's sum. So whole-box CPU utilisation was built and
  then removed in the same change: it was precise about a quantity that does
  not decide anything. The load average stays, as context.
- **A refusal is one of two kinds**, and the report labels them. Concurrency
  × 0.15 past the ceiling is the *stem count*; refused below it means egress
  measured its jobs above 0.15 — or it is not capacity at all, which the error
  text distinguishes.

**Not done, and the next step if a `below cap` refusal ever appears:** egress
logs its own `available`/`pending`/`used` with the refusal, but at debug level,
and `egress.yaml` runs at info. Raising it is a change on the box through
`bin/provision-livekit`, not in this repository's code.

**A comment found wrong on the way:** `bin/provision-livekit` says the default
`track_cpu_cost` of 1 would allow two stems. In v1.14.0 the default is 0.5,
which would allow three. The tuning to 0.15 stands either way.
