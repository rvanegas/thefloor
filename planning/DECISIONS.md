# Decisions

What was built, why it was built that way, and what it cost to find out. Also
what was considered and deliberately not built, which is the half most likely to
be mistaken for an oversight.

This is history rather than work. Nothing here is outstanding; see BACKLOG.md
for that. It is kept because the reasoning is the expensive part and it does not
survive anywhere else — a commit message is read once, by whoever is already
looking at the diff, and never again by the person about to make the same
mistake.

**This is the live volume. New decisions are appended here.** Earlier ones are
in dated volumes, which are closed and are never edited again:

| Volume | Covers | Ends at |
| --- | --- | --- |
| `DECISIONS-2026-08-07-to-2026-08-13.md` | the first decisions through self-hosting the media | the media server moving off LiveKit Cloud |
| `DECISIONS-2026-08-13-to-2026-08-15.md` | self-hosted media through the first App Review submission | the first build going to review |
| `DECISIONS-2026-08-16-to-2026-08-19.md` | the first App Review submission through the first public release | 1.0.0 approved and build 51 released |
| `DECISIONS-2026-08-20-to-2026-08-21.md` | the presence measurements and the whole of the AirPods tone | nothing — closed by rollover |
| `DECISIONS-2026-08-21-to-2026-08-23.md` | the notification levels, the two push stacks, and the ping | nothing — closed by rollover |
| `DECISIONS.md` — this file | 2026-08-23 onward | live |

**Keep every volume under 2,000 lines.** A plain read stops there and says so,
but the notice is easy to miss in a file that reads like an archive, and what
gets dropped is the tail — the newest and most likely to matter.

**So roll over rather than look for a seam: if the entry you are about to write
would take this file past 2,000 lines, close it first and make that entry the
first of the new volume.** Rename this file
`DECISIONS-<first date>-to-<last date>.md`, give it the closed-volume header the
others carry, start a fresh `DECISIONS.md` with this preamble and the two
running records below, and add a row above.

The rule is mechanical on purpose, adopted 2026-08-21. The first three volumes
were cut at seams that meant something — the media leaving LiveKit Cloud, the
first submission, the first public release — and that was worth doing while the
seams were obvious. Hunting for one under a line-count deadline is a different
activity: it turns a filing decision into an argument about what an epoch is,
in the middle of whatever work raised the question. A boundary that means
nothing and costs nothing beats a considered one that arrives late, and the
volumes closed this way say so in their own headers so nobody reads meaning
into where they stop.

Two sections here are exceptions to the chronology and stay in the live volume
however old they get, because they are single running records rather than dated
entries: `## The deploy history`, which is newest-first and grows at the top,
and `## The Android adaptive icon`, which describes something still unshipped.

**On vocabulary.** What this project used to call a session is now a channel,
renamed on 2026-08-10 when it stopped being a short-lived conversation and became
a permanent place. Historical passages below still name types and files as they
were at the time — `SessionView`, `SessionState` — and those are now
`ChannelView` and `ChannelState`. Two other things in this codebase are also
called sessions and are unrelated: the auth session behind a bearer token, and
LiveKit's `AudioSession`. Neither was renamed.

**And `bin/release-ios` is now `bin/upload-ios`**, renamed 2026-08-21 when
*release* was split into five non-overlapping verbs — land, deploy, upload,
submit, release. Passages below and in the closed volumes name the old script
and use *release* loosely for what is now *upload* or *submit*; read them as
written for the time. See § *Five verbs, because release was doing the work of
three*.

**And a channel is never called a room.** The word belongs to Clubhouse, and a
product that borrows a competitor's vocabulary invites the comparison it should
be avoiding. The media layer does use it — `closeRoom`, `setSilenced({ room })`,
`issueToken({ room, identity })`, `new Room(...)` in the app — because it is
LiveKit's own term for a LiveKit thing, and none of it reaches a screen. The
test is whether a user could ever read the word: in the code it is the media
plane's vocabulary; in the interface it does not exist.

---

## The deploy history

### 2026-08-23 — `4fb597c` → `6dd3735`

The headphone advice and the watch party's mute-all. **Three deploys went out
that day** before this one — the watch party itself, the follower page's
full-screen control, and this; a fourth followed within the hour.

The mute is the wire-visible half and it is additive: `watch.mutedAll` and
`SET_WATCH_MUTE`. A build below 82 neither reads nor sends it, so such a phone
in a muted room **keeps its microphone open and is inaudible anyway** — the
server withholds the subscriptions regardless, which is why both ends enforce
it and neither alone would do. planning/STATES.md § *Party-Muted* has the rest,
including that this is neither a self-mute nor a claim.

Verified against production afterwards: `/healthz` on `6dd3735`,
`deployed.json` stamped clean, the service active, 25 live channels revived,
`mutedAll` in the synced `core/watch.ts`, `/watch/:id` serving the headphone
advice. The `requested room does not exist` burst at startup is **not** new —
one at each restart, `restore()` closing rooms that went with the old process.

**This one was superseded the same hour**, which is the thing worth knowing
about it: the mute it shipped holds regardless of the transport, and the deploy
after it made the mute follow play and pause. No installed build ever had the
first behaviour — mute-all landed after `build/81` was tagged — so nothing in
anybody's hands was ever governed by it.

### 2026-08-23 — `5645ada` → `4fb597c`

