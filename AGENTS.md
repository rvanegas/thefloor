# Working on The Floor

What you need before touching anything: how it is laid out, how to run it, how
to ship it, and the traps that have already cost somebody a day.

Everything that is not this file lives in **`planning/`**. This one stays at the
root because it is the one a fresh reader is pointed at; the rest are documents
you go looking for, and a root directory that lists them all buries the code.

Three of them answer a standing question each. **`planning/BACKLOG.md`** is what
is known and not done. **`planning/DECISIONS.md`** is what was built and why,
including what was deliberately not built. **`planning/TASKS.md`** is the
roadmap, at a paragraph each — features, but also audits, open questions and
things to go and find out, which is why it is not called FEATURES.

**Any verb followed by a quoted string that matches a `##` heading in
`planning/TASKS.md` is a reference to that entry, and is not itself a
description of the work.** `Do task "Track Usage"`, `Implement "Track Usage"`
and `Start on "Track Usage"` all mean the same thing. Go and read the entry
before anything else; the paragraph under the heading is the request, and
everything the title leaves out is in it. Taking the title at face value and
starting to write is how you build something adjacent to what was asked for.

**The verb is not part of the convention** — it says what is wanted done, which
varies, since a good half of these entries are questions rather than features.
The match on the heading is what makes it a reference. If a quotation happens to
coincide with a heading and the surrounding request is plainly about something
else, it is a coincidence; read it as context tells you to, and say which way
you read it. Items in `BACKLOG.md` are named explicitly instead, until this
convention is extended to cover them.

`DECISIONS` is **more than one file**. `planning/DECISIONS.md` is always the
live volume and the only one new decisions are appended to; closed volumes are
`planning/DECISIONS-<first date>-to-<last date>.md`. The first,
`planning/DECISIONS-2026-08-07-to-2026-08-13.md`, runs from the beginning to the
day the media server came off LiveKit Cloud; the second ends at the first App
Review submission, which is the seam between a project with no installed
population and one with. **The later ones are cut where the line count fell,
not at a seam**, and say so. The live volume's header carries the index and the
rule for closing it. **Grep across the set** — `planning/DECISIONS*.md` —
rather than the live one alone, or you will search only the last few days of
the project's reasoning.

**`planning/RELEASING.md`** answers a fourth, and is different in kind from the
rest: it is not deferred work or history but standing guidance that was in this
file until 2026-08-15. Everything only somebody producing an iOS build needs —
`app.json`'s settings and their reasons, the icon rules that fail at upload,
`prebuild --clean` dropping the signing team, and **the five verbs** below.
Read it before `bin/upload-ios`.

**`planning/CREDENTIALS.md`** is the second of that kind, split out the same
day: the seven credentials, where each lives, what it can do and what losing it
costs. Read it before touching any of them, `bin/provision`,
`bin/provision-livekit`, or `server/.env`.

The rest are temporary, and say so in their own first lines. Designs for
unbuilt work — **`planning/ANONWEB.md`**, **`planning/WATCHPARTY.md`** — are
deleted when the work ships, with whatever survives moving to `DECISIONS.md`.
`planning/USAGE.md` was the third and went that way on 2026-08-19: the reasoning
is `DECISIONS-2026-08-16-to-2026-08-19.md` § *The meter is two tables and a
script*, and the queries it carried are `bin/usage`, which is the only way
anything reads those tables.
The three App Store files — `APPREVIEW.md`, `APPREVIEW2.md` and
`APPREVIEWSCRIPT.md` — were exactly that, and were deleted on 2026-08-19 when
1.0.0 was approved and released. Everything in them that recurs went to
`planning/RELEASING.md` first, and the open policy questions they carried went
to `planning/BACKLOG.md`. **`APPREVIEWSCRIPT.md` is back, for 1.2.0** — a
walkthrough is per-release, and the 1.0.0 recording shows none of guests, the
clipboard or notification settings. `planning/review-notes-1.2.0.txt` and
`planning/whats-new-1.2.0.txt` are the text of that submission, and all three go
when it is approved.

**`planning/DEMO-ACCOUNT.md`** looked temporary in the same way and is not: the
two accounts App Review signs in as, why there are two rather than one, and the
order they have to be torn down in. **They outlive approval, because every
update is reviewed** and the notes' credentials have to work each time — the
file said otherwise until the day it mattered. Read it before deleting them, or
before touching `REVIEW_IDENTIFIER` / `REVIEW_CODE` on the box — unsetting those
before the accounts are gone is how the rows become unreachable. The credentials
are not in it; they are in `~/.config/thefloor/demo-account.txt`, mode 600, on
the same reasoning as the `.p8` keys.

