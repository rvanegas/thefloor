# Moving this box, and the micro migration that was abandoned

**A record, not a plan.** On 2026-08-13 the server was to move from a
`small_3_0` Lightsail bundle to a `micro_3_0`. The new box was built and loaded;
the cutover was never performed and the migration was cancelled. `thefloor` on
`44.241.121.49` continues to serve, untouched throughout — it was only ever
read from.

This is kept because most of what it cost to learn is still true, and because
the next person to size this box, rebuild it, or wonder why `bin/provision`
exists should not have to rediscover any of it. It is not a checklist to
resume. Anyone restarting this work should re-derive the current numbers first:
everything below was measured on one afternoon with audio down.

**The direction has since reversed, and that is the first thing to know.** Later
the same day the media plane moved off LiveKit Cloud and onto this box — see
`DECISIONS.md`. The sentence this migration rested on, *a micro fits because
LiveKit carries the media*, is no longer true of anything. Any future move is a move **upward**, and the sizing
section below is marked accordingly: the measurements stand as history, the
conclusion does not.

What did not change is everything that made the attempt expensive — the traps,
the cutover ordering, the backup discipline. Those are the reusable part, and
they apply in either direction.

---

## Why it was attempted

A Lightsail bundle bills for existing, not for running. A stopped instance costs
the same as a running one, so there is no pause button, only delete — which was
the original question, how to suspend the $12/mo while audio was down on the
exhausted LiveKit free tier.

Downsizing was the better shape of the same work. A snapshot cannot be restored
to a *smaller* bundle, so either path is a full rebuild of the box; the
difference is that a rebuild onto `micro_3_0` keeps paying afterwards, where a
delete-and-restore is an hour spent to save about $7 once.

## The sizing argument, which no longer holds

Kept in full because the *numbers* are still the best record of what this
workload costs, and because the way the argument failed is the useful part. Read
it as history; the section after it is the one to size from.

**A micro fits because LiveKit carries the media.** The server never touches an
audio stream — WebRTC is phone↔LiveKit, and egress writes to S3 from LiveKit's
side rather than through the box. Server memory therefore tracks channel state
and socket count, not concurrent talkers, and adding users moves the LiveKit
bill rather than this one.

Measured on the old box at 4 days uptime:

| | |
| --- | --- |
| `thefloor` service | 196 MB current, **290 MB peak** |
| `caddy` | 13 MB current, 19 MB peak |
| whole box | 621 MB used of 1907 |
| load average | 0.14 |
| disk | 6.0 GB of 58 |
| database | 106 KB, plus a 4.1 MB WAL |

And on the micro, which got as far as a full deploy: **peak 472 MB of 911 with
swap untouched**, across the `npm install` that the box was sized around. Bare
Ubuntu there idles near 400 MB rather than the ~150 MB the old box suggested,
so the margin was thinner than estimated — but it was real, and the install
spike had room.

Note the load average: audio was down when all of this was measured, so 290 MB
is not a peak under real traffic. The structural argument is what carries it,
not the number.

`micro_3_0` is $7/mo for 1 GB, 2 vCPU, 40 GB and 2 TB of transfer, against
`small_3_0` at $12 for 2 GB, 60 GB and 3 TB. The transfer allowance drops by a
third and does not matter for the same reason the memory does not: what crosses
this box is JSON and websocket frames.

512 MB nano was rejected on the same evidence — 290 MB leaves nothing for the
install spike.

## Sizing it now that it carries the media

Measured 2026-08-13, immediately after `bin/provision-livekit` brought the three
new services up, with **audio still down** — so this is the idle floor and not a
load figure. The caveat that applied to the 290 MB above applies here twice over.

| | |
| --- | --- |
| whole box | **727 MB used of 1907**, swap essentially untouched |
| `thefloor` | 158 MB |
| `docker` | 66 MB |
| `livekit-server` | 15 MB |
| `livekit-egress` | 15 MB (idle; the container is 1.4 GB on disk) |
| `redis-server` | 5 MB |

The self-hosting plan projected ~990 MB and the reality is ~730, because
`livekit-server` and `egress` idle far below the estimates. What the estimates
did not carry is `dockerd` at 66 MB, which is the price of egress being
Docker-only upstream.

What each one scales with, since that is what a future move has to guess at:

- **`livekit-server`** relays Opus rather than decoding it, so it tracks the
  number of *connections*, not the number of talkers. One speaker at a time is
  the whole design; muted publishers send nothing.
- **`livekit-egress`** is per stem, and every participant in a recording is a
  stem — a six-person channel is six concurrent jobs. Track egress is a byte
  pump with no transcode, but it is the thing that multiplies.
- **`thefloor`** is unchanged, and `ffmpeg` under it remains the largest single
  memory event on the box, as the `storage.ts` correction below explains.

**The trap in moving up is that memory is not what you would be buying.** Every
Lightsail bundle from `nano_3_0` to `large_3_0` has exactly **2 vCPUs**; the
first one with more is `xlarge_3_0` at $84/mo.

| | ram | vcpu | transfer | $/mo |
| --- | --- | --- | --- | --- |
| `small_3_0` (current) | 2 GB | 2 | 3 TB | 12 |
| `medium_3_0` | 4 GB | 2 | 4 TB | 24 |
| `large_3_0` | 8 GB | 2 | 5 TB | 44 |
| `xlarge_3_0` | 16 GB | **4** | 6 TB | 84 |

That matters because egress rations itself by a **CPU budget**, not by memory:
it refuses a job when the running total of `cpu_cost` would exceed what it
thinks it has. `/etc/livekit/egress.yaml` sets `track_cpu_cost: 0.15` against
the default of 1 precisely so a six-person recording fits in 2 vCPUs. Moving to
`medium_3_0` would double the memory and buy **no additional egress capacity at
all** — the cost setting is what governs, and it is already tuned.

Bandwidth is not the constraint and is unlikely to become one: Opus speech is
~50 kbps on the wire including overhead, so a six-person channel with one
speaker is ~110 MB/hour downstream, and `small_3_0`'s 3 TB is some 27,000
channel-hours a month.

So the honest reading is that **the next spend is probably not a bigger box**.
Two failure modes are worth telling apart:

- *Memory pressure, or exports and playback contending with live audio.* Then
  `medium_3_0` at $24 is the move, and it is an ordinary rebuild — the cutover
  below, plus `bin/provision-livekit`.
- *A deploy audibly interrupting a live call, or an OOM taking a conversation
  and a recording in flight with it.* Then the answer is a **second $7 box** for
  the media plane, not a larger single one. `DECISIONS.md` argues this at length
  and it is the reason `bin/provision-livekit` is a separate script: splitting
  is a new box, an A record for `livekit.rvanegas.co`, and `LIVEKIT_URL` in
  `server/.env`. No code, no migration, no wire change.

The second is the more likely signal, and it is cheaper than the first.

## What the box is, read off it rather than remembered

| | |
| --- | --- |
| OS | Ubuntu 24.04.4 LTS |
| Node | v22.23.2, from NodeSource — Ubuntu ships 18 and `node:sqlite` is a 22 feature |
| npm | 10.9.8 |
| Caddy | v2.11.4, from the Cloudsmith stable repo |
| sqlite3 | 3.45.1 (the CLI, for backups; the server uses `node:sqlite`) |
| swap | 2 GB `/swapfile`, in `/etc/fstab` |
| unattended-upgrades | enabled |
| cron | none |
| livekit-server | 1.13.5, a single Go binary in `/usr/local/bin`, pinned by `bin/provision-livekit` |
| redis | 7.0.15, Ubuntu's, loopback and protected-mode as shipped |
| docker | 29.1.3, Ubuntu's `docker.io` |
| egress | `livekit/egress:v1.14.0`, pinned; Docker-only upstream |
| sysctl | `/etc/sysctl.d/60-livekit.conf`, UDP buffers at 5 MB |

The four media entries are pinned rather than tracking latest, which is the
whole reason a rebuilt box would behave like this one. `curl get.livekit.io |
bash` installs whatever is current and would silently give a second box a
different SFU from the one the first was tested against.

## What survives: `bin/provision`

Written for this and kept, because it is now the only written-down path from a
bare Ubuntu 24.04 instance to one `bin/deploy` can target — which is the thing
you want on the worst day, when the box is gone rather than merely small. It is
idempotent, places no secrets, and does not start the service.

It was exercised once, successfully, against `thefloor_micro`.