Three commits: the follower page's full-screen control, and the two from the
build-81 upload — `expo.version` to 1.3.0 and the build number itself. Only the
first reaches anybody, and it reaches them immediately: the follower page is
server-served HTML, so a deploy puts it on every screen without an App Store
anywhere in the path. **That asymmetry is worth remembering** — half of the
watch party ships like a website and half of it ships like an app.

No wire change. Verified against production afterwards: `/healthz` on
`4fb597c`, `deployed.json` stamped clean, the service active, 25 live channels
revived, and the served page at `/watch/:id` actually carrying the button, one
`requestFullscreen`, two `fullscreenchange` listeners and — the guard that
matters — `controls: 0` still in place.

### 2026-08-23 — `306dc5f` → `5645ada`

The watch party, and eight commits of 1.2.0 submission text that had landed
over the preceding day. **A deploy carries whatever has landed**, again: the
session that ran it was working on the watch party alone.

Wire-additive, so installed builds were unaffected — they ignore `watch` and
never send the actions. The one dent is that a build below this one can start a
recording the server now refuses, and will see its shared audio vanish when
somebody else starts a party; both correct, neither explained on that screen.

The migration added `watch_tokens` and touched no existing row. Verified
against production afterwards: `/healthz` on `5645ada`, `deployed.json` stamped
clean, the table created with its `ON DELETE CASCADE`, all 25 live channels
revived, `GET /watch/:id` serving the follower page and
`POST /channels/:id/watch-token` refusing an unauthenticated caller with a 401.
A build-80 client reconnected within a second of the restart, which is presence
recovery working across a deploy — the thing recorded as half-observed on
2026-08-19.

### 2026-08-23 — `0d5476c` → `306dc5f`

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

### 2026-08-22 — `8ef2615` → `0d5476c`

Most recently on 2026-08-22, `8ef2615` → `0d5476c`, which fixes nothing and
says something: a guest whose link opened inside Telegram was prompted for the
microphone, granted it, and was heard by nobody. **Every in-app browser on iOS
is a `WKWebView` whose audio session belongs to the host app**, so capture can
be granted and still deliver digital silence, with no failure anywhere in the
WebRTC API and no fix available to a page. So the page detects that it is
embedded and says so at the door — before the knock, since the seat is
per-browser and switching later costs it — listens to what it published with an
`AnalyserNode` and raises a notice after eight silent seconds, and offers a
retry from a real tap, the `speech` message having no gesture behind it.

The wire did not move and the app is untouched.

Verified against production afterwards: `/healthz` on `0d5476c`; the served
bundle containing `TelegramWebviewProxy` and the page containing `embedded`,
`mic-trouble` and `copy-link-button`.

### 2026-08-22 — `24a3920` → `8ef2615`

Most recently on 2026-08-22, `24a3920` → `8ef2615`, carrying the two defects
the first real guest link found. **The interesting one is that subscribing is
not hearing**: `livekit-client` subscribes to remote tracks by itself and hands
each one to the application, and until something appends `attach()`'s element
to the document nothing plays. The guest heard silence while every signal the
other end could see said it was working, and the member could hear *them*
perfectly. There is no equivalent step in the native client, so nothing about
this was noticeable by analogy — it is a browser fact, and it is now written
beside the code that does it. `startAudio()` and the autoplay button went in
with it.

The wire did not move and the app is untouched by this deploy; the knock haptic
that shipped in the same commit reaches nobody until a build carries it.

Verified against production afterwards: `/healthz` on `8ef2615`; the served
bundle containing `startAudio` and the page containing both `audio-sink` and
`unmute-page`, which is as close as anything here gets to testing that file.

### 2026-08-22 — `d2d0ec3` → `24a3920`

Most recently on 2026-08-22, `d2d0ec3` → `24a3920`, carrying anonymous web
access whole: a person with no account opens a link, knocks, and is let in by
somebody already in the channel. **This is the first deploy that serves a page
to a browser** — `/g/<token>` and one bundle under `/g/assets/`, built by
`bin/deploy` before the rsync because the install on the box is `--omit=dev`
and `livekit-client` is a browser dependency.

**The wire moved and the app has not shipped**, which is the ordering the rule
below requires: `ChannelState` grows `guests` and `knocks`, no installed build
reads either, and the app half that does is on `master` waiting for a build.
The floor is unchanged at `build/51`.

The deploy failed once before it ran, and usefully: the guest bundle would not
build, because `server/node_modules` in this checkout predated the two new
dependencies. It stopped before the rsync, which is what the build step being
unconditional and *first* is for.

Verified against production afterwards: `/healthz` reporting `24a3920` and
`minBuild: 51`; `/g/probe` serving the page with `data-link="probe"` in it;
`/g/assets/guest.js` serving 534kB as `text/javascript`; `/g/assets/..%2F..%2F`
answering 404; and a websocket upgrade to `/gws?link=nope` — over HTTP/1.1,
since Caddy speaks h2 by default and an upgrade there is not the same thing —
returning 101 and then the refusal, in words, before closing 4401.

**Nobody has yet been heard through it.** Everything above is the door
answering; the first time guest audio actually flows will be somebody opening a
real link, and there is no test in this repository that can stand in for that.

### 2026-08-21 — `46dd476` → `bf9ca6e`

