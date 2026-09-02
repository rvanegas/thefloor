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
| `DECISIONS-2026-08-31-to-2026-08-31.md` | fourteen entries written on one day, from the two halves of the channel screen to the profile naming a room | nothing — closed by rollover |
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

## Declining an invitation is leaving the channel — 2026-08-31

The first entry of this volume, which the last one's line count closed.

The ✕ on an invitation card did not do what it looked like it did. It called
`dismissInvite`, which appended a channel id to `dismissedInvites` — a
`useState` array in `AppProvider` that no storage ever saw — and Home filtered
the invitation list against it. So the row went away until the app was
relaunched, and it had never gone away on any other device the account was
signed in on. The provider's own comment said as much and defended it: channels
are short-lived, and reopening to see what is live is reasonable rather than a
fault.

That defence stopped holding when channels stopped being short-lived.
`9761d72` made them survive a restart, so an invitation now stands until
somebody acts on it, and the ones nobody acts on accumulate — the same
unbounded Home that BACKLOG.md § *Two things that ship unbounded* is about,
approached from the invitation end. A control whose effect is undone by closing
the app is one people press twice and then stop believing.

**So it leaves the channel, which is the action that already means no.**
`LEAVE_CHANNEL` gives up membership, and membership is the only reason
`invitesFor` was offering the channel at all: its test is a participant who has
never been present. Give up the first half and the invitation is gone
server-side, on every device, for good. Nothing was added to the core, the wire
or the schema — the action, its guard `canLeaveChannel`, its place in
`CLIENT_ACTIONS`, and the Home push aimed at `departed` were all already there
and all already tested. What changed is which button reaches them.

**Two other shapes were on the table and both are worse.** Persisting
`dismissedInvites` to device storage is the cheapest — no wire change — and it
buys the smaller half of the complaint: a relaunch stops resurrecting the row,
a second device and a reinstall still do. A server-side dismissed set per
account fixes both and is a core, wire and schema change that ends with two
ways of not being in a channel, one of which leaves you a participant of a
place you have said no to. Leaving already existed and already means exactly
that.

**It asks first, and the confirmation is not the settings screen's.** That one
counts the recordings, because leaving a channel you have been in gives up
reaching them. This reader has never been in the channel, has made none of
them, and cannot see the ones that are there — so saying a number would be
telling somebody what they are losing out of a room they have never entered.
The sentence is the consequence they can act on: a fresh invitation is what it
takes to come back.

**What it deliberately does not do is retract anything.** The person who
invited you is not told, the push notification already delivered is not
withdrawn, and a second invitation raises a new card exactly as it would have
before — which is the behaviour the old per-channel dismissal was reaching for
and got by accident, since a re-invite into the same channel could not have
been distinguished from the dismissed one.

`dismissedInvites` and `dismissInvite` are gone from `AppProvider` rather than
left unread. The three tests that drove the old list — dismissal surviving a
navigation, and a second invite raising a fresh banner — are gone with it, and
in their place are the three that describe a decline: it asks, the destructive
choice sends `LEAVE_CHANNEL`, and a cancel leaves the row where it is, the
invitation being the server's to withdraw rather than the screen's to hide.

1,081 lines, so no rollover.

---

## The iPad gets the room it has, which is two panes — 2026-09-01

`supportsTablet` had been false since 2026-08-09 on a stated reason: nothing in
the layout adapted to a larger screen and nobody had opened it on an iPad, so
claiming support invited App Review to test there on a phone layout.
RELEASING.md said to turn it back on after actually looking at one. This is
that, and the looking came first.

**Nothing was broken at 1024pt. Everything was stretched.** There was not one
`maxWidth`, `Dimensions` or `useWindowDimensions` call anywhere in `app/src/`;
every screen is flex-fill with padding, which is exactly right on a phone and
produces, on an iPad, a channel row with a two-word title and a timestamp 900
points away, a 976pt-wide email field on the sign-in screen, and a transcript
running the full width past any measure a person can read.

**Two mechanisms, deliberately separate, because they answer different
questions.** A *measure* — no column exceeds 620 — and a *layout mode*, two
panes or one. Keeping them apart is what let `ui/theme.ts`'s argument survive
whole. That file says the fourteen module-scope `StyleSheet.create` blocks may
capture their tokens once at import because the platform re-resolves colour,
and that a `useTheme()` would force a re-render path through all of them. A cap
is a **constant**: `maxWidth` resolved by the layout engine against whatever
parent it finds, so a block spreads it exactly as it spreads `spacing(2)` and
nothing becomes reactive. Only the mode is a hook, and it has one call site.

