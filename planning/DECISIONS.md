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
| `DECISIONS.md` — this file | 2026-08-21 onward | live |

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

## And then it was the wrong cue — 2026-08-21

The first entry of this volume, and it continues one in the volume before:
`DECISIONS-2026-08-20-to-2026-08-21.md` § *The buzz was allowed and then
discarded*, which is why build 70's silenced-speaker cue produced no haptics at
all. Read that first; this is what happened when it did arrive.

Build 71 was felt on a device and reported as "very slight, hardly
perceptible". Which is an accurate description of
`NotificationFeedbackType.Warning` rather than a sign it was misconfigured:
Apple's notification haptics are tuned for a hand already holding the phone and
looking at it, and the premise of this cue is the opposite one — a phone in a
pocket, against a leg, with somebody mid-sentence.

So it is the **alert vibration** now — `AudioServicesPlaySystemSound(
kSystemSoundID_Vibrate)`, via `vibrate()` in `modules/audio-route`. The motor,
not the Taptic Engine, at the strength iOS uses for an incoming call, which is
the same problem: reach somebody who is not looking. Not `CHHapticEngine`,
which would give finer control over intensity and is the obvious alternative —
it is an engine, started next to a live voice session, and this app has spent
six builds on what that neighbourhood does to audio. A system sound starts
nothing.

**It is a system sound, so the permission from the previous volume governs it
too**, which is the reason the two live in the same file: without
`setAllowHapticsDuringRecording`, this would be exactly as silent as the haptic
was.

**The noise objection is real and nearly cancels itself.** A vibrating phone
beside an open microphone is normally everybody's problem. But this fires only
while the person is silenced, and being silenced means no listener is
subscribed to their track — so there is nobody to hear it, and the recording
drops those windows per stem. The leak is a buzz that coincides with the floor
being released.

**Two builds, two silent failures, same shape.** Suppressed by a session
property, then delivered below the threshold of perception; both reported
success, and neither is readable from JavaScript. That is the argument for
`haptics ok` in the panel, and for asking what suppresses a cue before asking
when to send it.

**And it may have closed the pocket, which the haptic could not.** The question
that raised this — what happens if the process is suspended — has two halves,
and the repo had already measured the first.
`DECISIONS-2026-08-20-to-2026-08-21.md` § *Backgrounding costs presence in
about a hundred seconds* found a backgrounded app suspended 0.3 seconds after
going into a pocket with nothing flowing, and **not suspended at all while the
microphone is capturing** — one episode ran twenty-five minutes and was still
running. This cue can only fire while you are speaking, silenced, with somebody
else present, which is `micNeeded` true and the microphone live. So the process
is awake whenever there is anything to deliver. Suspension is not the obstacle.

The obstacle was the *other* half: `UIFeedbackGenerator` is ignored when the
app is not **active**, which a backgrounded-but-running app is not. That is a
property of the feedback generators rather than of the process, and
`AudioServicesPlaySystemSound` is not one of them — it is not gated on
`UIApplication` state, which is why iOS can vibrate for a call while every app
is in the background. **So the motor may reach a locked phone where the Taptic
tap could not, for free, as a side effect of being loud enough.** Untested, and
stated as the hypothesis it is: lock the phone, have somebody claim the floor,
and keep talking. If it buzzes, the tone into the audio session that TASKS.md
holds open — the one that pays by playing over the voice it is announcing — is
not needed and should not be built.

---

## The clipboard stays text, and the image half is dropped rather than deferred — 2026-08-21

Taken off the roadmap 2026-08-21. The clipboard shipped text-only the same day
— one slot per channel, riding in the channel snapshot — and the image half
was written up as deliberately deferred, on the design the text case had
started from and abandoned: an S3 key in a `clips` row, a `GET` route, and the
`kind` discriminator that `ChannelState.clip` already carries.

**It is dropped, not scheduled.** Recorded here rather than left in TASKS.md
because a deferred feature and a declined one look identical from the outside
and only one of them is an oversight. The `kind` field stays; it costs nothing
and it is the honest shape of the state either way.

**What the survey found, which is the part worth keeping.** None of it is
prohibitive on its own and all of it is invisible from the feature's
description:

- `getImageAsync`/`setImageAsync` in `app/src/clipboard.ts` deal in base64 with
  a `data:` prefix to strip and restore.
- **`setImageAsync` returns void**, so the rule `copyText` satisfies — never
  report a success you did not have — cannot be satisfied the same way. That is
  a policy problem rather than a plumbing one, and it is the one that would
  have to be answered first.
- `storage.put` hardcodes `ContentType: 'audio/ogg'` and would need
  parameterizing.
- `app/jest.setup.js` mocks three clipboard functions and not the image three,
  so any path reaching them throws across every existing suite.
- Nothing in the app renders an image yet, so a thumbnail is new ground.

**And the question that would have had to be settled before any of it**:
whether a thumbnail is shown at all. The text case deliberately shows nothing —
the argument being a screen read over shoulders — and that argument is stronger
for a picture, not weaker. Which leaves an image nobody may look at before
copying, which is a strange object to build. **That is the real reason this is
declined rather than the five costs above**, and it would be the thing to
answer if it is ever raised again.

---

## The buzz reaches a locked phone, so the tone is not built — 2026-08-21

**Both open questions above were measured on build 72, and both answered
yes.** § *And then it was the wrong cue* ended on a hypothesis stated as one;
this is the reading, written the same day the reading was taken, which the
volume before this one paid three builds to learn to do.

**The schedule was felt and counted, with the app open.** Four buzzes at
roughly 2s, 5s, 8s and 11s while talking silenced; nothing more for that claim
after the fourth; and it starts over on a re-claim. So the budget behaves as
`nudge.ts` says and as its tests pin, on a phone rather than in a fake clock.

**And the locked phone buzzed**, which is the answer that decides something.
`AudioServicesPlaySystemSound` is not a feedback generator and is not gated on
`UIApplication` state, and the guess was that this would reach a locked phone
where `UIFeedbackGenerator` silently could not. It does. **So the tone into the
audio session is not needed and must not be built** — the delivery that would
have paid by playing over the very voice it was announcing. It was the only
remaining idea for the pocket case and the pocket case is closed.

**What this cost, end to end, is the thing to carry.** Three builds and one
false start: build 70 delivered nothing because iOS mutes haptics for the
duration of a capturing session, build 71 delivered a tap too faint for a
pocket, and build 72 delivered the motor. Every one of those was correct in
the scheduling layer the whole time — `isSilenced` and `audio.speaking` were
already computed, and the tests were green throughout. **The question that
would have collapsed all three into one is "what suppresses this?", asked
before "when do I send it?"** — and it is the question to ask of the next
non-visual cue, because the delivery APIs answer yes either way.

---

## A heading outlived its own disproof, and a heading is what gets scanned — 2026-08-21

Filed when TASKS.md § *The Self-Mute Tone* was deleted, that entry having
closed. Everything else in it is already here: § *Four fixes, no measurement,
and that was the mistake*, § *The first reading, and the two things it could
not see*, and § *Muting moves from Apple's unit to our own mixer* in
`DECISIONS-2026-08-20-to-2026-08-21.md`. This is the one part that was nowhere
else.

The entry was headed **"Self-Mute Still Moves the Audio Category"** and had
been wrong since build 62, which read the route either side of a mute and found
`BluetoothHFP` at 24 kHz both times — no route change, no category movement.
The body was corrected. The heading was not, and it stood for three builds
after the measurement that disproved it.

**The body is what gets read once and the heading is what gets read every
time.** Somebody scanning a file of twenty entries reads twenty headings and
the bodies of the two they stop at, so a heading is the only part guaranteed an
audience — and a wrong one is not merely stale, it routes attention away from
the correction sitting underneath it.

