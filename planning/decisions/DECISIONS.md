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
| `DECISIONS-2026-08-24-to-2026-08-27.md` | the audio nobody could hear, the notification levels, and the heartbeat | nothing — closed by rollover |
| `DECISIONS-2026-08-28-to-2026-08-31.md` | the walk, the profile becoming a screen, and a token ceasing to be a device | nothing — closed by rollover |
| `DECISIONS.md` — this file | 2026-08-31 onward | live |

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

### 2026-08-29 — `41be02f` → `2844534`

Two commits, both app-only: the Email card moved up beside Ping on a profile,
and "Signed in as" moved off Home to Contact settings. **Nothing in `server/`
or `core/` changed**, so this deploy carries no behaviour at all — it restamps
`deployed.json` with a sha the box can be compared against and nothing else.
It was asked for alongside the upload rather than needed by it.

Worth writing down precisely because it is inert. A deploy with nothing in it
still costs presence and still restarts a box that may have somebody talking
through it — see AGENTS.md § *Known rough edges* — so the entry that says the
box moved should also say what it bought, which here is only the sha agreeing
with the checkout the build came from.

`bin/health` confirmed `2844534`, `oldestBuild` 56 and no silent builds, so
`MIN_SUPPORTED_BUILD` is untouched at 51. The drop counters read zero, which is
what a just-restarted box says.

### 2026-08-27 — `92fc306` → `41be02f`

Two commits: the two-second heartbeat with its per-build silence budget, and
the threshold correction that stopped it sweeping the installed population. The
reasoning is § *If you are going to claim the floor, be sure you can hold it*.

**This is the deploy where the wire-change rule earned its keep, and it nearly
did not.** The silence budget is a contract about cadence: judged against the
new 5s budget, a client that pings every 5s is permanently a moment from
exceeding it. `heartbeatTimeoutFor` keys the budget on the declared build so
old clients keep 12s — but the threshold went in as 108 when 107 was the newest
build in existence, and by the time it came to land, two other branches had
uploaded 108 and 109 from commits without the cadence. Deploying that would
have put every TestFlight install into a permanent kill-and-reconnect loop. It
was caught by re-reading `master` at the moment of merging rather than trusting
the read taken when the branch was cut, which is the whole reason that rule is
written the way it is.

The threshold is 110. Nothing declares 110 and nothing now can: the upload that
followed this deploy failed on a closed train, burning the number, so the first
build carrying the cadence is 111. The partition holds either way — everything
at 109 and below lacks the cadence and takes the legacy budget.

**Nothing on a phone changed at this deploy and nothing needed to.** Every
installed build takes the legacy branch, which is the behaviour they already
had, so this is inert for users until a build ≥ 110 exists. The guest page is
the exception and moves with the deploy, as it must — it now reads
`HEARTBEAT_INTERVAL_MS` rather than its own hardcoded `5_000`, which would
otherwise have had the sweep terminating every guest a moment after admitting
them.

`bin/health` confirmed `41be02f`, `oldestBuild` 56 and no silent builds, so
`MIN_SUPPORTED_BUILD` is untouched at 51. The counters read zero, which is what
a just-restarted box should say and is the reason they are worth reading only
off one that has been up a while.

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

## The scheme and the tap belong to the person, the headset to the phone — 2026-08-31

The first entry of this volume, which the last one's line count closed.

Three settings live on the Home settings screen and all three were stored in
the keychain on the device that set them. Two of them are now the account's:
the colour scheme, and whether a tap on a channel steps into it. The third —
holding the hands-free link steady — stays on the phone.

**The split is what the setting is about, not how important it is.** Whether a
tap arrives or only looks is a habit a person has; finding the other answer on
the second phone is being surprised by your own app. A scheme is the same, more
obviously. But `steadyHeadset` trades a property of the *headset* — the same
person with AirPods on a walk and a Bluetooth speaker on a desk may reasonably
want opposite answers — and the phone is where the headset is. The old comments
in `AppProvider` argued all three were the device's on one line of reasoning
about two phones disagreeing; that reasoning was true of exactly one of them.

