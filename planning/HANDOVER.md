# Carrying a live channel across a restart

A design for work not yet done, specified 2026-08-18. Nothing here is built —
when it is, what survives moves to decisions/DECISIONS.md and this file goes.

Two stages that are worth having separately. **Stage 1 hands a conversation
from a dying process to its successor through a file on disk.** **Stage 2 runs
two servers and drains one before restarting it**, so that in the ordinary case
there is nothing to hand over. Stage 1 is independently valuable and is also
what makes stage 2's bad case lossless, which is why it goes first.

---

## What a restart costs today

`bin/deploy` restarts the `thefloor` unit. AGENTS.md says a deploy costs
presence, not channels, and that is true — `restore()` revives every unended
channel from its durable blob. What it leaves out is that the *conversation*
does not survive, by design: `durableOf` (`server/src/channels.ts`) omits the
floor, playback, egress handles and `selfMuted`, on the stated reasoning that
those are facts about the conversation rather than about the channel.

| | |
| --- | --- |
| Live audio | **Unaffected.** The app's LiveKit `Room` depends only on `[mediaRoom, token]` (`app/src/audio/useSessionAudio.ts`) and is independent of the server socket. The server only *mints* the join token, so a conversation in progress keeps flowing. |
| The websocket | Drops; reconnects at 500ms→10s backoff, forever (`app/src/api/socket.ts`), re-sending `watch.home`, `watch.channel` and `ENTER` on open. |
| Visible to the user | Usually nothing. `app/src/ui/useOfflineNotice.ts` hides the banner for 2.5s, and `bin/deploy` runs `npm install` *before* the restart, so the outage is process boot. |
| Presence | Held for `DISCONNECT_GRACE_MS`, a minute. |
| The floor | **Lost.** The claim is released and must be re-made. |
| Playback | **Lost.** It points at a temp file in `tmpdir()` that the dead process owned. |
| A recording in flight | **Broken, visibly.** `restore()` files it with `failure = 'The server restarted while this was recording.'` and truncates it to the last checkpoint. |

**The recording is the sharpest loss and the reason to do anything at all.** It
is not a degradation somebody might notice; it is a truncated artefact carrying
a failure message, produced by any deploy that lands during a run. The floor
and playback are recoverable by the people in the room within seconds. A
recording is not recoverable at all.

---

## Stage 1: the handover blob

On `SIGTERM`, write the volatile state to a file. On boot, consume it if it is
fresh, and delete it.

The insight is that **transferring state is easier than persisting it**. The
things a restart drops are dropped precisely because they serialise badly — a
playback position means nothing without the file it indexes, an egress handle
is a live object, and a floor claim an hour stale is a trap rather than a fact.
`durableOf` says as much about `selfMuted`: "restoring a mute somebody set and
forgot is a trap, so everyone comes back audible." That objection is real
against *persistence* and evaporates against a *handover*, because there is no
later — the gap is one process boot, and the claim's holder had a socket open a
moment ago.

Same box, so playback's temp file is still on disk and is simply adopted rather
than re-fetched from S3 and sought.

### The mechanism

- **Write**, in the signal handler in `server/src/index.ts`, before
  `fastify.close()`: the floor claim, the playback session and position,
  `trackFiles` paths, live egress ids from `capturing` and `segments`,
  `silenceStated` and `floorWindows` — stamped with `Date.now()`. systemd waits
  `TimeoutStopSec` (90s by default), so a synchronous write is safe.
- **Read**, in `restore()` in `server/src/channels.ts`, **before** the
  stray-recording finalisation. Load it if the stamp is within about 30
  seconds. Channels it covers skip the file-as-failed path entirely and revive
  with their conversation intact.
- **Assert to the media plane** through machinery that already exists.
  `reconcileSilence` compares what was stated against what the room is actually
  carrying and restates the difference, once a tick. A restored claim is the
  same case as a client that flapped and republished, which is what that
  function was built for on 2026-08-14. Do not write a second path.
- **Do not sweep what is about to be adopted.** The tmpdir orphan sweep in
  `restore()` already reasons about ownership by pid; it has to skip files the
  blob claims.

### Why it is safe to ship alone

