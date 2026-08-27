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
| `DECISIONS-2026-08-23-to-2026-08-24.md` | the whole watch party, the profile, and several sessions per account | nothing — closed by rollover |
| `DECISIONS.md` — this file | 2026-08-24 onward | live |

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

### 2026-08-27 — `c7537d7` → `92fc306`

Four commits: the sweep's `terminate`, the floor released on `DISCONNECTED`, the
`/healthz` counters, and the DECISIONS and TASKS.md landing edits. The reasoning
is § *Talking into a void, which had three causes and one of them was
politeness*; this is what the deploy itself did.

**No two-step was needed and there is no wire change to sequence.** The three
new `/healthz` fields are additive and read by `bin/health` alone; nothing on a
phone asks for them. The floor change is a rule inside `core/`, which both ends
import from the same source — so the server and every installed build agree
about it the moment this restarted, with no version in which they disagree. The
client half of the early warning is build 107, uploaded minutes after this, and
it needs nothing from this deploy: `RoomEvent.ConnectionQualityChanged` comes
from the SFU rather than from this server, so the new roster line works against
a server that had never been redeployed.

**What installed builds see from the floor change is a claim ending sooner**,
which is a state they already draw — a released floor is a released floor,
whether it was released by a tap, an expiry or a drop. Nothing was added to the
snapshot for them to fail to understand.

The counters start at zero here and reset on every restart, which is the whole
of what makes them worth reading off a box that has been up a while.
`DISCONNECT_GRACE_MS` was deliberately not changed by any of this; these exist
so the next argument about it can be had with data.

`bin/health` confirmed `92fc306` against this checkout, `oldestBuild` 56 and no
silent builds, so `MIN_SUPPORTED_BUILD` is untouched at 51 and nothing was
expired by this. The new line reads `drops 0 (recovered 0, expired 0)`, as a
just-restarted box should.

### 2026-08-26 — `a4491cf` → `c7537d7`

Four commits: the revert of `bab713e`, the two that replaced it, and the
working tree's pending TASKS.md edits folded into the landing. The server's half
is two fields on `RejoinableView` — `lastPresenceByOthers`, the room's recency
with the reader taken out, and `steppedInAt`, when that reader last stepped in —
plus the `lastEntry` map behind the second and `PRESENCE_LIFETIME_MS` moving to
`core/constants.ts` so both ends read one window.

**Both fields are additive and optional, so no two-step was needed.** An
installed build receives two keys it has never heard of and ignores them; the
client that reads them is build 106, uploaded minutes after this. The order is
still the ordinary one and still matters — the app falls back to
`lastPresenceAt` when `lastPresenceByOthers` is absent, so a phone that updates
before this deploy lands would draw the old line and the old order rather than
anything wrong, and would start drawing the new ones the moment the server
answered with them.

**Nothing was migrated and nothing needed to be.** `lastEntry` is in memory by
design — five minutes wide, and a restart drops presence anyway — so this deploy
started it empty, which reads as "nobody has stepped in recently" on every row
until somebody does. That is the honest state after a restart rather than a gap:
the restart path already pre-suppresses arrival announcements for the same
window, so there was nothing to preserve.

`bin/health` confirmed `c7537d7` against this checkout, `oldestBuild` 56 and no
silent builds, so `MIN_SUPPORTED_BUILD` is untouched at 51 and nothing was
expired by this.

### 2026-08-25 — `ef0d0a2` → `d1794b7`

Two commits, one of them the build 98 bump. The server's half is
`transcript_voices` and the route that writes it: somebody who was in the room
says who the provider's speaker labels actually were, and the transcript is
named, collapsed and filtered from that. TRANSCRIPTS.md has the reasoning.

**A new table and no migration**, which is worth saying because it looks like
one. `CREATE TABLE IF NOT EXISTS` in SCHEMA is the whole of it: only the voices
somebody has said something about get rows, so absence is the default naming
and there was nothing to backfill. Confirmed present on the live database after
the restart rather than assumed.

**Deployed before the client that uses it, deliberately.** The app's naming
screen is build 99, uploaded minutes after this. A build that predates the
route ignores the new `voices` field on the transcript read — it is optional
and nothing renders it — and never calls the PUT, so the two-step here is the
ordinary one rather than a break: server first, client after.

### 2026-08-25 — `3d13362` → `ef0d0a2`

Two commits, one of them the iOS build bump. The server's half is the naming
and grouping of transcript lines: a stem the provider gave more than one
speaker label to now reads `Played audio (A)` against `Played audio (B)`, and
consecutive lines from one voice come back as one entry with paragraphs. See
TRANSCRIPTS.md for what decided it and for the member-stem question it left
open.

**No wire break, and no two-step needed.** `displayName` on a transcript line
already existed and already travelled; what changed is what the server puts in
it. An installed build renders the new string exactly as it rendered the old
one — the grouping is the app's own doing, and a build without it shows the
same lines it always did, one card each.

**The range starts at `3d13362` rather than at `901bdd1`, which is where this
history stops.** That is not a typo: the box was found on `3d13362` — the whole
of the transcripts feature, six phases of it — and nothing here records how it
got there. Whatever ran between those two shas was deployed without an entry.
The measurement is `bin/health`, and it was the only thing that knew.

### 2026-08-24 — `3c5f771` → `901bdd1`

Nine commits, of which two are the server's: `displaceOtherSessions` now fires
on `STEP_OUT` and `LEAVE_CHANNEL` as well as `ENTER`. The rest is the app's
stale-socket work, `bin/live`, two design documents, and AGENTS.md.

**A wire change that needed no two-step, which is worth saying because it looks
like one.** `core/protocol.ts` moved, so the instinct is to reach for the alias
dance in AGENTS.md § *Never ship a wire change to a server before the client can
speak it*. It does not apply here: `channel.displaced` is a message every
installed build already handles, and the change is only the set of actions that
provoke it. An old client receiving one on a Step Out does what it does on an
arrival — stops believing it is standing anywhere — which is the correct
behaviour and the reason the message was widened.

**The half that is not shipped is the client's.** The belief this corrects is
re-sent by `onopen` in `app/src/api/socket.ts`, so the server telling the truth
sooner helps every build, but the accompanying app work reaches nobody until
build 94 is released. Deployed at the same sitting as the upload, in that order,
which is the order that cannot be wrong.

Nothing to watch on the way in: presence survives a restart, and the added
sends are to sessions that were about to be told something anyway.

### 2026-08-24 — `29266a5` → `af41969`

The playback heartbeat, plus `b167172` — another session's contact-removal work,
which had landed on `master` between the two deploys and rode along as any
merged commit does.

**Server-only, and the deploy is the whole of shipping it.** No wire change, no
floor change, no client build: build 87 in the App Store speaks everything this
needs, which is why the fix could be tested the same hour it was written rather
than after an upload, a review and a release.

**What it is waiting to find out is whether it ever fires.** The change is a
correction for a shared-playback pump that has stopped producing frames — see
§ *A channel that cannot be heard, and nothing that could tell*, the entry above
this section — and it was diagnosed from the code and from this box rather than
reproduced on a phone. So the deploy is also the instrument:

    journalctl -u thefloor --since today | grep playbackStalled