This is the same failure as the unrecorded result recorded alongside it, in a
different medium: in both cases the finding existed and the artefact somebody
would actually consult did not carry it. **Correct the heading in the same edit
as the body**, and if the entry has outgrown its title, retitle it rather than
appending the news to the end.

**With one constraint that pulls the other way**, learned the same day: a `##`
heading in TASKS.md is an *address*. AGENTS.md makes any verb followed by a
quoted string matching one a reference to that entry, so a heading is a name
before it is a summary. Welding a status onto it — "The Self-Mute Tone —
CLOSED, and the title was wrong for three builds" — breaks the match. The
resolution is that the heading names the thing and the *first line of the body*
carries the status, which is the shape the file settled on.

---

## No output that cannot also capture — 2026-08-21

Build 65, reported and fixed the same day, and verified on a device on
2026-08-21 — recorded here when TASKS.md § *The Mic-Less Speaker Fix Is
Verified* was deleted, the entry having done its job. The reasoning lives at
length in `app/src/audio/session.ts`; this is why it was made and what the
checks found.

**A second participant arrived and was audible on a Bluetooth speaker that has
no microphone.** `CALL` listed `allowBluetoothA2DP`, and A2DP is output-only,
so under `playAndRecord` a device that cannot capture was still an eligible
*output*. iOS did exactly as asked: it kept the far end on the speaker and took
input from the built-in microphone in the same room. That is not merely the
wrong route — it is a loudspeaker playing the far end into an open microphone
at arm's length, which is the echo path the whole of POSTMORTEM-echo.md is
about, arrived at from a direction nobody was watching.

**The cause was in the option list rather than in a mechanism**, which is why
this one is short where the self-mute investigation ran six builds. The
option's documented meaning *is* the observed behaviour, so there was no chain
of inference to be wrong about. That was a reason for more confidence and not
for skipping the checks.

**A2DP is scoped rather than lost.** `IDLE` and `LISTENING` are `playback`,
where a Bluetooth device is an eligible output with no option at all, so the
stereo route is exactly as available as before whenever nobody is capturing.
Two tests pin both halves, and the absence is its own test because
`arrayContaining` cannot catch a missing element.

**Three checks were written before the build and all three were run.**

- **The reported case passed on build 65.** The mic-less speaker is released
  and output moves to the phone's own loudspeaker, both directions working.
- **AirPods passed on build 72**, which is the one that mattered. This is the
  option build 19 removed, when a tester's headphones fell back to the phone
  speaker and it was read as A2DP eligibility being required for headphones to
  be offered at all. That reading was doubted here on the grounds that
  `allowBluetooth` makes an HFP-capable headset eligible in both directions,
  and it is now **disproved on a device**: AirPods keep the route and go mono
  while capturing. Most likely the build 19 device could not do HFP at all.
- **The third check failed, and found a different bug** — the foreground
  interruption, which is TASKS.md's and is not this fix.

**The lesson is the cheap one for once.** Four rounds of reasoning had just
been spent on a symptom whose mechanism was not in the code being read; this
symptom's mechanism was one line of a constant, and the difference was legible
in advance from how long the chain of inference was. Length of chain is worth
noticing before deciding whether to read or to measure.

---

## How the diagnostic panel comes out, and what would trigger it — 2026-08-21

The panel itself is § *A diagnostic that a column turns on, which is why it can
stay* in `DECISIONS-2026-08-20-to-2026-08-21.md`, and that entry makes the
argument. What it did not carry was the removal recipe, which lived in TASKS.md
until that entry was deleted for being complete. It is written down for the
reason the ungated panel's deletion was: **taking out one piece and leaving the
others is how a diagnostic becomes furniture**, and the pieces are not
guessable from any one of them.

It comes out as: `app/src/ui/AudioDebugPanel.tsx`, `app/src/audio/diagnostics.ts`
and its test, `app/src/audio/engineState.ts`, the `asked` field on
`SessionAudio` and its two write sites, the `debug` column and its migration,
the `debug` field on `hello`, and `app.debug` in `AppProvider`.
`app/modules/audio-route` goes with it or stays on its own argument — it is a
native module, so removing it changes what `prebuild --clean` regenerates, and
that is a build-affecting change rather than a deletion.

**The trigger is not time passing.** It is somebody deciding the audio
subsystem no longer needs watching, which after six builds in two days is not a
decision to make from a quiet week. The gate is what makes waiting cost
nothing: the column is null for every row, an unflagged account renders no
panel and is not even told the field exists, and the only code that runs for
everybody is `recordEvent` appending a string to a forty-element array nothing
reads.

**Why this is not the furniture the earlier rule forbade**, restated because
the rule and the exception are easy to collapse: what makes furniture is a
diagnostic every user can see and nobody can switch off. This one is one
`UPDATE` and a reconnect in either direction, in the hands of whoever holds the
database. Furniture is defined by who can remove it.

---

## Invite credit is one edge per account, and the number is a subtree

Built 2026-08-22. The ask was a per-account metric of accepted invitations,
transitive: if Alice invites Bob and Bob invites Carol, Alice is credited with
two and Bob with one. Shown on Profile as `Invited <n>`.

**The whole feature is one nullable column.** `accounts.invited_by` holds who
brought this person here, written once, at account creation, by
`resolveInvitesFor` — which is already the only code that runs at the moment an
invitation turns into a person. Every count is then a walk of that forest, and
there is no counter to keep correct, no row to increment and nothing that can
drift from the accounts table because it *is* the accounts table.

The alternative was a `credits` table written on each acceptance, and it was
rejected for the reason aggregates usually are: a stored total is a second
answer to a question the source data already answers, and the two disagree the
first time anything is deleted, replayed or restored. `WITH RECURSIVE` over a
few hundred rows costs nothing at this scale, and the profile route was already
doing a read per open.

**Four things were decided about what counts, and none of them is obvious.**

*The earliest invitation gets the credit, and only that one.* Several people can
write to the same address, and all of them still get a contact request out of it
— that behaviour is untouched. But exactly one of them is the reason the person
is here. Splitting the credit makes the totals fractional and unstateable;
giving it to each makes them sum to more than the population. Ordered by
`created_at` then `requester_id`, so two invitations in the same millisecond
resolve identically on every replay.

*A request between two accounts that already exist is worth nothing.* Those are
two people finding each other, not one of them arriving. It falls out of where
the write lives — `pending_invites` is only ever written for an address with no
account — rather than being filtered for anywhere.

*An expired invitation credits nobody, and that is `INVITE_TTL_MS` doing its
job.* The sweep has already deleted the row by the time the person signs up, so
an unattributed signup is indistinguishable from an uninvited one. Nothing new
was added to make that true.

*A deleted account stops being counted, but the chain is still walked through
it.* Two halves of one decision, and they pull in opposite directions.
Excluding the tombstone is the honest number: a total that stays high after
everybody it counted has left is a claim about a population that is not there.
But `erase` deliberately does **not** clear the leaver's own `invited_by`, which
makes it the one field there that is not about the account being erased — it is
the edge somebody *else's* total is counted along, and clearing it would take an
entire subtree out of a third party's number because of a decision they never
heard about. `erase`'s doc comment says so, next to the paragraph explaining why
the row survives at all.

Nothing was backfilled. `pending_invites` rows are deleted the moment they
resolve, so for every account that predates the column the answer is simply not
recorded anywhere — and reconstructing it from who somebody became contacts with
first would credit whoever happened to be earliest in a table that was never
keeping score. Everybody who was already here reads nought, permanently, and
that is a correct statement about what is known.

**The client shows `Invited 0`.** A line that appears only once it is
flattering turns everybody's first week into a screen with something missing
from it. What is *not* shown is an absent count — a server that predates the
field sends no key, and a nought it never claimed would be a number we made up.
So `invited` is optional on the wire and the client distinguishes absent from
zero, which is the same shape `lastSeenAt` already has and for the same reason.

### The standings are in the app, behind a column set by hand

