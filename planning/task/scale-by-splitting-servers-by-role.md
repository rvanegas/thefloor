# Scale by splitting servers by role

DESIGNED, not built — premature on purpose. Written 2026-10-29 so the order is
settled before volume arrives, not while it is arriving.

**Two kinds of server, not identical ones.** Running every application on
both boxes was considered and rejected the same day: of everything on
`floor` and `commons`, only the static sites (noesis, www) can run twice.
thefloor keeps channel state in process memory, imitation's Telegram token
admits one poller, minifiles and mdc keep their state on local disk, and two
A records at Namecheap are round-robin without health checks, not failover.
So the boxes stay distinct, and grow along two axes: **media servers**
(LiveKit, egress) and **everything else** (thefloor's server, and the
commons applications beside it).

Three steps, each with its own trigger. Do not take one before its trigger.

**1. The media plane to its own box.** No code: a box run through
`bin/provision-livekit`, the `livekit.rvanegas.co` A record moved to it, and
`LIVEKIT_URL` in `server/.env`. Egress and Redis go with LiveKit. *Trigger:*
egress refusing a recording for capacity (`bin/usage egress` says which kind
of refusal it was), or a deploy audibly interrupting a call
(INFRASTRUCTURE.md § *Known rough edges*). This is the first ceiling
volume reaches: `track_cpu_cost: 0.15` caps the box at about ten
simultaneously recorded participants, while the app servers sit at a load
average near zero. MIGRATION.md § *Sizing it now that it carries the media*
explains why a bigger single box does not raise that ceiling — every bundle
below $84 has the same 2 vCPUs.

**2. More media servers, sharing one Redis.** *Trigger:* one media box no
longer carries the concurrent calls and recordings. LiveKit's multi-node
mode needs every node — and every egress worker — pointed at **the same**
Redis, which is how they find each other and place rooms; so Redis moves to
an instance of its own here, and is not distributed across the media boxes.
**thefloor's server does not use Redis at all**; both addresses in
`/etc/livekit/livekit.yaml` and `egress.yaml` are LiveKit's own. A room
lives on one node, so nothing about a room's single owner changes.

**3. A standalone database, and a second app server.** *Trigger:* one app
server, already moved to a larger bundle, is not enough. It is last because
it is the expensive one, and because it is two jobs, not one:

- **SQLite to a networked database.**
  `2026-10-03-a-live-channel-is-never-moved-to-another-box.md` in
  `decision/` already commits to this before there is a second server. The
  server uses `node:sqlite`'s synchronous `DatabaseSync`, at about 357
  `prepare()` sites across `server/src`, so moving to Postgres makes every
  query asynchronous, including the paths through `channels.ts`. Doing it
  while there is one app server buys a network round trip per query and
  another thing to fail, and nothing else.
- **Channel affinity.** A shared database does not make two processes able
  to serve one channel: live state is in memory and a room has one owner
  for its whole life (the same decision). Every phone in a channel has to
  reach the server that owns it, so the front needs to route by channel,
  not balance by connection. Between rooms a channel can move freely, which
  is what the shared database buys.

The commons applications' own state — mdc's `/srv/mdc`, minifiles'
`hits.db`, imitation's single poller — is a separate question for whenever
any of them grows, and none is near a limit. `rvanegas-site/PROJECTS.md` is
where their placement is recorded.

**What holds in the meantime is interchangeability, not duplication:**
either box can be provisioned to take the other's applications, so losing
one is a stop, a restore of a small amount of data, and an A record change.
Check that `floor` has automatic snapshots as `commons` does, and what TTL
the A records carry, since that is how long such a switch takes.