**A line there means the server had stopped being audible and rebuilt itself.
No line, on a recurrence, means the server was producing frames throughout** and
the fault is on the phone — which is a different afternoon's work, in the audio
session rather than the pump. Knowing which before starting is the whole value
of the log line, and it is the reason this went out ahead of any client change.

Nothing to watch on the way in: the stall check runs on the existing tick, the
heartbeat is a number the pump already had the information for, and a channel
with no track loaded has no playback session to check.

### 2026-08-24 — `b37879a` → `29266a5`

The backfill the entry below says was on a branch, plus the build 87 bump that
`bin/upload-ios` committed on its way past.

**It closed the census gap the same minute it opened, which is the only reason
the gap cost nothing.** `/healthz` went `oldestBuild: 56` → `null` on the
previous deploy and `null` → `56` on this one, and the nine session rows went
from nought stamped to nine. The number is the same one it was before the
migration, which is the point: nothing was measured differently, something was
briefly not measured at all.

**The timing was luck and is worth naming as luck.** Two things made the
backfill exactly right rather than approximately right, and both were true only
because the window was short. Nobody had connected since the restart, so the
census never entered the partial phase — the dangerous one, where `oldestBuild`
reads like a healthy number over whichever phones happen to have reconnected.
And no account had a second session yet, so `accounts.last_build` still held
what it held under one-session-per-account: that account's only session's
build. `markSeen` overwrites it with whichever device spoke last, so from the
first genuine second device onward, copying it down would have stamped a silent
old phone with a newer phone's build — reintroducing exactly the masking the
whole change was made to remove.

So the fix had a shelf life measured against the feature it was fixing, and
`bin/db` is what established that it had not expired: nine sessions, nought
stamped, no account holding two. **Check the shape of the data before trusting
a backfill, not just after** — the assertion that made this one legitimate is
about what the source column meant at the moment it was copied, and no test can
know that.

### 2026-08-24 — `5515f16` → `b37879a`

Twelve commits, of which the two that matter are several sessions per account
and the per-device facts that had to follow it. See § *Several sessions, one
voice*.

**The wire change in this deploy is one additive line** — `displaced` on
`ServerMessage` — and the check that licensed deploying the server first was
`git diff 5515f16..HEAD -- core/protocol.ts`, which is that line and nothing
else, plus reading build 56's own `switch (message.type)` to confirm it has no
`default` and drops an unknown type silently. `oldestBuild` said 56, so that
was the build to read. The habit worth keeping is the second half: the
compatibility argument is about what the oldest *installed* client does with
the message, and that is answerable by looking at its source, not by reasoning
about what clients generally do.

**And the deploy revealed a hole in its own migration, which is the part worth
writing down.** `tokens` gained `last_seen_at` and `last_build`, and the
migration adds them null. The census reads `MIN(last_build)` over sessions with
a non-null `last_seen_at`, so at the moment of the restart it had nothing to
read: `/healthz` went from `oldestBuild: 56` to `oldestBuild: null`, and nine
session rows carried no stamp between them.

Null was *expected* and is not the problem — it is loud, and nobody raises a
floor on a null. The problem is the shape of the recovery. Sessions stamp
themselves as their clients reconnect, so the census refills over hours and
days, and while it is refilling `oldestBuild` reports the minimum over
*whichever phones have opened the app since the deploy*. That reads like a
healthy number and is biased upwards, which is the one direction that strands
installs.

**It also created a category the design did not have.** `silentBuilds` exists
precisely so that `oldestBuild` cannot be mistaken for a measurement while
anything is unaccounted for — but it counts sessions *present in the window
that declined to say*. A session that has not been stamped at all is in neither
number. So for the length of the refill there is a population that is invisible
to both, and the guard rail that was built for exactly this reads zero.

The fix is a backfill the migration should have carried: before this change
there was exactly one session per account, so `accounts.last_seen_at` and
`accounts.last_build` *are* that session's values and can be copied into any
`tokens` row that has none. It was found after the restart, so it shipped in
the next deploy rather than this one — see the entry above, which is also where
the reason its window was closing is written down.

Nothing else was observed to change. Nobody was connected — the most recent
`accounts.last_seen_at` was 135 minutes old when the box came back, which is
also why the stamping path is proven by tests here and not yet by production.

### 2026-08-23 — `0afaa1f` → `5515f16`

**The first deploy that ships no server code at all.** The three commits are
`bin/health`, the AGENTS.md rewrite that stopped it carrying a sha, and the
`0afaa1f` entry below — a script, a rule and a paragraph. Nothing under
`server/`, `core/` or `app/` moved, so the only thing that changed on the box
is `server/deployed.json`'s stamp and the sha `/healthz` reports.

Which was the point of running it rather than skipping it. `bin/deploy` is what
writes that stamp, and until it runs the box reports the last commit that was
deployed rather than the last commit that exists — `bin/health` said `0afaa1f`,
three ahead, and that reading is exactly what the script was written to make
visible. Deploying makes the box's answer and the checkout's HEAD agree again.
A deploy of documentation is cheap; a box that quietly disagrees with the
working tree is what cost the day § *The most recent deploy is not
documentation* is about.

**The cost is a restart, which is not nothing.** Presence drops, the floor
drops, and any recording in flight goes with it — for a change no user could
observe either way. Worth weighing next time: a docs-only deploy could as
easily wait and ride along with the next real one, and the only reason to run
it alone is to stop `bin/health` reading behind. That is a reporting problem,
not a production one.

Verified against production afterwards: `/healthz` on `5515f16`,
`deployed.json` stamped clean at `2026-08-24T04:28:32Z` — UTC again, this went
out at 21:28 local — the service active, and the startup line reporting
`commit: 5515f16`, `minBuild: 51`, `push: apns:production`. 26 live channels
revived, and the `requested room does not exist` burst was exactly 26, one per
revived channel, same shape as the deploy below.

### 2026-08-23 — `be96c46` → `0afaa1f`

A profile now says when the person has been in each channel you share, and
carries an address either of you may show the other. The fifth deploy that day,
and **written up after the fact** — the box was running it before anybody
noticed there was no entry, which is the gap § *The most recent deploy is not
documentation* names and does not fix.

**Nothing installed can see either half, and the server going first cost
nothing.** Both are read from `GET /profiles/:id`, which no released build asks
for these fields on, so the deploy is inert until an upload — the two-step's
step 1 met by circumstance rather than by design. The new table is `CREATE
TABLE IF NOT EXISTS email_reveals` in `SCHEMA`, so there was no migration to
run and no step that could be forgotten on a rebuild.

Verified against production afterwards: `/healthz` on `0afaa1f`,
`deployed.json` stamped clean, the service active, `email_reveals` present in
the live database, and `/privacy` serving the rewritten address paragraph.
24 live channels revived, and the `requested room does not exist` burst was
exactly 24 — one per revived channel, `restore()` closing rooms that went with
the old process, not new.

`/privacy` is the half worth noticing: it is server-served, so the one
user-visible part of this deploy reached every screen in a minute while the
profile screen beside it waits on an upload, a submission, an approval and a
release. Which is why it could be checked with `curl`.

`deployed.json` reads `2026-08-24` because the box stamps UTC and this went out
at 20:45 local; the dates in this repository are local.

