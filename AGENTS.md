# Working on The Floor

What you need before touching anything: how it is laid out, how to run it, how
to ship it, and the traps that have already cost somebody a day.

Three other documents, each answering a different question. **BACKLOG.md** is
what is known and not done. **DECISIONS.md** is what was built and why,
including what was deliberately not built. **FEATURES.md** is wanted features
nobody has designed yet.

**POSTMORTEM-echo.md** is a one-off: the build 17 echo bug, start to finish.
Read it before touching the iOS audio session — three separate components
configure it and the ways they disagree are not guessable from the code.

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

Most recently twice on 2026-08-12: recordings moved to the channel they were
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

Five, deliberately separate, so no single leak is worse than it has to be:

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
