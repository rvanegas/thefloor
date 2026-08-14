# Working on The Floor

What you need before touching anything: how it is laid out, how to run it, how
to ship it, and the traps that have already cost somebody a day.

Everything that is not this file lives in **`planning/`**. This one stays at the
root because it is the one a fresh reader is pointed at; the rest are documents
you go looking for, and a root directory that lists them all buries the code.

Three of them answer a standing question each. **`planning/BACKLOG.md`** is what
is known and not done. **`planning/DECISIONS.md`** is what was built and why,
including what was deliberately not built. **`planning/FEATURES.md`** is the
roadmap: features that are wanted, at a paragraph each.

The rest are temporary, and say so in their own first lines. Designs for
unbuilt work — **`planning/ANONWEB.md`**, **`planning/WATCHPARTY.md`** — are
deleted when the work ships, with whatever survives moving to `DECISIONS.md`.
Two are one-offs that stay. **`planning/POSTMORTEM-echo.md`** is the build 17
echo bug, start to finish. Read it before touching the iOS audio session —
three separate components configure it and the ways they disagree are not
guessable from the code. **`planning/MIGRATION.md`** is about moving this box:
it began as the 2026-08-13 migration to a *smaller* instance, built and then
abandoned before cutover when self-hosting the media inverted its premise, and
it now carries the sizing argument in both directions. Read it before sizing,
rebuilding or re-hosting the server, and before trusting `bin/provision`,
`bin/provision-livekit` or `bin/deploy`'s health check about any box that is not
the live one.

References between documents inside `planning/` are by bare filename, since
they are siblings. References from code and from this file carry the
`planning/` prefix.

---

# Expo HAS CHANGED

This project is on **Expo SDK 54**. Read the exact versioned docs at
https://docs.expo.dev/versions/v54.0.0/ before writing any code.

It is on 54 rather than the latest because `@livekit/react-native-webrtc`'s
config plugin had no SDK 57 release. Check that before proposing an upgrade —
the media layer is what pins the version, not preference.

Confirm against `app/package.json` rather than trusting this line; a file
saying which version you are on is a file that can be wrong, and this one
already was.

---

## The shape of it

Three packages, and the split is load-bearing rather than tidy:

- **`core/`** — the rules, as pure functions over a `ChannelState`. No I/O, no
  clock of its own, no imports outside itself; `core/__tests__/purity.test.ts`
  enforces that. Both the server and the app import it, which is what stops the
  two ends disagreeing about what a claim or a recording means.
- **`server/`** — Fastify, SQLite, LiveKit, S3. Owns *when* the reducer runs
  and *who* may act, never what the rules are.
- **`app/`** — Expo React Native. Renders server snapshots; it does not compute
  channel state. The guards in `core/` drive which controls are enabled, so a
  greyed-out button and a refused action cannot disagree.

A channel's live state exists in the server's memory and is written to SQLite as
it changes; the app never holds authority over anything.

---

## Running the suite

From the repo root, across all three packages:

```bash
npm test           # core + app + server
npm run typecheck
```

Or one at a time: `npm test --prefix core`, `--prefix app`, `--prefix server`.

The per-behaviour table of which test covers what has been dropped: it
duplicated the suite and went stale faster than the code did. The tests are the
record.

---

## Deployment

Deployed to **https://thefloor.rvanegas.co**, first on 2026-08-09.

Most recently on 2026-08-14, three times: **voluntary donations**, the fix for
the mistake the first deploy shipped, and then the region filter.

Donations are a **Ko-fi link, external, unlocking nothing** — see
planning/DECISIONS.md for why it is not in-app purchase. The build is a
`donations` table, `server/src/donations.ts`, `POST /support/kofi` and `GET
/support`, plus a Support card in `HomeSettingsView`. Nothing in `core/` changed
except one additive type, so the wire is unchanged and build 30 kept working
across all three restarts; **build 31 is the one that shows the card**, and it is
not built yet. Alongside it went `GET /privacy` and a fixed one-time code for
App Review (`REVIEW_IDENTIFIER` / `REVIEW_CODE`).