Most recently on 2026-08-21, `46dd476` → `bf9ca6e`, carrying one change: the
invitation email links to the App Store. It had its own `INSTALL_URL` constant,
hardcoded null, waiting for somebody to edit it on release day — so every
invitation sent since 1.0.0 went out on 2026-08-19 told its recipient the app
was not on the App Store yet. `APP_STORE_URL` already held the address and was
already set on the box, serving `/healthz`'s `updateUrl`; `mail.ts` now reads
the same setting. **One address, one setting** is the reusable part: the second
name for it was the one nobody remembered to set.

**The wire did not move**, and the deployed behaviour visible to any client is
one string in one email. Against `build/51`, the oldest installed and the
floor, the standing drift is unchanged.

Verified against production afterwards: `/healthz` reporting `bf9ca6e`,
`minBuild: 51` and `updateUrl` set.

**The previous deploy, `ef57b7b` → `46dd476`, went unrecorded** in AGENTS.md,
which is how that section fails: it claimed `ef57b7b` while the box had been on
`46dd476` (the clipboard, the upload percentage, the quiet-channel line) for a
day. Rotate it in the same commit as the deploy, or the next reader believes a
sha that has not been live since yesterday.

### 2026-08-21 — `c002d31` → `ef57b7b`

Deployed on 2026-08-21, `c002d31` → `ef57b7b`, carrying the audio
diagnostic panel and the two entries that closed with it. **This is the deploy
that adds a column to the live database** — `accounts.debug`, nullable, added
by the guarded `ALTER TABLE` in `db.ts`. Verified after the fact rather than
assumed: `PRAGMA table_info(accounts)` shows it, and it is null for all eight
accounts, which is the value that means no panel.

**The wire moved, and this is the two-step, first half.** `hello` gains
`debug?: boolean`, optional and sent only when true, so the server now speaks a
field no installed build reads and every installed build ignores. That is the
order AGENTS.md requires and it needs no shim to remove later. Against
`build/51`, the oldest installed and the floor, the standing drift is 128
lines and still all optional fields and comments. **No iOS build carries the
panel yet**; it reaches a phone on the next upload.

Verified against production afterwards: `/healthz` reporting `ef57b7b` and
`minBuild: 51`, `/support` and `/privacy` serving pages, `/home` answering 401
unauthenticated.

**The flag was then set for one account**, which is the whole of turning the
panel on:

    bin/db --write "update accounts set debug = 1 where identifier = '…'"

It takes effect at that account's next reconnect, since `hello` reads the row
as the socket opens. `select count(*) from accounts where debug = 1` is the
check, and the answer should stay small enough to name.

**First deploy under the clean-tree guard**, added in the same commit range —
`bin/deploy` now refuses a dirty tree unless asked with `--dirty`. The previous
deploy had to stash an unrelated roadmap edit by hand to avoid stamping the box
`-dirty`; that manoeuvre is still valid and is now the thing the guard makes you
notice rather than remember. **The dirty marker is worth protecting rather than
tolerating**: its value is entirely in being rare, and a box that is usually
`-dirty` reports nothing at all.

### 2026-08-21 — `3bf43cb` → `c002d31`

Most recently on 2026-08-21, `3bf43cb` → `c002d31`, carrying one change: the
self-mute is now cleared by every departure rather than only a chosen one. It
went out the same day it was reported, from a screenshot of a roster reading
`Stepped out 2 hours ago · muted`.

**The wire did not move at all.** `git diff 3bf43cb..HEAD -- core/protocol.ts`
is empty — this is a `core/` reducer change and nothing about it is visible on
the wire, so no installed build can tell the difference except by the state it
is sent. Against `build/51`, the oldest installed and the floor, the standing
drift is 140 lines and still all optional fields and comments.

Verified against production afterwards: `/healthz` reporting `c002d31` and
`minBuild: 51`, `/support` and `/privacy` serving pages, `/home` answering 401
unauthenticated.

**Deployed from a stashed tree, deliberately, and that is the reusable part.**
An unrelated `planning/TASKS.md` edit was in progress, and since `bin/deploy`
ships the working tree rather than a ref it would have stamped the box
`c002d31-dirty` on account of a roadmap note. `git stash push <path>`, deploy,
`git stash pop` costs nothing and keeps `/healthz` answering with a sha that
exists in the history. **The dirty marker is worth protecting rather than
tolerating**: its value is entirely in being rare, and a box that is usually
`-dirty` reports nothing at all.

Moved out of AGENTS.md on 2026-08-15, where it had grown nine deploys deep and
was being paid for in every session's context. What a fresh reader needs at the
root is the current state and the traps; the sequence that produced it is this.
Newest first, and it picks up where AGENTS.md leaves off — that file keeps the
most recent deploy, which is now 2026-08-21's.

### 2026-08-20 — a week of server work, and an accidental sha

Most recently on 2026-08-20, carrying a week of server work that had
accumulated behind the 08-19 release: last-seen made monotonic and stamped from
what a closing socket last heard rather than when it gave up, presence
distinguishing a phone in a pocket from a phone in the app, the per-target ping
limit, and the usage meter's read interface. Plus the app-side self-mute audio
fix, which a deploy cannot carry to anybody — it ships in build 56.

**The wire check came out one field wide.** `git diff cc0e8a9..HEAD --
core/protocol.ts` is a single *optional* addition, `pingableAt`, which only ever
withdraws an affordance the server would refuse anyway — so every installed
build behaves exactly as it did, offering the button and being told no. Against
`build/51`, the oldest installed and the floor, the drift is 99 lines and all of
it optional.

