# Working on The Floor

What you need before touching anything: how it is laid out, how to run it, how
to ship it, and the traps that have already cost somebody a day.

Three other documents, each answering a different question. **BACKLOG.md** is
what is known and not done. **DECISIONS.md** is what was built and why,
including what was deliberately not built. **FEATURES.md** is wanted features
nobody has designed yet.

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

Deployed to **https://thefloor.rvanegas.co**, first on 2026-08-09 and most
recently on 2026-08-10 with the channels rework.

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
| Instance | Lightsail `thefloor`, us-west-2a, Ubuntu 24.04, 2GB, $12/mo |
| Static IP | `44.241.121.49` |
| DNS | Namecheap, A record `thefloor` → that IP |
| TLS | Caddy, automatic Let's Encrypt, renews itself |
| Service | systemd `thefloor`, restarts on failure and on boot |
| Node | 22, required for the built-in `node:sqlite` |
| Database | `/home/ubuntu/thefloor-data/thefloor.db`, outside the synced tree |
| Logs | `journalctl -u thefloor` and `-u caddy` |

Node binds to loopback only; nothing reaches it except through Caddy.

### Credentials

Four, deliberately separate, so no single leak is worse than it has to be:

- **LiveKit** — media, held by the server.
- **`thefloor-egress`** — PutObject only, and it travels to LiveKit. It cannot
  read the bucket back, so a leak of the key a third party holds does not
  expose anyone's conversations.
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

`server/.env` on the box holds all of it, mode 600, and is excluded from the
sync so a deploy cannot overwrite it.

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

  Build 13 shipped before this was noticed, archived with `development`. The
  symptom would have been every token from TestFlight being a sandbox token
  against a production server: `BadDeviceToken`, blaming the token.

  The cost is that `expo run:ios` now produces production entitlements too. To
  test push against a locally built app, flip `mode` to `development` and set
  `APNS_ENV=sandbox` on whichever server it talks to — both, or neither.

  Check it after every `prebuild`, since that is what regenerates the file:

      grep -A1 aps-environment app/ios/TheFloor/TheFloor.entitlements
- **The App ID needs the Push Notifications capability** enabled in the
  developer portal, or signing refuses the entitlement. It is registered
  against `co.rvanegas.thefloor`, which survives `prebuild --clean` even though
  the local `ios/` does not.

### Known rough edges

- **A deploy destroys every channel.** Channels are in memory, and they are
  now permanent as far as the interface is concerned. See BACKLOG.md.
- **The 380-day-uptime box is not this one.** dianoia runs on a separate
  instance and was deliberately left alone — it owns ports 80 and 443 there
  with its own nginx and certbot.
- **`tsx` runs TypeScript directly in production.** Fine at this scale and it
  keeps the cross-package `core/` imports working without a build step, but a
  compile step would start faster and use less memory if that ever matters.

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
- **`userInterfaceStyle` is `dark`,** matching the interface. It said `light`,
  which left system surfaces — alerts, the keyboard, the status bar — rendering
  pale against a `#0E1013` app.
- **`ITSAppUsesNonExemptEncryption: false`.** All traffic is HTTPS and WebRTC,
  which is the standard exemption. Declaring it stops App Store Connect asking
  on every single upload.
- **Icons are still the Expo defaults.** A build will upload, and every tester
  gets a generic square.

`buildNumber` must increase for each upload, even when the version does not.

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