**The app ships worldwide and the link is withheld per person.** App Review
Guideline 3.1.1(a) prohibits an external payment link outside the United States
storefront — the *link*, not the app — so shipping US-only would have locked
existing non-US users out of the App Store for nothing. The app reports its
locale and timezone from `Intl`; `server/src/region.ts` decides. **Silence means
hidden, and so does anything ambiguous**, because showing the link to the wrong
storefront is a violation while hiding it from the right one costs a donation.
`accounts.donations_allowed` overrides it either way — null for everyone by
default. That was the third deploy's migration, on the `bio` / `last_seen_at`
pattern.

The second deploy was the one that mattered. **The first stored Ko-fi's
`verification_token` in the `donations.raw` column**, because it stored the
request body verbatim and that body carries the secret authenticating every
future delivery — into the database, into every backup, and into the output of
any query selecting that column, which is how it surfaced. The token was
rotated, the row deleted, the payload is now stored minus that field, and a test
asserts it appears nowhere in the table. The general form is worth carrying:
**a payload that authenticates itself contains a credential, and storing it
verbatim stores the credential.**

Verified against production afterwards: `donations: "ko-fi"` in the startup log,
a bad token answered `401` with nothing written, `/privacy` served as HTML
naming `support@rvanegas.co`, and data untouched at 5 accounts, 24 channels and
12 recordings. A real end-to-end donation is still untested. Note that Ko-fi's
`closeRoom` noise in the log is unrelated and dates to 2026-08-09.

Before that, on 2026-08-13: the two idle timers, and with them the first
`accounts` migration since `bio`. **`accounts.last_seen_at`**, added and left
null — backfilling it from `created_at` would have read as a year idle for
somebody who used the app that morning — so it fills in as people connect. The
wire gained `ContactView.lastSeenAt`, typed optional precisely because an
installed build meets a server without it, and additive besides, so every build
kept working across the restart; build 30 is the one that shows the timers.
Verified against production afterwards: the column present, two accounts already
stamped by clients reconnecting after the restart, data untouched at 7 channels,
12 recordings with 6 already marked, and 5 accounts. No errors in the log.

Before that, on the same day, **the media server moved off LiveKit Cloud onto
this box.** `bin/deploy` was never run — no code
changed — and no build shipped, because the client is told where to connect by
the server and there is no URL in the binary. It was `livekit-server`, a Redis
and the egress recorder installed by the new `bin/provision-livekit`, a second
Caddy site block for `livekit.rvanegas.co`, two firewall rules, and three lines
of `server/.env`. The reasoning is in planning/DECISIONS.md; the numbers and the
rebuild path are in planning/MIGRATION.md.

Verified against production afterwards with two phones — join, claim and release
the floor, record, play back into the room — and the recording landed in S3 as
two stems with both egress manifests, timestamps matching `egress_complete` in
the log to the second. Data untouched at 24 channels and 18 recordings, 6 of
them already marked for deletion. Build 28 went on working across it without
being restarted.

The one number to know before it surprises somebody: **`track_cpu_cost: 0.15` in
`/etc/livekit/egress.yaml` caps the box at ~10 simultaneous recorded
participants**, every stem being its own egress job. That is a chosen figure and
raising it is the first move if it ever bites, not a hardware limit.

Before that, on 2026-08-13, adding `PATCH /recordings/:id`: a name written to
the row every member of the channel reads, guarded by the same reach test that
play, export and delete already ask, so anybody in the channel may rename
anything in it. No schema change — the `name` column has been there since
2026-08-11 — and no change to any existing response, so every installed build
goes on working; build 28 is the one that can ask for it. Verified against
production afterwards: the route answers `401` rather than `404` to an
unauthenticated caller, and the data is untouched at 23 channels and 17
recordings, 6 of them already marked for deletion.

Before that, five times on 2026-08-12. The last added `DELETE /recordings/:id`
— one recording marked for deletion on the same terms as a deleted channel's,
swept a week later by the sweep that already existed. No schema change: the
`deleted_at` column it marks has been there since earlier that day. Verified
against production afterwards: 11 live recordings, 4 already marked, unchanged
by the deploy. Purely additive, so every build keeps working; build 27 is the
one that can ask for it.

Before that, one that narrowed the one-per-set rule
to *unnamed* channels and made an unnamed channel's invitation move the
conversation when the invitee arrives — see planning/DECISIONS.md. No
migration: two
fields were added to the state blob, and both default correctly for a channel
that has never moved (`mediaRoom` to the channel id, `invited` to empty), so
existing rows are rewritten on their next change rather than up front. Verified
against production afterwards: 5 live channels revived, 15 recordings, health
green. Wire-additive, so build 23 goes on working; build 25 is the one that
follows a move.