**It originally forgot ffmpeg**, which is the most instructive thing it did.
The package list was curl, gnupg, ca-certificates, sqlite3, rsync, nodejs,
caddy — and `export.ts` spawns `ffmpeg` to mix a recording's stems while
playback probes duration with `ffprobe`. Neither path is exercised by starting
the server or by `/healthz`, so a box provisioned that way serves channels
correctly, stays green, and fails **every export and every recording playback**
at runtime. Confirmed afterwards on the live box: ffmpeg 6.1.1 and ffprobe at
`/usr/bin`, with no `FFMPEG_PATH` in `.env` to point elsewhere. The script now
installs it.

That is the shape of the whole risk in rebuilding this box: the failures are
not in what the server needs to *start*, they are in what it needs to *do*, and
starting cleanly proves nothing about them.

One known gap remains, left honest rather than patched blind:

- **It reads the unit file and Caddyfile from a dated backup directory**,
  `~/.config/thefloor/backup-2026-08-13` by default, overridable with
  `THEFLOOR_BACKUP`. That was right for a migration and is wrong for disaster
  recovery, where the backup is what you have lost.

**It does not know about the media plane, and deliberately never will.** That is
`bin/provision-livekit`, below.

## What survives: `bin/provision-livekit`

Written 2026-08-13 for the self-hosting move, and a sibling of `bin/provision`
rather than part of it. It installs `livekit-server`, the Redis that exists only
because egress needs one, Docker and the pinned egress image; writes
`/etc/livekit/{livekit,egress}.yaml` and two systemd units; raises the UDP
buffers; and appends the `livekit.rvanegas.co` block to the Caddyfile. Idempotent
in the same way, and it invents no secret either — the API key pair comes from
`~/.config/thefloor/livekit.env` and it refuses to run without it.

Separate because that is exactly what a second box would need if the media plane
ever splits off this one. Keeping it apart makes that move a matter of running
the script somewhere else, rather than untangling it from the app's setup.

Two things it does that are not obvious:

- **It will not touch Caddy unless the hostname already resolves to the target**,
  and it asks a public resolver rather than the local one. Same reasoning as the
  Caddy trap below — an ACME attempt against a hostname pointing elsewhere spends
  Let's Encrypt's five-failures-per-hour — but with the extra wrinkle that a
  laptop which cached `NXDOMAIN` while the record was being added would otherwise
  block a cutover that is perfectly ready.
- **It reserves uid 1001 with a `livekit-egress` system account.** The
  `livekit/egress` image runs as uid 1001, `egress.yaml` is bind-mounted into it
  at mode 600, and pinning the number on the host is what stops some later user
  drifting into it and silently gaining read access to an API secret.

Configs live in `/etc/livekit/` rather than `~/.config/thefloor/` for a reason
worth restating: `bin/deploy` rsyncs `~/thefloor` with `--delete`, and `/etc` is
outside that tree by construction. A config a deploy can reach is one that works
until the deploy after next removes it, and the failure arrives as "audio
stopped" some minutes after a deploy that reported success.

## What survives: the backup

`~/.config/thefloor/backup-2026-08-13/`, mode 700 — outside the repo, beside
the other credentials, per the same reasoning as the APNs key. It holds
`thefloor.db`, `server.env`, `AuthKey_AUMWLNZFF7.p8`, and the captured
`thefloor.service` and `Caddyfile`. `server.env.pre-selfhost` was added the same
day, before the LiveKit cutover rewrote the three `LIVEKIT_*` lines; it was
byte-identical to `server.env` when taken, and is kept as the labelled copy of
what Cloud looked like.

**`server.env` in there is a snapshot and has been mistaken for a mirror.** It
was taken on 2026-08-13 and was days stale within the week, while the box went
on being the only live copy of seven credentials. Since 2026-08-19 the live
local copy is `~/.config/thefloor/server.env`, mode 600, kept level with the box
by **`bin/env-pull`** and **`bin/env-push`** — the same arrangement
`bin/provision-livekit` has always had with `livekit.env`, and for the same
reason: a credential authored locally can be backed up and diffed, and one that
exists only on an instance cannot.

