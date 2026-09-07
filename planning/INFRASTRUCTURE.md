# The box, and what is on it

Standing guidance, split out of AGENTS.md on 2026-09-07 when that file was cut
by a fifth. What the live instance is made of, the two media settings that fail
silently when wrong, what it can carry, and the rough edges a restart has.
Needed by somebody provisioning, debugging the box, or sizing it — and by
nobody writing app or core code, which is most sessions.

Siblings: CREDENTIALS.md for anything secret, MIGRATION.md before sizing,
rebuilding or re-hosting, RELEASING.md for getting a build to a phone.

## Contents

| Section | When to read it |
| --- | --- |
| *What is where* | anything about the instance, DNS, TLS, ports or logs |
| *The two media settings that fail silently* | rooms connecting with no audio |
| *What the box can carry* | recording capacity, before it bites |
| *Known rough edges* | before a deploy, and before believing a restart is free |

---

## What is where


| | |
| --- | --- |
| Instance | Lightsail `thefloor`, us-west-2a, Ubuntu 24.04, 2GB, 2 vCPU, $12/mo |
| Static IP | `44.241.121.49` |
| DNS | Namecheap, A records `thefloor` **and `livekit`** → that IP |
| TLS | Caddy, automatic Let's Encrypt, renews itself, two site blocks |
| Service | systemd `thefloor`, restarts on failure and on boot |
| Media | systemd `livekit-server` (1.13.5) and `livekit-egress` (`livekit/egress:v1.14.0`, under Docker), plus `redis-server` |
| Media config | `/etc/livekit/livekit.yaml` and `egress.yaml`, mode 600 |
| Node | 22, required for the built-in `node:sqlite` |
| Database | `/home/ubuntu/thefloor-data/thefloor.db`, outside the synced tree |
| Logs | `journalctl -u thefloor`, `-u caddy`, `-u livekit-server`, `-u livekit-egress` |

Node binds to loopback only; nothing reaches it except through Caddy. So does
LiveKit's HTTP/WSS port, 7880. What is exposed is the media transport, which
cannot be otherwise: **7881/TCP** (ICE/TCP) and **7882-7885/UDP** (the mux), open
to any address, because that is where phones on arbitrary networks send audio.
Nothing is given up — WebRTC carries its own encryption, and ICE credentials are
negotiated during signalling, which is behind Caddy and needs a token this server
signs.

## The two media settings that fail silently

Two media settings are load-bearing and neither announces itself when wrong.
**`rtc.use_external_ip: true`** is necessary and *not sufficient*: it validates
the STUN-discovered address with a round trip, so the UDP ports must be open
before `livekit-server` starts or it silently advertises the private address and
rooms connect with no audio. Read `journalctl -u livekit-server | grep "using
external IPs"` — the yaml is no evidence. And **`udp_port` is mutually exclusive
with `port_range_start`/`end`**; setting both is not an error, the range just
wins. Both are covered at length in the first `DECISIONS` volume.

The media plane is deliberately *not* in `bin/provision`. It is
**`bin/provision-livekit`**, a sibling, run after it — which is exactly what a
second box would need if the media ever splits off this one.

## What the box can carry

The one number to know before it surprises somebody: **`track_cpu_cost: 0.15` in
`/etc/livekit/egress.yaml` caps the box at ~10 simultaneous recorded
participants**, every stem being its own egress job. That is a chosen figure and
raising it is the first move if it ever bites, not a hardware limit —
`bin/usage peak` says how close it has ever come.

## Known rough edges

- **A deploy costs presence, not channels.** `restore()` revives every unended
  channel from its state blob; what a restart drops is `present`,
  `disconnectedAt`, the floor and any recording in flight — the process, not
  the place. This file claimed the opposite for a day after `9761d72` made it
  false, and was believed.
- **The 380-day-uptime box is not this one.** dianoia runs on a separate
  instance and was deliberately left alone — it owns ports 80 and 443 there
  with its own nginx and certbot.
- **`tsx` runs TypeScript directly in production.** Fine at this scale and it
  keeps the cross-package `core/` imports working without a build step, but a
  compile step would start faster and use less memory if that ever matters.
- **A deploy now happens next to live audio, and nobody has heard what that
  sounds like.** `bin/deploy` runs `npm install` on the box and restarts, and
  since 2026-08-13 the SFU is on that same box. The line above is still true —
  a deploy costs presence, not channels — but it used to also be true that a
  deploy could not touch a conversation, *because* the media was elsewhere. That
  is no longer true. **A deploy that audibly interrupts a call is the signal to
  move the media plane to its own $7 box**, which the first `DECISIONS` volume
  argues and `bin/provision-livekit` exists to make cheap. It is worth listening
  for rather than waiting to be told about.

  **Half-observed on 2026-08-19.** Somebody present through a restart saw
  nothing: the socket dropped, the client re-entered from the set of channels
  `socket.ts` keeps for exactly that, and the screen never changed — presence
  recovery works outside its tests. But **nobody was talking**, so what a
  restart does to audio in flight is still unheard, and the case worth hearing
  is a claimed floor rather than silence: a restart drops the floor while the
  mutes it implied are stated in LiveKit and get restated a tick later by
  `reconcileSilence`. That gap is where an artefact would live.

  **And an `env-push` restart is the short version of this, not a sample of
  it.** A deploy installs on the box first, so the process comes back with a
  cold module cache on 2 vCPU while `tsx` strips the whole server at boot;
  `env-push` restarts a box nobody touched. On top of that the client retries at
  500ms × 2ⁿ capped at ten seconds, so what anybody sees is the outage rounded
  *up* to the next attempt — a two-second restart costs two seconds and a
  fifteen-second one can cost twenty-five. Each phone is on its own attempt
  count, so a channel refills raggedly rather than at once.
- **A floor claim is enforced against a *track*, and tracks are replaced under
  it.** Fixed on 2026-08-14 and worth knowing before touching `assertSilence`:
  a phone whose connection flaps rejoins publishing a new track id, which the
  mute already stated does not name and which is subscribed to by default, so
  the silenced person becomes audible again while every screen says otherwise.
  `reconcileSilence` compares what was stated against what the room is actually
  carrying, once a tick, and restates the difference. **The transition is for
  latency and the reconciliation is for truth** — do not collapse one into the
  other. planning/decisions/archive/DECISIONS-2026-08-13-to-2026-08-15.md carries the
  logs.


  The same change retired what used to be the loudest thing in the log by a wide
  margin — `participant does not exist`, twice a second for as long as a claim
  lasted, 470 on 2026-08-10 — by asking the room who is in it rather than
  guessing from channel membership. If it ever comes back, that is the
  regression.