**`planning/STATES.md`** is the third of the standing kind, split out
2026-08-18: what each state in this system is called in each layer that has a
word for it, when it holds, and where two layers describe the same thing and can
differ. Read it before touching the floor, the microphone, presence, or the
audio session — and before "simplifying" anything that looks stated twice, since
several of those pairs are load-bearing. It carries the rule that the audio
session is configured from whether **anybody** present is capturing rather than
whether you are, and the reason the resulting mono/stereo transition is a
feature rather than a blemish.

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

## Keeping this file small, which is a standing job

**This file is loaded in full into every session, before anybody types
anything.** Nothing reads it in segments. Everything in `planning/` is read only
when somebody goes looking, so a paragraph there is free until it is needed and
a paragraph here is paid for every time. That asymmetry is the whole reason for
the split, and it decays quietly: the natural place to write down what just
happened is the file already open, which is this one.

**Keep it under 650 lines, and nearer 600.** It is 629 now, having been 728,
then 650, then 600 — all on 2026-08-15, which is also the day this number was
found to be 54 lines stale, reporting 546 against a real 600. **Correct it in
the same commit as any change to this file**, or the rule governs against a
figure nobody has checked: it was claiming 104 lines of headroom when there
were 50. The two splits it records are the iOS release material to
`planning/RELEASING.md` and the credentials to `planning/CREDENTIALS.md`. The
headroom is about one deploy wide on purpose: each new one displaces the last,
so the file should sit still rather than climb.

When it passes 650, **do not shave the traps.** Almost all of the excess will be
one of these:

- **Deploy narrative.** `## Deployment` keeps the *most recent* deploy and
  nothing else. When a new one lands, the one it replaces goes to
  `planning/DECISIONS.md` under `## The deploy history`, newest first, verbatim
  — the verification counts and the which-build-kept-working notes are the
  valuable part and are not to be summarised away in the move.
- **Reasoning about unshipped work.** Belongs in `planning/DECISIONS.md`, or in
  its own `planning/` design document if it is still being decided.
- **The story behind a rule.** Keep the rule and the cost of breaking it; move
  the account of the afternoon it cost, leaving a pointer.

What earns its place here is what stops somebody losing a day: `APNS_ENV`, the
three artifacts that disagree about entitlements, `rtc.use_external_ip`, the
`.p8` keys living outside a tree that `bin/deploy` rsyncs with `--delete`. Those
stay verbatim however long the file gets — the density of the prose is not the
problem, accumulation is.

**When the traps alone reach the limit, split thematically rather than shave.**
Take a subject that a whole class of work never touches, move it to
`planning/` entire, and leave a section here that names the traps it contains
and says when to go read it. Nothing is summarised away, and the sessions that
do not need it stop paying for it — which is the same asymmetry the split from
`planning/` was for, applied one level in. `planning/RELEASING.md` was the first
of these and `planning/CREDENTIALS.md` the second, and they show the shape: the
seam is *who needs it*, not *how old it is*.

A trap that bites outside the subject stays here even when it looks like it
belongs there — `APNS_ENV` reads like release material and costs an afternoon to
somebody testing push locally, and the `.p8` keys sit outside the tree because
of `bin/deploy`, so that rule is quoted back into `### Credentials`. A trap
wrapped around material that is staying does not move either:
`rtc.use_external_ip` is inside `### What is where`, and separating it from the
inventory would leave it without the thing it is about.

Trimming is not a separate errand. Do it in the same commit as whatever added
the material, while the judgement about what is durable is still fresh.

**The `DECISIONS` volumes have a cap of their own: 2,000 lines each.** Not for
context — nothing loads them unprompted — but because a plain read stops at
2,000 and what it drops is the tail, which in an append-only file is the newest
material and the most likely to matter. The notice is easy to miss in a file
that reads like an archive.

**Roll over rather than look for a seam**, which is the rule as of 2026-08-21:
if the entry you are about to write would take the live volume past 2,000
lines, close it first and make that entry the first of the next one. The live
volume's header says how. The first three volumes were cut at seams that meant
something and it was worth doing while they were obvious; hunting for one under
a line-count deadline turns a filing decision into an argument about what an
epoch is, in the middle of the work that raised it. Volumes closed by rollover
say so in their own headers, so nobody reads meaning into where they stop.

Line *length* is not a constraint worth thinking about — a read truncates at
2,000 characters and the prose here wraps at 79.

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

`npm test` and `npm run typecheck` from the repo root run all three packages;
both are `scripts` entries in the root `package.json`, which is where to look
for the per-package variants rather than here.