**620 because `server/src/html.ts` already sets 38rem** on the privacy, support
and landing pages. One measure across the product beats two defensible ones. It
is inert below its own width, so no phone renders a pixel differently — which
is what let it ship as its own commit, ahead of anything iPad-specific.

**The breakpoint is 800, and it is arithmetic.** A 340pt list — a phone-width
Home, so Home needed no second design — plus a detail pane that must never be
narrower than the phone screen it replaced. 768 was written first and the test
caught it: 768 − 340 is 428, and an iPhone 16 Pro Max is 440. An iPad mini in
portrait is 744 and stays stacked for the same reason. And jest mocks the
window at 750×1334, so a breakpoint below that would have switched every future
test rendering `App` into the split layout without anybody asking; a test should
have to mock `useWindowDimensions` to get it.

**Width, never `Device.deviceType`**, though `expo-device` is already a
dependency and would have read more directly. An iPad window dragged to a third
of the screen beside a browser is a phone-shaped surface, and it is resized
while somebody watches. Device identity answers a question nobody asked. The
same fact is why none of it is gated on `Platform.OS`: the web spike had
already measured this defect from the other end — a *Claim the floor* button
1534px wide at a 1600px viewport — and a browser window and an iPad are one
problem.

**Two things did not have to be built, and knowing why is worth more than the
code that was.** Nested screens — a profile, channel settings, a transcript —
are early returns *inside* `ChannelView` and `ContactsView`, which are the
detail pane, so "nested screens stay in the right pane" was satisfied by
changing nothing. Lifting them into `Root` would have reintroduced exactly what
`App.tsx`'s opening comment refuses, this component knowing which screen a
profile was opened from. (**Half of this stopped being true within the day** —
see *The left pane is a choice* below, where the contact list's profile is
lifted after all, on the ground that the argument was about a profile covering
the screen it was opened from and a split is the case where it does not.) And `Screen`'s `reveal` needed nothing: it measures
the card and the frame both with `measureInWindow` and uses only their
difference, discarding `x`, so it is translation-invariant and two `Screen`s
side by side measure correctly and independently. That *sounds* broken, which
is why it is written down — somebody will otherwise rewrite it.

**`Panes` holds both arrangements, and that is the part that is not obvious.**
React preserves a subtree that stays in the same place in the tree. A stacked
layout rendering its screen directly and a split one rendering it two Views
down would therefore remount on every crossing — and a crossing is a rotation
or a window drag, something happening under somebody's hand. `ChannelView`
holds an open profile, an open transcript and every composer field in local
state, and all of it would have gone while the audio carried on regardless,
because the session hook is above all of this. Quiet enough to ship. So the
detail slot sits at one depth under one key in both modes, and
`panes.test.tsx` asserts the screen is not remounted across the flip; the naive
version fails that assertion, which is how the test is known to have teeth.

**The list pane does not avoid the keyboard.** iOS reports one keyboard frame
for the window rather than one per pane, so typing into the composer on the
right shortened Home on the left for a keyboard nothing over there had asked
for. This is the only thing `PaneContext` is load-bearing for, and that context
carries pane identity and never tokens — it is deliberately not the theme
context `theme.ts` argues against.

**One reasoned decision was reversed rather than quietly edited.** The channel
footer's comment argued its three equal thirds from the thumb. There is no
thumb at the bottom of a 1300pt screen, so the bar is capped at 480 and centred
— 620 divided three ways is a 206pt target for an icon and one word, which stops
reading as a control. What the cap does not touch is the property the comment
was really about: each action is still `flex: 1` within the bar, so the middle
one still does not move when *Claim* becomes *Release*. Stability of position
is the rule; reach was only ever a phone's reason for wanting it.

**Two things on screen were phone-shaped rather than merely narrow.** The
channel screen's Home button goes in the detail pane, Home being the thing
beside it; the exits are unaffected, another conversation being a tap on the
list and leaving this one being *Step out*. And Home's live bar goes when the
conversation it points at is the pane next door, since it says you are
somewhere else and offers to take you back, and neither is true from a hairline
away.

**The address still names one screen.** `webRoute.ts` did not change: the list
pane is not a screen and has no address — you cannot navigate to it, it is
simply there — so the precedence order now resolves the *detail* pane and
`screenOf(navOf(s)) === s` still holds. Home is still the state with nothing
set, which on a wide window is a live list on the left and an empty pane on the
right.