Before that, one that made claiming the floor clear the claimant's self-mute
and refuse to let them set it again until they release — no schema change and
no wire change, so build 23 kept working across it, simply without greying out
its own mute button while it holds the floor.

Before that, twice the same day: recordings moved to the channel they were
made in, with deletion by mark and sweep and playback into the room; then the
branch that answered for recordings whose channel had already ended, once the
four of those were deleted. The first carried a migration — `deleted_at` on
`channels` and `recordings` — verified against production afterwards: 22
channels, 15 recordings, nothing marked.

Before those, twice on 2026-08-11. The second put every channel you belong to
on Home regardless of what the server believes about your presence, and stopped
a bare socket asserting presence. No schema change and no wire change — the
`rejoinable` array simply carries more — so build 19 kept working across it,
showing a channel it is in as both banner and row until build 20 lands. The
restart also cleared the stuck presence that had made a channel invisible;
5 channels came back, `A Priori` among them.

The first, earlier that day, brought the settled recording names and the
channel ordering. Two columns were added to `recordings` —
`participant_names` and `name` — and verified against production afterwards:
22 channels, 11 recordings, both columns present. It was additive to the wire
protocol — two new `RecordingView` fields — so build 16 went on working
against it, ignoring them and labelling recordings the old way.

Before those, twice on 2026-08-10: the channels rework, and later the
empty-channel playback pause and the shared channel-description fallback. That
second one changed no wire format, so build 14 kept working across it.

`bin/deploy` syncs the server, reinstalls, restarts, and waits for health. It
runs the tests first and refuses to continue if they fail.

### The 2026-08-10 deploy broke every installed client, on purpose

The Session → Channel rename changed the wire protocol, and the two ends were
shipped separately because they cannot be shipped together: the server deploys
in a minute and a new iOS build reaches a phone via App Store Connect
processing plus whenever a tester updates. So build 5 stopped working the
instant the server restarted, and stayed broken until build 6 landed.

What broke, concretely — an old client talks and the new server does not answer:

| Build 5 sends | Server now expects |
| --- | --- |
| `watch.session`, `unwatch.session`, `session.action` | `watch.channel`, `unwatch.channel`, `channel.action` |
| `POST /sessions`, `/sessions/:id/media-token`, `/sessions/:id/track` | the same under `/channels` |
| `LEAVE`, `END` | `STEP_OUT`, `LEAVE_CHANNEL` |

Accepted knowingly because the only installs were the author's. **It is not a
choice that survives having users.** The way to avoid it next time is to teach
the server the old names as aliases, deploy that first, ship the client, and
remove the aliases a release later — the ordinary two-step, which costs a
compatibility layer to carry and then delete.

The database migration in that deploy renamed `sessions` to `channels` in place
and repointed the `recordings` foreign key. Verified against production
afterwards: 15 channels, 2 recordings, both still joining, ids unchanged.

### What is where

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

Two media settings are load-bearing and neither announces itself when wrong.
**`rtc.use_external_ip: true`** is necessary and *not sufficient*: it validates
the STUN-discovered address with a round trip, so the UDP ports must be open
before `livekit-server` starts or it silently advertises the private address and
rooms connect with no audio. Read `journalctl -u livekit-server | grep "using
external IPs"` — the yaml is no evidence. And **`udp_port` is mutually exclusive
with `port_range_start`/`end`**; setting both is not an error, the range just
wins. Both are covered at length in planning/DECISIONS.md.

The media plane is deliberately *not* in `bin/provision`. It is
**`bin/provision-livekit`**, a sibling, run after it — which is exactly what a
second box would need if the media ever splits off this one.

### Credentials

Seven, deliberately separate, so no single leak is worse than it has to be:

- **LiveKit** — media. Since 2026-08-13 this is a **self-issued** API key and
  secret rather than one granted by LiveKit Cloud, generated once with
  `livekit-server generate-keys`. Being self-issued is what makes it easy to
  treat casually, and it should not be: it mints join tokens for any room.

  It lives in exactly three places, all mode 600 and all outside the synced
  tree — `server/.env` and `/etc/livekit/{livekit,egress}.yaml` on the box, and
  `~/.config/thefloor/livekit.env` on the development machine, which is what
  `bin/provision-livekit` reads. That script refuses to run without it rather
  than generating a pair of its own, on `bin/provision`'s principle that a
  script which invents credentials is one whose every invocation can leave a
  different pair behind and a server pointed at the one before it.

  Losing it is recoverable in a way the APNs key is not: generate another and
  write it to all three, at the cost of invalidating every issued join token at
  once.

- **`thefloor-egress`** — PutObject only. **It no longer leaves the box, and it
  should stay exactly this narrow anyway.** The original reason was that it
  travelled to LiveKit, a third party, so a leak of a key somebody else held
  could not read anyone's conversations back. Self-hosted, that reason is gone
  and the scoping is still right: an S3 key that can only add is a smaller
  blast radius than one that can read or delete, whoever holds it. Widening it
  would be trading a real property for no gain.
- **`thefloor-server`** — `ses:SendEmail` on the rvanegas.co identity and
  `s3:GetObject` on the recordings bucket. Nothing else. Created for this
  deployment because Lightsail instances get no IAM role, so the default
  credential chain has nothing to find.

  It also needs the **configuration set** in its resource list, not only the
  identity. The rvanegas.co identity has `my-first-configuration-set` attached
  as its default, so SES applies it to every send and checks permission on it —
  which failed with a message naming a resource nothing in this codebase asks
  for. Worth knowing before scoping an SES policy anywhere else.

- **APNs auth key** — a `.p8`, team-scoped, valid for both the sandbox and
  production environments, held by the server so it can sign its own provider
  JWTs. Apple offers the download **exactly once**; there is no recovery, only
  revoking the key and creating another.

  It lives at `~/.config/thefloor/AuthKey_<KEYID>.p8`, mode 600, on the box and
  on the development machine alike — a credential rather than data, which is
  what separates it from the database in `thefloor-data`.

  What matters more than the convention is that it is **outside the synced
  tree**: `bin/deploy` rsyncs with `--delete`, so a key inside the tree is one
  a later deploy removes. `*.p8` is in `.gitignore` and in the deploy excludes,
  both deliberately.

- **App Store Connect API key** — a second `.p8`, used by `bin/release-ios` to
  sign and upload without an Apple ID being signed in to Xcode.

  It exists because that dependency broke a release. Build 21 archived cleanly
  and failed at the upload with `Failed to Use Accounts`: Xcode's account list
  had emptied overnight, with nobody having signed out and no keychain reset —
  the certificate and the provisioning profiles were untouched, so only the
  Apple ID session had gone. A key belongs to the team rather than to a person,
  is not a session, and does not expire.

  Named `thefloor-release`, after what it does, as `thefloor-egress` and
  `thefloor-server` are. **Its role must be Admin.** App Manager can upload a
  build and cannot touch signing assets, so it authenticates and then fails
  with `Cloud signing permission error` / `No signing certificate "iOS
  Distribution" found` — this project has no distribution certificate locally,
  Apple holds it, and fetching it is a signing-asset operation. A key's role is
  fixed at creation, so getting this wrong means revoking and starting again.

  It lives in **its own directory**, `~/.config/thefloor/asc/`, holding
  `AuthKey_<KEYID>.p8` and a plain-text `issuer-id`. The directory is the point:
  the APNs key is an `AuthKey_*.p8` under `~/.config/thefloor` as well, and a
  glob there matches it first — alphabetically, silently, and with no way to
  tell the two apart by content, both being ES256 private keys. The script now
  refuses outright if that directory ever holds more than one key.

  The key id is read from the filename; the issuer id is per-team, so it
  survives replacing the key. `THEFLOOR_ASC_DIR` and
  `APP_STORE_CONNECT_ISSUER_ID` override both.

  Generated in App Store Connect under Users and Access → Integrations, and
  offered for download **once**, like the APNs key. Same reasons for the
  location: `*.p8` is gitignored and excluded from the deploy, and `bin/deploy`
  rsyncs with `--delete`, so a key inside the tree is one a later deploy
  removes.

  Without it the script says so and falls back to the interactive path, which
  still works whenever somebody is signed in.