The per-behaviour table of which test covers what has been dropped: it
duplicated the suite and went stale faster than the code did. The tests are the
record.

---

## Branches, tags, and what is actually in people's hands

Adopted 2026-08-15, once there was a submitted build to be wrong about. The
reasoning is in planning/DECISIONS-2026-08-13-to-2026-08-15.md; these are the
rules.

- **`master` is trunk and is the only thing deployed.** Work on short-lived
  branches, merge back. There is no develop branch and no release branches.
- **Five verbs, and none of them is a synonym for another: land, deploy,
  upload, submit, release.** Adopted 2026-08-21, because *release* had been
  doing duty for both "put a build in TestFlight" and "put a build in front of
  App Review" while the `released` tag meant neither. `land` merges and pushes
  and reaches nobody; `deploy` reaches everybody in a minute; `upload` sends a
  build to App Store Connect; `submit` puts an uploaded one in front of
  review; `release` makes an approved one downloadable. The table with what
  each costs is RELEASING.md § *The five verbs, which are five different days*.
  **Say the one you mean** — a session told to "ship it" has to guess between
  two commands, days apart, one of which is irreversible.
- **"Land it" means merge, push and clean up, in one phrase, and puts the
  change in nobody's hands.** Get the branch onto `master`, **push `master` to
  the origin**, remove the worktree if the work was done in one, delete the
  branch locally and on the origin. Landing is not shipping: the box does not
  have it until a deploy, and a phone does not until an upload, a submission,
  an approval and a release. The push
  is not optional and is the step that gets skipped: a change that has landed
  only on one machine is one that every other checkout, and any `bin/deploy`
  run from one, silently does not have — and since `bin/deploy` rsyncs the
  working tree rather than a ref, the box can be running it while the origin
  has never heard of it. Fast-forward when it is possible; when the branch
  has fallen behind, rebase onto `master` and fast-forward that. **Rebase only
  while nobody else has the branch** — it rewrites commits that are already
  pushed, so it needs a force-push, which is harmless for a branch one session
  made and is not harmless once anything pulls it. When it is shared, or when
  the rebase throws conflicts whose resolution is a judgement rather than a
  formality, make an ordinary merge commit instead and say so. Landing is not
  the moment to be inventing what the change meant. The worktree goes *before*
  the branch — git refuses to delete a branch that is checked out somewhere,
  and the error names neither the worktree nor which one. A session working
  inside a worktree has to leave it first, since the merge has to happen where
  `master` is checked out.
- **Landing is manually triggered, every time, and is never something a
  session decides to do.** Adopted 2026-08-22. Finish the work, commit it on
  the branch, say it is ready, and stop. Somebody says "land it" or it does
  not land — and having been asked once does not license the next one.
  **The reason is not the merge and not the race.** Several sessions do work
  this repository at once from separate worktrees, and `master` moved twice
  under one session in the afternoon this was written — but sequencing alone
  could be delegated, to inter-session coordination or to a queue. What cannot
  be delegated is knowing that a piece of work is *finished*. A session cannot
  tell whether more will be asked of it in the same context a minute from now;
  the person at the prompt is holding that picture across every session at
  once, which ones are done and which are still going. **So it is a rule about
  who knows the work is over, not about who is careful with git**, and merging
  well is not a substitute for being asked.

  Once asked, the mechanics have to assume `master` has moved, which is where
  the concurrency does bite. **Re-read it at the moment of merging, not
  before**: rebase
  onto what is there now, re-run the tests if the rebase moved anything, and
  only then fast-forward. `--ff-only` is the guard that makes a stale
  assumption fail loudly instead of inventing a merge commit — use it rather
  than trusting a fast-forward checked a minute ago. And `git branch -d`
  refuses a branch whose *upstream* has diverged even when `master` already
  contains every commit, which is what rebasing an already-pushed branch
  leaves behind; reading that refusal as "not merged" is how somebody talks
  themselves out of a landing that was complete.
- **A fresh worktree has no dependencies. Run `bin/worktree-setup` in it first.**
  The three packages are not an npm workspace: each owns a lockfile and a
  `node_modules`, all ignored, so git populates a worktree with none of them and
  the first `npm test` fails as `jest: command not found` — which reads like a
  broken toolchain rather than the missing install it is. **Do not symlink the
  main checkout's modules.** `npm install` resolves the link and writes through
  it, so a branch that bumps a dependency changes what master builds against;
  the script refuses a tree set up that way, and one such link reached a commit
  already. Installing per worktree costs disk and a few minutes and nothing else.