### 2026-08-23 — `6dd3735` → `d76908e`

The watch party's mute now follows the transport, holding while the video plays
and lifting on a pause. **Four deploys went out that day** and the three before
it are below.

**It was deployed before the client that needs it, and that ordering was the
point.** `core/` is imported by both ends, so the two have to agree on what
*muted* means: a build 82 client against the previous server would open its
microphone on a pause and say "you can talk" while the server went on
withholding every subscription. People talk, nobody hears, and the screen
insists otherwise. That is RELEASING.md's step 1, met rather than read. Nothing
installed could disagree either way — mute-all landed after `build/81` was
tagged, so build 82 is the first build with any mute at all.

Verified against production afterwards: `/healthz` on `d76908e`,
`deployed.json` stamped clean, the service active, 25 live channels revived,
`partyWithholds` in the synced `core/watch.ts` and `core/micNeeded.ts`. The
`requested room does not exist` burst at startup is **not** new — one at each
restart, `restore()` closing rooms that went with the old process.

**Half the watch party ships like a website and half like an app**, which is
what will catch somebody out: the follower page is server-served, so a deploy
puts it on every screen in a minute, while the channel card beside it needs an
upload, a submission, an approval and a release.

**This entry was the last one to live in AGENTS.md**, which kept the most recent
deploy and moved its predecessor here as each new one landed. That stopped on
2026-08-23: a sha in a file nobody re-reads goes stale silently, and `bin/health`
answers the same question against the box. Entries now come straight here. See
§ *The most recent deploy is not documentation*.

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

## A channel that cannot be heard, and nothing that could tell — 2026-08-24

The first entry of this volume, which the last one's line count closed.

From TASKS § *Stepping Back In*: step into a channel, play an uploaded track,
walk to Home and back, and the audio is gone. The transport still runs. Pause
and play still work and the position still advances. Stepping out and back in
does not restore it, force-quitting the app does not restore it, and only
stepping into a *different* channel produces audio again.

**The last two facts are the diagnosis.** Nothing a phone does survives being
force-quit, and nothing about one channel follows you into another. What is per
channel and outlives every client in it is the media participant: it is opened
by the first track and kept for the channel's life on purpose, publishing
silence between tracks so a recording's stem keeps its place. So the thing that
had stopped was the pump, and everything the person could see was reporting on
something else entirely.

### Everything visible was committed state, which is why this could last for ever

`playbackPositionMs` is arithmetic on `startedAt` and the clock. The transport
is the reducer's `status`. The volume, the scrubber, the pause button and the
recording's red dot are all state this server holds and pushes, and every one of
them was correct. **None of them is about whether a frame reached the room**,
and until this entry nothing in this system was. A pump that stops is therefore
invisible in exactly the way that matters: the screen is not merely optimistic,
it is *accurate*, and it is describing the wrong thing.

That is the same shape as the two faults the media plane already carries
corrections for — a mute stated against a track that has been replaced, an
egress asked for before a track existed — and the rule those produced is stated
in AGENTS.md as the transition being for latency and the reconciliation for
truth. Playback had the transition and no reconciliation.

### Two ways the pump stops, and it can recover from neither

**A read answered by a decoder that has been replaced.** `pause` and `play` both
stop the current decoder, and stopping an `FfmpegDecoder` does not answer the
read waiting on it — killing the process wakes the waiter, which finds neither
samples nor an end and waits again, and the answer arrives with the child's
`close` event, whenever the operating system gets round to it. That answer is
`null`, which is the same word the pump uses for "the file ran out". Read as
the second thing it sets `playing` false and stops the decoder that `play` had
just opened, so a seek issued while the pump happened to be waiting for samples
left the channel publishing silence with the transport running. `nextFrame` now
compares the decoder it read from against the current one and discards the
answer if they differ.

**A capture that never returns.** `AudioSource.captureFrame` resolves when an
FFI callback with a matching id arrives; there is no timeout anywhere in that
path, and the frame loop awaits it. One lost callback parks the loop for the
life of the process. The same silence arrives by a second route: the media
participant is a client like any other and can lose its connection like any
other, except that nobody is holding it to notice — the pump goes on producing
frames into a source that reaches nowhere.

### So the pump gained a heartbeat, and the registry corrects it

`PlaybackPump.producedAt()` is when a frame last reached the sink. Frames are
produced every 10ms whether or not anything is playing, so this advancing is
the difference between a channel that is quiet and one that has stopped being
audible — the only measurement of shared playback this server has ever had.
`LiveKitPlaybackSession` answers 0 for it once the room says it has been
disconnected, which is stale by construction rather than by a second question.

`tick` compares it against `PLAYBACK_STALL_MS`, five seconds, and rebuilds what
has stopped. The rebuild is a close and an open, because `openPlayback` already
does the whole of the catching up — current file, resume at the transport's
position, re-open the stem if a recording is running. Closing files whatever the
old stem had captured, so an interrupted run is a gap of silence in the export
rather than a broken recording.

**The pump is not asked to heal itself, deliberately.** Both ways it stops are
ways it cannot act: one leaves its own loop pending for ever, and the other
leaves it with nowhere to put a frame. What it can do is say when it last
worked, and let something outside it decide. `close` is bounded for the same
reason — waiting on a loop parked inside a capture that will never return is how
a wedged pump takes down the rebuild that was replacing it.

### What is not proven, and the line that will settle it

**This was diagnosed from the code and from the box, not reproduced on a
device.** What the box says for the reproduction of 2026-08-24 is consistent
and not conclusive: `media:chan_PyepS3IEwRO9` joined at 09:44:50, published one
track, and stayed for 12m33s while its owner rejoined the room four times and
heard nothing; no playback failure was logged, because a pump that stops this
way raises nothing.

A stall is now logged, with context `playbackStalled <channelId>`. That makes
the next occurrence a bisection rather than an argument: **if the symptom comes
back and that line is not in the log, the server was producing frames** and the
fault is on the phone — where the place to look is the audio session, which is
`useSessionAudio`'s `startAudioSession` and the three writers POSTMORTEM-echo.md
describes. It is in BACKLOG.md as unconfirmed on hardware.

No wire change, no client build, no floor change: `bin/deploy` is the whole of
shipping it.

## The bisection came back, and build 88 fixes nothing on purpose — 2026-08-24

The entry above shipped a correction for shared playback and, with it, a log
line whose *absence* was defined in advance to mean something. Within the hour
the symptom was reproduced on build 87 and the line was absent. This is what
that bought and what it cost.

### What was settled

Server-side, at the moment the audio was dead: the media participant publishing
an unmuted track, the phone active in the same room, zero `playbackStalled`
lines. Phone-side, from the panel: `asked` and `actual` in agreement,
`audible 1`, route `Speaker`, output available, `other playing F` — and
`run/rec/play` reading **`F F T`**. Playout enabled, engine stopped.

So the pump, the publication, the room, the subscription and the audio-session
*configuration* are all cleared in one reading, and the fault is an engine that
is not running. **That is the whole return on the log line**: yesterday every
one of those was a live suspect, and no amount of reading source was going to
retire them, because each was individually plausible and none was observable.