Beside it and **not** in it: `~/.config/thefloor/livekit.env`, mode 600, holding
the self-hosted LiveKit API key pair. Not folded into the dated backup because
it is not a snapshot of anything — it is the live credential
`bin/provision-livekit` reads on every run. Losing it is not fatal in the way
losing the APNs key is: a new pair can be generated and written to both
`/etc/livekit/*.yaml` and `server/.env`, at the cost of every issued join token
becoming invalid at once.

**It contains live credentials**, which is the reason for the location and the
mode, and a reason to know it is there rather than discover it later.

The database was copied with `sqlite3 .backup` rather than `cp`, which mattered
more than expected: there was a **4.1 MB WAL unmerged against a 106 KB
database**, so copying the `.db` alone would have silently lost every change
since the last checkpoint. Verified after copying — `integrity_check` ok, and 23
channels / 17 recordings (6 marked) / 5 accounts, matching both the live box and
the deploy record in `AGENTS.md`.

That is worth generalising: **any file-level copy of this database must take
the WAL with it, or use `.backup`.** The `-wal` file being forty times the size
of the `.db` is normal here, not a symptom.

## Three traps found, all still live

### `bin/deploy`'s health check lies about any box that is not the live one

It checks `https://thefloor.rvanegas.co`, which resolves to whatever owns the
static IP. Deploying to a staging box therefore prints `✓` because *the old
server* answered about *itself* — a green tick for a machine the deploy never
touched. The honest check pre-cutover is `curl 127.0.0.1:8787/healthz` over SSH.

### A server with no database looks perfectly healthy

The new box came up against an empty `~/thefloor-data/`, wrote a fresh schema,
and reported `{"ok":true,"audio":"livekit"}` while holding 0 channels, 0
recordings and 0 accounts. `/healthz` does not distinguish a loaded server from
an empty one. This is why `bin/provision` installs the unit but deliberately
does not start it.

### Caddy is loaded at cutover, not at provision

The least guessable of the three, and it cost a bug.

`apt-get install caddy` starts the service as part of installing it. So writing
`/etc/caddy/Caddyfile` afterwards and calling `systemctl enable --now caddy`
does nothing at all: `--now` is a no-op on an already-running unit, and Caddy
never re-reads the file. Caught by timestamps — Caddy up at 19:53:52, the
Caddyfile written at 19:53:58, six seconds too late — and confirmed against the
admin API, which showed it serving the packaged `file_server` on
`/usr/share/caddy`, having never heard of the hostname.

Nothing about that looks wrong. The file is correct on disk, the service is
active and enabled, and provisioning reports success. It would have surfaced
only at cutover, as the production hostname serving the Caddy welcome page over
plain HTTP with no certificate — which reads like a DNS or TLS fault rather
than an ordering mistake six steps earlier.

The fix is not to restart it during provisioning either. Caddy would at once
try ACME for a hostname still pointing at the old box, fail validation, and
spend Let's Encrypt's **five failed validations per hostname per hour** — so
the certificate would be rate-limited at exactly the moment cutover needed one.
The config is therefore written and `caddy validate`d at provision time, and
loaded only once the box owns the IP.

## The cutover that was never run

Recorded because the ordering was the part that took thought.

Move the **static IP** rather than repointing DNS: `44.241.121.49` stays the
address, so Namecheap is untouched and there is no propagation to wait out.
This requires an IPv4 instance — `micro_ipv6_3_0` is $2 cheaper and has no
public IPv4 at all, so an IPv4 static IP cannot attach to it and this whole
approach is unavailable.

Since self-hosting this is a better deal than it was: `livekit.rvanegas.co` and
`thefloor.rvanegas.co` are two A records pointing at the same address, so moving
the static IP moves **both**, and the media plane needs no DNS change either.

Order: stop `thefloor` on the old box; take the final `.backup` and move it;
*then* the IP; then load Caddy and start the service. Everything reversible
happens before the console action, and the irreversible-feeling part is last
and smallest.

The alternative — move the IP first, then copy — is worse in a specific way:
the new box would hold the production address with no service on it, and any
client arriving in that window meets a stub. Stopping the old service first
makes that window a clean refusal from a box that is deliberately down.

### What the media plane adds to that order

Four things, and the first is the one that will cost an afternoon if it is
missed, because it fails silently in both directions.