**Orientation is per-platform and Expo has no key for it.** `orientation` is
`default` purely so prebuild writes no array of its own, and two `infoPlist`
keys say it instead: portrait for the iPhone,
`UISupportedInterfaceOrientations~ipad` for all four, which Apple requires of
an app that can share the screen. `UIRequiresFullScreen` is deliberately absent
— that absence *is* the multitasking support, and setting it true is the
one-line retreat if it ever proves untenable. Verified against the generated
`Info.plist` and `TARGETED_DEVICE_FAMILY = "1,2"` in `project.pbxproj`, on the
rule `rtc.use_external_ip` earned: the config file is no evidence.

**What this costs at submission time** is an iPad screenshot set, which App
Store Connect requires the moment the binary declares iPad support. Nothing
local catches it — `bin/submit-ios` does not look at media — so it surfaces as
a refused submission with the version record already made. It is in
RELEASING.md's pre-submission list now, where the old assertion that
`supportsTablet` was false used to be.

---

## The left pane is a choice, and there are two things to put in it — 2026-09-01

Written hours after the entry above, which said the pane on the left was Home.
It is now Home *or* the contact list, switched by the same `contactsOpen` flag
that makes Contacts a screen on a phone.

**The reason is that they are two indexes onto one thing.** Home lists the
people you can reach by the conversations you have with them; Contacts lists
them by name. Everything else in this application is something you *opened*,
and opened things belong in the pane on the right. Sending the contact list
there made it an interruption — it covered whatever conversation was open, and
closing it was an exit rather than a switch — when what it actually is is the
other way of reading the same list.

**Below the breakpoint nothing changed at all.** One flag, read two ways by the
two layouts, rather than a second notion of where the contact list lives. On a
phone `contactsOpen` still means Contacts is the screen, and `detail() ?? list`
still reproduces the old chain exactly.

**The address needed no work, which was not obvious until it was checked.**
With a channel open, `screenOf` already prefers the channel over
`contactsOpen`, so a contact list beside a conversation is that conversation's
address — the left pane is not a location and cannot be navigated to. A contact
list beside an empty pane is `/contacts`, which is exactly what is showing, and
it survives a reload. `webRoute.ts` is untouched and `screenOf(navOf(s)) === s`
still holds, since the invariant is about what `navOf` produces rather than
about every `Nav` that can exist.

**The profile is lifted into `Root`, and the entry above says it would not be.**
That entry was right about the argument and wrong about its reach.
`App.tsx`'s opening comment refuses to route profiles through it because it
would have to decide where closing one goes *back* to — and that is a question
only where the profile covers the screen it was opened from. In a split it
covers nothing: the contact list is the pane next door and never went away, so
closing the profile empties the right-hand pane and there is nothing to decide.
So the refusal stands exactly where it applied, and `ContactsView` still owns
its profile on a phone. The seam is one optional prop, `onOpenProfile`, given
only when there is a second pane to open into — and the two paths are
deliberately not collapsed, because collapsing them would drag the question the
comment refuses back into the case where it is real.

`ChannelView`'s profiles were never in question. It *is* the detail pane, so
its roster's profiles have always opened in the right place, in both layouts.

**A profile sits ahead of the channel rather than instead of it.** Tapping a
contact while a conversation is open draws the profile over it and closing the
profile puts the conversation back — nothing was cleared, so nothing has to be
restored, and presence never noticed. It also means the address still reads
`/c/…` under an open profile, which is what it has always done: profiles have
no address here and never had one.

---

## What is open is a value, not a race down five flags — 2026-09-01

The third of the same day, and the one that retracts a paragraph of the first.
`App.tsx` held a channel id and four booleans and resolved them in a fixed
order to decide what the detail pane showed. That order answers *which of
several open things is on top*. The question is *what did you last ask for*.

**A chain cannot answer it, and the bug was already shipped.** A profile
outranked a channel, so `HomeView`'s `onEnterChannel` — which set the channel
and cleared nothing — did nothing visible while a profile was open in the pane.
Three other call sites cleared the neighbouring state by hand to avoid exactly
that, and the ones that forgot were the faults. The entry above this one
records the reasoning that made it look correct: *a profile sits ahead of the
channel rather than instead of it*, which is true of a profile opened over a
conversation and false of a channel tapped under an open profile. **That
paragraph is retracted.** Closing a profile still puts the conversation back;
the pane simply no longer holds both at once, and the conversation is what the
list to the left is showing as open.