Verified against production afterwards: `/healthz` reporting `3bf43cb` and
`minBuild: 51`, `/support` and `/privacy` serving pages, `/home` answering 401
unauthenticated. `updateUrl` now reads the App Store listing rather than null,
which was the one thing 08-19 left undone.

**The box was at `cc0e8a9` before this, not at 08-19's `f1aff87`, from an
accidental `bin/deploy` run that day.** Harmless as it happened — `cc0e8a9` is
the build-55 bump, so it shipped the then-current master from a clean tree, and
the script runs the tests before it syncs. Worth keeping for the general shape
rather than the incident: **`bin/deploy` is one command with no confirmation
step, and it ships the working tree rather than a ref.** So the sha on the box
is not necessarily one anybody chose, and it costs a restart's presence on a box
with a public population. Read `/healthz` before assuming this section is
current; it was a day stale here, and that is how it will fail again.

### 2026-08-19 — the first with a public population

This was the first deploy with **a public
population on the other end of it** — 1.0.0 was approved and build 51 released
that morning. It carried a fortnight of work in one go, master having been held
back while 51 sat in review: Home as a list of channels ordered by how quiet
each one is, an unnamed channel **widening** rather than moving the conversation,
availability as a fact rather than an inference, the ping from inside a channel,
usage metering, and the compatibility floor at 51.

**Build 51 was checked against it before it went, and now that check is not a
courtesy.** `git diff build/51..HEAD -- core/protocol.ts` is 82 lines and every
one of them is an *optional* field — `lastPresenceAt`, `everUsed`, `inApp` on
three different views — so a client that predates them reads what it always
read. `channel.moved` is no longer sent, which leaves 51 holding a handler that
never fires rather than missing one it needs. And `minBuild` is now 51, which
is the floor 51 sits *at* rather than below.

The migration was the part with teeth, this being the first deploy to add
tables to a database with strangers' rows in it. `usage_bytes` and `usage_spans`
are present afterwards, and the counts moved only where they should: 8 accounts,
35 channels, 41 recordings, 1 donation, and **5 device rows where there were 6**
— the duplicate the one-row-per-account invariant could not retroactively clean
went on that account's next launch, exactly as 2026-08-17 predicted it would.

Verified against production afterwards: `/healthz` reporting `f1aff87` and
`minBuild: 51`, `/support` and `/privacy` serving pages, `/home` answering 401
unauthenticated.

`updateUrl` reads null, which is the one thing left undone. `APP_STORE_URL` is
unset on the box, so the update screen a below-floor client shows would have no
button on it. Nothing is below the floor today and 51 could not read it anyway,
but the listing now has a URL and there is no longer a reason for it to be
empty.

### 2026-08-17 — the ping

**The ping**, `POST /channels/:id/ping`, which is
the first notification a person composes rather than the channel sending it
about itself. With it, per-message notification lifetimes — an invitation now
outlives an arrival by a month, `apns-expiration` having been one five-minute
constant for everything — and **one device row per account**, matching the one
session per account `issueToken` has always enforced.

**This deploy was checked against build 51 before it went, because 51 is in
App Review and `oldestBuild` on `/healthz` says it is also the oldest build
installed anywhere.** Two changes since that build was cut could have broken it
and do not: `channel.moved` is no longer *sent*, and build 51 keeps a handler
that now never fires; and `ChannelState.invited` is gone, which build 51 never
read. **`core/protocol.ts` is unchanged since `build/51`** — that is the check
worth repeating before any deploy while a build is in review, and it is one
`git diff build/<n>..HEAD -- core/protocol.ts` away.

Verified against production afterwards: `/healthz` reporting the sha just sent,
`POST /channels/:id/ping` answering 401 unauthenticated and to a bad token,
`/support` still serving HTML, and data untouched at 8 accounts, 32 channels, 40
recordings, 6 device rows and the one donation. One account still holds two
device rows, which is the pre-existing case the invariant now prevents and does
not retroactively clean — it goes on that account's next launch, or on the first
410 Apple returns for the address.


On **2026-08-14, four times**. The last was **everything App Store
review needed**: in-app account deletion (`DELETE /me`), a privacy policy link
inside the app, a support page at `GET /support`, and the donations routes moved
to `/donations` to free that name. **Build 36 is the first build containing any
of it**, uploaded the same day; every earlier build's Delete account and privacy
link do not exist, so a submission cannot use one.

Two things about that deploy are worth carrying. **The Ko-fi webhook URL lives
in Ko-fi's dashboard and nowhere in this repository**, so moving the route meant
editing it there by hand — done first, deliberately, so the window in which a
donation could 404 was the deploy rather than however long a dashboard edit
takes. And **installed builds up to 35 call `GET /support` expecting JSON and
now receive HTML**; `SupportView` optional-chains the snapshot, so the screen
reads "There is no way to give from here at the moment" rather than crashing.
One such call was in the log within seconds of the restart.

Verified against production afterwards: `/support` serving HTML naming
`support@rvanegas.co`, `/donations` answering 401, `POST /donations/kofi`
refusing a bad token with 401 and writing nothing, `POST /support/kofi` gone with
a 404, `DELETE /me` answering 401 rather than 404 to an unauthenticated caller,
and data untouched at 7 accounts, 25 channels, 20 recordings with 7 marked, and
the one real donation row. Somebody took a media token seconds after the restart
and stayed connected.