1. **Open the Lightsail firewall on the new box before starting
   `livekit-server`** — `7881/TCP` and `7882-7885/UDP`, and *not* 7880, which
   stays on loopback behind Caddy. `use_external_ip: true` discovers the public
   address over STUN and then validates it with a round trip back to itself; a
   closed firewall fails that validation and the server falls back to
   advertising its **private** address. The symptom is the worst kind: the room
   connects, participants appear, negotiation completes, and there is no audio.
   Observed exactly this way on 2026-08-13, and the tell is in the log —

       journalctl -u livekit-server | grep "using external IPs"

   A `172.x` or `10.x` address there means the firewall, not the config. If the
   firewall is opened afterwards, restart `livekit-server`; the discovery only
   happens at startup.

2. **`bin/provision-livekit` runs after `bin/provision`, not instead of it.** It
   assumes Caddy and the base packages are already there.

3. **The Caddy block is appended by the script and loaded at cutover**, exactly
   as the app's own block is, and for the same ACME reason. If the static IP has
   not moved yet, the script will decline to touch Caddy and say so.

4. **The recording path is the last thing to verify and the least similar to
   anything else.** Starting cleanly proves nothing about it — the same lesson
   the forgotten `ffmpeg` taught. Make a recording and confirm the object lands
   in S3, then play it back into the room: playback runs `@livekit/rtc-node`
   against a self-hosted server rather than Cloud, and nothing else in the
   codebase exercises that.

The reverse is worth stating too. **Nothing in the app changes for any of this.**
The client is told where to connect by the server, and `issueToken` signs with
whatever key it is handed — so a media move is `LIVEKIT_URL`,
`LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` in `server/.env` and a restart. No
build, no App Store round trip.

## A correction worth keeping, about `storage.ts`

Through most of this work the claim was made — three times, and it informed a
recommendation — that `storage.ts` should "stream the S3 body straight to the
reply" because `get()` buffers a whole object via `Buffer.concat`. **That is
not what the code does**, and the advice did not apply.

`store.get` is never a proxy to the client. It is passed as a *fetcher* into
`encodeRecording`, which downloads each stem in turn, writes it to a temp file,
and then has **ffmpeg** mix the stems into one track against the floor
timeline. You cannot stream what you have to mix, and both routes — export and
playback — want the finished mix rather than any single object.

So the real memory profile of an export is: one stem buffered at a time and
released (largest object in the bucket today, 973 KiB), plus ffmpeg's own
process, plus `readFile` of the finished mix. The item that scales with
recording length is the mix, not the stems, and **ffmpeg is the memory event on
a small box**, not the Buffers. Spawned children share the service's cgroup, so
the 290 MB peak already includes any ffmpeg run that happened in that window.

There is still a real improvement available — stream each object to disk rather
than through a Buffer, and send the export from a file stream rather than
`readFile` — but it is smaller and differently shaped than described, and
nothing at current sizes comes near needing it.

The general lesson is the ordinary one: `storage.ts` was read and its callers
were not.

## How it was left

`thefloor_micro` was deleted from the console the same afternoon, having
existed for about three hours. Nothing of it survives: no static IP was ever
attached, no snapshot was taken, and the copies of `server/.env` and the APNs
key it briefly held went with it. Verified afterwards — `get-instances` returns
`thefloor` and the unrelated `Ubuntu-3`, and the live server answers
`{"ok":true,"audio":"livekit"}` on `44.241.121.49`.

The deletion needed the console because the `roxana-cli` credential on the
development machine allows exactly three Lightsail calls — `get-bundles`,
`get-instances`, `get-instance`. Every write is denied, along with key pairs,
blueprints, disks, snapshots, static IPs and port states. Worth knowing before
planning any work here that assumes the CLI can act rather than only look.

Confirmed again on 2026-08-13 while self-hosting: even
`get-instance-port-states` is refused, read-only though it is. So opening
`7881/TCP` and `7882-7885/UDP` is a console action, and there is no way to check
from a script whether it has been done — only to read the consequence out of
`livekit-server`'s log, as above.

So the standing cost is unchanged at $12/mo, and the question that started this
— how to suspend it while audio is down — still has the same answer: Lightsail
has no pause, only delete, and deleting is a rebuild.

That question has since answered itself from the other side. Audio came back by
moving onto this box rather than by paying LiveKit's $50/mo Ship tier, so the
$12 now buys the media plane too, and suspending it would mean suspending
everything. The pressure to make it go away is gone.
