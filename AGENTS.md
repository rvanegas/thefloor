# Working on The Floor

What you need before touching anything: how it is laid out, how to run it, how
to ship it, and the traps that have already cost somebody a day.

**The practices this project shares with others are technosophia's**, at
`~/src/technosophia`. `CLAUDE.md` imports its `WORKING.md` — trunk, the verbs,
one at a time and only when asked, commit subjects and trailers — which says
when to read the rest: `LANDING.md`, `PLANNING.md`, `INSTRUCTIONS.md`,
`SERVICES.md`, `CLIENTS.md`. An agent that does not follow `@` imports reads
`WORKING.md` first. What follows is what is The Floor's alone, and where it
departs.

**Scripts run as `ts <name>`**, from anywhere in the checkout: this project's
`bin/<name>` first, then technosophia's shared ones (`note`, `task`, `deploy`,
`deploys`, `health`, `db`, `env-pull`, `env-push`, `worktree-setup`,
`transcript`). `ts` alone lists both. The shared ones read `bin/ts.env`, never
ship what `bin/ts.rsync` excludes, and run this project's own steps from
`bin/hooks/`. `bin/restore-mtimes` is ours rather than the shared one, because
it knows the 2026-09-14 split.

## `planning/`

Laid out as technosophia's `PLANNING.md` says: `task/`, `backlog/` and
`decision/`, one file per item; a verb and a quoted title is a reference to a
file, resolved with `ts note find`; the archive is archaeology. Read it before
filing or resolving one. Particular to here:

- **The eleven closed decision volumes are frozen in
  `planning/decision/archive/`.** Match filenames first and the archive's
  headings (`grep -n '^## ' planning/decision/archive/*.md`) second, rather
  than sweeping the prose. The collection is approaching a megabyte.
- **Deploys are not in it.** `ts deploy` and `bin/restart-services` record
  themselves on the box and `ts deploys` reads them.
- **A submission's own text** is the one transient kind, under
  `planning/submissions/`, written by `bin/set-review-notes`.
- **A shipped design's reasoning is not always what the task that asked for it
  appears to ask for** — the entry *The Floor carries no video* is the one that
  caught somebody out. The queries such a design carried usually leave as a
  script in `bin/`, which is then the only thing that reads that data at all.

The standing documents, and when to read each:

**`planning/RELEASING.md`**: everything only somebody producing an iOS build
needs — `app.json`'s settings and their reasons, the icon rules that fail at
upload, `prebuild --clean` dropping the signing team, the entitlements three
artifacts disagree about, and **the five verbs** below. **Read it when you are
executing one of the deploy-related verbs, and not otherwise** — `deploy`,
`upload`, `submit`, `release`, before `ts deploy`, `bin/upload-ios` or
`bin/submit-ios`. It is forty-four kilobytes of procedure for a day that most
sessions never have.

**`planning/CREDENTIALS.md`**: the credentials, where each lives, what it can
do and what losing it costs. Read it before touching any of them,
`bin/provision`, `bin/provision-livekit`, or `server/.env`.

**`planning/APPREVIEWSCRIPT.md` and `planning/DEMO-ACCOUNT.md`**, both read at
submission time. The first is the *walk* — what found eight defects before
1.0.0 — on the premise that Apple requires no demo video and 1.2.0 went
without one; filming is the optional half. The second is the two accounts App
Review signs in as, why there are two, and the order they are torn down in.
**They outlive approval, because every update is reviewed** and the notes'
credentials have to work each time. Read it before deleting them or before
touching `REVIEW_IDENTIFIER` / `REVIEW_CODE` on the box — unsetting those
before the accounts are gone is how the rows become unreachable. The
credentials are in `~/.config/thefloor/demo-account.txt`, mode 600, on the same
reasoning as the `.p8` keys.

**`planning/STATES.md`**: what each state is called in each layer that has a
word for it, when it holds, and where two layers describe the same thing and
can differ. Read it before touching the floor, the microphone, presence, or the
audio session — and before "simplifying" anything that looks stated twice,
since several of those pairs are load-bearing. It carries the rule that the
audio session is configured from whether **anybody** present is capturing
rather than whether you are.

**`planning/GLOSSARY.md`** is **the source of truth for the vocabulary**, in
three parts — words a user meets, words that exist only in the code, and the
same words in Spanish. These nouns are mostly ordinary English used narrowly —
*present*, *live*, *member*, *seat* — and reading one the way English suggests
is how somebody builds the adjacent thing, twice so far. **This one is worth
reading routinely, and it is cheap to**: its § *Every term, in one line each*
is enough for ordinary work. These are the terms of communication, so a
session that has skimmed the list and one that has not are not having the same
conversation. Maintain it as `PLANNING.md` § *Standing documents* says: in the
same commit as the code, the one-line list included.