**It also killed the leading hypothesis, which is worth recording because it was
a good one.** BACKLOG.md had carried the `IDLE` → `LISTENING` edge as never
confirmed on a device — it changes category options on an already-active session
rather than activating one, and iOS does not document that. The prediction was
that the write would not take. The write took: `asked` equals `actual`. What did
not survive the edge, if it is the edge at all, is the engine rather than the
configuration — which is a different mechanism reached through the same door.

### What was not settled, and why no fix ships with the instrument

`released LISTENING` is stamped 330ms after the media track was published, and
the whole reproduction then falls between that line and an `app active` a minute
and a half later with nothing in between. The category write and the first audio
that could have been rendered are a third of a second apart. **So "the edge
stopped the engine" and "something later stopped it" are the same evidence**,
and the log has no engine events in it to separate them.

Build 88 therefore logs engine transitions and changes no behaviour. The rule it
is obeying is `engineState.ts`'s own history — on 2026-08-20 one symptom was
attributed in turn to the session category, to the mute releasing the track, and
to the engine's mute mode, each reasoned from code that turned out not to
contain the mechanism, three builds, no change. A fix written now would be a
fourth guess dressed as a conclusion, and it would ship to a population.

**The instrument registers on `willStartEngine` and `didStopEngine` and could
not have used any other slot.** Six delegate hooks each hold one handler, and
the SDK applies its own audio policy from inside `willEnableEngine` and
`didDisableEngine`, both guarded on whether a JS handler exists — so registering
there *replaces* the policy rather than observing alongside it. The failure
would be an echo or a dropped route in a build nobody associates with logging.
The jest mock offers only the two safe slots, which makes the wrong choice a
compile error rather than a silent regression.

Three properties of the handler are load-bearing and all three are pinned by
tests. It must not throw, because a rejection is an error code and an error code
**cancels the engine operation being reported on** — the instrument becoming the
fault, which is the only outcome worse than no instrument. It must return
immediately, because the native side blocks the audio worker thread on it. And
it must touch nothing but its sink, because calling into the engine or a peer
connection from inside one can deadlock against the operation it is holding up.

A navigation marker goes with it. Leaving the channel screen for Home and coming
back is not an `AppState` change, not a route change and not a session write, so
the move the whole reproduction turns on was invisible to every existing signal.
That it is invisible is not an oversight: presence is deliberately not
navigation, which is why the audio hook lives above the screen switch — and
which is exactly why the marker has to be stamped rather than inferred.

### The finding that does not depend on the cause

`AudioSession.startAudioSession()` is called in one place, once per connection,
and nothing else ever re-activates the session. The foreground listener that
would rebuild the room returns early while `status` is `connected`. So an engine
that dies under a healthy room is unrecoverable: the socket is fine,
`Disconnected` never fires, and the only repair is gated on a failure that has
not happened.

**That is the same fault as the one in the entry above, on the other side of the
wire** — state entirely correct, the thing that makes noise stopped, nothing
watching. It is in BACKLOG.md as the recovery half, and it is worth fixing on
its own account whatever the next build turns out to be about.

**It was first written here as also explaining why only a new channel restores
audio, and that was wrong.** Stepping out makes `live` null, `mediaRoom` is a
dependency of the connect effect, so stepping out tears the connection down and
stepping back in rebuilds it — `startAudioSession()` included. Re-entry and a
new channel are not told apart by that mechanism. The correction is worth the
space because the false version is the more satisfying story: it closes the
case, and it closed it on a premise nobody had checked against the dependency
array.

## A tap that waits ten seconds, and the socket that was nobody's — 2026-08-24

Reported from a device: stepping out of a channel had become "noticeably
delayed — there appears to be a server round trip, and it is so slow that one
isn't sure the button was pressed." Attributed, reasonably, to the work that
allowed several sessions per account, that being what had just changed.

**The step-out path contains no round trip, and did not gain one.** The button
in `ChannelView` fires the action, drops the channel view and navigates home in
the same tap handler; `git diff build/86 build/88 -- app/src/ui/ChannelView.tsx`
touches `iAmPresent`, `displaced` and the watch-party wording, and not that.
The box answers a channel action in one to five milliseconds and an HTTP round
trip to it is about 150ms, most of that the trip to us-west-2. So a delay of
seconds is not a slow answer. It is the question never being asked.

**`send` queues anything it cannot write, and the reconnect backoff decides
when it gets written.** The backoff doubles to a ten-second cap, and the
queue's TTL is also ten seconds — so an action taken while the socket is down
lands whenever the retry timer happens to fire, up to ten seconds later, and is
dropped outright if the reconnect takes longer than that. Nothing on screen
says either. That is the reported symptom exactly, and it is not specific to
stepping out: every control on the channel screen goes through the same path,
which is why the report said "stepping in or out".

**And the box shows a device living in that state.** In six hours one session
opened `/ws` 448 times at a ten-second cadence — the backoff cap, arriving over
and over — where the other active session opened it twenty times.

Three things are wrong, and they compound. They are fixed together because any
one of them alone leaves the symptom reachable.

### A replaced socket goes on speaking for the client

`open()` assigned `this.socket` and left the previous socket's handlers live.
Those handlers write shared state: `onclose` nulls `this.socket`, stops the
heartbeat, reports the connection down and schedules a reconnect. So a close
belonging to a socket nobody was using any more tore down the connection that
had replaced it — leaving an open socket nothing referenced, every `send`
queueing instead of writing, and a fresh connection on every backoff. Which is
what a ten-second cadence looks like from a server.

Two ordinary things overlap sockets, and neither is a fault: `connect` closes
the old one and opens the new one in the same turn, and the close event lands
after `closedByUs` has been set false again; and `resume` — the foreground
probe — opens one whenever the current socket is not OPEN, which includes a
handshake still in flight after a spell in the background.

Every handler now checks that it belongs to `this.socket` and returns if it
does not, and `open` closes what it replaces rather than abandoning it. **The
one exception is an unauthorized close**, which is acted on whichever socket
heard it: every connection carries the same token, so one of them being refused
refuses all of them.

### A backoff is not for a person who is waiting

The backoff is right for a client failing on its own — a phone with no signal
must not hammer a server it cannot reach. It is wrong the moment somebody taps
a button: the delay still to run was earned by failures nobody was waiting on.
So `act` now asks for a connection immediately rather than only queueing, which
is the argument `resume` already makes from the other end — there the app
coming back, here somebody using it.

**A handshake already in flight is left alone**, which is where this differs
from `resume`. A tap is not evidence that the network changed, so restarting a
connection that may be about to succeed would push the thing being asked for
further away, once per tap.

### A device's belief about where it is standing goes stale

`onopen` re-sends ENTER for whatever channel this client thinks it is in. That
is right inside `DISCONNECT_GRACE_MS`, where the server has removed nobody and
re-entering restores a state that was never given up. Outside it, the server
stepped this person out a while ago and everybody in the room watched them go —
and since 2026-08-24 the account may have entered somewhere else from another
device since. So the re-entry is now bounded by the grace period, measured from
the moment the socket was lost.