- **Ko-fi webhook verification token** — `KOFI_VERIFICATION_TOKEN`, from More →
  API → Webhooks → Advanced on Ko-fi, matching the webhook URL
  `https://thefloor.rvanegas.co/support/kofi`.

  Unlike every other credential here it is a **shared secret sent inside the
  request body** rather than a signature over it, so it is only safe because
  Caddy terminates TLS in front of the endpoint. Anyone holding it can write
  fabricated donations into the database. It is compared with
  `timingSafeEqual`, never logged, and — since 2026-08-14 — **stripped from the
  payload before the payload is stored**, because the first implementation kept
  the request body verbatim and put the secret on every row. See
  planning/DECISIONS.md.

  Rotating it is cheap and non-destructive: regenerate on Ko-fi, replace the
  line in `server/.env`, restart. Nothing already recorded depends on it, which
  is the opposite of the APNs key and worth knowing when deciding how nervous to
  be.

  It lives at `~/.config/thefloor/kofi-verification-token.txt` on the
  development machine, mode 600 — outside the synced tree, on the same reasoning
  as the `.p8` keys.

`server/.env` on the box holds all of it, mode 600, and is excluded from the
sync so a deploy cannot overwrite it. `KOFI_URL`, `CONTACT_EMAIL` and the
`REVIEW_*` pair live there too and are settings rather than secrets —
`server/.env.example` documents every one of them.

### `APNS_ENV` is the setting that will cost you an afternoon

A device token minted by a debug build (`expo run:ios`) is valid **only**
against `api.sandbox.push.apple.com`; one from TestFlight or the App Store only
against `api.push.apple.com`. Cross them and APNs answers `BadDeviceToken`,
which names the token and says nothing whatsoever about the environment being
the cause — so the obvious next move is to go looking at registration, which is
working fine.

The server defaults to `production`, because that is what a deployed server is
talking to. Set `APNS_ENV=sandbox` when testing against a locally built app.

Two more things that fail quietly and are worth checking before anything else:

- **`aps-environment` is static, and its default is wrong for us.** The
  `expo-notifications` config plugin writes the entitlement once at prebuild
  time — it does *not* vary by build configuration, and its default is
  `development`. `app.json` therefore passes `{ "mode": "production" }`, which
  is what a build headed for TestFlight needs.

  The cost is that `expo run:ios` now *requests* production too. Requests, not
  gets: the entitlements file only asks, the provisioning profile decides what
  may be claimed, and what APNs reads is the entitlement in the **signature of
  the installed binary**. A local run is signed against a Development profile,
  which permits only `development` — so the phone holds a sandbox token however
  `app.json` is set. Same three-way split as the table below, seen from the
  other end.

  To test push against a locally built app, point it at a server running
  `APNS_ENV=sandbox` — a local one. Not the deployed server: its testers hold
  production tokens, and flipping it breaks push for all of them at once.
  Flipping `mode` to `development` is then only housekeeping, making the file
  agree with what signing was going to do anyway.

  `codesign -d --entitlements - ` on the installed `.app` settles what a phone
  actually has, the file being no evidence.

- **Check the exported IPA, not the entitlements file and not the archive.**
  There are three artifacts and they disagree, which makes this easy to get
  wrong in either direction:

  | | |
  | --- | --- |
  | `app/ios/TheFloor/TheFloor.entitlements` | what the app *requests*; the plugin writes it |
  | `/tmp/thefloor.xcarchive` | signed against a **Development** profile by automatic signing — reads `development` even when the file says `production`, and that is expected |
  | the exported IPA | re-signed for distribution at export. **This is what ships.** |

  So an archive reading `development` proves nothing. To settle it:

      xcodebuild -exportArchive -archivePath /tmp/thefloor.xcarchive \
        -exportPath /tmp/thefloor-check -exportOptionsPlist <plist with
        destination=export> -allowProvisioningUpdates
      cd /tmp/thefloor-check && unzip -q TheFloor.ipa -d x
      codesign -d --entitlements - x/Payload/TheFloor.app | grep -A2 aps-environment

  Verified this way for builds 14 through 23: `production`.

  Note that this export **re-signs**, and Xcode's automatic build-number
  management can bump `CFBundleVersion` while doing it: the check on build 19
  produced an IPA reading 20 from an archive reading 19. That copy is local and
  is never uploaded, so it does not matter for what ships — but do not read the
  number off the *checked* IPA and conclude the wrong build went out. The
  archive's `Info.plist` is the honest answer, and TestFlight is the final one.
