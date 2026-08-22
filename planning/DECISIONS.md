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