The same belief had a second way of going wrong, and this one was created by
several sessions per account. `displaced` was sent only on ENTER, so a session
was told when another device *took* the room and never when one *gave it up* —
leaving it believing it was present somewhere the account had left, and
re-entering from that belief on its next connection. **A Step Out on the phone
in somebody's hand was undone by another device reconnecting**, once per
reconnect, which for a device that cannot hold a connection is every few
seconds. `STEP_OUT` and `LEAVE_CHANNEL` now displace the account's other
sessions exactly as `ENTER` does.

The message keeps its name and its shape — wire-compatible in both directions,
no floor change — because what it means was never "somebody took the room". It
means *this session is not the one standing anywhere*, which both cases are.

**The two halves of that fix are not redundant.** The message reaches a session
that is connected; the grace period covers the one that is not, which is
precisely the flapping device that made this visible.

## The demo account's tokens keep dying, and one of them is now unreachable — 2026-08-24

Checked while looking at something else, and worth writing down because it is
the third time. Every token in `~/.config/thefloor/demo-account.txt` answers
401. They were minted while `issueToken` revoked every other session for the
account, so each sign-in killed its predecessors; that rule went on 2026-08-24,
so this should be the last reissue for that reason.

**The sign-in path itself is fine**, which is the half that matters at a
submission: `POST /auth/request-code` for `appreview@` then `POST /auth/verify`
with `REVIEW_CODE` was confirmed working on this date. A verify *without* the
request first is refused — the fixed code is written to `otp_codes` when it is
requested, not held in the configuration — which is worth knowing before
concluding the account is broken, as this session briefly did.

**Sam Rivera has no way back in.** `REVIEW_CODE` applies only to whichever
address `REVIEW_IDENTIFIER` names, and that is `appreview@`; the second demo
account's only credential was a token, and it is revoked. Getting in needs the
bypass flip DEMO-ACCOUNT.md describes — point `REVIEW_IDENTIFIER` at
`appreview2@`, restart, sign in, flip back — which costs a server restart, and
a restart drops presence and any call in flight. Left undone deliberately: it
is not needed until that account has to be signed in as or torn down, and it is
not a thing to do to a live box on the way past.

## "Notification UI" was already shipped, and the 1:1 repeat stays — 2026-08-26

TASKS § *Notification UI* asked for two things — *Show user name and channel.
Tapping takes you to channel.* — and a session sent to implement it found both
already there. Written down because the next reader of that entry will start
the same search, and because the one case that genuinely does not satisfy the
sentence was looked at and deliberately left alone.

**Both halves shipped between 2026-08-10 and 2026-08-22.** Every push carries a
person and a place: `invited` titles with the inviter, `arrived` and `pinged`
title with `nameFor(channel, recipient)`, which is `channel.name` when there is
one and the recipient's own roster view when there is not. The tap is
`channelId` in the payload → `channelOf` → `pendingChannelId` → `App.tsx`,
which watches the channel and shows it, and it works from a cold launch as well
as from a running app because `getLastNotificationResponseAsync` is read
alongside the listener. `server/__tests__/push.test.ts` pins the wording of all
three; 60 tests.

**The invitation names no channel, and that is correct rather than missing.**
`create` passes `null` for the name, so it reads *Invited you to a channel.* An
invitation is always into a channel that did not exist a moment ago — naming is
something somebody does later, if at all — so there is no name to give and the
roster fallback would be describing a room nobody has been in yet.

**The case that does fail the sentence is the 1:1 standing channel, and it is
staying.** Every pair of contacts has one, it is never named, and the roster
from the recipient's side is exactly one person — the person who just arrived.
So it renders `Alice` / *Alice stepped in.*, and a ping renders `Alice` /
*Alice: come back*: the same name twice, with nothing on the notification that
reads as a channel. Three ways out were considered — dropping the repeat from
the body (*Alice* / *Stepped in.*), putting both in the title separated by a
dot, and leaving it — and leaving it won. **The redundancy is not an
ambiguity.** A 1:1 channel's only identity *is* the other person, so the
notification names the conversation exactly, twice; the reader knows precisely
where the tap lands. The alternatives each buy tidier prose with a second
sentence form to keep true — and `Stepped in.` with no subject is worse on a
lock screen where the app name sits above the title and the eye lands on the
body first.

So the entry is closed as shipped rather than as work. If it comes back, it is
the 1:1 repeat that is being complained about, and the argument above is the
one to overturn.

## Home counts other people, and marks your own step-in separately — 2026-08-26

Home ordered and labelled channels by `lastPresenceAt`, the maximum across every
`lastPresentAt` stamp *and* `lastActiveAt` — so it includes the reader. A
channel you stepped into alone this morning read, and sorted, as fresher than
one two other people spent an hour in yesterday. The fresher of the two is the
one where nothing happened.

What makes this worse than a mis-ranking is `stepOutOfOthers`: **presence is
exclusive**, so entering a channel removes you from every other one. Somebody
going down the list announcing themselves — step in, wait, step into the next —
was rewriting the top of their own list with their own footsteps, one row at a
time, and had no way to tell those rows from rooms somebody else had been in.

### Three tries, and the first two are worth recording

**`bab713e` shipped two numbers behind a setting, and was reverted.** The room's
own number and a second with the reader removed, joined with ` · ` on the same
line, gated on `thefloor.showOthers`, plus the mirror of it on Contacts. The
arithmetic was right and the packaging was not: two intervals on one row of a
list that is *scanned* rather than read is a question posed to the reader rather
than a fact given to them, and a setting to turn the second one on is a setting
nobody knows the meaning of until after they have tried it. The sorts were left
untouched, which meant the room you were alone in still sat at the top and now
explained why — an explanation being no substitute for not doing it.

**`lastTogetherAt` was built, tested green, and discarded before it landed.** The
idea: measure the last moment *two or more* people were in the room, guests
counted, on the reasoning that without two people there is no conversation. It
is the obvious idea, which is why it is written down here rather than left out —
the next person will have it again.

It is holed. **A member who steps in alone and leaves before anyone joins
registers nothing**, so the channel is buried. That is not an edge case: it is
somebody coming to find you, it is the single most actionable thing Home can
report, and it is the same gesture the reader makes themselves. It is also
exactly what the push already announces — `announceActive` fires on
`before.present.length === 0 && after.present.length > 0`, so a lone arrival in
an empty room notifies every absent member, and a *second* person joining an
occupied one notifies nobody. A channel list ordered by simultaneity would have
had Home contradicting the notification that brought the reader to it.

### One measure: `lastPresenceByOthers`

Three kinds of event move a channel's recency, and only two are worth surfacing:

| | event | surface it? |
| --- | --- | --- |
| **a** | somebody *else* here alone | **yes** — a bid, aimed at you, the thing you missed |
| **b** | two or more here together | **yes** — a conversation happened |
| **c** | *you* here alone | **no** — your own echo; you already know |

`lastPresenceAt` counts all three. `lastTogetherAt` counts only **b**. The last
moment anybody other than the reader was in the room counts **a** and **b** and
excludes **c**, which is the whole specification, and it is the function
`bab713e` wrote.

**It strictly dominates `lastTogetherAt`**, which is the argument that settled
it: any moment with two people in the room contains at least one person who is
not you, so `lastPresenceByOthers >= lastTogetherAt` always. It buries nothing
the other surfaces and surfaces the case the other buries. There is no scenario
where simultaneity is the better key.