**No file, or a stale one, is exactly today's behaviour.** A SIGKILL, an OOM
kill or a panic loses nothing it does not already lose, and the failure message
still gets written for a run nobody handed over. There is no state in which the
blob makes things worse than not having it, which is what makes this shippable
without the second process ever existing.

No wire change, so no two-step deploy and no interaction with
`MIN_SUPPORTED_BUILD`.

---

## Stage 2: two servers, and drain before restart

Declare one process ready to restart. It stops taking ownership of newly
occupied channels; everything new goes to the other. Once it has gone quiet,
restart it. Roll deploys out the same way.

**This removes the hardest part of the alternatives.** There is no handover
protocol between the two, so no serialised live-state format, and therefore no
internal version boundary between old code and new — which is the thing that
makes live migration expensive, and is the same two-step problem AGENTS.md
describes for wire changes, in a place nobody would think to look for it.
Nothing is forcibly interrupted; a process is simply given no new work.

**The shard unit is occupancy, not channels.** An empty channel has no volatile
state — `durableOf` already holds everything it has — so either process can
revive it at any time. Only an *occupied* channel is pinned. What is being
drained is therefore small and clears itself.

### Home very nearly does not shard, and that is the surprise

The obvious objection is that one socket carries `watch.home` as well as
per-channel watches, and `homeFor` in `server/src/app.ts` composes a user's
Home across *all* their channels — so a user with channels on both processes
would get a correct Home from neither. Inspected, almost all of it survives:

- `invitesFor` reads `status`, `participants`, `everPresent` and `invitedBy`.
  All durable, all already in `durableOf`.
- `recordingsFor` reads membership from SQLite deliberately, and says so: it
  "answers for a channel this process has not revived as readily as for one it
  has." Somebody already designed for a process that does not hold everything.
- `rejoinableFor` needs exactly one live field: `presentCount`, which is
  `channel.present.length`.
- `reachability.inApp` needs one boolean per contact.

**Two scalars cross the process boundary, not a registry.** Both are already
approximate — presence has a minute of grace, and `inApp` carries documented
flap handling — so a shared best-effort projection is faithful to what they
already mean rather than a weakening of it.

### That state goes in Redis, not the database

The instinct is to put it in SQLite. That is wrong twice, and both arguments
are already written down in this tree.

**Wrong by write volume.** `durableOf` quantises `lastPresentAt` to the minute
for exactly this reason: `STILL_HERE` moves presence every five seconds for
every present participant, and `persistChannel` writes whenever the projection
changes, so at full resolution "a four-person conversation would rewrite its
row forty-eight times a minute to record something no screen can show." Putting
`present` itself in the database reinstates the amplification that comment
exists to prevent. MIGRATION.md already records a 4.1 MB WAL against a 106 KB
database as a surprise worth noting.

**Wrong by meaning.** Presence is a fact about live sockets and is deliberately
not durable. A presence table would have to be cleared at boot to stay honest,
which is a durable store used as a cache with extra steps.

**Redis is already on the box** for LiveKit, at 5 MB. It is the right medium
for both facts: ephemeral, shared, expiring. A presence key with a TTL a little
over `DISCONNECT_GRACE_MS` gives the grace period for free, and a dead
process's presence expires on its own rather than needing anyone to clean up
after it — which matters when the whole design has processes going away on
purpose.

It is one new dependency; `server/package.json` has no Redis client today.
**Make it optional, the way everything in `server/src/index.ts` already is** —
LiveKit, S3, SES and APNs each degrade to a console or no-op fallback there.
Absent `REDIS_URL` the server runs single-process, which is today's behaviour,
and the test suite never needs a datastore.

### The one real cost: routing sockets

A user present in a channel acts on it over their websocket. Presence is
exclusive — `stepOutOfOthers` steps a user out of every other channel on entry
— so a user has at most one active channel and there is no conflict in
principle. But Caddy fronts one upstream and cannot route by user, and
`watch.channel` can name a channel the connected process does not own.

**Client-side routing is rejected.** Having the socket name a server in its URL
needs a new build, which makes a deployment concern into a client-compatibility
concern, and puts `MIN_SUPPORTED_BUILD` and the installed population between
you and a deploy. That is the trade this project has consistently refused.