Built as a served HTML page first, at `/leaderboard`, gated on a
`LEADERBOARD_KEY` and HTTP Basic — an operator's page, the browser-shaped
sibling of `bin/usage`. **That version was deleted the same day and none of it
shipped.** It is written down because the reasoning that killed it is the
reasoning that shaped what replaced it, and because a future session proposing
a web page for this should know it has been tried.

The objection was never the password. It is that **a list of real people's
names is exactly what `/privacy` and `/support` promise in writing does not
exist here** — *"There is no directory, no search for strangers, and no way to
be added to anything without saying yes."* A page on the public internet is a
directory whether or not it asks for a password first, and the promise is about
what this service *is*, not about who currently holds a credential.

So the standings are in the app, and the gate is an `accounts.leaderboard`
column set by hand with `bin/db --write`. **That is `debug`'s pattern reused
whole**, deliberately: nobody has it by default, there is no screen that grants
it, it rides on `hello` as an optional-when-true field, and it is read fresh per
connection so revoking it closes the way in at the next reconnect rather than at
the next reinstall. Copying a pattern that already exists is worth more here
than a better one invented for a second user.

**One way it is not like `debug`**, and the difference is the point: `debug`
gates a display and nothing else, so a client ignoring it loses nothing it was
entitled to. This gates *data*. `GET /leaderboard` refuses anybody whose column
is unset, so the flag on `hello` says whether to offer the screen and the server
decides whether to answer it — two enforcements, and the client's is only the
polite one. The refusal is a **404 rather than a 403**, matching the profile
route: "you may not" and "there is nothing here" are deliberately one answer.

The way in is a button below *Chip in* on Support, absent unless the flag is
set. Support is the one screen already about the project rather than about a
conversation, and a screen nobody can reach needs somewhere unobtrusive to be
reached from.

The board itself is one query rather than a recursive walk per account: the
closure of `(ancestor, descendant)` pairs, grouped. Only accounts with a count
of one or more appear, which falls out of the join — an account nobody arrived
through is in no pair — and is the right shape, since a list whose tail is every
account that ever existed all reading nought is a list of accounts rather than a
ranking. Ties break on display name so two reads agree.

### Who invited them is a name, so it is told only to somebody who knows it

A profile carries `invitedBy`, and the rule is that the inviter is **you, or one
of your contacts**. Carol, who knows both Alice and Bob, sees *Invited by Alice*
on Bob's profile. Carol, who knows only Bob, sees no line at all.

The asymmetry with the count above is deliberate and is the whole design. The
number on a profile is the same number for everybody who can read the profile,
because a total names nobody. A name is not like that. **A profile is readable
by a contact, by anyone sharing a live channel, and by yourself** — and that
middle audience is exactly the one this must not leak to: somebody an
acquaintance brought into a channel would otherwise learn, from a screen they
are perfectly entitled to open, the name of a stranger who knows them. That is
the shape of question `pending_invites` exists to avoid answering, arriving by a
different door.

Refused means **absent**, never a placeholder and never an id for the client to
resolve — either would be the same disclosure with an extra step. So absent is
three things at once: nobody recorded invited them, or somebody did and you do
not know that person, or the server predates the field. The client cannot tell
them apart and does not need to, since all three mean there is no line to draw.
A tombstone is excluded too: *Invited by Deleted account* tells a reader nothing
except that somebody left.

### The backfill is a script with four private addresses in it, not a migration

Two arrivals predate the column and their `pending_invites` rows were deleted the
moment they resolved, so who invited them is not recoverable from the database
and had to be supplied by hand. `bin/backfill-invited` does it.

**It is not in `migrate()`, and that was the tempting place** — it runs on
deploy, so nobody can forget it, which is the argument this repository usually
finds decisive. It lost to a simpler fact: `migrate()` runs against every
database this project ever creates, including the in-memory one in every test,
and naming four private individuals in the file that defines the schema is
wrong at a level that outlives the two rows it fixes.

Everything about it is a read until it finds a blank to fill. Every statement
carries `WHERE invited_by IS NULL`, so running it twice is a no-op and it can
never overwrite an attribution the server made itself — which matters more than
it looks, because **one of the two named people had not signed up when it was
written**. If they sign up before it runs, the server credits them correctly on
its own and the script must leave them alone; an invitee with no account is
skipped and reported rather than treated as an error.

One bug in it is worth keeping, because it is a bash trap rather than a mistake
about this feature. The database check was `if ! query ... | grep -q 1`, and
`query`'s `exit 1` on an unreadable database ended **only the pipeline's
subshell** — so a database that could not be opened at all came back as empty
output and was reported as a missing column, which sends somebody off to deploy
for no reason. The result now comes back in a variable and the call sites are
`query ... || exit 1`, in the main shell. `set -e` does not fire inside a
pipeline or a condition, which is the whole of why this class of thing survives.

### The index had to move, and the failure was a boot rather than a test

Worth writing down because it fails at exactly the wrong moment. The
`CREATE INDEX` on `accounts(invited_by)` was first declared in `SCHEMA`
alongside the column, which is where it reads as belonging — and `SCHEMA` runs
*before* `migrate()`. Against a fresh database that is fine. Against one that
already has an `accounts` table, `CREATE TABLE IF NOT EXISTS` is a no-op, the
column does not exist yet, and the index statement fails the entire boot with
`no such column: invited_by`.

`migration.test.ts` caught it, which is what that suite is for. **A column added
by migration can only be indexed by migration**, and the index now lives there,
unconditional and `IF NOT EXISTS`, after the `ALTER`.

## Tapping a channel and being in it are two things — 2026-08-22

TASKS.md § *Stepping into Channel*. Home settings gets "Tap a channel to step
in", set by default; unset, a tap opens the channel screen and enters nothing,
and the card that says **Step Out** says **Step In** instead.

**The interesting part is how little had to be built.** The server has always
distinguished watching a channel from being in it — `watch.channel` reports
`CONNECTED`, which cancels a grace period and confers no presence, and every
`can…` in `core/channel.ts` asks about the room rather than the roster. The
audio moved above the channel screen when Home learned to show a live bar, so
the connection follows presence and not what is mounted. Both halves of the
new state were therefore already load-bearing; the app was simply never in it,
because every route to `ChannelView` dispatched `ENTER` on the way.

So the change is one branch on Home, one preference, and making the channel
screen honest about a state it could already be in. Nothing on the wire moved
and the server was not touched.

### What the screen must not say when you are not in the room

Three things, and each was a sentence that had become false rather than a
control that had become dangerous:

- **The microphone card is absent, not disabled.** Nothing in it is true —
  the microphone is not open, muting changes nothing anybody can hear, and
  `describeAudio` is describing a session nobody asked for. `canSetSelfMute`
  is the one guard here that does *not* test presence (self-mute is unilateral
  and the reducer would accept it), so disabling the button would have been the
  screen disagreeing with the rules, which is the shape this codebase forbids.
  Absence says the same thing and says it truthfully. The sentence that would
  have gone there is on the Step In card instead.
- **Nobody is at the door.** `canAnswerKnock` needs presence, so a knock card
  offered to somebody who has stepped out is two buttons the reducer refuses.
  Whoever is actually in the channel is being asked the same question.
- **The floor hint names the real reason.** It could otherwise say "you cannot
  claim while you are silenced" to somebody who is not silenced but absent.

Everything else disabled itself: the clip, the playback, the recording and the
claim are all guarded by a `can…` that tests the room.

### Stepping in does not navigate

You are already looking at the channel. The tap fills the screen in around
itself — the microphone card appears, the floor becomes claimable — which is a
better answer than a screen that closes and reopens on the same channel.

### Starting a channel still enters, whatever the setting says

The setting is about a list of rooms that already exist, where a tap is as
likely to be curiosity as intent. Opening a channel of your own *is* the
intent, and a room you have just made and are not standing in is a strange
thing to have produced.

