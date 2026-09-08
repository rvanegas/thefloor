# Working on The Floor

What you need before touching anything: how it is laid out, how to run it, how
to ship it, and the traps that have already cost somebody a day.

Everything that is not this file lives in **`planning/`**. This one stays at the
root because it is the one a fresh reader is pointed at; the rest are documents
you go looking for, and a root directory that lists them all buries the code.

Three of them answer a standing question each. **`planning/BACKLOG.md`** is what
is known and not done; **`planning/decisions/`** is what was built and why,
including what was deliberately not built; **`planning/TASKS.md`** is the
roadmap, at a paragraph each — features, but also audits, open questions, and
things to go and find out.

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

**Decisions are one file each**, since 2026-09-07, in `planning/decisions/`,
named `<date>-<title>.md`. Writing one means adding a file and nothing else —
no volume to choose, no cap to check, no rollover. `planning/decisions/README.md`
is the whole convention, and the reason it replaced an append-only volume:
two worktrees landing in the same week used to conflict at the same place every
time, and the surgery to avoid that went wrong in both directions. The eleven
closed volumes are frozen in `planning/decisions/archive/`.

**It is archaeology, for the exceptional case, and is not consulted as a matter
of course.** The collection is approaching a megabyte, and this file used to say
to grep all of it — which for a common word like `channel` returns eighty
kilobytes and costs more than everything else a session reads put together.
Enough to know it is there. Go in when a comment or a decision in the code is
genuinely inexplicable and knowing why would change what you do; then match the
filenames first, and the archive's headings
(`grep -n '^## ' planning/decisions/archive/*.md`) second, rather than sweeping
the prose.

**The exception is `planning/decisions/deploy-history.md`**, which is written to
on every deploy and is the one part of the collection still in routine use.

**`planning/RELEASING.md`** answers a fourth, and is different in kind from the
rest: it is not deferred work or history but standing guidance that was in this
file until 2026-08-15. Everything only somebody producing an iOS build needs —
`app.json`'s settings and their reasons, the icon rules that fail at upload,
`prebuild --clean` dropping the signing team, the entitlements three artifacts
disagree about, and **the five verbs** below.

**Read it when you are executing one of the deploy-related verbs, and not
otherwise.** `deploy`, `upload`, `submit`, `release` — before `bin/deploy`,
`bin/upload-ios` or `bin/submit-ios`. It is forty-four kilobytes of procedure
for a day that most sessions never have, and reading it speculatively is the
single most expensive thing this file used to imply.

**`planning/CREDENTIALS.md`** is the second of that kind, split out the same
day: the nine credentials, where each lives, what it can do and what losing it
costs. Read it before touching any of them, `bin/provision`,
`bin/provision-livekit`, or `server/.env`.

The rest are temporary and say so in their own first lines, and **this file
names none of them, deliberately** — every such list it has kept was wrong
within a fortnight, pointing at a design that had shipped or a file that had
been deleted. `ls planning/` is the current list. Two kinds recur: a **design
for unbuilt work**, deleted when the work ships with whatever survives moving to
`decisions/`; and a **submission's own text**, written by `bin/set-review-notes`
and gone when that version is approved.

**A shipped design's reasoning is not always what the task that asked for it
appears to ask for** — the entry *The Floor carries no video* is the one that
caught somebody out. This is the exceptional case the section above licenses:
when you are about to contradict something that was clearly decided, go and
find the entry. The queries such a design carried usually leave as a script in
`bin/`, which is then the only thing that reads that data at all.

**Two more are standing rather than temporary, and both are read at submission
time.** `planning/APPREVIEWSCRIPT.md` is the *walk* — what found eight defects
before 1.0.0 — on the premise that Apple requires no demo video and 1.2.0 went
without one; filming is the optional half. `planning/DEMO-ACCOUNT.md` is the
two accounts App Review signs in as, why there are two, and the order they are
torn down in. **They outlive approval, because every update is reviewed** and
the notes' credentials have to work each time. Read it before deleting them or
before touching `REVIEW_IDENTIFIER` / `REVIEW_CODE` on the box — unsetting
those before the accounts are gone is how the rows become unreachable. The
credentials are in `~/.config/thefloor/demo-account.txt`, mode 600, on the same
reasoning as the `.p8` keys.

**`planning/STATES.md`** is the third of the standing kind: what each state is
called in each layer that has a word for it, when it holds, and where two
layers describe the same thing and can differ. Read it before touching the
floor, the microphone, presence, or the audio session — and before
"simplifying" anything that looks stated twice, since several of those pairs
are load-bearing. It carries the rule that the audio session is configured from
whether **anybody** present is capturing rather than whether you are.