`core/settings.ts` holds `AccountSettings` and its defaults, for the reason
`core/notifications.ts` holds `DEFAULT_NOTIFICATION_LEVEL`: the server fills
defaults in on every read, the app has to draw a screen before the server has
said anything, and a second table of defaults in the client is one that can
disagree with what the account holds. `app/src/ui/appearance.ts` now re-exports
the type rather than declaring it, and keeps the half that is about the window.

**Two columns on `accounts`, and the untouched case is null**, which is the
shape `NotificationPreferences` argues for at length — null and the default
mean the same thing today and stop meaning the same thing the day a default
moves. But **choosing the default back writes it rather than deleting it**,
which is the opposite of what that class does, and the difference is the screen:
these are two buttons where picking `System` is an act, and the row is what the
account's other devices are then told about. Reverting to null would make "I
chose this" and "never opened the screen" indistinguishable at the one moment
the difference is visible.

**Nothing is migrated out of the keychain.** Every account starts at the
defaults and sets it once more. A backfill would have to pick which of
somebody's phones was right, and the phones disagree by construction — that is
what the setting being device-local *meant*.

**Delivered on `hello`, changed by `POST /me/settings`, pushed as its own
message.** `hello` is already the one message that is about you and goes only
to you, so it is where `debug` and `leaderboard` are and where this belongs.
The push is a new `SettingsNotifier`, shaped like `HomeNotifier` and separate
from it because the audiences differ in kind: Home reaches whoever is *watching*
Home, and this has to reach every session the account holds whatever screen it
is on — somebody sitting in a channel when their other phone goes dark is the
case, and a Home push misses it. The session that asked is told too, so its
optimistic copy is restated by the server rather than trusted.

**`settings` on `hello` is always present, unlike the two flags beside it.**
Those are grants and absent means no; a setting is not, and a client has to be
able to tell "the account says light" from "this server was never asked". So
`onHello` carries `AccountSettings | null` and a null leaves the client with
what it had.

**This deploys before any client can read it**, which the two-step rule
requires. The field is additive on a message every build already receives and
ignores unknown keys in, and `socket.ts`'s switch has no default clause, so an
installed build receiving a `settings` message drops it. An old build goes on
keeping both settings on the phone and never posting them, which is exactly
what it did yesterday.

**The device-local storage is now a cache and says so.** `APPEARANCE_KEY` and
`TAP_TO_STEP_IN_KEY` are read once at launch and never again; anything the
server says overwrites them, and signing out clears them. Their whole job is
the second between a cold start and `hello` — the gap a stored scheme was
always covering, since a flash of the wrong palette is what this was avoiding
in the first place. Clearing them at sign-out is not tidiness: keeping them
would paint the sign-in screen in the last person's scheme and hand their tap
to whoever signs in next. `steadyHeadset` is untouched by all of it — the phone
has the same headset in front of it as it did a moment ago.

**A failed write is not reverted and not announced.** What is on screen is what
the person asked for, and a scheme flicking back half a second later because a
tunnel dropped is the app arguing with them. The next `hello` corrects it,
which is the soonest anybody could honestly be told what the account holds.

**The Headphones card now says it is kept on this phone.** A screen where two
settings follow you and one does not, silently, has lied to somebody by the
time they notice.

## The channel screen gets two halves and gives the floor its place — 2026-08-31

Eleven sections in one flat column, each a `SectionLabel` over a `Card`, in
roughly the order the features were built. Three things followed from that, and
all three are the same problem seen from different sides: **a flat column has no
way to say that some of what is on it matters more than the rest.**

**The floor was fifth.** Under Your microphone, under the departure, at the same
weight as Guest link — the one mechanic this application is named after, below a
readout about yourself. It is now the first control, directly under the roster,
because it is *about* the roster: it decides which of the people listed there
may be heard. The microphone is about you alone and is mostly a state readout,
so it follows. The floor is also the only control on the screen with a running
clock, and a clock somebody is watching should not be the thing they scroll to.