### A push notification already landed you outside the room

Worth recording because it was a defect nobody had named. The notification-tap
path in `App.tsx` watches the channel and sets the screen, and has never
dispatched `ENTER` — so anybody arriving that way was looking at a channel they
were not in, under a button offering to step them out of it. That is now the
supported state with a Step In button in it, so the path is correct by
accident of this work rather than by a fix of its own.

### The preference is a phone setting, and there is a gap at launch

`thefloor.tapToStepIn` sits beside the appearance preference in SecureStore,
for the same reason: it is about how this device behaves under a thumb, and two
phones signed in as you may reasonably disagree. Stored as `'true'`/`'false'`
and read as *anything that is not `'false'` is on*, so a missing key, a key
from an older build and a value nobody recognises all give the behaviour every
build before this one had.

It is read in an effect, so for the first frames of a cold launch the default
is in force whatever is stored — the same gap appearance has, where it costs a
flash of the wrong palette. Here it costs a tap in the first instant of a cold
start entering a channel somebody meant only to open. Neither is worth blocking
the first screen on a keychain read, and the recovery from this one is a tap on
Step Out.

## Nobody reaches into a conversation they are not in

2026-08-22, the day after the Step In screen, and it exists because of it. Once
watching a channel became a state somebody arrives at on purpose, the question
"what can be done from out here" stopped being rhetorical, and the answer on
audit was: nearly everything. A member standing outside an occupied channel
could rename it, rewrite its description, invite a contact into it, mint a
guest link onto it, rename or delete its recordings, and — because the two
controls were never wired to their guard at all — grant a guest the microphone
or throw them out.

The rule adopted is one sentence. **Membership is standing over a channel; it
is not standing over an occupation of it.** People who are talking to each
other are entitled to control the place they are talking in, and a member who
is somewhere else does not get to reach in.

### The escape hatch is what makes it liveable

`hasTheRoom(state, id)` is `state.present.length === 0 || inRoom(state, id)`,
and the first half is not a concession. An empty channel belongs to all of its
members equally: setting a track up before anybody arrives, tidying the
recordings, fixing a typo in the description are all interrupting nothing. A
rule of plain presence would have locked the absent out of their own channel
and turned every one of those into a step in and a step out.

It also means every sentence explaining a disabled control can say the same
thing. The only way the guard is false is that other people are in there, so
"step in" is always both the reason and the remedy, and the screen never has to
work out which of several reasons applies. That uniformity is worth more than
it looks — the floor hint one section up exists because it *did* have several
reasons and got them wrong.

### Seven guards, one predicate, and where it is not asked

`canEditChannel` (new, covering `SET_NAME` and `SET_DESCRIPTION`, which had no
guard of any kind before this), `canInvite`, `canInviteGuest` — which now
covers revoking as well as minting — `canControlPlayback`, `canPasteClip`,
`canClearClip`, `canManageGuest`.

Deliberately outside it:

- **Leaving.** Giving up your own membership is yours whatever anybody else is
  doing. Deleting needs no rule either: only the last member may, and nobody
  can be the last member while somebody else is present.
- **Exporting a recording.** A read. It changes nothing anybody in the room can
  see, and refusing somebody their own conversation because two other people
  happen to be talking would be a rule with no injury behind it. Renaming and
  deleting are governed because both change what everybody else's list says and
  one of them cannot be undone.
- **Reading the guest links.** How somebody works out who can get in, which is
  a question worth being able to answer from outside. Shutting a door is not.
- **Claiming the floor, self-mute, starting a recording, answering the door.**
  Already about presence for reasons of their own. Folding them in would make
  the rule mean something else.

### `state.present` counts members, and the guest case is not what it looks like

Writing this, the obvious argument for counting members only was that a guest
left alone in a room every member had walked out of is exactly who somebody
needs to reach in and remove. **That state does not exist**, and the test
written to demonstrate it is what said so: `settleEmpty` takes every guest out
with the last member, on the rule that nobody may remain in a room with no
member to answer for them, and `GUEST_ENTERED` refuses an empty channel for the
same reason. So `canManageGuest` gets no behaviour out of the empty half at all
— it collapses to plain presence — and `core/__tests__/room.test.ts` asserts
the invariant rather than the story. The reason to count members anyway is that
the rule then says what it means: a conversation is people who belong here
talking, and a guest is somebody a member is answering for.

The other half of the guest question is sharper. `hasTheRoom` is written on
`inRoom` so that the clipboard guards, which a guest is meant to pass, can ask
it directly — which means it is *true* of every guest. Everything a guest must
not reach therefore says `isParticipant` beside it rather than leaning on the
predicate to do both jobs. `canControlPlayback` is where that bites: it used to
read `isPresent`, and the word doing the work of refusing guests was
"present", not anything about playback. Swapping in `hasTheRoom` alone would
have handed guests the shared track.

### Two of these do not go through the reducer

Renaming and deleting a recording are HTTP routes with no action to carry a
guard, so `Channels.hasTheRoomIn` asks core directly by channel id. A channel
not in memory passes, which is not a gap: `restore` revives every unended
channel at boot, so what is missing has ended, and an ended channel has nobody
in it to interrupt.

They answer **409, not 404**, and the delete route had to be taught the
difference — it flattened every refusal to 404 on the good reasoning that
absent, deleted and not-yours are one answer, since knowing a recording exists
is something only the channel's members learn. A busy channel is not that
case. The caller is a member who can already see the recording and can see who
is in the channel; 404 would tell them the one thing that has not happened to
it. `mintGuestLink` was split the same way and for the same reason — it was
answering "Not your channel" to a member whose channel it plainly is.

### The old clients are fine, which was not obvious

This tightens what a deployed server accepts without moving the wire, so build
51 and everything after it will show enabled controls the server now refuses.
The reducer-side refusals are silent no-ops, which is what a refused action has
always been on this wire — the screen snaps back on the next snapshot. The
HTTP-side ones surface properly: `DeleteButton` alerts with the message, and
the guest-link failure lands in `shareError`, both of which now read "Somebody
is in this channel. Step in to…". So the two that could confuse somebody are
the two that explain themselves.

### The controls are disabled, not hidden — the opposite of the day before

Yesterday's work hid the microphone card and the knocks. These are disabled
with a sentence underneath, and the difference is worth stating because the two
sit on one screen. What is hidden is what is *untrue* of somebody outside the
room. What is disabled is what is true and merely not theirs at this moment —
a control that vanished when somebody else walked in would read as a bug rather
than as a rule.

One consequence took a rewrite. `InviteList` filtered its contacts through
`canInvite`, which now carries the room rule, so for a watcher the list emptied
and rendered "every contact you could invite is already in this channel" —
false, and unrecoverable, there being nothing left on screen to explain itself.
The room half now arrives as a prop and disables the buttons; the contact half
still filters. **A guard that gains a clause can turn a filter into a lie**,
and the filter is the call site that will not fail loudly.

## The speaking dot needs three ways to go out, not one

2026-08-22. Somebody sat alone in a channel with the microphone shut and their
own speaking dot lit — filled, plus the floor-coloured card border, on a screen
that also said "Closed until somebody else is here". It had been that way since
the other person stepped out.

`ActiveSpeakersChanged` is computed from tracks the server is *observing*, so
it reports nothing about a track that stops existing. Whoever was in the set
stays in `hold.active`, and **`active` has no expiry — only `releaseAt` does**,
because the hold is a smoothing of live speech and there is no such thing as
speech running out. So the set is only ever narrowed by a later event, and in
a two-person channel there is nobody left to produce one.

The remote half of this was found and fixed on a departure: `onParticipantGone`
and `ParticipantDisconnected`, for somebody who leaves mid-word. **What that
fix got wrong was its own scope** — it named a participant leaving, when the
thing that matters is a *track* leaving, and there are three ways in:

- leaving the room, which was covered;
- unpublishing, which is what releasing the microphone does — and releasing is
  exactly what the last other person stepping out causes, so the transition
  that produces the empty channel is the same one that strands the dot;
- muting, which looks skippable because a self-mute keeps the device open, and
  is the one that fires while somebody else is still here.

`onParticipantGone` is now `onAudioGone` and takes all three, `TrackMuted`,
`LocalTrackUnpublished` and `TrackUnpublished` joining the departure event. The
rename is the point rather than tidiness: the old name is what made the second
and third cases invisible, and the same fix will need making again if it goes
back to being about people.

**The general shape is worth keeping: a state cleared only by the event that
sets it is stuck for as long as nothing else happens.** The floor and the
recording both have this property and both are reconciled against what the room
is actually carrying rather than trusted; this indicator is not, deliberately —
it changes several times a second and a tick's reconciliation would be a worse
account of speech than the events are. So the events have to be complete
instead, which is why they are enumerated above rather than left to whoever
next reads the file.

An installed app already showing the stuck dot keeps showing it until it
reconnects; there is nothing on the wire to correct it with.

## A granted microphone is not a working one, inside somebody else's browser — 2026-08-22

A guest followed a link from inside Telegram on iOS. Telegram's own browser
took the page, prompted for the microphone, was granted it, and the channel
heard nothing. The same link in Chrome on the same phone was fine, which is
what made it findable at all.

**Every in-app browser on iOS is a `WKWebView` owned by the host app, and the
host app owns the audio session with it.** So the sequence that produces
silence has no failure in it anywhere: `getUserMedia` resolves, the track is
live and unmuted, `publishTrack` succeeds, the SFU forwards, and what arrives
at the other end is digital silence. Apple's developer forums carry the same
shape of report against several host apps and several iOS versions — a
background transition muting `microphoneCaptureState`, CallKit taking exclusive
ownership of the microphone in a different process from the renderer, a
`mediaTypesRequiringUserActionForPlayback` that the embedder has to clear.
**Every fix in them is a change to the embedding app.** None of them is
available to a page.

So the page cannot fix this, and the decision is what it should do instead.
Three things, and the order matters:

- **Say so at the door.** `embeddedBrowser()` tests by exclusion, because the
  interesting browsers do not identify themselves: a WebKit page on iOS
  carrying neither Safari's `Version/… Safari` nor another browser's token
  (`CriOS`, `FxiOS`, …) is inside something. Named checks for `FBAN`,
  `Instagram`, `Telegram` and the rest go in front and cost nothing;
  `navigator.standalone` is excluded, since a page added to the home screen has
  no Safari token either and is not embedded. The notice is at the door rather
  than in the room **because the cure is to open the link elsewhere, and doing
  that after knocking costs the seat** — the seat is in `sessionStorage`, so
  another browser is another knock.
- **Then listen to the microphone, since the warning may be wrong in both
  directions.** An `AnalyserNode` on the published track, sampled four times a
  second, connected to nothing downstream — connecting it to the destination is
  how you build an echo. Eight seconds of samples below −54 dBFS raises a
  notice. Suspended contexts and muted tracks are not counted rather than
  counted as quiet, which is what stops a held floor or a self-mute reading as
  a broken device.
- **Offer a retry from a tap.** The `speech` message arrives on a socket,
  seconds after anybody touched anything, so the `getUserMedia` behind it has
  no gesture and a browser is entitled to treat it as untrusted. That is a
  second, independent reason for a dead microphone, and it is one a button
  actually fixes.

**The notice is worded as an observation and not a verdict** — "nothing is
coming from your microphone", not "your microphone is broken" — because
somebody sitting quietly in a quiet room with noise suppression on reads the
same way, and a page that calls a working device broken teaches people to
ignore it.

The general form is the one already learned from `attach()` earlier the same
day: **on the web, every step of the audio path can succeed and still produce
no sound**, and the native client has no equivalent of any of them. There is no
analogy to reason from. The only reliable check is to listen to what came out.

## The build census counts users, and two kinds of row are not one — 2026-08-22

`GET /healthz` reports `oldestBuild` and `silentBuilds` so that
`MIN_SUPPORTED_BUILD` can be raised against a measurement rather than a memory.
The measurement was over-counting, and the way it was wrong is worth keeping
because the reading it produced was not obviously wrong — it was pessimistic,
which is the direction that looks safe.

On production, `select identifier, last_build from accounts order by
last_seen_at` read like this: `appreview2@rvanegas.co` silent,
`erased:acct_BQYdtV9SJT3d` at 51, `appreview@rvanegas.co` at 51, and then every
real account at 56 or above. So `oldestBuild` was 51 and `silentBuilds` was 1,
when the installed population a raised floor could actually strand started at
56 and was entirely accounted for.

**Neither of those three rows is a phone belonging to somebody who would be cut
off.** A tombstone cannot sign in at all: `erase` deletes its tokens and
rewrites its identifier to `erased:<id>`, which `request-code` refuses because
it is not an email address. Its `last_build` is a fossil. The demo accounts are
a device at Apple that reinstalls whatever is under review at each submission —
DEMO-ACCOUNT.md — so what they last reported measures the last review and
nothing about anybody's install.

So `buildsSeenSince` now excludes both. The demo pair is named in configuration
rather than guessed at: `REVIEW_IDENTIFIER` was already there, and
`REVIEW_CONTACT_IDENTIFIER` is new and exists only for this — the second demo
account has no code of its own and nothing else needed to know its address.
Matching is case-insensitive, like every other identifier comparison, because
the value is typed into `.env` by hand.

**`silentBuilds` is the half that mattered.** `oldestBuild` being three builds
pessimistic is an annoyance; `silentBuilds` sitting at 1 forever is a broken
instrument. It is the flag that says the known population is not the real one,
and while it is above zero the standing rule is not to trust `oldestBuild` and
not to delete a shim on the strength of it. A demo account that will never
report a build number would have held it at 1 for the life of the app, which
retires the check rather than failing it — the failure mode where a warning
that is always on is a warning nobody reads.

Two smaller things fell out of it. **`erase` nulls `last_seen_at`, so a
tombstone should have been outside the thirty-day window anyway** — and this
one was not, which means something stamped it again after the deletion. A
socket that was already authenticated when the account was deleted writes
`last_seen_at` on its way out; the token is gone but the open connection is
not. The exclusion is by identifier prefix rather than by hoping the window
covers it, so it is certain rather than probable. And the exclusion is narrow
on purpose: an erased row keeps its `last_build` for `bin/db` to read, and the
demo accounts are still counted by everything else that counts accounts. This
is a change to one census, not to what a deleted account is.

## A ping is delivered to a phone whose app is open — 2026-08-22

The first real test of the feature failed in the one way nobody had tried.
Somebody stepped out of a channel, having asked the other member to ping them
once they were gone, and no notification arrived. Everything worked: the POST
returned 200, the sender was told it had gone, and the log recorded

    push skipped  asked:1  away:0  why:"all reachable in-app"

`pushNotifier.notify` dropped every recipient that `reachability.inApp` claimed,
and that predicate is `hasConnection` — *holding a websocket*, not *standing in
the channel*. Stepping out of a channel without leaving the app is the ordinary
way to become pingable; it is what being absent looks like from the inside. So
the filter was rejecting precisely the population the feature exists for, every
time, and it will have been doing so since the day it shipped.

**The reasoning it was built on was sound and had gone stale in a week.**
`notifications.pinged` said a ping was withheld like the rest, not because it
duplicated anything but because the in-app path for it was being built and
routing a lock-screen notification into a foregrounded app would be a workaround
with a short life. The in-app path was not built. So *withheld* did not mean
"shown another way", it meant nothing happened at all — and the comment recorded
the intention so plausibly that reading the code did not raise the question.

### Holding a socket is evidence about duplication, not about being told