`ui/detail.ts` is one value — `none | channel | profile | settings | standings
| support` — and every handler assigns it. Overriding is structural: there is
no order to get right, nothing left set behind what is showing, and no handler
that has to remember what else might be open. The three defensive clearings
went with it, and the notification tap's five `setX(false)` calls became one
assignment. That tap had missed Standings until 2026-08-31, invisibly, because
the channel outranked it and only the way *out* was wrong — a class of fault
the type no longer permits.

**Ordering did not disappear; it moved to where it belongs.** An address is
read rather than assigned, so `webRoute.ts` § `screenOf` still resolves a
precedence, and `detailOfNav` calls it rather than restating it. The two ends
cannot drift because there is only one chain left.

**The contact list is deliberately not one of the kinds.** It is not something
you opened; it is which list you are indexing people by, so it stays its own
flag — and that is what deletes the `!split && contactsOpen` special case.
Below the breakpoint the list pane *is* the screen, so rendering `ContactsView`
there covers the phone exactly as the special case did, without a layout test.
One consequence is deliberate and visible: entering a channel from the contact
list on a phone no longer closes the list behind it, so stepping out returns to
the list you came from. Home still means Home — `ChannelView`'s Home button
clears both.

## Close, not Back, in both layouts — 2026-09-01

Six screens said *Back*: `HomeSettingsView`, `SupportView`, `LeaderboardView`,
`ProfileView`, `ChannelSettingsView`, `TranscriptView`. On a phone the word
means *reveal what is underneath*. In a split there is nothing underneath — the
list is beside rather than under — and all the control can do is empty the
pane.

*Close* is true in both, which is the point: one word means the handler is
`() => setDetail({ kind: 'none' })` with no `split` in it. **Every attempt to
make the wording pane-dependent reintroduces the conditional the choice
removes**, and buys nothing, since the act is identical either way.

**`ChannelView` gets one too, and only when you are not present in it.**
Without any way out it is the only view the detail pane can hold that cannot be
dismissed — the single place the two panes behave unlike each other. Offered
unconditionally, somebody present in a conversation could close its screen,
switch the left pane to Contacts, and be in a call with nothing on screen
saying so. So `App.tsx` passes `onClose` exactly when `live?.id !== channelId`,
which means it appears the moment you step out. It is drawn only in the detail
pane, taking the place of the Home button that is already hidden there — on a
phone this screen covers the list, and Home is what the way out means.

**TASKS.md § *The Tier Above Both Lists* is what makes that belt-and-braces
rather than load-bearing.** Once the room you are in is shown above both lists,
closing its view cannot hide it, and the condition could be dropped. It is
worth keeping until then.

A live bar duplicated into `ContactsView` was proposed for the same gap and
rejected: a live room is not a contact and has no business in that list. That
objection is what produced the tier.

---

## The web app is a secondary interface, and the phone is the install — 2026-09-01

Written out of WEB.md when that file was deleted, along with the four entries
below it. The design is built, landed and serving on both trains; what it was
still holding was reasoning, which belongs here, and a list of things nobody
has looked at, which went to BACKLOG.md and TASKS.md.

**Every reference to `WEB.md` in code and in `planning/` was repointed at these
five entries in the same commit** — which is the job that makes deleting a
design document more than an `rm`, since a dozen files named it and four named
a section of it. One pointer could not be fixed and is left dangling
deliberately: `DECISIONS-2026-08-28-to-2026-08-31.md` says *See WEB.md*, and a
closed volume is never edited. If you have followed it here, this is where it
was going.

**The premise, which decides nearly everything else: the web app is a
secondary interface, and the phone is the referential install.** Somebody is
expected to install on a phone and reach for a browser as a convenience — a
laptop already open, a machine that is not theirs, a keyboard for the
clipboard. Almost every scope decision follows from that sentence rather than
from a technical limit, so it is the thing to argue with directly if it ever
stops being true.

It is why **notifications are skipped**: no service worker, no VAPID, no server
path beside APNs. A secondary interface has no business waking anybody, and the
phone is already there to do it.

It is also why **file upload and download are not optional**. Picking a file is
the one thing a laptop does better than a phone, so it is among the reasons to
open the browser at all rather than a feature ported for completeness. Upload
is `<input type="file">` into the raw body the server already accepts, and
**`fetch` reports no upload progress** — a 100 MB file over domestic upstream
is minutes of silence, so it wants `XMLHttpRequest`, which does, rather than
the more obvious call. Download cannot be a plain link, because
`GET /recordings/:id/export` needs the bearer token: fetch, blob,
`URL.createObjectURL`, click a synthetic `<a download>`, revoke. The whole file
is in memory for the moment that takes.