**`planning/STYLE.md`**: what the app looks like and why — the colour tokens
and which meaning each is spent on, the type roles and every departure, the
controls, the card and row shapes, the two pinned bars, the icons. **Read it
before adding or changing a screen, a control or a colour**; its § *The rules
that are actually load-bearing* is the half-dozen things that look like
tidying and are not. Maintained the same way as the glossary.

Two are one-offs that stay. **`planning/POSTMORTEM-echo.md`** is the build 17
echo bug, start to finish — read it before touching the iOS audio session,
since three separate components configure it and the ways they disagree are not
guessable from the code. **`planning/MIGRATION.md`** carries the sizing argument
in both directions, from the 2026-08-13 migration to a *smaller* instance that
was abandoned before cutover when self-hosting the media inverted its premise.
Read it before sizing, rebuilding or re-hosting the server, and before trusting
`bin/provision`, `bin/provision-livekit` or `ts deploy`'s health check about
any box that is not the live one.

## Keeping this file small, which is a standing job

**technosophia's `INSTRUCTIONS.md` is the rule; read it before adding here.**
This file is loaded in full into every session, so a paragraph here is paid for
every time and a paragraph in `planning/` only when somebody goes looking.

**Keep it under 550 lines, and nearer 500.** It is 306 now. **Correct that
figure in the same commit as any change to this file** — it was once 54 lines
stale.

What earns its place here is what stops somebody losing a day: `APNS_ENV`, and
the `.p8` keys living outside a tree that `ts deploy` rsyncs with `--delete`.
Those stay verbatim however long the file gets. The splits so far, by *who
needs it*: RELEASING.md, CREDENTIALS.md and INFRASTRUCTURE.md. A trap that
bites outside its subject stays here even so — `APNS_ENV` reads like release
material and costs an afternoon to somebody testing push locally.

---

# Expo HAS CHANGED

This project is on **Expo SDK 55**. Read the exact versioned docs at
https://docs.expo.dev/versions/v55.0.0/ before writing any code.

It is on 55 rather than the latest because the upgrade goes one SDK at a time,
and 56 needs Xcode 26.4 and raises the iOS floor to 16.4. Read
`planning/task/upgrade-expo-and-react-native.md` before proposing the next.

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

**Several source files are past the 2,000-line read limit** — `channels.ts`,
`ChannelView.tsx` and `app.ts` today; `wc -l` is the current list. Grep for the
line and read the range (`INSTRUCTIONS.md` § *Reading large files*).

**They are three packages, not an npm workspace**: each owns a lockfile and a
`node_modules`. `ts worktree-setup` installs all three in a fresh worktree and
copies `app/.env`, without which the app builds and then draws a "Not
configured" screen. `server/.env` is deliberately not copied.

---

## Running the suite

`npm test` and `npm run typecheck` from the repo root run all three packages;
both are `scripts` entries in the root `package.json`, which is where to look
for the per-package variants rather than here. The suite runs technosophia's
`note check` by path, so `~/src/technosophia` (or `$TECHNOSOPHIA`) has to be
there.

---

## Branches, tags, and what is actually in people's hands

Trunk, the verbs and landing are technosophia's (`WORKING.md`, `LANDING.md`).
Particular to here:

- **Five verbs: land, deploy, upload, submit, release.** `upload` sends a
  build to App Store Connect; `submit` puts an uploaded one in front of
  review; `release` makes an approved one downloadable. The table with what
  each costs is RELEASING.md § *The five verbs, which are five different days*,
  and § *One verb does not imply the others*.
- **`ts deploy` stamps `server/deployed.json`** with the sha, `-dirty` when the
  tree was; `GET /healthz` and the startup log report it, and `ts health`
  compares it with this checkout.
- **Every upload is tagged `build/<n>`, by `bin/upload-ios`**, and **`released`
  points at what is downloadable** (`CLIENTS.md` § *Tags*). `bin/submit-ios
  --status` is the second opinion, since what is downloadable is a state Apple
  holds rather than a ref.