Before that, three times the same day: **voluntary donations**, the fix for
the mistake the first deploy shipped, and then the region filter.

Donations are a **Ko-fi link, external, unlocking nothing** — see **Donations,
by a link out rather than in-app purchase** above for why it is not in-app
purchase. The build is a `donations` table, `server/src/donations.ts`,
`POST /donations/kofi` and `GET /donations`, plus a Support card in
`HomeSettingsView`. Those two shipped as `/support/kofi` and `/support` and
were renamed later — `support` meant money on
one path and help on every other, and `/support` is the path somebody wanting
help will try, which is what App Store Connect's Support URL has to point at.
Nothing in `core/` changed
except one additive type, so the wire is unchanged and build 30 kept working
across all three restarts. **Build 31 is the one that shows the card**, uploaded
to TestFlight the same day. Alongside it went `GET /privacy` and a fixed one-time
code for App Review (`REVIEW_IDENTIFIER` / `REVIEW_CODE`).

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
of `server/.env`. The reasoning is in **The media server is self-hosted, on the
box that was already there**, in DECISIONS-2026-08-07-to-2026-08-13.md; the
numbers and the rebuild path are in MIGRATION.md.

Verified against production afterwards with two phones — join, claim and release
the floor, record, play back into the room — and the recording landed in S3 as
two stems with both egress manifests, timestamps matching `egress_complete` in
the log to the second. Data untouched at 24 channels and 18 recordings, 6 of
them already marked for deletion. Build 28 went on working across it without
being restarted.

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

Before that, one that narrowed the one-per-set rule to *unnamed* channels and
made an unnamed channel's invitation move the conversation when the invitee
arrives — see **One *unnamed* channel per set of people** in
DECISIONS-2026-08-07-to-2026-08-13.md. No migration: two
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

---

## The Android adaptive icon, which is preparation rather than shipping

Android is not built or shipped here — there is no `android/`, and
`bin/release-ios` is the only release path. The artwork is prepared in three
layers anyway, and the reasoning for each is below. Moved out of AGENTS.md on
2026-08-15: reasoning about unshipped work is this file's job.

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

---

## The Floor carries no video, and that is the whole watch party — 2026-08-23

The first entry of this volume, and the one that closed the last. What was
built is TASKS.md § *Watch Party*; what it turned out to mean was designed in
`planning/WATCHPARTY.md`, which is deleted with this entry, its surviving
reasoning being here.

**The task's line reads like a second media pipeline and is not one.** *"A
watch party plays video, and disallows recordings"*, read against shared audio,
suggests widening `PlaybackTrack` to carry video — and that is the wrong shape
for a reason that has nothing to do with effort. The videos people want to
watch together are on YouTube. Nobody has an mp4.

So the feature is a **shared transport clock over a link**, and each person's
own player follows it. The server never fetches, decodes, publishes or stores a
frame; `server/src/playback.ts` and the LiveKit media plane are untouched, and
`core/watch.ts` is arithmetic over a position and a start time.

That is also what settles the terms question this file already recorded. The
YouTube objection there is against *separating audio from video and fetching it
server-side*. This does the opposite: everybody watches the real player,
visible and unobscured, and the audio arrives with its own video on the same
device. Nothing is extracted, so there is nothing to redistribute — which is
the same reason recordings are **refused rather than merely lossy**.

### Two surfaces, and they are honestly different

**The phone is the remote.** It holds the transport, shows where the party is,
and can hand the link to the YouTube app. It cannot correct anything it has
opened that way, and the button says so — a hand-opened player starts at the
right second and runs on its own clock from there.

**The follower page is the screen.** `server/src/watch-page.ts`, served at
`/watch/:channelId`, running YouTube's IFrame API and following the channel
over the existing websocket. It is the surface that can be driven, so it is the
one that stays in step.

An in-app player is deliberately **not** in this change. It means
`react-native-webview`, a native module and a rebuild, and this project's
history with those — build 2's black screen — argues for it landing on its own.

### What the floor does to it, and what mutual exclusion is for

`canControlWatch` is the same rule as `canControlPlayback`, and they now share
`holdsSharedControl` rather than repeating the body. A claim confers exclusive
control of what is attended to; a video on everyone's second screen is squarely
that. **It does not pause anything** — the film keeps running and stops being
anybody else's to change, which is the same thing a claim has always done to
playback.

`START_WATCH` clears any loaded track and `SET_TRACK` ends any party. A channel
attends to one thing, and mutual replacement is what stops either button ever
being dead.

Recording is the one that is refused rather than replaced, in both directions:
`canStartWatch` requires an idle recording and `canStartRecording` requires no
party. **Assumed rather than asked**, and the alternative was considered: one
tap silently ending a run somebody may be speaking on the strength of is worse
than a greyed button with a sentence under it. Both buttons say why. Cheap to
reverse — it is two clauses in `core/channel.ts`.

### The credential is its own table, and could not have been a session

`watch_tokens`, hashed, naming an account **and** a channel. A session token
was impossible twice over: `issueToken` revokes every other session for the
account, so minting one to open a laptop would sign the phone out; and
`accountForToken` would then accept the link everywhere, making a URL pasted
into a chat a full credential for the account.