**`planning/GLOSSARY.md`** is the fourth, and is **the source of truth for the
vocabulary**: what every word this project uses means, in two parts — words a
user meets, and words that exist only in the code. Where a name in the code and
an entry there disagree, one of them is a bug. Most of these nouns are ordinary
English used narrowly — *present*, *live*, *member*, *seat* — and reading one
the way English suggests is how somebody builds the adjacent thing, twice so
far.

**This one is worth reading routinely, and since 2026-09-07 it is cheap to.**
Its § *Every term, in one line each* is the whole vocabulary, sixty-seven terms
at a clause apiece, front-loaded so that section alone is enough for ordinary
work — seven kilobytes rather than forty-two. Read the list; go down to an
entry only when the one-liner will not settle the question, or when you are
about to argue with it. These are the terms of communication, so a session that
has skimmed the list and one that has not are not having the same conversation.

**Maintain it as the code evolves**: rename there in the same commit as the
rename in the code, and add an entry when a word starts to mean something the
dictionary does not — **and edit the list at the top in the same breath**, since
that is the half that gets read. A lagging source of truth authorises the wrong
word.

Two are one-offs that stay. **`planning/POSTMORTEM-echo.md`** is the build 17
echo bug, start to finish — read it before touching the iOS audio session,
since three separate components configure it and the ways they disagree are not
guessable from the code. **`planning/MIGRATION.md`** carries the sizing argument
in both directions, from the 2026-08-13 migration to a *smaller* instance that
was abandoned before cutover when self-hosting the media inverted its premise.
Read it before sizing, rebuilding or re-hosting the server, and before trusting
`bin/provision`, `bin/provision-livekit` or `bin/deploy`'s health check about
any box that is not the live one.

References inside `planning/` are by bare filename, since they are siblings —
inside `planning/decisions/` too. From outside, a volume carries `decisions/`
and a submission's text `submissions/`; code and this file carry `planning/`.

## Keeping this file small, which is a standing job

**This file is loaded in full into every session, before anybody types
anything.** Nothing reads it in segments. Everything in `planning/` is read only
when somebody goes looking, so a paragraph there is free until it is needed and
a paragraph here is paid for every time. That asymmetry is the whole reason for
the split, and it decays quietly: the natural place to write down what just
happened is the file already open, which is this one.

**Keep it under 550 lines, and nearer 500.** It is 538 now. **Correct that
figure in the same commit as any change to this file**, or the rule governs
against a number nobody has checked — it was once 54 lines stale, claiming 104
lines of headroom when there were 50. The cap was 650 until 2026-09-07, when
the file was cut by a fifth and there was no reason to leave the headroom
behind. Nothing displaces anything here any more, so the file has no reason to
climb at all: material arrives only when a rule is added, and one should
usually leave with it.

When it passes 550, **do not shave the traps.** Almost all of the excess will be
one of these:

- **Deploy narrative.** None of it belongs here. A deploy is written up in
  `planning/decisions/deploy-history.md`, newest
  first, and what is running right now is `bin/health` rather than any sentence.
  This file kept the most recent deploy until 2026-08-23 and was wrong twice.
- **Reasoning about unshipped work.** Belongs in
  `planning/decisions/`, or in its own `planning/` design document
  if it is still being decided.
- **The story behind a rule.** Keep the rule and the cost of breaking it; move
  the account of the afternoon it cost, leaving a pointer.

What earns its place here is what stops somebody losing a day: `APNS_ENV`, and
the `.p8` keys living outside a tree that `bin/deploy` rsyncs with `--delete`.
Those stay verbatim however long the file gets — the density of the prose is
not the problem, accumulation is.

**When the traps alone reach the limit, split thematically rather than shave.**
Take a subject that a whole class of work never touches, move it to `planning/`
entire, and leave a section here that names the traps it contains and says when
to go read it. Nothing is summarised away, and the sessions that do not need it
stop paying for it — the same asymmetry the split from `planning/` was for,
applied one level in. RELEASING.md was the first of these, CREDENTIALS.md the
second and INFRASTRUCTURE.md the third: the seam is *who needs it*, not *how old
it is*. A trap that bites outside its subject stays here even so — `APNS_ENV`
reads like release material and costs an afternoon to somebody testing push
locally, and the `.p8` rule sits in `### Credentials` because of `bin/deploy`.

Trimming is not a separate errand. Do it in the same commit as whatever added
the material, while the judgement about what is durable is still fresh.