**`AudioDebugPanel` is hidden on web** — 454 lines of `AVAudioSession` route
diagnostics describing a session a browser does not have. Already gated on
`hello.debug`; the web build gates it on the platform as well.

**The tab indicator replaces the buzz, and is deliberately weaker.** `cue.ts` is
imported as `./cue` by both nudge hooks and both already take
`fire: () => void = buzz`, so one `cue.web.ts` covers it and neither hook
changed. It marks `document.title`, swaps the favicon, and clears both on
`visibilitychange`. The buzz's entire justification was that it reaches a
*locked phone*; a browser tab has no equivalent, and with notifications skipped
there is no delivery to a machine nobody is watching. **That is the premise
working, not a gap** — written down so nobody later closes it by reaching for
notifications, or by reviving the tone into the audio session, which
`DECISIONS-2026-08-20-to-2026-08-21.md` § *The buzz reaches a locked phone, so
the tone is not built* rules out and which would play over the very voice it
was announcing.

**What the spike established, and it inverted the scope question.** The iOS UI
ports essentially wholesale under `react-native-web`: `ChannelView`, all 2,356
lines of it, renders with correct state and no console errors. The cost was
three web-only files, not eight thousand lines retyped — `index.web.ts`
(whose native twin is nothing but iOS audio setup),
`livekitReactNative.web.ts` (because `@livekit/react-native` reaches
`react-native-webrtc`, which calls `requireNativeComponent`, an API
`react-native-web` has removed, so the import throws before any of our code
runs) and `useSessionAudio.web.ts`. Bundle: 1.51 MB raw, **405 KB gzipped**,
582 modules. `Pressable` renders as a real `<button role="button">`, so the
semantic-HTML cost is lower than assumed.

**Metro does not apply platform extensions to the entry point.** With
`"main": "index.ts"` in `app/package.json`, `index.web.ts` is silently ignored
and the whole iOS audio graph bundles anyway — 765 modules rather than 582, and
no error. `"main": "index"` is the fix and is why it reads that way.

## What react-native-web ships inert, which is not nothing — 2026-09-01

Audited 2026-08-30, after *Sign out* and *Leave channel* turned out to do
nothing in a browser. **The library's compatibility strategy is that every
React Native export exists**, so shared code imports and renders — but an API
with no browser equivalent is shipped *inert* rather than omitted (which would
fail at import) or throwing (which would fail at the first call). That is the
generalisation worth holding: the failure mode of this library is silence, and
it will not appear in a stack trace.

Two cost this app something:

- **`Alert` is `static alert() {}`.** A no-op, and its own declaration says so:
  `static alert(): any`, no parameters. All twenty-six call sites did nothing —
  confirmations never asked, so the action behind them never ran, and error
  reports never appeared. Patched in `app/src/ui/alerts.web.ts`, installed from
  `index.web.ts`, mapping onto `alert`/`confirm`.
- **`Share` rejects** where `navigator.share` is missing, which is every
  desktop browser and no iOS one — **so the fault hid from a phone.** The guest
  link is the whole of how somebody without an account gets into a channel, so
  `app/src/share.ts` falls back to the clipboard and the control says which it
  is about to do.

Two more are inert without costing anything yet. **`Keyboard`** never fires a
listener and `isVisible()` is always false, so `useRevealOnKeyboard` does
nothing here — browsers scroll a focused field into view themselves. And
**`DynamicColorIOS` does not exist at all**, so the import in `theme.ts` is
`undefined` on web; every use is behind a `Platform.OS` guard, and an unguarded
one would be an immediate crash rather than a quiet no-op.

## The web app is a versioned client; the guest page is lockstep — 2026-09-01

**The two browser clients have opposite compatibility policies, deliberately.**
Written down because the next person will otherwise "fix" one to match the
other.

The guest page is rebuilt on **every** `bin/deploy` and must stay in lockstep
with the server. `build.mjs` explains why its bundle is never committed, and
`bin/deploy` states the stake: a stale bundle is a page whose behaviour is a
deploy behind its server, and nothing on it would say so. For a page with no
version, that unconditional rebuild *is* the entire compatibility mechanism —
and it is free, because a guest seat is ephemeral, `sessionStorage`, no
install.