The TTL is **six hours**, which is a film with an interval rather than a round
number. `ws.ts` re-checks a socket's credential every heartbeat, so the
fifteen-minute token this otherwise wants to be would cut the page off in the
third act with nothing on screen to say why. Long is affordable only because of
what the token *can do*: follow one channel and report a duration.

**The token travels in the fragment** — `/watch/<id>#<token>` — so it reaches
no access log, no `Referer` header and no proxy. The route returns the whole
URL rather than the token for exactly that reason: a client assembling its own
is a client that might put it in the query string.

### The socket gained a scope, and every assertion about a person went with it

`Connection` is now `{ kind: 'session' }` or `{ kind: 'watch'; channelId }`. A
watch-scoped socket may watch its one channel, heartbeat, and send exactly one
action, `WATCH_READY`. Everything else is refused in one place rather than as a
clause on each case.

The subtler half is what a follower page must **not** do, and it is all the
same mistake in different costumes: it does not `markSeen`, does not
`stillHere`, does not report `CONNECTED`, is not counted by `hasConnection`,
and reports nothing on close. A browser tab left open on a finished film would
otherwise hold its owner in a channel they walked away from and read as "in the
app now" on every contact's Home for six hours. **A second screen must not be
able to assert that its owner is in the room.**

### `parseYouTubeUrl` is in core because two decisions have to agree

The app needs it to decide whether Start lights up; the server needs it to
decide whether to accept. A greyed control and a refused action cannot be
allowed to disagree about what a link is, so there is one function and both
call it. The wire action carries the URL as typed and `dispatch` parses it —
the same division `INVITE` makes, where the reducer must not be reachable with
something the server has not checked.

### The design was wrong about the media plane, in the harmless direction

WATCHPARTY.md claimed that starting a party would tear down the audio track's
media participant "with no new code at all", `applyPlaybackToMedia` already
following committed state. Half right. Clearing the track does reach the media
plane with no new code — but what it issues is a **pause**, not a close:
`applyPlaybackToMedia` keeps the participant for the channel's life, publishing
silence between tracks so a recording's stem keeps its place, and only the
channel ending closes it. The server test asserts what actually happens rather
than what was predicted, and says why the participant stays.

Worth recording because the prediction was reasonable and the code disagreed:
**a design's claim about a path it does not touch is a hypothesis**, and the
test is where it gets checked.

### Restart brings it back paused, and the position is banked rather than derived

`durableOf` carries `watch` — unlike playback, which points at a temp file the
dead process owned, a party is a link and a number and needs nothing external
to mean what it meant. `revive` brings it back **paused at its banked
position**, never playing: the clock ran on through the outage with nobody
driving it and every follower's page disconnected, so coming back playing would
assert a position no screen in the world is at. Deriving from the stored
`startedAt` would add the length of the outage to a position nobody watched
through — an hour's downtime and the party resumes an hour further in.

### The drift tolerance is 1.5 seconds, and generous on purpose

`WATCH_DRIFT_MS`, in `core/constants.ts` because it describes the shared clock
rather than one client. Correcting continuously is the obvious thing and the
wrong one: a seek is a visible jump and an audible one, and two people half a
second apart are watching the same film while two people stuttering every four
seconds are not. **Correcting for smaller drift is worse than the drift.**

### What is deployed and what is not

Wire-additive: a new field on the channel snapshot and new `ClientAction`
members. Old builds ignore `watch` and never send the actions. The one dent is
that a build below this one can start a recording the server now refuses, and
will see its audio track vanish when somebody else starts a party — both
correct, neither explained on that screen. **Deploy the server first**, as
always.

The migration adds one table and touches no existing row. `watch` defaults
correctly for every channel that has never had one, so rows rewrite on their
next change rather than up front — the same story as `mediaRoom` and `invited`.

### The part no test reaches

Verified by 45 core tests, 17 server tests and 11 view tests, and none of them
has watched anything. The same lesson as the choppy pump: **a promise resolving
is not evidence of what it waited for**, and nothing here is confirmed until two
people have watched something on two screens for ten minutes without a visible
correction. The walk that would establish it is in BACKLOG.md § *The watch
party has been walked once*, along with the two things that are known-unknown
rather than untested.

---

## A watch party leaks into the channel through the microphone — 2026-08-23

The first walk, hours after the entry above predicted that a walk was the only
thing that could tell us anything. Verdict: mostly works. What it found is not
a defect, which is why this entry exists rather than a fix.

**Everybody plays the video on their own device, so everybody's microphone can
hear their own screen.** A phone sitting beside a laptop picks up the video and
publishes it to the channel like any other sound in the room; it arrives at
everybody else a network delay later, on top of the copy their own screen is
already playing. Two copies, tens or hundreds of milliseconds apart. The
listener hears a slapback and reasonably concludes the sync is broken.

**The sync is not broken, and tightening it would not help.** `WATCH_DRIFT_MS`
is a *correction* threshold, not an accuracy: two independent YouTube players
on two devices cannot be sample-aligned, and even perfectly corrected they sit
tens of milliseconds apart, which is already comb filtering. Lowering the
tolerance buys more stutter and exactly no less doubling. The leak is a
different quantity from the drift and is not bounded by it — it is bounded by
network latency, which nothing here controls.