### The cap that mattered was not this file's

Adopted 2026-09-07, after the cost of a session was actually measured and this
file turned out to be innocent. It had been flat at 38KB since August while
`planning/` went from nine files and 237KB to forty-three and 1.6MB — seven
times over, in three weeks. **A fixed sentence here that says *read X* or *grep
the set* costs whatever X has grown to since somebody wrote it**, which is how
the bill went up with nothing in this file changing.

So these rules are about what this file **points at**, not only what it holds:

- **A `planning/` document over about 20KB carries its own index** — a contents
  table of sections and when to read each, or for GLOSSARY.md a line per term.
  A pointer here can then say *read the index*, and a session pays for the
  paragraph it needs rather than for the file.
- **A pointer says when to read the thing, not merely that it exists.** An
  unconditional *read it* aimed at a file that quadruples is a bill that grows
  on its own, unsigned by anybody.
- **A record that many sessions append to is one file per entry, not one file.**
  `DECISIONS` was a single append-only volume rolled over at 2,000 lines, and
  it failed in the ways that scheme always fails: two worktrees landing in the
  same week conflicted at the same place, the rollover was hand surgery done in
  the middle of unrelated work, and the running records were copied forward
  until three volumes held a stale `## The deploy history`. It is now a file per
  decision, and there is nothing left to get wrong. **The 2,000-line read limit
  that drove the old cap still exists** — a plain read stops there and drops the
  tail, which in an append-only file is the newest material — so it is a reason
  to prefer many files, not to police one.

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
reasoning is in planning/decisions/archive/DECISIONS-2026-08-13-to-2026-08-15.md; these
are the rules.

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
- **Fold any pending edit to `planning/TASKS.md` into the landing commit.**
  Adopted 2026-08-24. A session that has just finished a task routinely finds
  the entry for it already deleted or rewritten in the working tree, because
  the person at the prompt reached the same conclusion from the other end.
  That edit is not unrelated work in the way a half-finished feature is — it
  is the same statement the landing is, made in the file whose whole job is
  to say what is outstanding, so it belongs in the same commit rather than
  stashed aside and handed back. **Take theirs where the two disagree**: a
  deleted entry beats a session's note explaining why the entry was kept.

- **Landing is manually triggered, every time, and is never something a
  session decides to do — and so are deploying and uploading**, added
  2026-08-24. Adopted 2026-08-22. Finish the work, commit it on
  the branch, say it is ready, and stop. Somebody says "land it" or it does
  not land — and having been asked once does not license the next one.
  **Naming one verb does not name the others, and documentation is not
  exempt**: nothing in this rule is about risk, so nothing in it bends for a
  change that carries none. When one verb is asked for and another looks
  necessary to finish the thought, **say so and ask** rather than deciding
  either way — RELEASING.md § *One verb does not imply the others*.
  **The reason is not the merge and not the race.** Sequencing could be
  delegated to a queue; what cannot is knowing that a piece of work is
  *finished*. A session cannot tell whether more will be asked of it a minute
  from now, and the person at the prompt is holding that picture across every
  session at once. **So it is a rule about who knows the work is over, not
  about who is careful with git**, and merging well is not a substitute for
  being asked.

  Once asked, the mechanics have to assume `master` has moved — several
  sessions work this repository at once from separate worktrees. **Re-read it
  at the moment of merging, not before**: rebase onto what is there now, re-run
  the tests if the rebase moved anything, and only then fast-forward.
  `--ff-only` is the guard that makes a stale assumption fail loudly instead of
  inventing a merge commit. And `git branch -d` refuses a branch whose
  *upstream* has diverged even when `master` already contains every commit,
  which is what rebasing an already-pushed branch leaves behind; reading that
  refusal as "not merged" is how somebody talks themselves out of a landing
  that was complete.
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
  was. `GET /healthz` and the startup log report it — `bin/health` is that
  read, against this checkout — and the deploy now fails if the box comes back
  not reporting the sha just sent. **Since 2026-08-21 it
  refuses a dirty tree unless you pass `--dirty`**, which is the same trade
  `bin/db --write` makes: shipping the working tree means unrelated work in
  progress rides along, and whoever runs it is usually deploying for a
  different reason. The box sat on `cc0e8a9` for a day from exactly that.
- **Every upload is tagged `build/<n>`, by `bin/upload-ios`**, which refuses a
  dirty tree: a tag is permanent where a deploy is reversible. Tags are not
  pushed automatically; the command is printed.