The web app takes the other route: it gets a version and is pinned to a release
train, so it **can** fall behind the server. The protection is therefore the
discipline that already protects iOS — *never ship a wire change to a server
before the client can speak it*, two-stepped, aliases first.

**It reports the App Store build number of the train it was cut from**, read
from `app.json`'s `ios.buildNumber` at the exported tag and inlined at export
as `EXPO_PUBLIC_BUILD`. Correct by construction: stable is cut from `released`,
beta from its `build/<n>` tag, and neither needs hand-syncing. `build.ts` reads
`nativeBuildVersion` rather than `app.json` because Xcode's re-signing has been
observed bumping `CFBundleVersion`; **that objection does not apply here** —
there is no signing step and the bundle is the artefact — so `build.web.ts`
returning the injected constant is sound rather than a shortcut.

Two things follow. `heartbeatTimeoutFor` keys the 5s cadence on `build >= 110`,
so a web client reporting a real build gets the fast path rather than the
legacy 12s one. And **`MIN_SUPPORTED_BUILD` applies to web**, which is
consistent — the floor is never raised past what is released — but it means a
browser can be shown `UpdateRequiredView`, whose button is an App Store link
when what a browser user must do is reload. That variant is still not built;
see BACKLOG.md.

## The census counts native only, and absent means native — 2026-09-01

The build census exists to measure an *installed population*, and the web app
has none: there is one live version and everyone gets it on load. So web is
counted out.

**This needs a platform field separate from the build number, and the reason is
counter-intuitive enough to keep.** Absence of a build number is web-shaped
today — production reports `silentBuilds: 0` — but it is not a safe rule: every
native build before 37 is silent too, those installs still exist, and a
returning one misfiled as web would be dropped from the census. That number's
job is to say when a shim may be deleted; misfiling it to zero would license a
deletion that strands a phone.

So platform is explicit and opt-in, and **absent means native** — not because
silence is native-shaped, but because the field will not exist in any installed
binary, and every client that can omit it shipped before the field was
invented. **A new field's absent-value must describe the population that
already exists**, since that population is exactly the set that cannot be
taught the field is there. That generalises past this field and is the reason
this entry is worth its length.

With the build number above, web is not silent anyway; the platform field is
what keeps it out of the count.

## Three variants of deploy, and one door called `/open` — 2026-09-01

**`RELEASING.md` § *The five verbs* gains variants rather than a sixth verb**:
deploy server, deploy web stable, deploy web beta. Deploying is still deploying
— it reaches everybody in a minute and is reversible — and only the target
differs. Stable tracks what is on the App Store, cut from the `released` ref;
beta tracks what is in TestFlight, cut from its `build/<n>` tag. Both are
served at prefixes on the existing host, so there is no DNS record, no second
certificate, and same-origin holds.

**Built from the tag, not the working tree.** `bin/deploy` rsyncs the working
tree on purpose, but "coinciding with the App Store release" is only nominally
true unless the bundle is exported from `released` rather than from whatever is
checked out. And **not folded into `bin/upload-ios` or the release step**:
naming one verb does not name another, and these are manually triggered every
time.

**Fastify serves it, and same origin is not a preference.** The server has no
CORS at all — no `@fastify/cors`, no `Access-Control` headers anywhere — so an
app served from another port renders and then says it cannot reach the server.
Confirmed by `curl -H 'Origin: …'`. `@fastify/static` rather than a hand-rolled
directory server, because the existing `/g/assets/:file` allowlist — named
rather than resolved, which is the whole of the traversal story — cannot carry
to hashed Expo filenames, and traversal defence is where hand-rolled static
servers fail.

**`index.html` must be served `no-store`.** Hashed assets can be `immutable`,
but a cached shell means a returning visitor silently runs an old bundle, which
falsifies the premise that the web app is always current — and that premise is
what excuses it from the census above.

**`--exclude 'app/'` matches at any depth.** rsync patterns without a leading
slash match a directory of that name anywhere, so a bundle exported to
`server/web/app/` is silently not shipped: the deploy succeeds and the page
404s with nothing saying why. Confirmed by dry run. Anchored to `/app/`, and
the export directories are `stable/` and `beta/` rather than `app/` for the
same reason.

**`/open` exists because a channel has no train**, and neither does a contact
or a guest link. Every address that sends a browser *into* the app has to
answer a question none of them holds the answer to, and on 2026-08-30 four of
them tried: the landing page's redirect and its link, the guest page's way out,
and the hand-over after a guest accepts a contact request. Three named `/app`
outright, which on a box serving only `/beta` is a 503 whose JSON body a phone
offers to save as a file — found that way twice, by the same person, a day
apart. So they link to `/open` and the rule lives once, in `server/src/open.ts`.