**And the echo canceller is the wrong tool, which is the part most likely to be
misdiagnosed.** iOS voice processing cancels what *this device* is playing,
because that is the only signal it has a reference for. A laptop across the
desk is, to the phone, a person talking. POSTMORTEM-echo.md is about the other
kind of echo entirely — the device hearing itself — and reaching for it here
would be an afternoon spent on the wrong layer.

So the remedy is headphones on the screen end, and it is complete rather than
partial: a microphone that cannot hear the video cannot send it. That is a
sentence, not a feature, and it is now said in the two places somebody meets
the decision — the channel card once a party is loaded, and the follower page's
gate, which is the last moment before that screen makes any sound. The gate
matters because the person reading the laptop is frequently not the person
holding the phone that will do the transmitting.

### What was considered and not built

- **Auto-muting while a party plays.** It would cut the loop completely and it
  defeats the feature: the point of watching together is reacting to it, and a
  channel that silences everybody for the length of a film is a channel nobody
  needs. If it is ever built it is an offer, never automatic. **Built as an
  offer the same day** — see the entry below, where the "never automatic" half
  is the part that survived.
- **Warning when a screen is already following.** The server knows how many
  watch-scoped sockets a channel has, so the phone could be told. It addresses
  a *different* cause — one person hearing both their laptop and their own
  hand-off via "Open on this phone" — which is not what was observed. Kept
  here because it is cheap and wire-additive if that one ever bites.
- **Routing the video's audio through The Floor instead**, so there would be
  one copy. This is the extraction the terms forbid and the thing the whole
  design exists to avoid; see the entry above. It would also put the video into
  recordings, which is the other thing being refused.

The general lesson, which is the same one the choppy pump taught and the entry
above predicted: **the walk finds what the suite cannot, and what it finds is
often not a bug.** 74 tests passed on a feature whose most noticeable property
in real use is not expressible as an assertion.

---

## Muting the room is a third state, not a sixfold self-mute — 2026-08-23

Asked for hours after the entry above, and it is the other half of it: the
headphone advice is what you do to keep talking through a film, and this is
what you do when you would rather not. Both remedy the same leak, at opposite
ends of the same choice, and the card now says whichever is true rather than
stacking two warnings about one thing.

**The requirement that shaped it was stated in the asking**: clearing the mute
must not clear anybody's self-mute. That one sentence rules out the obvious
implementation — writing `true` into every entry of `selfMuted` — because
unmuting could then never give back what people had chosen. Somebody who muted
themselves before the film starts would come out of it audible, which is the
exact failure `DECISIONS-2026-08-20-to-2026-08-21.md` § *Every departure clears
the self-mute* was careful about from the other direction.

So it is `watch.mutedAll`: a property of the room, held with the party, cleared
when the party ends and never inherited by the next one. STATES.md carries it
as `Party-Muted`, the third reason a microphone can be quiet.

**It is not a claim either**, and the pair is worth stating because both
withhold audio and the difference is the whole of what each is for. A claim
withholds everybody *but one* and confers control; this withholds everybody,
the holder included, and confers nothing. They compose rather than conflict:
`isWithheld(state, speaker)` is the one place the two reasons are combined, so
no caller has to remember there are two, and clearing a mute over a live claim
drops back to the claim's answer rather than to everybody audible.

### Both ends enforce it, and neither alone would do

The server withholds the subscriptions, as it does for the floor. The app
closes its own microphone, via `microphoneNeeded` returning false for a muted
room. That looks redundant and is not:

- **The server's half is what makes it true.** A build that predates this rule
  goes on publishing, and only the plane can stop that reaching anybody.
- **The app's half is what makes it useful.** The whole point is that the video
  on the screen beside the phone is never picked up *at all* — withholding the
  subscription would stop others hearing it while the microphone went on
  listening to it.

Answering it inside `microphoneNeeded` rather than at the call site has a
consequence that falls out rather than being arranged: `anyMicrophoneOpen` is
false for the whole room, so every audio session goes to its high-quality
configuration for the length of the film. That is the behaviour anybody would
want and nobody would have thought to ask for, and it is a second reason not to
special-case this at the top of `useSessionAudio`.

The reconciliation loop was widened to match. It previously skipped any channel
with no floor holder, which would have left a muted room outside the one
mechanism that catches a track being replaced under a statement made about it —
so a phone that flapped mid-film would come back audible with every screen
saying otherwise. That is the `reconcileSilence` fault of 2026-08-14 arriving
by a new route, and it was avoided by reading the rule rather than by meeting
it again.

### And then it follows the transport, which is what it should have been

Asked for within the hour, and it is the better shape: **a party mute holds
while the video plays and lifts the moment it pauses.** You pause a film to
talk about it, so the mute gets out of the way exactly when talking starts and
comes back when it stops. Nobody taps anything.

The implementation is one line and the choice behind it is the interesting
part. `mutedAll` became the *intent*; what holds is `partyWithholds(watch)` —
the intent **and** `status === 'playing'`, derived. The alternative was to
write the mute on every play and pause, which is two states to keep in step and
one of them drifts. Derivation is the same trick `isSilenced` plays on
`floor.holder`, and it pays the same dividend: **every route out of `playing`
gives the room its voice back for nothing.** A video running out under `TICK`,
a channel emptying through `settleEmpty`, the party being stopped, the channel
ending — none of them knows the mute exists, and all four do the right thing.

`applySilenceToMedia` already compared `isPartyMuted(before)` against
`isPartyMuted(after)`, so play and pause now reach the media plane with no new
code at all — the transition it was watching for simply has a second cause.