- **`bin/deploy` rsyncs the working tree, not a git ref**, deliberately — so it
  stamps `server/deployed.json` with the sha, marked `-dirty` when the tree
  was. `GET /healthz` and the startup log report it, and the deploy now fails
  if the box comes back not reporting the sha just sent. **Since 2026-08-21 it
  refuses a dirty tree unless you pass `--dirty`**, which is the same trade
  `bin/db --write` makes: shipping the working tree means unrelated work in
  progress rides along, and whoever runs it is usually deploying for a
  different reason. The box sat on `cc0e8a9` for a day from exactly that.
- **Every upload is tagged `build/<n>`, by `bin/upload-ios`**, which refuses a
  dirty tree: a tag is permanent where a deploy is reversible. Tags are not
  pushed automatically; the command is printed.
- **`released` points at what is downloadable.** It moves on release, not
  approval — which is why the release is manual. `git diff released..master` is
  the drift users cannot see. **It is at `build/51` since 2026-08-19**, that
  being the first public build; 52 was already in TestFlight and was passed
  over, because the declaration to Apple stays clear when what was approved is
  what ships.
- **`MIN_SUPPORTED_BUILD` in `server/src/release.ts` is the compatibility
  floor**: a shim may be deleted only once the floor has passed the build that
  needed it. The server enforces nothing, but **the client does, since
  2026-08-17** — an app below the floor replaces itself with an update screen
  and disconnects, so raising this number now ends sessions on phones rather
  than merely licensing a deletion. Builds before 37 send no build number at
  all and are counted as `silentBuilds` on `/healthz`; raising the floor past
  them expires installs nobody can see. **And build 51 is below all of that**:
  it announces which build it is but predates the expiry client by hours, so
  the first public build is one that can never be shown the update screen and
  has to be waited out instead. See RELEASING.md.

The thing to hold on to: **the App Store is not a version, it is a
population.** What the server owes compatibility to is the oldest build still
installed, which is not the newest released one and is not something a branch
can represent.

---

## Deployment

Deployed to **https://thefloor.rvanegas.co**, first on 2026-08-09.

**This section carries the most recent deploy and nothing else.** Every earlier
one is in planning/DECISIONS.md under `## The deploy history`, newest first —
which build kept working across which restart, and what was verified against
production each time. Look there before assuming a behaviour is new.

Most recently on 2026-08-23, `0d5476c` → `306dc5f`, which is nineteen commits
rather than one: the notification levels, the two push stacks, the phone
clearing announcements that have stopped being true, the ping on the nearby
card, and a floor claim cut from three minutes to sixty seconds. Most of it had
landed over the preceding day and none of it had been deployed — **a deploy
carries whatever has landed, not what the session that ran it was working on**,
and the two drift apart when several sessions land in a day and nobody deploys.

The claim length is the only wire-visible behaviour in it. `FLOOR_CLAIM_MS` is
in `core/`, which both ends import, so an install below build 79 counts down
from three minutes while the server releases at sixty seconds; the server is
authoritative and the release arrives as a snapshot with a null holder, so the
old countdown stops early. Nothing else about the protocol moved.

Verified against production afterwards: `/healthz` on `306dc5f`,
`deployed.json` stamped clean, `FLOOR_CLAIM_MS = 60_000` in the synced tree,
the service active. A burst of `requested room does not exist` from `closeRoom`
at startup is **not** new — one at each of the last seven restarts, `restore()`
closing LiveKit rooms that went with the old process.

Read `/healthz` before assuming this section is current. It was a day stale here
once already, and that is how it will fail again.

The one number to know before it surprises somebody: **`track_cpu_cost: 0.15` in
`/etc/livekit/egress.yaml` caps the box at ~10 simultaneous recorded
participants**, every stem being its own egress job. That is a chosen figure and
raising it is the first move if it ever bites, not a hardware limit —
`bin/usage peak` says how close it has ever come.

`bin/deploy` syncs the server, reinstalls, restarts, and waits for health. It
runs the tests first and refuses to continue if they fail, and refuses a dirty
tree before it does either — `--dirty` if you mean it.

### Never ship a wire change to a server before the client can speak it

The 2026-08-10 Session → Channel rename broke every installed client on
purpose: the server deploys in a minute and a new iOS build reaches a phone via
App Store Connect processing plus whenever a tester updates, so build 5 was dead
the instant the server restarted and stayed dead until build 6 landed. It was
accepted only because the only installs were the author's. **It is not a choice
that survives having users.** The way to avoid it is the ordinary two-step:
teach the server the old names as aliases, deploy that first, ship the client,
remove the aliases a release later. What broke, and the migration that went with
it, is in the first `DECISIONS` volume.

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
wins. Both are covered at length in the first `DECISIONS` volume.