The filter conflates two things that happen to coincide for three of the four
notifications. For `started`, `invited` and `arrived`, a live socket really has
already drawn the thing being announced, and a banner is a second copy of what
somebody is looking at. For `pinged` neither half holds: nothing in the app
renders a ping, and a person composed it and aimed it at somebody, so being in
the app is evidence about attention and not about having been told.

The fix is a `reachesInApp` field on `PushMessage`, false on three constructors
and true on one, tested in `app.ts` in place of a bare `inApp` check. **The
policy belongs on the message, next to the lifetime and the collapse key, and
not in the filter** — the same argument push.ts already makes for
`lifetimeMs`. A fifth notification then arrives at the filter with the question
already answered rather than meeting a rule that has never heard of it.

Which is also where this stopped being a patch and paid for itself. The seam is
the one already found for the collapse key: *who decided to send it*. What may
overwrite a notification and who a notification may reach turn out to be the
same question asked twice — the automatic three are safe to overwrite **because**
they are the channel repeating itself, and for that same reason they are the
ones a live socket has already covered. Two consequences, one distinction, and
the second fell out of naming the first.

### The rate limit was compounding it, and is now honest

`ping` stamps `lastPingedAt` before handing to push, so the five-minute window
was being spent on a notification nobody received. The sender's next seven taps
— 17:01:18 through 17:01:51 in the log — were all 409, *They have just been
pinged*, about a ping that had gone nowhere. Nothing about that is wrong as
written; it is the feature working correctly on top of a delivery that silently
failed.

It needed no change. The window bounds **sending** rather than delivery, and now
that an accepted ping is a delivered ping the two coincide, so the refusal a
sender gets is true. That is the whole argument for leaving the limit where it
is: it exists to bound a person who cannot be answered or turned off, and it
never made a promise it now has to keep.

### The banner is the app's half of the same rule

Delivery is not receipt. `setNotificationHandler` returned `shouldShowBanner:
false` unconditionally, on the same reasoning the server filter used, so a ping
delivered into a foregrounded app would have landed silently in Notification
Center — the failure moved one layer down rather than fixed. The flag therefore
travels in the APNs payload beside `channelId`, and the handler shows a banner
exactly when the server said this was worth interrupting somebody for. One
field, read at both ends, so the two cannot reach different conclusions about
what a notification is for.

Absent means quiet, deliberately: a build outliving the server it was written
against should not start showing banners for arrivals.

Still no sound in the foreground. The sound is what reaches a phone face-down on
a table, which is the case the server now handles by sending the thing at all; a
banner over an app somebody is holding is seen.

### Order of shipping

Either half is safe alone, which is unusual here. The server half deploys by
itself and immediately fixes the reported failure — an older build receives the
ping and files it in Notification Center without a banner, which is strictly
more than the nothing it got before. The app half is inert until a build carries
it. No wire compatibility question and nothing for `MIN_SUPPORTED_BUILD`.

## A ping replaces nothing, so the header comes off — 2026-08-22

Same afternoon, same feature, and the second half of one idea. A ping was given
a collapse key of its own — `<channelId>:ping` — so that an arrival could not
overwrite what somebody had typed. The reasoning stopped one step short: it kept
pings out of the *automatic* stream but left them in a stream of their own,
where a second ping still discards the first. That was written down as a
decision — "two lines from one person about one channel is nagging rather than
information" — and it is wrong on the facts of what a ping is. **Each one
carries words somebody chose.** No later ping is a better version of an earlier
one, and none is entitled to speak on its behalf. Losing one is losing a
sentence a person wrote to somebody, quietly, at Apple, after this server has
reported success.

The comparison that settles it is with the three the key was designed for. A
second `arrived` for a channel really is a better version of the first: same
room, later, and one line about a room that filled and emptied all evening is a
mercy. That property is what makes collapsing safe, and a ping does not have it.

### Null, not a unique key

`collapseKey` is now `string | null`, and `ApnsPusher` omits `apns-collapse-id`
entirely when it is null. The alternative — a key made unique per send — behaves
identically and says the wrong thing: it is a collapse key arranged never to
collide, which reads to the next person as an accident to be tidied up. The
absent header is how APNs is told, in its own vocabulary, that a notification
stands on its own.

Grouping is untouched and is a different mechanism: `thread-id` is still the
channel, so pings gather under their channel in Notification Center rather than
scattering through it. Losing that would have been the obvious over-correction,
so there is a test for it.

### The transport got its first test

The collapse header is the only conditional one, and its absence is
load-bearing, so `apns-headers.test.ts` stubs `node:http2` and reads what was
actually sent. Everything else about push stops at `MemoryPusher`, one layer
above where headers are composed — which is why a ping growing a collapse id
back would have been invisible to the whole suite and visible only to two
phones, five minutes apart, with somebody watching.

### What the rate limit now means

With no collapsing, the five-minute window is the only thing bounding pings, and
that is the right place for it: it refuses out loud, to the sender, at the
moment of sending. The old arrangement had a second limiter behind it that
nobody was told about — the window refused the second ping, and had it not, the
collapse key would have thrown it away anyway.

## Only a ping makes a sound — 2026-08-22

Every notification this server sends carried `sound: 'default'`, which was
never a decision so much as the first payload anybody writes. It is now false
for the three the channel sends about itself and true for the one a person
composes — the third property to fall on that seam, after the collapse key and
in-app delivery.

**The quiet ones are what buy the loud one its credibility.** A phone that
chimes every time a room fills and empties is a phone whose owner turns this
app's notifications off, and the ping goes with them — the single notification
that was worth interrupting somebody for, lost to the noise made by the ones
that were not. Nothing is given up: a silent notification still arrives, still
shows a banner, still lights the lock screen. What it does not do is demand the
room's attention on behalf of a room somebody merely walked into.

`sound` is omitted from `aps` rather than set to something quiet. There is no
silent sound, and an empty string is a value APNs has opinions about rather
than a way of asking for silence — the same shape as the collapse header
earlier the same day, and for the same reason: absence is the vocabulary.

### Nothing above `active`, deliberately

`interruption-level` has two rungs above the default and neither is claimed.
`time-sensitive` pierces Focus modes and Scheduled Summary; `critical`
overrides the ring switch. **Somebody who has put their phone in a Focus mode
has said something, and a conversation app is not entitled to talk over it.**
A ping is a good technical fit for `time-sensitive` — come now, expires in five
minutes, composed by a person — and that is exactly why the refusal is worth
writing down rather than leaving to be rediscovered as an opportunity. There is
a test asserting no interruption level is ever sent, so a future attempt to
make pings "more reliable" has to argue with something.

The entitlement costs are worth knowing since they will come up: `time-sensitive`
needs a capability on the app but no approval, while `critical` needs an
entitlement Apple grants by hand plus a separate user opt-in. Cheapness was not
the reason for declining either.

### Three fields, not one predicate

`collapseKey`, `reachesInApp` and `audible` are now set alike by all four
constructors, which invites somebody to replace them with `isPing`. They answer
different questions — what may be discarded, what would be a duplicate, what is
worth interrupting for — and a notification that should arrive quietly and never
be overwritten is easy to imagine. The fields can say that; a predicate cannot.
The reasoning also has to live somewhere a constructor can see it.

## Notifications have a level, per channel and per person — 2026-08-22

Three days of decisions about how loudly this app may interrupt somebody ended
where they were always going to: with the person deciding. `low`, `medium`,
`high`, set per channel, held per account, defaulting to the arrangement that
was hard-coded until now.

| | started | invited | arrived | pinged |
| --- | --- | --- | --- | --- |
| `low` | passive | passive | passive | **passive** |
| `medium` | silent | silent | silent | **audible** |
| `high` | **audible** | **audible** | **audible** | audible |