- **`MIN_SUPPORTED_BUILD` in `server/src/release.ts` is the compatibility
  floor** (`CLIENTS.md` § *The compatibility floor*). The client enforces it
  since 2026-08-17. Builds before 37 send no build number at all and are
  counted as `silentBuilds` on `/healthz`; raising the floor past them expires
  installs nobody can see. **Builds up to 51 predate the expiry client** and
  can never be shown the update screen, so the floor moves only once
  `oldestBuild` has already passed it. **SHIMS.md says what moving it frees**,
  the only reason to care what it is.

---

## Deployment

Deployed to **https://thefloor.rvanegas.co**, first on 2026-08-09. **This
section carries no deploy and no sha**: `ts health` measures what is running —
the commit, whether that is this checkout's HEAD, the compatibility floor and
the build census, with `--raw` for the body. `ts deploys` is what each deploy
*was*, newest first.

`ts deploy` runs `bin/hooks/deploy-pre` first — the core and server tests, the
type checks (the app's only warns), and the guest page's bundle — and refuses
a dirty tree before it does either. After the sync, `deploy-remote` installs
and restarts on the box: **live channels live in memory, so a restart drops
every call in progress.** Once the box answers with the sha just sent,
`deploy-post` says whether the floor is due to rise and which media-plane
services are stale (`bin/restart-services --list`). Never acted on.

**Wire changes go in two steps** (`CLIENTS.md`): the 2026-08-10 Session →
Channel rename killed build 5 the instant the server restarted. **Whatever is
added at step one gets an entry in `planning/SHIMS.md` in the same commit**;
read it when the floor moves and at no other time.

### The box itself is planning/INFRASTRUCTURE.md

The instance, static IP, DNS, TLS, services, which ports are exposed and why,
and the logs; the two media settings that fail silently when wrong
(`rtc.use_external_ip`, and `udp_port` being mutually exclusive with
`port_range_start`/`end`); what the box can carry before recording capacity
bites; and the known rough edges — what a deploy costs, and what a restart
does to audio in flight. **Read it before touching the box, before sizing it,
and before believing a restart is free.**

### Credentials

**Which ones there are, where each lives, what it can do and what losing it
costs is planning/CREDENTIALS.md, entire.** This file keeps no names and no
numeral. **Read it before touching any credential, `bin/provision`,
`bin/provision-livekit`, `ts env-pull`/`ts env-push`, or `server/.env`** — and
before assuming a credential this project *issues* rather than holds is out of
scope, since the session token is in there too. Its § *What to read, and when*
is a row per credential.

One rule from it stays here, because it bites somebody who is merely deploying:
**both `.p8` keys live outside the synced tree**, under `~/.config/thefloor`,
because `ts deploy` rsyncs with `--delete` — a key inside the tree is one a
later deploy removes. `*.p8` is in `.gitignore` and in `bin/ts.rsync`, both
deliberately.

### `APNS_ENV` is the setting that will cost you an afternoon

A device token minted by a debug build (`expo run:ios`) is valid **only**
against `api.sandbox.push.apple.com`; one from TestFlight or the App Store only
against `api.push.apple.com`. Cross them and APNs answers `BadDeviceToken`,
which names the token and says nothing whatsoever about the environment being
the cause — so the obvious next move is to go looking at registration, which is
working fine.

The server defaults to `production`, because that is what a deployed server is
talking to. Set `APNS_ENV=sandbox` when testing against a locally built app.

**The entitlement is static and its default is wrong for us**, so `app.json`
passes `{ "mode": "production" }` — which means `expo run:ios` *requests*
production too. Requests, not gets: the entitlements file only asks, the
provisioning profile decides what may be claimed, and a local run is signed
against a Development profile — so the phone holds a sandbox token however
`app.json` is set. `codesign -d --entitlements -` on the installed `.app`
settles what a phone actually has; the file is no evidence.

Which of three artifacts to check, why an archive reading `development` proves
nothing, and the `xcodebuild -exportArchive` recipe that settles it — with the
three authentication flags it needs — are in planning/RELEASING.md § *What the
app requests, what it gets, and how to check*, along with the App ID's Push
Notifications capability.

---

## Getting a build to users

All of it is in **planning/RELEASING.md** — the five verbs and what each costs,
what `app.json` is set to and why, the icon that is rejected at upload if it
carries an alpha channel, and `prebuild --clean` dropping `DEVELOPMENT_TEAM`.

**Read it before running `bin/upload-ios` or `bin/submit-ios`** — the second
prepares a submission and deliberately stops before the button, since that
PATCH is the irreversible half. The trap that bites outside that stayed here:
`APNS_ENV` above.

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