**Step In and Step Out stopped sharing a card.** One `SectionLabel` said
`{iAmPresent ? 'Step Out' : 'Step In'}` over one card with a branch inside it,
which meant one *position* served two controls that want opposite ends of the
screen. Step In is the only thing you came to decide on a screen you are not in;
Step Out is the last thing you do on one you are. The position had been chosen
for Step Out — reasonably — and Step In inherited it, landing below a microphone
card that is not rendered for somebody outside the room anyway. So Step In goes
directly under the roster and Step Out stays at the foot of its half.

The recorded reason for Step Out's placement survives intact and is now visible
rather than merely written down: it is still directly under the microphone,
still the same question asked at a greater strength, and "everything below is
about what the channel is doing rather than about you being in it" is now a
heading instead of a comment.

**Two group headings, and nothing else moved to earn them.** `GroupHeading`, a
hairline rule and a line of 13px `textMuted`, splits the screen into the
conversation — the room, the floor, your microphone, the way in or out — and
*What the channel is carrying*, then *Who gets in*. The sections below the first
seam were already in this order; the comment on Invite has said since
2026-08-24 that they run "in roughly the order somebody in one reaches for
them", and a column of ten identical labels could not show it. Two headings can.

**It is local to `ChannelView` rather than in `components.tsx`**, on the rule
`cardPing`'s paddings are kept under: every other view in this application is
one run of sections, where a heading over the only group there is would be a
label for the screen — which is what *The profile stops saying things its own
route said* was about. A second caller is where it moves out.

**The rule carries the weight, not a third type size.** `SectionLabel` is
already the loudest small type here, so a heavier heading would compete with the
labels rather than sit above them. A hairline and a wide top margin say a new
part begins without adding a size that argues with the two already present.

### What was considered and not done

**Collapsing the dormant sections.** The largest problem on this screen is that
Shared clipboard, Watch together, Shared audio, Recording and Recordings render
in full — a field, two or three buttons, and a paragraph each — whether or not
anything is happening, so two people talking in a fresh channel scroll past five
cards describing things nobody is doing. Folding each to a line until it has
something in it would be the single biggest improvement and is not this change.

It is left because of what it costs elsewhere. `views.test.tsx` finds controls
by `findButton(tree, label)` over the whole render, so every dormant control
behind a disclosure disappears from dozens of assertions at once — and more
importantly it fights the rule this screen is built on, that a control which is
refused says why. A disclosure hides the reason along with the button. Doing it
properly means deciding what a collapsed section shows *instead*, which is a
design question and not a mechanical one. It wants asking for on its own.

### The header

**Home and Settings move above the name.** They shared its line, which cost the
name the width of two ghost buttons and truncated it at `numberOfLines={1}` to
pay for them — and a channel named after the people in it is exactly the name
that runs long. It was the one thing on that row a tap could not recover.

With the line to itself the name goes to 28, which is `type.title` and what a
screen's own name is everywhere else, and to two lines, which is the difference
between reading three names and reading two and an ellipsis. `flexShrink: 1`
goes with the row it was for. The buttons take a negative horizontal margin
because `Button`'s padding is sized for a card and would otherwise inset the
pair further than the title beneath them, which reads as a mistake rather than
as chrome.

### The floor card

`floorCardHeld` and `floorCardSilenced` go to `borderWidth: 2`. These are the
two states where the room is not behaving normally — somebody is speaking
uninterrupted, or you have been cut off — and a colour change on a hairline is
a small signal for a large fact. `floorDim` alone does not carry it in light
mode, where it is a pale tint on a white card. `floorStatus` goes to 20/700,
above `type.heading`, being the first sentence anybody reads on the screen now.

### The test

`orders the screen by what somebody in a conversation reaches for` reads
`SectionLabel` and `GroupHeading` as **one interleaved sequence**. Asking
separately whether both headings render would pass with either of them in the
wrong run, which is the only way this can actually go wrong — the same failure
the structural read replaced the text search to avoid, one level up.

`Step Out` loses its capital and joins the rest in sentence case. The capital
was there to distinguish the heading from a lowercase "step out" in some card's
prose, back when the test searched flattened text; the structural read retired
that hazard, and splitting the two departures retired the flip the capital was
marking.

1,206 lines, so no rollover.

## Home and the channel get pinned headers — 2026-08-31