Two more properties, both of which fell out rather than being designed for:

- **It answers "which of these are fresh only because of me?" by construction.**
  Those rows do not rise, there being nothing of the reader in the number. That
  is what the `showOthers` toggle was reaching for and could not reach, having
  kept the reader inside one of its two numbers — the comparison it offered was
  between a number that counted you and a number that did not, which is a
  subtraction performed by the reader.
- **It is the channel screen's own fact, one zoom out.** `ParticipantCard`
  renders each member's `idleMs` as `Stepped out 3 hours ago`; this is the
  maximum of exactly those, minus the reader's own row. So "what accounts for
  this?" is answered by opening the channel, which is where that question was
  always going to be asked. `lastTogetherAt` could not do that — simultaneity is
  a different *kind* of fact, and nothing in the roster explains where its
  number came from.

**`lastActiveAt` cannot be in the fold, and that costs something real.** It is
unattributed — it moves on anybody's entry or exit, including yours — so
admitting it would put the reader's comings and goings back into the one number
meant to leave them out. `lastPresenceAt` takes the maximum across both kinds
partly *because* the persisted per-person stamps are floored to the minute by
`quantise`, and an exit recorded in `lastActiveAt` can be the fresher evidence of
the very same departure. This gives that correction up, so after a restart it can
read up to a minute early. The test asserts the *bound* rather than a value, so
nobody later "fixes" it by folding `lastActiveAt` back in.

**Guests are out, permanently.** They move `lastActiveAt` and never
`lastPresentAt` — `STILL_HERE` is guarded on `isPresent`, which reads
`state.present`, so even a guest's heartbeat cannot stamp one. Making them count
would mean giving a volatile population durable per-identity stamps, a guest id
outliving the session it names, to move a number on a list about the people you
have accounts with. Home's recency is a claim about **members**. This was left
implicit in `bab713e` and is settled here so it is not re-opened as an oversight:
a guest's visit is visible inside the channel and nowhere on Home, on purpose.

### Three tiers, because the number is null-capable and the old one was not

`byIdleness` gained a middle tier, which is the "fourth tier" problem the
reverted TASKS entry raised and could not answer without deciding this:

1. others have been here → most recent first
2. **null but `everUsed`** — a room only the reader has opened. It cannot stay at
   the top on the strength of a solitary visit, which is the complaint; and it
   must not drop in among the never-opened, because somebody *went* there,
   possibly to wait. Ordered among its own kind by `lastPresenceAt`, the only
   number it has.
3. `!everUsed` → bottom, by name, unchanged.

**The row says the same number the list is ordered by**, which is the other half
of the reason for changing the sort rather than only the label. A list ordered by
one fact and annotated with another puts the disagreement in front of the reader
and makes both halves look wrong. `bab713e` left them split and made a TASKS
entry of it; this closes it.

Against a server that predates the field every row takes the `lastPresenceAt`
fallback, which restores the old order and the old line **exactly** rather than
collapsing the list into tier 2 and shuffling it by name. Absent and null are
different answers and both are drawn differently — null is a fact about the room
and gets words, absent is a fact about the server and gets the old behaviour.

### And one mark, which is not a measure

Removing yourself from the number stops the false freshness. It does not tell you
that you were there — and it *cannot*, a number that has forgotten you being
unable to report you. Those are two jobs and only one of them is a measure. This
is the part all three attempts kept collapsing into the recency number and the
part that had to stop being collapsed.

`steppedInAt` reports **the act, not the notification**, and getting that
distinction wrong is the fourth mistake this entry records. The first draft of it
was a receipt for the arrival *push* — the server recording which announcement it
last sent and about whom. That is a proxy for stepping in, and a leaky one: an
announcement is suppressed inside `ANNOUNCE_INTERVAL_MS`, and none is sent at all
when nobody is absent to receive it or when the room was already occupied. So a
step-in that rang no phone left no mark, which is a rule about Apple's delivery
semantics leaking onto a row that is meant to report what the reader did. What
they did was step in. Whether it lit anybody's screen is a different fact, and it
has its own map two fields away.

So the server records, per channel, **who last became present and when**, at the
one transition every route into a channel passes through — the same place
`consume` already reads. `rejoinableFor` answers with the moment when that
somebody was this reader.

It is not derived from `present`, and pointedly not from the reader's own
`lastPresentAt` either: that stamp is refreshed by the heartbeat and re-stamped
by every route out, so it answers "when were you last here" where this answers
"when did you arrive". The difference is the entire use — **it has to outlive the
visit**, the visit being what `stepOutOfOthers` erases the instant the reader
knocks on the next door.

- **A moment on the wire, not a flag**, so the mark expires against the phone's
  own clock instead of waiting for a snapshot that may never come. That needs
  both ends to read one window, so `PRESENCE_LIFETIME_MS` moved from
  `server/src/push.ts` to `core/constants.ts`. Five minutes for both, because it
  is the same claim seen from its two ends: the push says "somebody is here now"
  to them, the mark says it to you about yourself, and it stops being worth
  saying at the same moment either way.
- **Cleared by supersession, with no machinery for clearing it.** The next
  arrival overwrites the entry. The mark goes at exactly the moment somebody
  else's presence enters the number beside it, so a mark saying you stepped in
  can never sit next to an interval saying somebody answered.
- **In memory**, like `lastAnnouncedAt` beside it: five minutes wide, and a
  restart drops presence anyway.
- **It orders nothing**, deliberately and with a test. Sorting on it would put
  the reader's own echo back at the top of the list, undoing with the second
  signal precisely what the first one was for.

**Drawn as `↗` rather than words or a bullet.** Not a bullet because
`ParticipantCard` already spends a hollow/filled dot on who is speaking, and Home
must not borrow a glyph that means something else two screens over. Not words
because the muted line is carrying the interval and this is a different kind of
thing — a note to yourself about your own last action, not another fact about the
room. It sits at the row's right edge, which is where the invite `✕` lives, so it
is styled emphatically *not* as a control: no `Pressable`, no hit slop, muted
rather than accent. It cannot collide with the `✕` itself — stepping in is what
sets `steppedInAt` and also what stops a channel being an invitation, so a row
can carry a mark or a dismiss and never both.

**It was `‥`, U+2025 TWO DOT LEADER, for a day, and the reversion is the
interesting half.** The case for the two dot leader was sound on paper. While
the mark still reported a *push* it meant "a call is out, awaiting an answer",
and an arrow suited that; once the trigger became stepping in, the subject
became residue rather than suspense — I was here, I stepped in, I moved on —
and an arrow depicts motion, which is the wrong half of it, where two dots are
two steps. Its obscurity was the rest of the argument: `↗` is the web's "opens
in a new window", `›` is disclosure, `⋮` is an overflow menu, `·` is the
separator already joining the two halves of the line above, and nothing in a
user interface uses a two dot leader, so it arrived carrying no convention to be
misread as. Considered and rejected beside it: `◌`, whose Unicode job is
standing in for an absent occupant, semantically perfect and a disabled radio at
14px; `◦`, which loses to the roster collision; and 👣, colour emoji only.