The media plane is deliberately *not* in `bin/provision`. It is
**`bin/provision-livekit`**, a sibling, run after it — which is exactly what a
second box would need if the media ever splits off this one.

### Credentials

Seven, deliberately separate, so no single leak is worse than it has to be: the
self-issued **LiveKit** key that mints join tokens for any room,
**`thefloor-egress`** (PutObject only), **`thefloor-server`** (SES plus
recordings `GetObject`, and the configuration-set trap that scopes an SES policy
wrongly everywhere else), the **APNs `.p8`**, the **App Store Connect key** and
its Admin-role requirement, and the **Ko-fi verification token**. Where each
lives, what it can do and what losing it costs are in planning/CREDENTIALS.md.

**Read that before touching any credential, `bin/provision`,
`bin/provision-livekit`, `bin/env-pull`/`bin/env-push`, or `server/.env`.** Moved there on 2026-08-15 when this
file hit its limit a second time: it is needed by somebody provisioning,
rotating a key or debugging an auth failure, and by nobody writing app or core
code.

One rule from it stays here, because it bites somebody who is merely deploying:
**both `.p8` keys live outside the synced tree**, under `~/.config/thefloor`,
because `bin/deploy` rsyncs with `--delete` — a key inside the tree is one a
later deploy removes. `*.p8` is in `.gitignore` and in the deploy excludes, both
deliberately.

`server/.env` on the box holds all of it, mode 600, and is excluded from the
sync so a deploy cannot overwrite it — `server/.env.example` documents every
line, secret and setting alike.

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

      ASC=~/.config/thefloor/asc
      KEY=$(ls $ASC/AuthKey_*.p8 | head -1); KID=$(basename "$KEY" .p8); KID=${KID#AuthKey_}
      xcodebuild -exportArchive -archivePath /tmp/thefloor.xcarchive \
        -exportPath /tmp/thefloor-check -exportOptionsPlist <plist with
        destination=export> -allowProvisioningUpdates \
        -authenticationKeyPath "$KEY" -authenticationKeyID "$KID" \
        -authenticationKeyIssuerID "$(tr -d '[:space:]' < $ASC/issuer-id)"
      cd /tmp/thefloor-check && unzip -q TheFloor.ipa -d x
      codesign -d --entitlements - x/Payload/TheFloor.app | grep -A2 aps-environment

  **The three authentication flags are not optional, and this recipe was
  missing them until build 36.** Without them the export fails with `No
  Accounts` and `No signing certificate "iOS Distribution" found` — the export
  re-signs for distribution, Apple holds that certificate, and fetching it is a
  signing-asset operation needing the App Store Connect key. It is the same
  failure `bin/upload-ios` exists to avoid, met by a command that had not been
  given the same treatment.

  Verified this way for builds 14 through 23, and for **36**: `production`.

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
  is no longer true. **A deploy that audibly interrupts a call is the signal to
  move the media plane to its own $7 box**, which the first `DECISIONS` volume
  argues and `bin/provision-livekit` exists to make cheap. It is worth listening
  for rather than waiting to be told about.

  **Half-observed on 2026-08-19**, and the half that was observed is the less
  interesting one. Somebody was present in a channel through a restart and saw
  nothing: the socket dropped, the client re-entered from the set of channels
  `socket.ts` keeps for exactly that, and the screen never changed. So presence
  recovery works outside its tests. But **nobody was talking**, so what a
  restart does to audio in flight is still unheard — and the case worth hearing
  is not silence but a claimed floor, since a restart drops the floor while the
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
  other. planning/DECISIONS-2026-08-13-to-2026-08-15.md carries the logs.


  The same change retired what used to be the loudest thing in the log by a wide
  margin — `participant does not exist`, twice a second for as long as a claim
  lasted, 470 on 2026-08-10 — by asking the room who is in it rather than
  guessing from channel membership. If it ever comes back, that is the
  regression.

---

## Getting a build to users

All of it is in **planning/RELEASING.md** — the five verbs and what each costs,
what `app.json` is set to and why, the icon that is rejected at upload if it
carries an alpha channel, and `prebuild --clean` dropping `DEVELOPMENT_TEAM`.
Moved there on 2026-08-15 when this file hit its limit: it is needed by
somebody producing a build and by nobody else, which is most sessions.

**Read it before running `bin/upload-ios` or `bin/submit-ios`** — the second
prepares a submission and deliberately stops before the button, since that
PATCH is the irreversible half. The two traps that bite outside
that stayed here: `APNS_ENV` above, and the three artifacts that disagree
about entitlements.

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