It reads the train this browser last used from `thefloor.train` in
`localStorage`, written by the app itself on boot — evidence rather than a
guess — intersects that against the trains actually deployed so a retired train
is a redirect rather than a refusal, falls back to stable and then beta, and
when there is no web app on the box at all says so in a sentence instead of
forwarding into nothing.

**It is a page rather than a 302, and that is structural**: the answer is in
`localStorage`, which the server cannot read. There are deliberately **no
cookies anywhere in this application** — the token is not one either — and this
is the place one would have been convenient. What a cookie would buy is a
correct plain `<a href>`; what it would cost is a header on every request, a
line in the privacy policy, and a property the codebase has kept from the
beginning.

**Stable stays at `/app` rather than earning the root**, so `/` can speak to
somebody who has never heard of this — server-rendered by `landing.ts` through
the same `page()` helper as `/privacy` and `/support`, because shipping 405 KB
to show a paragraph and three links to a non-user is the wrong trade. It also
keeps the single-page catch-all safely inside `/app` and `/beta`, where it
cannot swallow `/privacy`, `/healthz`, `/g/:token` or anything added later; a
catch-all at the root would have to enumerate every API route and would be
wrong again the next time one was added.

A signed-in visitor is forwarded from `/` by an inline script before paint.
**Presence, not validity** — checking would mean a round trip before paint, and
a stale token costs a redirect to `/app`, which restores, takes a 401 and lands
on sign-in, where that person was going anyway. `location.replace` rather than
`assign`, so Back does not bounce into the redirect; wrapped in `try`/`catch`,
because Safari with storage blocked throws rather than returning null; and
`/?stay` is the escape hatch, since otherwise a signed-in person could never
read the informational page or reach `/support` from it.

---

## The tier above both lists — 2026-09-01

Home used to *be* the channel list. Contacts was a screen you opened from a
button in its header, with a button of its own to get back. The two are peers —
both are lists of the people you can reach, one indexed by the conversations you
have with them and one by name — and nothing about the pair justified which one
was the root of the application and which was reached from it.

Home is now a **tier** containing both, and the channel list has a name of its
own for the first time. The frame has a pinned top — the title and Settings, the
room you are present in if there is one, and a switch between the two lists —
and a scrolling middle, which is the selected list with Chip in and Standings
at the foot of it. The design that argued all of this was HOME.md,
deleted with this entry; what follows is what survives it.

**The live bar is the reason it was worth building rather than tidier.** It sat
in Home's header, so it did not exist while Contacts was showing. On a phone
that survives, because Contacts covered Home and you were there a moment ago.
Above the width breakpoint it does not: the contact list holds the left pane
while something else holds the right, and then somebody is present in a
conversation with nothing anywhere on screen saying so — which `HomeView`'s own
comment had called *"the one thing this change could plausibly make worse"* when
the second pane shipped that morning. The fix proposed first was to draw the bar
in the contact list as well, and it is wrong: a live room is not a contact and
has no business in that list. It belongs to whatever contains both lists, which
did not exist until now.

**Chip in and Standings were at the bottom of your channels because the bottom
of your channels was the only place there was.** They are about the application
rather than about either list, which is the same argument in two places, and
Settings — already a header button — is the third. All three are now tier-level.

**How prominent Chip in became was the one open question the design carried, and
it is answered: exactly as prominent as it was.** It is the last thing in the
tier's scroll, below whichever list is showing. Promoting it is a claim about
what it belongs to, not about how loudly it should ask, and the comment it
inherited governs the tier exactly as it governed Home: *"Everything above it is
what somebody opened the app to do. A request for money that sat above the
channels would be reading the room wrong."* That argument was never about the
channel list in particular. Two alternatives were declined — pinning it to the
foot of the frame, which is the most visible and the furthest from what the
comment asks for, and folding it behind Settings, which would make Settings a
drawer of unrelated things, trading one miscellany for another.

**The address needed no new axis, because it already had one.** The iPad split
had introduced `contactsOpen` as a state independent of what the detail pane
shows; the tier is that state with honest names, `List = 'channels' |
'contacts'`. `/` is the Channels tab and `/contacts` the other, exactly as
before. **`webRoute.ts` is untouched** — the boolean survives on the wire
between `detail.ts` and the address bar, because a URL only ever needs to know
whether the contact list is the one showing. This is the one place the split and
the tier fit together rather than fight.