**None of that survived looking at it.** Two periods of ink at the edge of a row
are too small to register as anything, which is why the two dots had been set
two points *larger* than the `✕` beside them — the size chasing equal weight
against four strokes. That compensation is the tell: a mark that needs to be
grown to be seen is being asked to carry more than its shape can. In context the
arrow is simply the one that reads, and the semantic objection to it — that it
depicts motion — costs nothing next to a glyph nobody notices. **A denotation
argument does not beat legibility**, and this is the entry to point at the next
time one is winning on the page.

The cost of a glyph is that it reads as nothing, and there is exactly one place
to pay it: `accessibilityLabel` gains **"Stepped in and out."** The extra two
words are load-bearing. The action at the end of that same label is "Step in",
so the short form put the state and the button a syllable apart — *"Stepped in.
Step in."* — which is a stutter that says which is which to nobody. Saying the
whole of what happened separates them. **The phrase was written for the two dot
leader and outlived it deliberately**: the stutter it fixes is a property of the
label, not of the mark, so reverting the glyph does not revert the words. A test
pins the pair rather than the phrase, so the two cannot drift back together.

### What was deliberately not built

**Contacts is untouched.** `bab713e` gave a contact row the mirror of this —
`lastInChannelAt`, when they were last in a channel you share — and it is gone
with the revert and not coming back here. It needed `lastInChannelFor` walking
the resident channel map, it carried a scope limitation nobody could see from the
wire (only channels you *still* share), and the complaint that started all of
this was about the channel list.

**No setting.** One number and one mark, always drawn. A setting exists to defer
a decision, and this entry is the decision.

**The invitation gets neither field.** `invitesFor` skips any channel the viewer
appears in `everPresent` for, so an invitation is by construction a channel they
have never entered: its own `lastPresenceAt` is already about other people, and
there is no visit of theirs for a mark to remember. Both absences are asserted so
that a later session does not add them for symmetry.

**The profile screen keeps the room's own number.** It draws `describeQuiet` too,
and passes no `lastPresenceByOthers`, taking the fallback branch. That is not an
omission: a profile card already carries `sharedChannels`, the same question
asked per person and answered with more detail, and this line is the one drawn
when that array is missing — whose job is to describe the *room*. Excluding the
reader from a card about somebody else answers nobody's question. Asserted, since
somebody tidying will one day notice Home passes a field there that this does not.

## Talking into a void, which had three causes and one of them was politeness — 2026-08-27

Raised from the other end of TASKS.md § *Websocket Lost*, which asks what the
timeline within a channel is when a websocket is lost. The measured answer was
worse than anybody expected, and the largest single term in it was a courtesy
extended to a corpse.

**The timeline, for a phone that goes quiet rather than closing.** Up to
`HEARTBEAT_TIMEOUT_MS` for the sweep to notice, plus up to
`HEARTBEAT_INTERVAL_MS` of sweep phase — and then **thirty seconds** in which
`socket.close()` sent a close frame and waited out `ws`'s `closeTimeout` for an
answer from a process that was never going to send one. `disconnectedAt` is
written in the close handler, so none of the room's screens could say anything
until that wait was over: up to forty-seven seconds of a roster reading
*Present*, about somebody whose phone had already gone. The sweep now
`terminate`s, which is not rude to anything, since the only sockets reaching
that branch have already failed the heartbeat. Worst case is ~17s and the
refusal branch still closes cleanly, 4401 being a code the client has to
actually receive to read.

**The existing test could not tell the fix from the bug**, which is worth
recording because it was a live client that had merely stopped sending pings.
`ws` answers a close frame at protocol level regardless of what the application
above it is doing, so the close completed at once and the test passed either
way. It now pauses the underlying socket to be genuinely half-open, which makes
the assertion one about *latency*: it fails, after 21s, against `close`.

**A claim does not survive the claimant.** The grace period was holding one
thing that does not belong to the person who dropped. Everything else it
protects is theirs — their place, their membership, their recording's stem —
but a claim is a lock on everybody else, who are silenced by it and, since
`satisfiesEligibilityRule` refuses outright while `holder` is non-null, cannot
take it back. Both bounds on it were a minute, `DISCONNECT_GRACE_MS` from the
drop and `FLOOR_CLAIM_MS` from the claim, so a room whose speaker vanished
spent the rest of that minute unable to speak, for a turn nobody was taking.
`DISCONNECTED` now releases it.

The cost is that a returning holder rejoins the queue rather than resuming, and
it is worth stating because the first instinct is that it is a bug.
`claimDelayMs` ranks by recency and they spoke most recently, so in a pair they
wait one `FLOOR_CLAIM_DELAY_STEP_MS` while the other may go at once. Right in
both directions: whoever stayed keeps the room moving, and a flapping
connection cannot take the floor, vanish, and take it again on the strength of
having just had it. If that step ever annoys, the smaller fix is to give the
floor back on `CONNECTED` when nobody else has claimed — not to stop releasing.

**The earliest warning is not the websocket's to give.** No amount of tuning
the heartbeat beats the heartbeat, and the question somebody mid-sentence is
asking is not *have they given up their place* but *is my voice reaching them*
— which is about the media plane. The SFU already answers it continuously and
already pushes it to every client: `RoomEvent.ConnectionQualityChanged`, whose
`Lost` livekit-client documents as what it reports **before** the timeout that
would produce `ParticipantDisconnected`. `SessionAudio.failing` keeps that set,
and the roster draws *Present · not receiving you* from it, coloured, ahead of
the reconnecting line and in the accessibility label.

The two readings are not redundant and neither replaces the other, which is the
same pair STATES.md § *Audio Connected* already had to keep apart: a phone whose
media path is dead while its websocket is fine is a real state, and so is the
reverse. `Poor` is deliberately not surfaced — it is ordinary on a phone, and a
red line under half of every conversation teaches people to ignore red lines,
which is the argument `useOfflineNotice` already makes for its delay. Nothing is
said about your own connection either, that being already reported once, in the
first person, on the audio status line.

**And the constant was being argued about from a story.**
`DISCONNECT_GRACE_MS` is justified as the interval in which a tunnel or a lift
is survivable. That is a claim about *frequency*, it was written before this ran
on anybody's phone, and nothing had ever counted. The commonest way to lose a
socket on iOS is not a tunnel but the app being suspended, which returns either
within a second of somebody picking the phone up or not for minutes — a
distribution with little mass in the band the minute is sized for. `/healthz`
now carries `drops`, `dropsRecovered` and `dropsExpired`, and `bin/health`
prints them. Aggregate, in memory, per nobody, and **flat on the wire**, that
being a constraint of the endpoint rather than a style: `bin/health` reads it
with sed and says as much.

**The number itself was left alone, deliberately**, and the reason is the half
that was not obvious from its own comment. Beyond somebody's dot on a roster,
the grace expiring on the *last* present member runs `settleEmpty` — which ends
a solo recording, pauses playback and any watch party, and revokes every guest
link irreversibly through `guests.channelEmptied`. A lone host whose own phone
blips for a minute would destroy a guest's access with no undo. So it is
load-bearing in a way that makes shortening it a much larger change than it
looks, and the counters exist so that the next argument about it can be had
with data. If they come back saying almost nothing returns inside the window,
the answer is probably to split it into two constants rather than to shorten
one.

## The mark's window is the nearby window, and "Nearby" loses its verb — 2026-08-27