- **The App ID needs the Push Notifications capability** enabled in the
  developer portal, or signing refuses the entitlement. It is registered
  against `co.rvanegas.thefloor`, which survives `prebuild --clean` even though
  the local `ios/` does not.

### Known rough edges

- **A deploy costs presence, not channels.** This said a deploy destroyed
  every channel, which stopped being true on 2026-08-10 when `9761d72` made
  them survive a restart — and the line stayed, so it was still being believed
  and acted on a day later. `restore()` revives every unended channel from its
  state blob. What a restart does drop is `present`, `disconnectedAt`, the
  floor and any recording in flight: the process, not the place.
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
  is no longer true and it has not been observed either way, since nobody was
  talking during one. **A deploy that audibly interrupts a call is the signal to
  move the media plane to its own $7 box**, which planning/DECISIONS.md argues
  and `bin/provision-livekit` exists to make cheap. It is worth listening for
  rather than waiting to be told about.
- **`setSilenced` throws `participant does not exist` twice a second while a
  floor is held**, whenever a channel member is not connected to the media room
  — 89 in one test session, 470 on 2026-08-10. It is the loudest thing in the
  log by a wide margin and it is **not** a media-provider fault: it survived the
  2026-08-13 move from LiveKit Cloud unchanged, which was checked at the time
  precisely so it would not be misread later as a regression. Diagnosis, log
  greps and a deliberate reproduction are in planning/BACKLOG.md under Known
  defects.

---

## Before the first TestFlight build

Configuration decided 2026-08-09 and worth knowing the reasons for.

- **`supportsTablet` is now false.** Nothing in the layout adapts to a larger
  screen and nobody has opened it on an iPad. Claiming support invites App
  Review to test there, on a layout built for a phone. Turn it back on after
  actually looking at one.
- **`voip` removed from `UIBackgroundModes`, and still out.** It does nothing
  without PushKit, and reviewers have objected to apps declaring it unused.
  Push notification has since been picked up and this did *not* change: a
  visible alert needs neither `voip` nor `remote-notification`. It becomes load
  bearing only if PushKit and CallKit are adopted for call-like ringing.
- **`userInterfaceStyle` is `automatic`.** This said `dark`, and stopped being
  true when `app/src/ui/theme.ts` grew a light palette — the app follows the
  system now, and a screenshot of it in light mode is it working rather than
  failing. What the setting is *for* has not changed: it is what makes system
  surfaces — alerts, the keyboard, the status bar — match the app instead of
  rendering pale against a `#0E1013` screen.
- **`ITSAppUsesNonExemptEncryption: false`.** All traffic is HTTPS and WebRTC,
  which is the standard exemption. Declaring it stops App Store Connect asking
  on every single upload.
- **The iOS icon is the artwork now, rasterised from `the-floor-icon.svg`.**
  `app/assets/icon.png` and `app/assets/favicon.png` are generated from it; the
  SVG is the master, and neither PNG should be edited by hand. Regenerate with
  ImageMagick, rendering large and downsampling so the diagonal is smooth
  rather than stepped:

      magick -background white -size 4096x4096 the-floor-icon.svg \
        -resize 1024x1024 -alpha remove -alpha off -type TrueColor \
        -colorspace sRGB PNG24:app/assets/icon.png

  `-alpha remove -alpha off` is not decoration: **an iOS app icon with an alpha
  channel is rejected at upload.** The artwork is opaque either way — two
  triangles filling the square — so the channel would carry nothing and still
  fail the check.

  `bin/release-ios` runs `prebuild --clean`, which regenerates the whole
  `ios/` asset catalogue from `app/assets/icon.png`, so nothing else has to be
  copied anywhere for a build to pick this up.