**`ChannelView` has one way out with one word.** It had two buttons and three
cases: *Home* on a phone, which revealed the screen underneath and also put the
channel list back in the pane behind it; *Close* in the detail pane; and
neither, while you were present in the channel, because closing the conversation
you were talking in and then switching the pane beside it to Contacts would have
left somebody in a call with nothing on screen saying so. The tier answers all
three from above. The pane this closes into carries the live bar whichever list
it is showing, so there is nothing left to withhold, and *Close* is honest in
both layouts — it reveals the tier on a phone and empties the pane in a split.
See GLOSSARY.md § *Close*, whose "distinct from Home" clause is now about a
frame rather than about a button.

**The profile a phone opens from a contact row moved up one level with
everything else that was not a list.** `ContactsView` owned it, which is what
made it a screen; it is a body now and cannot cover anything. `App.tsx`'s
refusal to route profiles through itself is untouched and for the reason it
always gave — it would have to know which screen a profile was opened from to
know where closing it goes back to — and that question does not arise one level
down, where there is exactly one answer: back to the tier, with the contacts
showing, which is where it was tapped. The same optional `onOpenProfile` seam,
given only when there is a second pane, now hangs off the tier rather than off
the list.

**Three questions the design raised and this deliberately did not answer.**
Where contact requests belong now that each tab could answer for its own pending
work — they are still drawn in the channel list, where they have always been,
which is the status quo rather than a decision. Whether the switch should carry
counts, which is the obvious answer to a pending request going invisible behind
the other tab and is the first thing that will be asked for. And whether the
*You* card should leave the Contacts tab, which is the same argument that
promoted Chip in, applied to a card. None of the three is load-bearing for what
shipped, and each is worth deciding on its own rather than in the middle of a
restructure.

**Nothing on the wire, in the reducer, in presence or in the audio.** A pure
client change: no protocol change, no compatibility floor, nothing to deploy
before it. What it does change is the first screen every existing user sees on
launch, so it is a release-note item, and it wants the walk in
APPREVIEWSCRIPT.md before it goes anywhere.

---

## The split and the web app have both been looked at — 2026-09-02

Two entries in TASKS.md existed for one reason each, and the reason was the
same: something was built, tested, reasoned about and shipped without anybody
ever having seen it. *Look At The Split On An iPad* and *Look At The Web App In
A Browser* both closed on 2026-09-02 by somebody signing in and looking, which
is the only way either could have closed. **Both swept clean.** Nothing is
recorded here about what the sweeps found because they found nothing; what is
recorded is that they happened, since the entries said in their own text that
no test in this repository reaches the code in question and the absence of a
defect is therefore evidence rather than silence.

What that covers, so a later reader does not have to guess how much was
released by the word *verified*. On the iPad: iPhone SE at 320 and iPhone 16 at
393 unchanged; iPad mini stacked in portrait and split in landscape; 11" split
at both; Pro 13" at the widest the caps go. All four orientations on each, with
a channel open and with a transcript open, no remount either time; the Slide
Over and Split View transitions narrow to wide to out again, also live; a call
surviving the whole sweep, which was the one thing the entry said had to be
seen rather than argued; the rename reveal scrolling its own card; the floating
and hardware keyboards. And both of the behaviours that had never had a reader:
tapping a channel while a profile is open in the right pane, and the live tier
staying above the left pane after closing the channel you are present in and
switching to Contacts.

In the browser: the tab cue marking title and favicon and clearing on look, the
file picker and the download anchor, a large upload showing progress, the
landing page's redirect for a signed-in visitor and `/?stay` defeating it, Back
and Forward walking the route table, and how it all sits at desktop width under
the measure. **Including two browsers in one channel hearing each other**,
which was named as the piece with the least evidence behind it —
`useSessionAudio.web.ts` had never held a real room, the spike having been
written when there was no media server to hold one. It has now.

**Two things this releases and one it does not.** BACKLOG.md § *The left pane
has no selected-row highlight* was held back explicitly on the grounds that it
should follow rather than precede somebody looking at the split; that gate is
open. The spike hook having carried a real room is one more reason to finish it
rather than replace it. What it does not release is BACKLOG.md § *The browser's
audio hook is a spike* — its two named gaps are a refused autoplay with no way
out and nothing listening to what was published, and neither is a thing a clean
session would have shown. A browser that grants the microphone and permits
playback exercises exactly the paths that work.