TASKS.md's `## Mark Duration`, both halves of it, and the second reverses a
decision five days old.

**The mark now lasts fifteen minutes rather than five, by reading
`WAITING_WINDOW_MS`.** It was written the day before against
`PRESENCE_LIFETIME_MS`, and that constant's own comment argued the two were one
claim seen from its two ends: the push says "somebody is here now" to them, the
mark says it to you about yourself, and both stop being worth saying at the same
moment. The ends turned out to be different lengths. A push's window is bounded
by what Apple will hold undelivered and by how long walking over to your phone
would still land you in the conversation being announced — that is a claim about
a room, and it decays fast. The mark is a note about a **visit**, and how long a
visit stays worth mentioning is a question this app had already answered
somewhere else: `WAITING_WINDOW_MS` is how long the roster goes on describing
somebody as nearby before it says they stepped out.

So the alignment is not arithmetic. While the mark is on your Home screen, every
other member's roster is calling you nearby; when it goes, they are being told
you stepped out. **One visit, two audiences, one expiry** — and if that number
ever moves, the mark moves with it rather than being found to disagree, which is
why this reads the constant rather than restating fifteen minutes.

**The two clocks are not the same instant, and the difference runs the safe
way.** `steppedInAt` is when the reader *arrived*; the roster's `nearby`
measures from the last thing heard from them. On a visit of any length the
arrival is the earlier of the two, so the mark expires first and can never
outlive the state it is aligned with. The alternative — the mark reading the
reader's own `lastPresentAt` — was not built, for the reason `protocol.ts`
already gives: that stamp answers "when were you last here", and the mark's
whole use is to outlive the visit.

Nothing on the wire moved. The server sends a moment and each client decides how
long it is worth drawing, so an older build on the old five minutes is not wrong
about anything, merely briefer. This is the rare UI constant that needs no
`MIN_SUPPORTED_BUILD` thought at all.

**And the roster line is "Nearby for 5 minutes" again, reversing
DECISIONS-2026-08-21-to-2026-08-23.md § *"Been nearby for"*.** That entry was a
correction to the same day's work: bare, *nearby for five minutes* was heard as
how much longer the person would still be within reach — a future — where the
number is elapsed. The perfect tense put the length behind them and cost two
words.

**The reversal is a judgement about the price, not a claim the risk was
imagined.** The Ping button that made the misreading plausible is still sitting
right beside the line, so the ambiguity is real. Against it: the misreading
needs a reader who does not already know what the card is, and that reader is
rare on a roster they opened, in a room they just walked out of, where every
other line — "Stepped out 2 hours ago", the interval on Home — measures
backwards too. Two words of scaffolding on every absent card, forever, to
pre-empt a first-encounter misreading is the wrong trade on a line that has to
stay short. The remaining-time version thrown away in that entry is still
thrown away, and for its original reason: the window is how long *we* go on
calling somebody reachable, not how long they will be.

Worth knowing that this is now the second reversal in as many days of a
decision made carefully and written up in full — the arrow, and now the verb.
Neither entry was wrong on its own argument. Both lost to something the
argument could not contain: what the thing is like to look at.

## If you are going to claim the floor, be sure you can hold it — 2026-08-27

A faster heartbeat, and the thing that was deliberately *not* built alongside
it. Follows § *Talking into a void*, and settles two confusions that had been
producing wrong answers about which number to change.

**The interval and the timeout answer different questions.** The interval is
the proof cadence; the timeout is the silence budget. The budget does not scale
with the cadence — it bounds how long somebody may be quiet, and the cadence
decides how many chances they get inside it. So a *faster* interval at the same
timeout is strictly **more** tolerant of packet loss. 2s against 5s is two
consecutive pings lost before anybody is declared dead, exactly what the old 5s
against 12s gave. The reasoning that said otherwise, and briefly appeared in
this project's own advice, confused "the timeout must exceed the interval" —
true — with "it must scale with it", which is not.

**And a faster interval does not make detection faster.** This is the one worth
keeping, because it is counterintuitive and it was nearly acted on backwards.
The timeout measures silence since the last *evidence*, so more frequent
evidence starts the clock later: at a 5s cadence a death is noticed somewhere
in 7–17s, at 2s somewhere in 10–14s, and the mean is a timeout either way. A
shorter interval buys predictability, not speed. **Only a shorter timeout buys
speed**, which is why the budget came down to 5s and the interval to 2s
together rather than the interval alone.

**The budget is a wire contract, and this is where the two-step was needed.**
The server applies a timeout to whatever is connected, and an installed build
goes on pinging at the cadence it shipped with — 5s for everything through
build 107. Judged against a 5s budget those phones are always a moment from
exceeding it, so a flat cut would have swept the entire live population into a
permanent kill-and-reconnect loop. `heartbeatTimeoutFor` keys the budget on
`connection.build`, which the socket already carries: the new budget for builds
that declare the new cadence, the old one for everything else, including
anything that declares nothing. It is deployable server-first, since the tight
branch applies only to a build that does not exist yet, and it retires itself
once `MIN_SUPPORTED_BUILD` passes `FAST_HEARTBEAT_BUILD`.

The guest page is the exception and is judged against the current budget. It is
served by the deploy rather than installed, so it cannot be a version behind —
and it now reads `HEARTBEAT_INTERVAL_MS` instead of its own hardcoded `5_000`,
which would otherwise have had the sweep terminating every guest a moment after
letting them in. A number written twice is a number that drifts, and this one
had already.

**The grace period now runs from the last ping rather than from noticing.**
`report` takes the time as an argument and the close handler passes
`connection.lastSeen`. Stamped with `now()`, the detection latency was silently
added to the minute somebody is given — they were stepped out a whole budget
later than the rule says. Sixty seconds now means sixty seconds since the last
thing anybody heard, whenever it was noticed, which also makes the total
predictable rather than a function of how the sweep phase happened to fall. It
is the same correction `heard` makes one line above, finally applied to the
other stamp.

**What was deliberately not built: giving the floor back on reconnect.** With
the budget at 5s, an ordinary mobile stall — a radio state transition, a
handover — can now cost a speaker their claim, and `claimDelayMs` sends them to
the back of the queue rather than restoring the turn they were in the middle
of. Restoring the floor on `CONNECTED` when nobody else had taken it would have
made a spurious release free, and it was declined.

The reasoning is that it is not spurious. A claim is a request that everybody
else stay silent; holding it is a responsibility rather than a grant, and
somebody whose connection cannot carry a minute of speech is somebody the room
should be able to move on from. The person best placed to ensure a claim can be
held — good signal, incoming calls silenced — is the claimant, and handing the
turn back automatically would remove the only incentive to do any of it. It
also keeps the rule simple: the floor is released by every departure, and a
connection that failed is a departure like any other. **If you are going to
claim the floor, be sure you can hold it.**

The cost is accepted with open eyes: somebody will lose a turn to a tunnel, and
the answer will be to claim again rather than to add a restore path. Should
that prove wrong, the restore is still the smaller of the two fixes — a field
on `FloorState` recording that the release was caused by a disconnect, so that
nothing else can be resurrected by it — and it is not a reason to lengthen the
budget, which is what would otherwise be reached for.