- **The Android adaptive icon is the same artwork, in three layers**, though
  Android is not built or shipped here — there is no `android/`, and
  `bin/release-ios` is the only release path. It is preparation.

  The artwork is the **background** layer, full-bleed. It survives any launcher
  mask — circle, squircle, rounded square — because a diagonal through the
  centre stays a diagonal through the centre; having no focal mark is what
  makes it crop-proof rather than what puts it at risk.

  The **foreground** is a fully transparent 1024×1024 PNG. Expo requires the
  key, and the foreground is the layer launchers shift for parallax, so
  full-bleed art there would slide and expose an edge. The artwork belongs
  underneath it.

  The **monochrome** layer — the themed icon, Android 13+ — is the one that
  took a decision rather than a command. It has to be a single-colour shape on
  transparency, and a two-colour split has no silhouette, so the shape is the
  orange triangle: the upper-left half, the one that leads in the artwork. Black
  on transparent; the system tints it, and only the alpha channel is read.

  That silhouette is its own master, `the-floor-icon-mono.svg`, beside the
  full one — a second file rather than a `magick` incantation that crops the
  first, because which half it is is a decision and belongs somewhere legible.

      magick -background none -size 4096x4096 the-floor-icon-mono.svg -resize 1024x1024 \
        -type TrueColorAlpha -colorspace sRGB PNG32:app/assets/android-icon-monochrome.png

  `adaptiveIcon.backgroundColor` went from `#14162B` to `#5B6478`, the artwork's
  grey. The background *image* covers it, so it is only what shows if that ever
  fails to load — but a fallback in a colour from nowhere in the design was
  worse than one that matches.

- **The splash is still the Expo default.**

- **Availability is worldwide, and the donate link is filtered per person.**
  Guideline 3.1.1(a) permits buttons and external links to outside payment
  mechanisms *in the United States storefront* and prohibits them everywhere
  else — so what has to be US-only is the link, not the app. This was very
  nearly got wrong in the other direction: the original plan shipped US-only,
  which would have locked out non-US users who already existed.

  The filter is `server/src/region.ts`, fed by a locale and timezone the app
  reports. **Anything it is not sure about resolves to hidden.** If you ever
  change it, keep that asymmetry: showing the link outside the US storefront is
  a guideline violation, and hiding it inside costs one donation.

  Two global kill switches sit above it, both server-side and both a restart
  rather than a submission: unset `KOFI_URL`, or set every account's
  `donations_allowed` to 0. That is deliberate, because the US carve-out exists
  under an injunction still being appealed.

- **`NSMicrophoneUsageDescription` was wrong until 2026-08-14**, and it is the
  one string every user and every reviewer reads. It said "so the other person
  in a session can hear you": sessions became channels on 2026-08-10, and a
  channel holds up to `MAX_CHANNEL_PARTICIPANTS` rather than one other person.
  Worth re-reading whenever the vocabulary moves — nothing tests a permission
  string.

`buildNumber` must increase for each upload, even when the version does not —
and **`bin/release-ios` does that itself**, reading `app.json`, adding one, and
writing it back before it prebuilds. Bumping it by hand first is not an error
Apple will complain about, but it skips a number: doing both is what turned 23
into 25 and left build 24 never existing.

---

## `prebuild --clean` drops the signing team

`expo prebuild --platform ios --clean` regenerates `ios/` from scratch, which
discards `DEVELOPMENT_TEAM` and leaves the next archive failing with "Signing
for TheFloor requires a development team".

Pass it explicitly until something better exists:

    xcodebuild ... DEVELOPMENT_TEAM=9946JKHZUJ CODE_SIGN_STYLE=Automatic

Note too that changing `expo.name` renames the whole native project. It became
`TheFloor` when the display name did, so the workspace, scheme and source
directory all moved from `thefloor` to `TheFloor`. Anything with those paths
hard-coded breaks silently, and the error names a missing scheme rather than
the rename that caused it.

---

## Names, which are three different things

- **`The Floor`** — what appears under the icon. `CFBundleDisplayName`, set in
  `app.json`. Nine characters, inside the dozen or so iOS shows before
  truncating.
- **`The Floor Uninterrupted`** — the App Store listing name, registered
  2026-08-09. Both `The Floor` and `TheFloor` were already taken; listing names
  are unique across the whole store, and this one never reaches a device.
- **`co.rvanegas.thefloor`** — the bundle identifier, which is permanent once
  registered and is what actually identifies the app to Apple.

Worth writing down because only the first is in the codebase. The other two live
in App Store Connect, and a future reader finding "The Floor" everywhere in the
repo has no way to know the store calls it something else.