- **`released` points at what is downloadable.** It moves on release, not
  approval — which is why the release is manual. **No sha here**, for the same
  reason the deploy section carries none: `git describe --tags released` says
  which build, `git diff released..master` is the drift users cannot see, and
  `bin/submit-ios --status` is the second opinion, since what is downloadable
  is a state Apple holds rather than a ref. It is a **lightweight ref pointing
  at the `build/<n>` tag object**, not at a commit — `git tag -f released
  build/<n>` moves it and leaves it pointing at that tag object. This demanded
  `git update-ref`, on the grounds that `git tag -f` peels to the commit; it
  does not, and both leave a ref of type `tag`.
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
  has to be waited out instead. See RELEASING.md, and **SHIMS.md for what
  moving it frees**, which is the only reason to care what the number is.

The thing to hold on to: **the App Store is not a version, it is a
population.** What the server owes compatibility to is the oldest build still
installed, which is not the newest released one and is not something a branch
can represent.

---

## Deployment

Deployed to **https://thefloor.rvanegas.co**, first on 2026-08-09.

**This section carries no deploy and no sha.** What is on the box is a
measurement, and `bin/health` takes it — the commit it is running, whether
that is this checkout's HEAD or behind it, the compatibility floor and the
build census, with `--raw` for the body `/healthz` actually returned. Run it
before believing anything here about the state of production.

What each deploy *was* is in planning/decisions/deploy-history.md, newest first
— **add an entry there when you deploy.** That running record is the exception
to the archaeology rule above, being the one part of the collection still
written to as a matter of course. This file used to carry the latest deploy and
went stale twice; it is not coming back.

`bin/deploy` syncs the server, reinstalls, restarts, and waits for health. It
runs the tests first and refuses to continue if they fail, and refuses a dirty
tree before it does either — `--dirty` if you mean it.

### Never ship a wire change to a server before the client can speak it

The server deploys in a minute; a new iOS build reaches a phone via App Store
Connect processing plus whenever a tester updates. The 2026-08-10 Session →
Channel rename therefore killed build 5 the instant the server restarted, and
it stayed dead until build 6 landed — accepted only because the only installs
were the author's. **It is not a choice that survives having users.** The way
to avoid it is the ordinary two-step: teach the server the old names as
aliases, deploy that first, ship the client, remove the aliases a release
later.

**The third step is `planning/SHIMS.md`, and it is a register with one rule:
whatever you add at step one gets an entry there in the same commit.** Every
shim, with the build number that retires it, what it touches, and what must
*not* be deleted alongside it. The gate is knowable only at the moment the
shim is written — it is the next build uploaded — and a week later it is
`git tag --contains` and a guess. **Read it when the floor moves and at no
other time**, that being the one event that makes any of it actionable; the
alternative was grepping the tree for build numbers, which missed two. Delete
the entry in the commit that deletes the shim.

### The box itself is planning/INFRASTRUCTURE.md

Split out 2026-09-07, on the same seam as RELEASING.md and CREDENTIALS.md —
who needs it. The instance, static IP, DNS, TLS, services, which ports are
exposed and why, and the logs; the two media settings that fail silently when
wrong (`rtc.use_external_ip`, and `udp_port` being mutually exclusive with
`port_range_start`/`end`); what the box can carry before recording capacity
bites; and the known rough edges — what a deploy costs, and what a restart
does to audio in flight. **Read it before touching the box, before sizing it,
and before believing a restart is free.**

### Credentials

Eight, deliberately separate, so no single leak is worse than it has to be: the
self-issued **LiveKit** key that mints join tokens for any room,
**`thefloor-egress`** (PutObject only), **`thefloor-server`** (SES plus
recordings `GetObject`, and the configuration-set trap that scopes an SES policy
wrongly everywhere else), the **APNs `.p8`**, the **App Store Connect key** and
its Admin-role requirement, the **Ko-fi verification token**, and the
**AssemblyAI key** — the only one that spends money per use, and the only one
whose presence changes what `/privacy` claims. Where each lives, what it can do
and what losing it costs are in planning/CREDENTIALS.md.

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
Moved there on 2026-08-15 when this file hit its limit: it is needed by
somebody producing a build and by nobody else, which is most sessions.

**Read it before running `bin/upload-ios` or `bin/submit-ios`** — the second
prepares a submission and deliberately stops before the button, since that
PATCH is the irreversible half. The trap that bites outside that stayed here:
`APNS_ENV` above. The three artifacts that disagree about entitlements went to
RELEASING.md on 2026-09-07, being a check you only run while making a build.

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