**A cross-process relay is the answer.** Caddy load-balances both; either
process accepts any socket and forwards `channel.action` and channel
subscriptions to the owner when it is not the owner. No client change, no wire
change, no routing layer. The relay is narrow — it carries the `ClientAction`
and `channel` view messages that both processes already speak.

It is needed steadily rather than only during a drain, and that is the honest
cost of the design.

### Memory

Measured on the live box; the table is MIGRATION.md's.

| | |
| --- | --- |
| whole box | 727 MB used of 1907, swap essentially untouched |
| `thefloor` | **158 MB** current, 290 MB peak |
| `docker` | 66 MB |
| `livekit-server` / `livekit-egress` | 15 MB each |
| `redis-server` | 5 MB |

**A second server is about +158 MB steady state**, taking the box to ~885 MB of
1907, with a 2 GB swapfile behind it. Comfortable.

**The 290 MB peak does not double**, and this is the part worth knowing:
MIGRATION.md establishes that ffmpeg is the memory event on the box, and the
peak is mixing and exporting — per *run*, on whichever process owns the
recording, not per process. Both mixing at once is ~580 MB and still fits.

What genuinely duplicates is the Node baseline and the channel state, since
`restore()` loads every unended channel into both processes. Negligible at 32
channels and a 106 KB database. It is the term that grows.

**The memory event in a rolling deploy is `npm install`, not the second
process.** MIGRATION.md notes the micro instance was sized around it. Today it
runs before a restart with nothing else live; here it runs while the other
process is carrying audio. Install into a staged directory rather than in
place, so the spike does not land in the serving process's working tree.

---

## The gap in the premise

**Drain time is unbounded.** `DISCONNECT_GRACE_MS` bounds only how long a
*dropped* socket holds presence. A foregrounded app holds one indefinitely, and
BACKLOG.md's "Presence follows the websocket, not the room" records ghosts
showing as Present for reasons that are not a conversation. A deploy cannot
wait forever, so the drain needs a timeout and a forced restart.

**Which is why stage 1 goes first.** Forcing a restart on a process that
refused to go quiet is exactly the case the handover blob makes lossless. Drain
handles the common case with no machinery in the data path; the blob catches
the stragglers. Either alone leaves a gap, and the gap each leaves is the
other's strength.

### Measure before committing to stage 2

How long occupancy actually lasts is the load-bearing assumption and nobody has
the number. `lastActiveAt` and `lastPresentAt` are durable and on disk already,
so a week of watching says whether a drain typically completes in seconds or
never. The measurement is free and should precede the work.

If occupancy routinely runs for hours, stage 2 buys little that stage 1 has not
already bought, and the better follow-on is BACKLOG.md's "Presence follows the
websocket, not the room" — because then the thing keeping a process busy is not
a conversation, and no amount of draining will help.

---

## Three things worth doing regardless

- **Swallow a 404 from `deleteRoom`.** BACKLOG.md's known defect 6: `closeRoom`
  raises `requested room does not exist` at `level: 50` once per revived
  channel at every boot. That is noise at exactly the moment stage 1 makes the
  boot log worth reading. `server/src/media.ts`.
- **Add `PRAGMA busy_timeout`** in `server/src/db.ts`, before any second
  process exists. WAL is on, but two writers without it will throw.
- **Stop `ChannelSettingsView.persist` recording a write before it lands.**
  BACKLOG.md's known defect 9, the half that needs no wire change.

---

## Verification

- `npm test` and `npm run typecheck` from the repo root.
- A server test that claims the floor and starts a recording, stops the
  registry through the handover path, builds a fresh one against the same
  database and temp directory, and asserts from a *watcher's* snapshot that the
  claim survives, the recording has no `failure` and no `ended_at`, and the
  mute is re-stated to a fake `MediaServer`. The server tests already drive
  real sockets, which is what makes asserting on a watcher's view possible.
- A companion test that a stale stamp produces today's behaviour exactly,
  failure message included. Without it, the safe-degradation claim above is
  unchecked.
- On the box: `journalctl -u thefloor` across a real deploy with a recording
  running. The run continues, and the boot log is free of `deleteRoom` traces.
- **While a build is in App Review**, before any deploy:
  `git diff build/<n>..HEAD -- core/protocol.ts`. Stage 1 makes no wire change,
  which is part of why it is first.