Two things had to stay apart in the interface, and this is where the two
questions earn their names. The toggle reads `partyMuteRequested`, the intent:
a button that flipped itself back to *Mute the room* at every pause would be a
control fighting its owner. The line under the roster reads `isPartyMuted`, the
truth: it appears while the video plays and goes when it pauses. And a paused
muted room says *"Paused, so you can talk — the room goes quiet again when the
video resumes"*, because the silence **returning** on the next tap of Play is
the surprise, and that pause is the one moment somebody learns the rule.

The audio-session consequence is nicer than it had any right to be. Each pause
crosses the `anyMicrophoneOpen` boundary, so the room drops from its
high-quality configuration to the call one exactly as talking becomes possible
and blooms back as the film resumes. That is the mono/stereo cue
`core/micNeeded.ts` argues for at length, arriving for a reason nobody designed
and saying precisely what it always said.

### And then muted became the default, which only the derivation allows

Same day again. **Every party now starts muted**, and the headphone advice that
this entry's parent added is deleted rather than kept beside it.

The order those two happened in is the argument. Muting by default would have
been heavy-handed a few hours earlier: a mute that ignored the transport would
have silenced a channel from the moment somebody pasted a link and kept it
silent through every pause, until a person noticed a control they had never
touched. Because the mute is derived — intent **and** playing — the default
only ever asserts itself over a running film, and a party begins paused, so the
first thing it can possibly do is the thing it is for. **A default is only as
good as what it defaults you into**, and the derivation is what made this one
worth having.

So the advice goes. It warned about a leak the default now prevents, and
advice about a thing that no longer happens is a sentence people learn to skip
past — while the person who deliberately unmutes is the last one who needs
telling. The constraint has not changed and is still recorded above; it has
just stopped being news. What the card says instead is which of the three
states the room is in, since a room that has stopped carrying voices is
otherwise indistinguishable from one where nobody is talking.

Two smaller things went with it. `revive` now **restores** the mute, having
deliberately dropped it a few hours before: that rule was written for a world
where unmuted was the norm and a mute ignored the transport, and in this one a
revived party comes back paused, so a restored mute withholds nothing until
Play. What survives is the room's own answer — including an explicit unmute,
the only case where the stored value says anything the default does not.

And **the card can change the video without stopping first**. `START_WATCH`
always replaced a party in place; the interface simply had no way to ask for
it, so the only route from one video to the next was Stop and start again —
which empties the card, drops every follower to "Nothing is playing", and makes
a continuous evening read as two unrelated ones.

### A cued video has no duration yet, which broke the readout

Found by somebody looking at a footer that said `Playing 2:31` with nothing to
measure it against. Both readouts show `elapsed / length` and always did — but
only once the length is *known*, and the channel learns it from exactly one
place: a follower page's `WATCH_READY`.

That report fired on `onStateChange`, on the assumption that a player knows its
duration by the time it changes state. **A cued video does not.**
`getDuration()` returns 0 until enough metadata has loaded, and a video cued
and left paused may produce no further state change at all — so nothing was
ever reported and nothing retried. Latent until the swap started cueing rather
than loading, an hour earlier, because a *loaded* video plays and a played
video has a duration. One fix produced the other's symptom.

It now retries from the same 500ms tick that corrects drift, so the duration
lands whenever the player learns it, at the cost of one guarded property read
until it does. **The lesson is the same one this file keeps recording**: an
event is a claim that something has happened, not that a value is available,
and a fact worth having is worth asking for again.

### An ended video is not a stopped one

Reported as the first second of a finished video stuttering endlessly, which is
the visible half of a loop with four steps. The video ends, so the player is
ENDED. The transport still says playing — the server pauses on its own tick, a
moment later, and never at all while the duration is unknown. `follow()` read
"the transport says playing and the player is not playing, so play it" and
called `playVideo()`, **which on an ENDED player starts the video again from
the beginning.** `correct()` then compared a player at zero against a position
at the end, called the difference drift, and seeked back to the end — which
ended it again. Half a second later, the same.

Every step is individually correct and the composition is not, which is what
made it invisible on the way in. The rule the page needed is that an ended
player is left alone: the video is over, and nothing on a follower page has any
business restarting it.

**With one clause, and the clause is the interesting part.** Pressing Play on a
finished video moves the transport back to zero — `watchPlay` replays from the
start, being the only reading of "play" available at that position — while the
player is still ENDED. So a flat "never touch an ended player" trades an
endless restart for a screen stuck on Finished that will not replay, which is
the same bug facing the other way. The guard therefore holds only while the
channel *agrees* the video is over; a transport position behind the player's is
a replay or a seek, and then restarting is exactly right.

It is the third defect in a day out of the same twenty lines, and the three are
related in a way worth recording: the swap autoplaying, the duration never
arriving, and this. Each was a one-line fix, each was invisible to a suite that
can only search the page for substrings, and the second was produced by the
first one's fix. BACKLOG.md § *The follower page's control logic has no test*
says what would catch the fourth.

### Said once, under the roster

Asked for on the participant cards first and moved during the asking, which was
the right call: it is one fact about the room, not six facts about six people.
Six badges would also imply each person had been muted individually — precisely
what this is not, and precisely the misreading the implementation was chosen to
avoid. It sits under the roster because it is a claim about the roster directly
above it: those people cannot be heard right now.