**`low` takes the ping down with everything else, and that is the one entry
not dictated by the brief**, which said only that a ping goes passive there.
The alternative — the automatic three staying `silent` while the ping alone
drops to `passive` — would make being asked for by name *less* obtrusive than
somebody wandering into the room. Nobody would choose that on purpose, and it
is the kind of inversion that survives for months because each half looks
right on its own. Every column is now non-decreasing down the rows, which is
the property to preserve if the table is ever edited: turning the setting up
must never make anything quieter.

`passive` is the rung *below* the default and needs no entitlement. Nothing
here reaches `time-sensitive` or `critical`, and the test asserting so still
stands.

### Loudness stopped being a property of the notification

`audible: boolean` had been on `PushMessage` for about an hour. It was correct
while it was a fact about the notification and stopped being correct the moment
each person could set a level: the same arrival is audible to somebody who
asked for everything and passive to somebody who did not, so there is no value
a constructor can honestly write down.

So `kind` replaced it — which of the four this is — and the loudness became an
argument to `Pusher.send` rather than a field on the message. `alertFor(kind,
level)` in `core/notifications.ts` is the whole rule, and `notify` groups the
recipients of one event by what they each asked for: one call in, one request
per distinct answer out. **The common case is still a single request**, because
the common case is that nobody has touched the setting.

The rule lives in core rather than the server because both ends need it for
different halves of one question: the server decides what to send, and the app
tells somebody what they have chosen. A settings screen explaining the levels
from its own table is one that can disagree with what the phone then does, and
that disagreement is invisible until somebody complains that a setting lied.

### Storing only the exceptions

`channel_notification_levels` holds a row only for people who have changed
something. Absence is the default, so there was no backfill, and choosing the
default again is a delete rather than an update.

That is not an optimisation. A row saying `medium` and no row at all mean the
same thing today and would stop meaning the same thing the day the default
moves — at which point everybody who had ever opened the screen and left it
alone would be pinned to the old arrangement, indistinguishable from the people
who meant it. The route echoes the *stored* level back rather than the
requested one for the same reason.

It is deliberately not in the channel's state blob, though it is per channel.
That blob is the reducer's, is rewritten whole on every transition, and is the
same for everybody. This is one person's preference, read on a path no reducer
runs, and it must never travel to the other members — a field in the blob would
have been all three of those things by accident.

### One person's setting, on a snapshot everybody gets

`ChannelView.notificationLevel` is the viewer's own and nobody else's. Which
member has turned a channel down is not a fact about the channel, and a
snapshot carrying the roster's settings would make "has muted you" readable by
the people it is about. That is a different feature and nobody asked for it.

The snapshot was already per connection — `recordings` and `pingableAt` are
viewer-relative in exactly this way — so this cost nothing structurally. There
is a test with two clients watching one channel and seeing two different
answers.

### What `high` cannot reach yet

`started` at `high` is unreachable in practice, and honestly so. The setting is
per channel, and a channel does not exist before it is created — so nobody can
have asked to hear loudly about a channel that is about to be started with
them. The code handles it because the table is total, not because the case
occurs. **An account-wide default is what would make it reachable**, and that
is the natural next question rather than a defect in this one.

### The app makes the same decision twice, and must not disagree

A passive ping is delivered but must not put a banner over the app somebody is
holding — that would be exactly the interruption they declined, arriving by
another door. So the resolved alert travels in the payload beside
`reachesInApp`, and the handler tests both. The phone is told the *conclusion*
rather than the setting: the level lives on the server, and a client
re-deriving it is a client that can reach a different answer.

## Two collapse-and-expiry defects, found by reading rather than by failing — 2026-08-22

A review of the expiry and collapse rules, prompted by nothing going wrong.
Both defects are the same shape as the ping-collapse one earlier the same day —
something that stays true being discarded by something that does not — and
neither would have announced itself, because the evidence is a notification
that is absent.

**The thing to hold on to: expiry governs delivery, never display.**
`apns-expiration` is how long APNs keeps *retrying* an undelivered
notification. Once it lands it stays in Notification Center until somebody
dismisses it, so the five-minute presence lifetime tidies nothing up. Collapse
is the only thing that stops the list growing; expiry is only ever about the
phone that was off.

### An arrival could destroy an invitation

`started`, `invited` and `arrived` shared one collapse key, `channelId`. The
first two stay true for thirty days and the third for five minutes — the file
names that seam, uses it for the lifetimes, and then drew the collapse key on
the *other* seam, the one about who composed the notification.

So: Alice invites Bob to Standup, and his lock screen reads "Alice — Invited
you to Standup". Ten minutes later Carol steps in. Same key, so APNs replaces
the notification already sitting there, and it now reads "Standup — Carol
stepped in". The one notification telling Bob he had been added to a channel is
gone, overwritten by one that expires in five minutes and says something else.
He will find the channel on Home eventually; the thing whose whole job was to
tell him has been thrown away.

Membership now takes `${channelId}:you` and presence keeps `channelId`.
**The collapse keys follow the lifetimes**, which is the seam that was already
right. `started` and `invited` share the new key safely, since being invited to
a channel you were just started into does not happen — one makes you a
participant and the other refuses everybody who already is.

### A passive ping was droppable, which is losing rather than quieting

Self-inflicted, an hour old, and from the level work. `apns-priority` was
chosen by *alert*, so `passive` meant priority 5 — and priority 5 lets iOS
defer delivery while the five-minute expiry goes on running. The two compound,
and they compound hardest for exactly the wrong person: the phone least likely
to be awake belongs to whoever turned this channel down. The outcome is not a
quiet ping. It is no ping, no record that one was sent, and nothing said to
either end.

Priority now follows the kind rather than the alert: 5 for a passive
announcement about the room, 10 for a ping at every level. **`low` says do not
interrupt me; it does not say throw away what people write to me**, and that
distinction is the same one that stops a ping collapsing.

The battery argument survives where it was actually made — about presence
noise, which is where the volume is.

## Two stacks, not one per channel — 2026-08-22

`thread-id` gathers notifications into one expandable pile and keeps every one
of them; a collapse key destroys what it lands on. The two take the same kind
of argument, both make a lock screen shorter, and confusing them is how an
afternoon of work protecting the words in a ping would be undone by somebody
"tidying up the duplication".

The piles are now drawn on a seam this file had not named. `started`, `invited`
and `pinged` share `ASKING_THREAD` across every channel: those are the three
where **a person did something aimed at you** — opened a channel with you,
added you to one, called you into one. `arrived` is the only one that is merely
a room reporting its own state, and it keeps a stack per channel.

So a phone shows at most two kinds of pile: somebody wants you, and this room
is busy. A lock screen answers "is anybody asking for me" in one place instead
of once per channel — which is the question people actually have, and the
reason the cross-channel mixing is the point rather than the price. Which room
it was is what tapping is for, and the tap still lands correctly because that
comes from `channelId` in the payload, which is a third thing again.

**A ping stands alone and stacks, at once.** It sends no collapse header and it
joins the pile, which is only a contradiction if the two headers are read as
one. There is a test that says exactly this, because it is the sentence a
future reader will not believe.

## The phone tidies up, because iOS never will — 2026-08-22

There is no expiry on a *delivered* notification, anywhere in APNs or iOS.
`apns-expiration` bounds how long Apple retries one that has not landed; once
it lands it sits in Notification Center until something removes it. So the
five-minute presence lifetime, which reads like a self-destruct, tidies nothing
up at all — a phone left alone all evening accumulates announcements about
rooms that emptied hours ago, and the only thing that can remove them is this
app.

Four mechanisms exist and three of them are wrong here. A background push can
wake the app to clear them, but delivery is opportunistic and throttled, so it
cannot be relied on at a chosen minute. A notification service extension runs
when a *new* notification arrives, which is tidying on the next event rather
than on a clock. Collapse already bounds arrivals at one per channel and never
empties the list. What is left is the app removing its own, which it can only
do while running.