`Screen` has had a `header` slot since TranscriptView needed one: a sibling
above the ScrollView rather than an overlay on it, so it takes its own height
out of the viewport and nothing is ever hidden beneath it. Both of the two
screens somebody actually lives in now use it. No new mechanism, and the two
notes that slot already carried — that it sits inside the
`KeyboardAvoidingView`, and that a pinned header needs an edge a scrolling one
does not — apply unchanged.

**What each header carries is the whole of the design question**, a pinned
header being the one place on a screen where height is paid for on every
screenful rather than once.

**The channel.** The name, Home, Settings, and the recording indicator while
one is running. This is the longest screen in the application — eleven
sections, several of them lists — and Home was reachable only from the very top
of it, which on a channel with a few recordings is a flick away from wherever
anybody is.

The name goes back onto the buttons' row, which reverses a decision made a few
hours earlier on the same day, and the reversal is the point rather than a
correction. That change moved the name *off* the row because it lost the width
to two ghost buttons and truncated to pay for them — sound reasoning about a
header whose height is spent once, at the top of a scroll. Pinning changes the
premise: a two-row header with a 28pt title over a button row is a permanent
tax on the viewport. So the name comes back to the row at 20 and one line. What
truncation costs is also smaller than it was, the description sitting
immediately below in the scroll and the full name being in Settings, which is
the button beside it.

**The recording indicator is the piece that gains most.** It marked the top of
the scroll, so the one fact on this screen somebody needs at every moment —
that they are being captured — was the first thing to leave the viewport. It is
a second row inside the header and only while a recording runs, so the header
is one row the rest of the time; `Screen`'s note says a header whose height
changes is fine, there being no inset kept in step with it.

**Home.** The title, Contacts, Settings, and the live bar. The header was
already one row and keeps its shape; what this is really for is the bar under
it. *An open microphone behind a screen giving no sign of it is the one way
this could be worse than having to step out first* — and a sign that leaves the
viewport on the first flick gives no sign for most of a list as long as
somebody's channels.

**The offline notice stays in the scroll.** It is held back before it appears
at all and goes away by itself; pinning it would give the most transient thing
on the screen the one position that never moves.

### Testing a header that is pinned

Both arrangements flatten to the same string — `textOf` walks the whole tree
and reads a header that scrolls away and one that does not as identical — so
the tests assert on `Screen`'s `header` prop and render that element on its own.
That is also what makes the negative assertion meaningful: the channel's test
gives the channel a description, checks it is in the tree and *not* in the
header, so "the description stayed behind" is a claim about a description that
exists. It was written first against a string the fixture never had, which would
have passed whatever the code did.

1,268 lines, so no rollover.

## Contacts joins the pinned headers — 2026-08-31

The third and last of the screens somebody scrolls, done the same way as Home
and the channel: the title and the way back move into `Screen`'s `header` slot,
the row keeps its shape and stops moving, and `header` takes `container`'s
horizontal padding plus the hairline a pinned header needs.

It has the strongest case of the three and got it last. Home has a live bar
worth pinning and the channel is simply long, but this list is as long as the
number of people somebody knows and **has no other way out of it** — the single
Home button in that row is the exit. A header that scrolls away strands whoever
is furthest down the list, which is whoever has the most contacts.

**`AddContact` stays in the scroll**, which is the only judgement here. It was
the obvious candidate to bring up with the title, being the one thing on this
screen that is not a contact. Two reasons it does not go: opened, it is a field
with two buttons that grows another line when it has something to report, and a
pinned header is the one place on a screen that cannot afford something
changing height for a reason nobody asked about — the same rule that keeps the
channel's description out of its header and Home's offline notice out of that
one. And it is not navigation. It is the first thing you do on this screen,
which is what the top of a scroll is for; the header is for what you do *to*
the screen, which here is leave it.

Its test asserts on the collapsed **"Add contact"** label rather than on the
field's placeholder. A placeholder is a prop, and `textOf` walks rendered text
— so the negative assertion would have passed against any string at all,
including one the screen never contains. Written first the wrong way, and it
would have proved nothing.

1,300 lines, so no rollover.