**So the rule became "remove them when they stop being able to be true", not
"when they get old"** — and that is nearer what a timer was wanted for than a
timer would have been. An arrival is stale the instant the app opens, because
the app shows who is present: the notification and the screen would be saying
different things, and the screen is right. `sweepArrivals` runs on launch and
on every foreground.

**Arrivals only.** An invitation stays true until it is acted on, and a ping
carries words somebody chose; sweeping either on a clock would delete something
nobody had read. Those are cleared by opening the channel they name —
`sweepChannel`, hung off `watchChannel` because that is the one call every
route into a channel makes, including a tap on the notification itself.
Invitations survive even that, though walking in is arguably acting on one:
they are the only record that somebody added you to something, and the cheaper
mistake is one line too many.

It cost a field. `kind` now travels in the payload, because a delivered
notification is otherwise opaque to the phone holding it — there is no way to
tell an announcement from a summons without being told. Nothing in the server
suite would notice that field going missing, and the symptom on a phone is an
old announcement that never goes away, so there is a test on the payload
specifically.

## Four notifications became three — 2026-08-22

`started` — somebody opened a channel with you — is gone, folded into
`invited`. By the end of the day it differed from `invited` in nothing a rule
could see: the same collapse key, the same thread, the same month-long
lifetime, the same alert at every level, swept by neither, and never
distinguished from it at any site that reads `kind`. What remained was one
sentence.

**Two kinds that no rule separates are one kind with two bodies**, and
`invited` had the two bodies already: it says *Invited you to Standup* when the
channel has a name and *Invited you to a channel* when it does not. A channel is
never named at creation, so the nameless form is precisely what a new channel
is. Nothing had to be written to absorb the case; the sentence was there.

The name was worth having while it lasted. `notifications` exists so that a
question about one of these can be asked about a word rather than a fragment of
prose, and the day the four were named was the day the two seams became
visible. This is the same exercise carried one step further: a name that turns
out to mark no distinction is a name that will eventually be given one by
somebody who assumes it already means something.

### The second call site is why this needed reading twice

`started` had two, and only one of them was creation. The other is
`announceStarted`, which fires the first time anybody is present in a channel
nobody has ever been in — the standing channel a pair get on becoming contacts,
entered from a Home card. It reads like presence and is deliberately not:
`commit` says so at the branch, because `arrived` would give it five minutes and
let the room's own traffic overwrite an invitation about a conversation the
other person has never had.

So the fold covers it, and covers it better than a glance suggests. That site
wanted membership semantics all along and was borrowing `started`'s wording to
get them; it now sends the notification whose semantics those actually are —
and can pass the channel's name, which `started` had no parameter for.

The wording is no less true there than what it replaced. `Started a channel
with you` was already an approximation: the channel had existed, silently,
since the pair became contacts. What is new is being asked into it.

## Nearby, not waiting — and the ping is on the card — 2026-08-22

A member whose websocket drops reads as present-in-spirit for
`WAITING_WINDOW_MS`, on the reasoning that pocketing a phone suspends the
process in under a second, so most absences from an otherwise empty channel are
a connection rather than a decision. The card said **Waiting for 5 minutes**.

**It named the wrong person.** The card is read by somebody standing in an
empty room, and that person is the one waiting. Being told that the absent
party is waiting reverses who is doing what, and invites the reply *no, I am*.

**Nearby** says the useful thing instead: this person is within reach, and one
notification would fetch them. Which is also the argument for what went with
it — if the state means a ping would work, the ping belongs on the card that
says so, not two screens away behind a profile and a composer.

### Wordless, which is the point rather than a shortcut taken

The composer on the profile is for when you have something to say. This is for
when the thing to say is *come back* — which the notification already says by
arriving. A field would make the quick case slower than the considered one, so
the card sends `''` and the body reads *Alice is asking for you*, which is the
sentence `pinged` has always had for a ping with no words.

Offered only while somebody is nearby, and that narrowing is deliberate.
Somebody who stepped out an hour ago is a different act — open their profile
and say something — and a button on every absent card would turn the roster
into a row of controls rather than a picture of the room.

### What is not renamed

`ChannelState.waiting` and `isWaiting` in `core/` keep their names. The field is
on the wire, and renaming it would cost a two-step migration — teach the server
both names, deploy, ship the client, remove the alias a release later — for a
word no user ever sees. The screen is where the word was wrong. There is a
comment at the call site saying so, because the gap between the state's name
and the card's word is exactly the kind of thing somebody later tidies into
agreement, in the wrong direction.

### The refusal is left to correct itself

The card has no room for a sentence, so a failed ping reverts the button rather
than reporting. Both refusals the server can give are already on their way here
as state: they walked in, and the card stops being nearby; or somebody pinged
them a moment ago, and the next snapshot carries the window that disables the
button and says **Pinged**. The optimistic *Pinged* does not wait for that
snapshot — the notification has already gone, and half a second of a button
that looks unpressed reads as a dropped tap.

## A claim is a minute, and its clock is a number — 2026-08-22

`FLOOR_CLAIM_MS` was three minutes, chosen before anybody had used the thing.
Sixty seconds now.

**Three minutes is longer than the turn it was protecting.** An uninterrupted
minute is a long time to speak into a phone, and the ceiling is not paid for by
the person holding it — it is paid by everybody else in the room, whose
microphones are cut for the whole of it. The asymmetry is what makes a generous
ceiling the wrong default: a claim that runs out is cheap to fix, since the
holder claims again and nobody else has done anything in the meantime, where
three minutes of being unable to say a word is the kind of thing somebody
leaves over rather than complains about.

### The display follows, because there is no minutes column left

The floor card's two clocks — the claim countdown and the cooldown — were
`mm:ss` through `formatDuration`. Both are now bounded under a minute by
construction (the claim by `FLOOR_CLAIM_MS`, the cooldown by
`FLOOR_CLAIM_DELAY_STEP_MS × FLOOR_CLAIM_DELAY_MAX_STEPS`, which is twenty
seconds), so the left-hand digit could only ever be a zero, and **0:47** asks a
reader to parse a clock face to learn a number. `formatSeconds` says **47s**.

It is a second function rather than a mode of the first. What makes seconds
safe here is that these two durations are bounded, and nothing else on screen
is: a recording or a loaded track passes a minute routinely and keeps the
clock.

### The one place the two constants stopped being independent

`DISCONNECT_GRACE_MS` is also sixty seconds. It used to be a third of the
claim, which meant a disconnected holder was always removed by the grace period
long before the claim could expire — the expiry never ran for them, and
`connectivity.test.ts` pinned that with `toBeLessThan`. The two now land on the
same tick.

Nothing changes in the outcome, because both release the floor, so the test now
pins the outcome and not the ordering: the holder is gone, the floor is free,
and their `lastClaimedAt` still stands so they rank as having spoken most
recently. Written that way deliberately — a later change to either bound
should not have to care which of them is asked first.

### Old installs will count down wrong for one release

The constant lives in `core/`, which both ends import, so a phone on build 51
holds three minutes while the server holds one. The server's reducer is
authoritative and releases at sixty seconds; the old client's countdown is
simply reading its own copy of the number, and the release arrives as a
snapshot with a null holder, at which point the countdown disappears. It shows
a number that is too large for up to a minute and then stops. Not worth a
two-step migration for.

## "Been nearby for", the bare form having read as a promise — 2026-08-22

Same day as the entry two above, and a correction to it. **Nearby for 5
minutes** was elapsed time, and next to a Ping button it is not heard that way:
*for five minutes* reads as how long this person will still be within reach.

A remaining-time version was built first and thrown away — *Nearby for another
10 minutes*, counting down the rest of `WAITING_WINDOW_MS`. It is the more
actionable fact, being how long the tap beside it will still work, but it
promises something the app does not know: the window is how long we go on
calling somebody reachable, not how long they will be. The perfect tense fixes
the reading without touching the number. **Been nearby for 5 minutes.**
