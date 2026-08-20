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
| `DECISIONS.md` — this file | 2026-08-16 onward | live |

**Keep every volume under 2,000 lines.** A plain read stops there and says so,
but the notice is easy to miss in a file that reads like an archive, and what
gets dropped is the tail — the newest and most likely to matter. When this file
approaches it, close it: rename it `DECISIONS-<first date>-to-<last date>.md`,
give it the closed-volume header the others carry, start a fresh `DECISIONS.md`
with this preamble, and add a row above. Cut on a section boundary and on a seam
that means something — an epoch in the project, not a line number.

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

**And a channel is never called a room.** The word belongs to Clubhouse, and a
product that borrows a competitor's vocabulary invites the comparison it should
be avoiding. The media layer does use it — `closeRoom`, `setSilenced({ room })`,
`issueToken({ room, identity })`, `new Room(...)` in the app — because it is
LiveKit's own term for a LiveKit thing, and none of it reaches a screen. The
test is whether a user could ever read the word: in the code it is the media
plane's vocabulary; in the interface it does not exist.

---

## The mix is made when the run ends, and is stored

Until 2026-08-16 a recording had no finished form. The stems were the artefact
and the mix was derived on every request — an export encoded one and threw it
away, and `POST /recordings/:id/play` did the same before loading the result as
the channel's track. That was a deliberate choice with a real property behind
it, recorded in the first volume: nothing stored means nothing stale, so a
change to how the floor is applied reached every recording ever made rather
than only the ones recorded after the deploy.

The cost was paid by whoever tapped the row. A long recording takes seconds to
mix, and those seconds were spent with somebody waiting on them — which is why
the row said "Loading…" rather than the screen simply going quiet. The work was
also done again on every request, so a recording played three times was mixed
three times from the same unchanging stems.

It is now made once, when the run is filed, and stored beside the stems it came
from at `<channel>/<run>/mixed.ogg`. Playing and exporting are a GetObject.

**A recording is not shown until its mix exists.** This is the part that makes
the change worth making rather than merely faster on average: `recordingsFor`
and `recordingsInChannel` both exclude rows whose `mix_state` is `'pending'`, so
every card on a screen is one that responds the moment it is tapped. The
alternative — showing it immediately and making the tap wait — is what was
already happening, and the whole point is that a control which is visible ought
to work. The window is seconds, and `startMix` emits when it closes, so the card
appears by the same channel snapshot every other change arrives on.

`mix_state` has three values and the third is the important one. `'pending'` is
invisible; `'ready'` has a mix in the bucket; **`'unmixed'` has none and is
shown anyway**, exporting by encoding on demand exactly as everything did
before. Everything that can go wrong lands there: a mix that failed, a run
filed by a server with no storage configured, and every recording made before
this existed, which the migration backfills. So the worst case of this feature
is the old behaviour, not a conversation nobody can reach — and a row that was
`'unmixed'` becomes `'ready'` the first time it is asked for, since the export
path stores what it made.

Three things were nearly wrong and are worth keeping:

**The stems are not in the bucket when the run ends.** `stopEgress` resolves
when LiveKit has accepted the stop, not when it has uploaded anything, so the
first read after a run will often find nothing. Mixing on demand never met this
because minutes had passed. `getWhenReady` therefore retries for ten minutes
before giving up, and is patient about every failure rather than only a 404 —
the answer to all of them is the same. It is deliberately *not* used on the
request path, where a missing object means missing and the caller is holding a
socket open.

**The sweep deletes the mix key unconditionally**, without consulting
`mix_state`. Asking for one that was never written costs a no-op; skipping one
that was — a mix stored a moment before a crash that lost the state update —
leaves a conversation in the bucket after the row that names it has gone, which
is the failure the sweep's whole ordering exists to prevent.

**A restart during mixing would hide a recording permanently**, since pending is
invisible and nothing else would ever revisit it. `restore()` re-queues every
finished row still marked pending — which is also how a run interrupted
mid-capture gets its mix, the stray-finalizing pass marking it pending first —
and marks them unmixed instead when there is no store to mix from.

**What was given up is the property the old design had.** A change to
`buildFilterGraph` no longer reaches a recording already mixed, and there is
nothing in the code that will notice. Anyone changing how the floor is applied
has to invalidate what exists — `UPDATE recordings SET mix_state = 'unmixed'`,
which makes the next request re-encode and overwrite — or the fix applies to
conversations recorded after the deploy and to no others. That is written above
`GET /recordings/:id/export` as well, since that is where somebody will be
looking.

### Where the mix lives, and the credential that was blamed for it

The first version of this put the mix on the box's own disk, beside the
database, on the stated grounds that writing it to S3 would mean widening
`thefloor-server` from `s3:GetObject` to something that can also write the
bucket. **That was simply false, and the evidence was already open**: the
server has held a PutObject-only credential all along — the one handed to
LiveKit with each egress request — and `media.ts` has used it directly to store
the playback stem since shared audio shipped. Writing the mix needs no IAM
change at all.

With that gone the argument for local disk was weak and the argument against it
was not: persistent state on an instance's filesystem is the thing this project
has otherwise avoided, the database being the acknowledged exception, and one
that would live on its own server if it were larger. The latency case did not
survive either — playback is slower than S3 bandwidth, and delivery to a phone
is slower than traffic inside AWS.

So the mix goes in the bucket, and `RecordingStore` grew a `put` to say so:
reads on the server's own credential chain, writes on the narrow key, one
long-lived client each rather than the fresh `S3Client` per call that
`media.ts` still constructs. `thefloor-server` stays `s3:GetObject` and nothing
else, which planning/CREDENTIALS.md says it should.

### `mixesSettled`, and why tests had to change

Eleven tests failed on the first run, all of them asserting that a recording is
listed the instant the run stops. That is the contract this deliberately
changes, so they were updated rather than accommodated — but they needed
something to wait on, and `setTimeout(0)` is not it when the work is an ffmpeg
process behind three `await`s.

`ChannelRegistry.mixesSettled()` resolves when nothing is in flight, exposed for
the same reason `tick()` is. It forced one thing in the implementation worth
knowing: `startMix` does **not** go through `this.run`, which reports failures
in a continuation of a promise it has already handed back. Everything that
decides whether a recording is visible has to have happened by the time the
tracked promise settles, or a caller that waits correctly still reads a state
that is still moving. `mixWaitMs` is injectable for the same reason — a test
whose store holds whatever it is going to hold should not wait ten minutes to
find that out.

---

## The audio session has three states, and only one of them mixes

2026-08-16, for the "Other Audio Output" task: *audio playing in some other app
should be paused when audio activity, in or out, in The Floor begins.*

It never was. Both configurations in `app/src/audio/session.ts` carried
`mixWithOthers`, deliberately — a podcast played straight through a
conversation. Taking it off both would have been one line, and would have been
wrong: `micNeeded.ts` argues at length that "being in an empty channel should
cost the speakers nothing", and a session is taken the moment you are present
in an active channel, so a two-state fix stops somebody's music while they sit
alone waiting for anybody to arrive.

So the boundary is **audio activity, not presence**, and it needs a state that
did not exist: playout that is exclusive. Three states, in that file:

| | category | options | when |
| --- | --- | --- | --- |
| `IDLE` | `playback` | `mixWithOthers` | connected, alone, nothing audible |
| `LISTENING` | `playback` | — | something audible, microphone closed |
| `CALL` | `playAndRecord` | routes, `defaultToSpeaker` | microphone capturing |

**`othersAudible` turned out to be exactly the right signal, already computed.**
It is a set of identities maintained on `TrackSubscribed`/`TrackUnsubscribed`,
which means it counts a recording being played into the room — the server
publishes that as an ordinary participant track — and, because the room is
built with `stopMicTrackOnMute: true`, does *not* count somebody present who is
self-muted and therefore silent. Both are the behaviour wanted, and neither was
designed for it. What was **not** used is `speaking`: that is smoothed live
speech, and following it would reconfigure the session at every pause in a
sentence.

### Breaking the postmortem's rule on purpose, in one direction

`POSTMORTEM-echo.md` is emphatic that three writers mutate one process-wide
configuration and that this is survivable only because they all write the same
values. `setupIOSAudioManagement` takes two — a recording value and a playout
value — and there are now three.

The break is real and it is asymmetric. `index.ts` hands the observer `IDLE`,
the **mixing** playout value. So a write nobody asked for, firing on some
engine transition while the session is `LISTENING`, can only ever let another
app back in — an audible nuisance, and recoverable at the next edge. Handing it
`LISTENING` instead would have made the same unasked-for write *silence
somebody's music while they sat alone*, from an event nothing reports. Same
rule broken either way; only one of the two failures is one you would ever want
to have.

The microphone ordering from that postmortem is untouched, and that was a
constraint on the design rather than an accident: the new distinction is only
ever between two *closed* states, so nothing about "a call before capture
starts, and until capture has stopped" moves. `useSessionAudio`'s one effect
now owns the configuration outright, with a ref holding what was last applied
— a second effect watching the audible count would have raced the first at
exactly the moment both change, since somebody arriving both makes a track
audible and, through `micNeeded`, opens the microphone.

### `mixWithOthers` left `CALL`, and not for the reason it was once suspected

It was a live suspicion during the echo hunt and was cleared: the echo stopped
under a configuration carrying it. It comes off now because a call is audio
activity by definition. Nothing about the echo canceller (`videoChat`), the
Bluetooth eligibility list or `defaultToSpeaker` depends on it.

### Other apps stay paused when you leave

`AudioSession.stopAudioSession()` is `session.setActive(false)` with no
`notifyOthersOnDeactivation`, so iOS never tells the interrupted app it may
resume. Considered and not built: making it resume means an app-owned native
module deactivating the same session the postmortem is about, for a user who
can press play. If it turns out to annoy people, that is the change.

**The one thing to confirm on a device**, because iOS does not document it
usefully: establishing exclusivity at *activation* is reliable, but the
`IDLE` → `LISTENING` edge changes category options on a session that is
already active. If another app plays on through it, the fallback is to bracket
that one edge — microphone closed, so no capture is disturbed — with
`stopAudioSession()` then `startAudioSession()`, at the cost of a brief gap in
playout. Not adopted pre-emptively.

---

## The deploy history

Moved out of AGENTS.md on 2026-08-15, where it had grown nine deploys deep and
was being paid for in every session's context. What a fresh reader needs at the
root is the current state and the traps; the sequence that produced it is this.
Newest first, and it picks up where AGENTS.md leaves off — that file keeps the
most recent deploy, which is now 2026-08-19's.

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

## One snapshot slot for many watched channels, 2026-08-16

Reported from a phone: sitting in a channel, *listening*, the audio went silent
and the screen fell back to "Loading channel…" with no way forward but Back to
home. 11:05 PDT, which is 18:05 UTC, and the server log for that minute shows
what it looked like from the other end — a media token taken for
`chan_k2WGas_exwcD` ("Piano") at 18:05:37 and another for
`chan_H90XCmha58Cs` ("A Priori") seven seconds later, then the same pair again
at 18:10:08 and 18:10:23. The audio was walking between two channels on its
own. Both were alive and both held the same three people the whole time, so
nothing had ended and nobody had been removed.

**The app kept one snapshot, and the server sends snapshots for every channel
a socket is watching.** `AppState.channelView` was a single slot that
`onChannel` overwrote with whatever arrived, whichever channel it was about.
Two things read it, and both were wrong the moment a second channel was in
play: the channel screen, which rendered "Loading channel…" whenever the slot
held some other channel's id, and `App.tsx`, which decided *where you are
standing* — and therefore which media room to be connected to — from that same
slot. A snapshot for a channel nobody was looking at said "you are not present
here", which the app read as "you are not present anywhere", and hung up.

**The watches accumulate on purpose, so the fix belongs on the client.** The
server's `connection.watchingChannels` is a Set that only `unwatch.channel`
removes from, and the client sends that only when you actually leave a channel
— walking back to Home deliberately does not, because presence outlives the
screen. It is more than a subscription: on `close`, every watched channel is
told this user is DISCONNECTED, which is what starts the grace period.
Unwatching the previous channel on each `watch.channel` would have been a
one-line fix and would have left somebody who is present in A while looking at
B standing in A forever after a dropped socket. So the server was left alone.

`channelView` became `channelViews: Record<string, ChannelView>`, keyed by the
channel each snapshot is about. The screen looks up its own id; nothing else
can empty it. Where you are standing moved into `state/live.ts` as
`liveChannelView`, which searches every held snapshot for the one that is
active and lists you as present — the server allows presence in one channel at
a time and `stepOutOfOthers` enforces it, so at most one matches. Where two do,
the newer `serverNow` wins: after a move, the channel you left has not been
re-sent yet and still says you are there. That tie-break is new, and a map is
what made it expressible at all.

**And "Loading channel…" was a dead end in its own right.** A channel that
genuinely goes — ended, then deleted thirty seconds later, or no longer yours
to see — produces `channel.gone`, which cleared the slot and left that screen
waiting for a snapshot that was never coming. `goneChannels` now records the
ids and the screen says "Channel gone". An id comes back off that list if a
snapshot for it ever arrives, so the two cannot disagree.

Covered by `app/src/state/__tests__/live.test.ts`,
`app/src/state/__tests__/twoChannels.test.tsx`, and two cases in
`views.test.tsx`. What none of them can cover is the shape of the report: the
symptom was heard before it was seen, and the screenshot showed the *less*
serious half of it.

## The way off a settings screen names where it goes, 2026-08-17

Both settings screens said **Done**, which is a word about the *edit* on a
screen that no longer has one to finish — saving happens on blur, so by the time
you reach for that button everything is already kept. What it actually does is
go somewhere, and the two screens go to different places. The button now reads
**Home** on `HomeSettingsView` and **Channel** on `ChannelSettingsView`, so it
says the destination rather than implying a commit.

Behaviour is unchanged. Home settings still `persist()`es and declines to close
if the write fails, which is the thing the old label was quietly wrong about in
the other direction — "Done" on a screen that had refused to save.

**Only one of the two has a "Saving…" state, and asking why turned up a defect.**
Home settings awaits `app.saveProfile`, an HTTP call, so there is an interval to
show and a failure to report. Channel settings dispatches `app.act` and returns,
so there is nothing to await — which is *not* the same as nothing going wrong: a
`channel.action` sent while the socket is down is queued for ten seconds and then
dropped in silence, a refused one is answered with a snapshot carrying no error,
and `persist` records the value as saved the instant it dispatches. The screen
believes a write it has no way to confirm. That is now known defect 9 in
BACKLOG.md, with the reasoning at `socket.ts:88` that already named this shape as
the worst a bug can take.

It was deliberately not fixed here. The honest repair is an acknowledgement for
`channel.action`, which is a wire change under the two-step-deploy rule and
touches every caller of `act`; the tempting one — give the channel button a
matching in-flight state — would be worse than the inconsistency, because it
would assert a round trip that does not exist. So both screens carry a comment
pointing at each other, and the difference reads as chosen rather than missed.

**`ProfileView` and `SupportView` keep Done, deliberately.** Neither has
anything to save, and neither has one destination: you reach a profile from Home
or from inside a channel and it returns you to whichever it was, so naming the
place would be wrong half the time. The rule is that the label names a
destination when there is exactly one, and only then.

One test had to change for a reason worth writing down. `session.test.tsx` uses
the settings screen's exit as the marker for "settings is open", because the
screen's own contents load async. That marker is now `Home`, which appears
nowhere on the Home view — the obvious alternative, the screen's `Settings`
heading, is also the label of the button that opens it, so it would match both
sides of the assertion.

## The build number is global and never resets, 2026-08-17

TASKS.md asked whether the build number increases indefinitely, even when the
version is bumped. Apple does not require it to: `CFBundleVersion` is scoped to
`CFBundleShortVersionString`, so it need only be unique and increasing *within
a version train*, and 1.0.0 build 51 may be followed by 1.1.0 build 1. Counting
up forever is therefore a choice, and it is made here.

The reasoning is in RELEASING.md under `## The build number never resets, and
Apple would let it`, next to the other things `bin/release-ios` does to the
number. The short of it: `MIN_SUPPORTED_BUILD` and the `x-thefloor-build`
header both carry a build with no version beside it, so a reset makes `36` name
two binaries and stops the shim-deletion rule being decidable; `build/<n>` tags
are one flat namespace; and `bin/release-ios` derives the next number from
`app.json` alone, so resetting means the hand edit that already lost build 24.

Nothing was built. The value of answering it is that the constraint on
`MIN_SUPPORTED_BUILD` was implicit until now — the floor has always been read
as an absolute build ordinal, and nothing said that the release process had to
keep making that true.

---

## An unnamed channel widens instead of moving, 2026-08-17

Inviting somebody into an unnamed channel now adds them to it. It used to do
something else entirely, and undoing that is the largest deletion this codebase
has had.

### What it did before

`ChannelState` had two invitation fields. `invitedBy` recorded how somebody who
*is* a participant got here; `invited` held an invitation that was not
membership — invitee → whoever asked — and only an unnamed channel ever had one.
The reasoning was that a named channel is a place and takes people in, whereas an
unnamed one is not a place but a set of people talking, described on screen by
its roster rather than named. So it could not widen. Asking a third person into
`<A,B>` did not make it `<A,B,C>`; it parked the invitation, and when the invitee
answered, `acceptInvitation` walked everybody present out of `<A,B>` and into the
unnamed channel for `<A,B,C>`, creating it if it did not exist.

That machinery worked. Presence moved and membership did not, so the source kept
its roster, its description and its recordings. The audio moved without a
reconnection: the destination took over the source's LiveKit room via
`TAKE_MEDIA_ROOM` and the source was handed a fresh one in the same breath, since
two channels naming one room would put whoever walked back into the empty one
inside the conversation that had left it. Clients were told by `channel.moved`,
which no snapshot could express — the people are simply absent from one channel
and present in another, and a client watching the first cannot guess where they
went.

### Why it is gone

**People reported that their recordings had disappeared.**

They had not. They were on the channel they were made in, which is the correct
place for them — a recording is a record of what was said *there*. But the
conversation was now somewhere else, and the channel holding the recordings was
one nobody was looking at any more. The mechanism was invisible and the loss was
not, which is the worst combination available: nothing on screen was wrong, and
the thing people wanted was gone from where they expected it.

That is the whole argument. The move was elegant and cost a user their
recordings, in the only sense that matters, which is the sense of not being able
to find them.

### What it cost to undo

One unnamed channel per set of people. That invariant existed because two
unnamed channels with the same roster are indistinguishable on Home — both
rendered by `describeChannel` as the same list of names, with nothing to say
which one anybody meant — and the move was what maintained it: widening was
impossible, so a wider set always resolved to the single channel for it.

Widening can now produce such a pair. `<A,B>` invites C and becomes `<A,B,C>`;
A and B start a fresh `<A,B>` and widen it again, and there are two. Accepted
deliberately. Two channels with the same names on Home is a puzzle; a
conversation that silently relocates and takes the recordings out of view is a
loss.

**`create` keeps the rule, and that is not an inconsistency.** The guard does two
jobs and only one of them was about moving. The other is making the
Start-a-channel button idempotent: everybody has exactly one channel that is only
themselves, and tapping again walks back into it rather than filing a row per
tap. Dropping it there would put a second identical "Just you" on Home for every
tap, which is the same confusion this change exists to remove. So duplicates
arise by invitation and never by the button. `unnamedChannelFor` survives with
one caller.

The `SET_NAME` guard that refused to *clear* a name when these people already had
an unnamed channel went too. It was the same invariant defended on the one other
path that could breach it, and with widening able to breach it anyway the guard
bought a dead button rather than a guarantee.

### The consequence worth stating out loud

Recordings are reachable by channel membership — `recordingsFor` and
`recordingsInChannel` both ask who belongs, not who was there — so **somebody
asked into a channel can now hear what was recorded in it before they arrived**,
and can delete it, `deleteRecording` using the same reach test.

This was already true of named channels and always had been. What has changed is
that it is now true of unnamed ones, where the move used to prevent it as a side
effect of leaving the recordings behind. It is not a new rule; it is the same
rule no longer having an exception. Anyone who wants the old privacy boundary
back should reach for stopping the recording or naming a new channel, not for
reinstating the move — but it is a real change in who can hear what, and it was
not the point of the exercise, merely its price.

### What was deleted

`ChannelState.invited`, `isInvited`, the `INVITE_TAKEN` action and its reducer
case, the `TAKE_MEDIA_ROOM` action and its reducer case, the `!isNamed` branch
of `INVITE`, `acceptInvitation`, `createMoved`, `applyServer` (whose whole
purpose was those two actions), `Move`/`onMove`/`emitMove`/`moveListeners`, the
`channel.moved` emission in `ws.ts`, the `SET_NAME` clear guard, the `isInvited`
block in `removeMember`, and the exception in `dispatch` that let a
non-participant `ENTER` a channel holding an invitation for them. `invitesFor`
lost half its body: it had two shapes presented identically because they were the
same question, and there is one shape now.

`ChannelState.mediaRoom` **stays**, though nothing varies it any more. Rows
written while conversations did move carry a room that is not the channel id, and
restoring either end as its own id would put somebody into a room another channel
still holds tokens for.

`channel.moved` stays in `ServerMessage`, and the client keeps its handler and
its test. Nothing sends it. Removing an inert path from installed builds is worth
nothing and costs a release; whichever release next touches the app can drop all
three together.

### The migration, which is the part that could have lost data

Outstanding invitations were persisted in the durable blob. With
`acceptInvitation` gone and `dispatch` refusing every non-participant, nothing
could answer one — those rows would have become permanently unreachable
invitations to channels their holders could not see.

`restoreChannel` folds each `invited[user] = inviter` into `participants` with
`invitedBy[user] = inviter`, capped at `MAX_CHANNEL_PARTICIPANTS` and dropping
the overflow rather than throwing: a channel already full is one they were never
going to join, and a restore is not the place to fail loudly. The read stays
tolerant of the key so a rollback strands nothing. `durableOf` stops writing it.

### No client change, and no new build

Verified rather than assumed, because this is a behaviour change under a wire
shape that barely moves. The app never runs the reducer — there is no `reduce(`
in `app/src` outside tests — so an installed build's bundled `core`, which still
knows all of the above, never executes any of it against channel state. It does
use `core` for guards, and `canInvite` was not touched, so an old client's
enabled controls still agree with what the server accepts. The invite tap never
depended on the move: `HomeView` dispatches `ENTER` and navigates itself to the
channel the invitation named, which the old server then corrected with
`channel.moved` and the new one has no need to correct. And `rejoinableFor`
filters on `everPresent`, so a directly-added participant appears as an
invitation and not also as a channel row.

`MIN_SUPPORTED_BUILD` stays at 36.

**The audit was of behaviour, and the copy was stale for a day.** Corrected
2026-08-18. `ChannelView`'s invite section carried a second paragraph, shown
only in an unnamed channel, telling people that when the invitee joined
everybody would move to a channel with all of them and this one would stay
behind with its recordings. All of it had just stopped being true. The check
above asked what an old build would *do* and was right that the answer was
nothing; what an old build *says* is a separate question and was not asked.
The paragraph is gone, there being no longer two cases to tell apart, and the
`isNamed` import with it. The dead rationale in `useSessionAudio`'s
`@param mediaRoom` — keyed on the room because a moving conversation carried
its room with it — went the same day; `mediaRoom` has equalled the channel id
since `TAKE_MEDIA_ROOM` was deleted.

**A screen is a wire surface too.** The reason it survived the audit is that
the audit's question was about the reducer and the protocol, and a string is
neither. Anything that ships in the bundle and describes behaviour — copy,
empty states, button labels — needs reading when the behaviour it describes
changes, and it does not reach anybody until a build carries it, which this
one needs and the widening did not.

## A worktree installs its own dependencies, 2026-08-17

`bin/worktree-setup`, and the reason it exists rather than a symlink.

The repo is three independent npm packages, not an npm workspace. `core/`,
`app/` and `server/` each own a `package-lock.json` and a `node_modules`, and
there is no root `node_modules` at all — the root `package.json` only shells out
with `--prefix`. Git populates a new worktree with tracked files, `node_modules`
is ignored in all three, so a fresh worktree has no jest, no tsc and no tsx.
Every entry point in AGENTS.md fails on its first command, and it fails as
`jest: command not found`, which points at the toolchain rather than at the
install that is missing. That misdirection is most of the cost.

### Why not the symlink

Linking each `node_modules` at the main checkout is the obvious fix and was in
use in one worktree. It works, and it is wrong twice.

It has already put a self-referential link into a commit: `node_modules/` with a
trailing slash matches a directory and not a symlink, so `git add -A` staged the
links and the next checkout replaced the real directories with links to
themselves. The trailing slash is gone and that specific failure cannot recur,
but the fix is one absent character wide.

The larger one is that a shared `node_modules` is shared for writes. `npm
install` in a worktree resolves the link and installs into the main checkout, so
a branch that bumps a dependency silently changes what master builds against,
with nothing to warn anyone. A per-worktree install costs disk and a few minutes
and buys the property the worktree was for — that the branch cannot reach the
tree beside it. `bin/worktree-setup` refuses to run against a tree set up the old
way rather than repairing it silently, since a link here suggests another one
elsewhere.

`npm ci` rather than `npm install`, so a worktree gets exactly what the lockfile
pins and its results are comparable to the main checkout's. It also refuses when
package.json and the lockfile disagree; the script passes that refusal through
with the fix rather than falling back to `npm install`, which would quietly
install something the lockfile does not describe.

### Workspaces, deliberately not now

Real npm workspaces are the structural answer — one `node_modules`, one
lockfile, hoisted binaries, and no per-worktree install to remember. Deferred on
purpose: Expo and Metro are sensitive to hoisting, `app/` is the package most
likely to fight it, and build 51 is in App Review. The cheap fix does not
foreclose it.

`.claude/worktrees/` is now ignored. The worktrees live inside the repo and each
holds a `.git` file, so `git add -A` in the main checkout warned about an
embedded repository and offered to stage a worktree as a gitlink.
## A build below the floor stops rather than misbehaves, 2026-08-17

`MIN_SUPPORTED_BUILD` has always been half a mechanism. It declares the oldest
build the server still answers correctly, and until now nothing acted on it: a
build below it went on making requests and got whatever the current wire
happened to give it, which is not an error message but a confused screen. The
client-side half is this. The app asks `/healthz`, compares `minBuild` with its
own `CFBundleVersion`, and if it is below, replaces itself with a screen saying
to update.

**Replaces, rather than covers.** `Root` returns `UpdateRequiredView` before it
reads `ready` or the token, so there is no app behind it and nothing to dismiss
back to. A banner over a working-looking Home would leave every screen reachable,
and every one of those screens is exactly what the floor says can no longer be
trusted. Signing in is refused on the same reasoning — the auth path is where an
old build is most likely to have been moved out from under, and there is nothing
worth signing in for.

Disabling the screens is the visible half; the socket is the other. An expired
client that stays connected goes on watching channels and reporting this account
*present* in them, so everybody else sees somebody standing in the room who
cannot hear them. So discovering the expiry disconnects, and the foreground
handler stops calling `resume()`. `App.tsx` also drops `live` to null, because
the audio follows the channel a snapshot says you are present in rather than the
socket, and would otherwise hold a microphone open behind the update screen.

### Two absences that are deliberately not expiry

The rule is in `app/src/api/expiry.ts` as `mustUpdate`, on its own so both
directions are testable without a server. A client that cannot say which build
it is — `appBuild()` returns null where the platform will not answer — is never
expired, and neither is one whose `/healthz` could not be reached or answered
without a usable `minBuild`. **The failure modes are not symmetric.** Refusing to
run is total and the user cannot argue with it; running one release too long is
what this app did for its entire life until today. A tunnel, an airport wifi
portal or a server restart must not brick the app. The comparison is strictly
below, too: `MIN_SUPPORTED_BUILD` names the oldest build still supported, not
the first unsupported one.

Checked at launch and on every foreground, not on a timer. The answer only
changes when the *server* is deployed, and a poll would buy somebody being
ejected mid-sentence in exchange for nothing the next foreground does not catch.

### Where to update comes from the server

`/healthz` gained `updateUrl`, from `APP_STORE_URL` in `server/.env`. It is
configuration rather than a constant in the app because of what this feature is:
**the client that needs the address is by definition one that cannot be shipped
anything.** A URL compiled into the app could only be corrected by releasing the
app, which is the thing that is not happening. Unset — as it is now, the listing
having no numeric id in this repository — the screen appears with no button,
which is honest; a link that opens nothing is worse than a sentence.

### The server still enforces nothing

Deliberate. `MIN_SUPPORTED_BUILD` stays a declaration: requests from old builds
are answered exactly as before, and nothing new returns 4xx on a build number.
Enforcing it server-side would lock out every *silent* build as well — every
install predating build 37 sends no header at all, and `silentBuilds` on
`/healthz` is still above zero. The client refusing itself is a decision made
where the build number is known for certain.

**Raising `MIN_SUPPORTED_BUILD` now has teeth.** It used to cost nothing but the
right to delete a shim; from this build on it is what takes an installed app off
the air. Read `oldestBuild` and `silentBuilds` before moving it, and do not move
it while `silentBuilds` is above zero unless the intent is to expire everything
that has never spoken.
---

## Home says whether you are in the app, rather than working it out, 2026-08-17

Built for TASKS.md's "Recency Distinctions", which reported that Home's idleness
measured time since the viewer last looked at Home rather than time since the
other person was active. The audit that preceded it found the report accurate
and the cause somewhere else, so both are written down here.

**The two clocks were never the problem.** They are described under "Two idle
timers, and one place that turns a gap into words", in
`DECISIONS-2026-08-13-to-2026-08-15.md`, and that reasoning stands: a channel
card asks when you were last *in this channel*, Home asks when you were last
*in the app*, and only the second can be a socket. `last_seen_at`
was already correct — written on every message a socket carries, so never more
than a heartbeat stale.

**What was wrong was that Home shipped a number where the channel side keeps a
fact.** `idleMs` holds `present` beside `lastPresentAt`, so it returns null for
somebody who is here rather than a duration that has to be recent to be true.
Home held only `lastSeenAt`, fixed when the server composed the snapshot, and
the app subtracted it from a clock that keeps advancing. That difference is
*the age of the snapshot*, added to the real gap, and there was nothing bounding
it: a Home push happened on `watch.home`, on contact mutations, and on channel
changes, and on no timer and no heartbeat at all.

**The accidental part is the part worth remembering.** The channel-change push
sat *outside* the loop over the changed ids, so any change to any channel
anywhere pushed a whole fresh Home to every watcher on the server. That was most
of what kept contact rows current, which is why nobody had noticed: on a busy
server every Home is continuously accurate, and on a quiet one it is arbitrarily
stale. One person's view was accurate in proportion to how busy strangers were.
Nobody chose that, and it is not a property that survives having users.

**The fix is to send the fact.** `ContactView.inApp` is a boolean, composed in
`homeFor` from the reachability the websocket layer already publishes. A fact
does not decay: a snapshot saying somebody is in the app is wrong only once they
leave, and one saying they left at T is true for ever. So Home needs no timer
and no per-heartbeat fan-out — only a push on the two transitions, the first
socket opening and the last one closing, to that account's accepted contacts.
Twice per app session, bounded by contact count.

**No grace period on this clock, though a channel has one.** A flap pushes
`inApp: false` with a departure a moment old, and `agoOrNull`'s sixty-second
floor already reads that as being in the app. The floor was put there to absorb
heartbeat imprecision and absorbs a tunnel or a lift for free. Building a second
grace mechanism would have been a timer to reproduce something that already
worked.

**The client tick was a second, opposite bug.** The 500 ms tick is gated on
holding a channel snapshot, not on displaying one — and pressing Home from a
channel deliberately keeps the snapshot. So Home's rows aged in real time *only*
for a viewer who was in a channel, climbing from a stale base; for anybody else
the row was drawn once and then stopped, and kept saying "In the app now" long
after the person had quit. Whether the number was wrong loudly or wrong silently
turned on something with no relationship to the person being described. A slow
20-second interval now runs when the fast one does not, which is enough because
the words come from dayjs's thresholds and move at minutes.

**`lastActiveAt` was not a specification change, but a comment that had never
been true.** It claimed to freeze when a channel emptied *and* to "read as now
for one still occupied". Nothing ever did the second: it is written on entry and
on exit and never in between, so an hour of conversation moves it not at all and
a live channel sinks below one somebody walked out of five minutes ago.
`orderChannels` now asks `presentCount`, which was already on the wire and
already rendered two lines away, and the comment says what the field does. The
alternative — a fourth stamp site, or a server-side "now" for occupied channels
— would have transported another decaying fact, which is the thing being fixed.

**The broadcast was narrowed last, deliberately.** It was what masked the
staleness, so removing it before the rest would have made Home visibly worse. It
now aims at the changed channel's `participants` — participants and not the
present, because somebody invited has yet to enter and the invitation appearing
is exactly what the push delivers. A channel the registry can no longer describe
falls back to the old broadcast; nothing emits such a change today, since an
ended channel is kept for thirty seconds and its deletion is silent.

**What the tests were not doing.** Every existing test supplied `lastSeenAt`
directly, which is the one thing production never does, so the whole delivery
path was outside the suite — which is how four documented behaviours went
unnoticed. The new server tests drive real sockets and assert on what a
*watcher's* snapshot says, including the worked case: Alice in the app for an
hour, Bob holding one snapshot, nothing sent in between, and his copy still
right. Each was checked against the unmodified server and fails there; the
arrival test was written wrong first time and passed instantly, because
`Client.next` scans from the beginning and Bob's first snapshot says `inApp:
false` quite truthfully.

**On the wire, this is additive.** `inApp` is optional, so a server that
predates it sends no key and the app falls back to exactly its old arithmetic,
with no version check. Build 51 was in App Review when this was written and
reads neither field. `core/protocol.ts` is no longer unchanged since `build/51`
— check it before the deploy rather than discovering it.

---

## "Are you there" is measured by evidence, not by departures, 2026-08-18

The channel-side idle timer built on 2026-08-13 — see `## Two idle timers`
in `DECISIONS-2026-08-13-to-2026-08-15.md` — stamped `lastPresentAt` in one
place, `stepOut`, on the reasoning that one route out means one place to
write. That is true and it was the wrong place, because a departure is an
*event* and what the timer answers is a question about *evidence*: how long is
it since anybody heard from you here.

**The bug that showed it.** `lastPresentAt` is durable and `present` is not, so
a restart drops the presence that gates the value without touching the value.
For anybody who had stepped out earlier in the channel's life and come back,
the stamp still held that old departure — unreachable while they were present,
because `idleMs` returns null for anyone present, and un-gated the moment a
deploy dropped `present`. Enter Monday, step out Monday, return Thursday, be
talking when `bin/deploy` restarts the server: everyone else's roster then
reported you as having stepped out three days ago. Reproduced before it was
believed; the audit that found it is what prompted the change.

The near fix was to drop present users' stamps from the durable projection, so
the restart produced "not known" and a bare "Stepped out". It patches this
case and leaves the model wrong, which is the reason it was not taken.

**What the field means now.** The last evidence that somebody was in this
channel, refreshed by a new transport-reported action, `STILL_HERE`, on every
message a socket carries — the same messages that already write
`accounts.last_seen_at` for Home, so the two clocks are fed by one signal and
cannot drift apart. `stepOut` still stamps, as the final entry rather than the
only one. An observation cannot fail the way a claim about an event did: an
older one is only ever replaced by a newer one, and nothing reads it on the
assumption that presence was dropped for the right reason.

**A restart now has an honest answer rather than none.** The stamp it leaves
behind is the last heartbeat before it, and "stepped out a minute ago" about
somebody who was talking when the process died is both true and actionable —
they are not reachable, and that is what the reader is deciding about. It
self-corrects the moment their app reconnects. The earlier reasoning against
stamping the restart still stands and is untouched: the restart itself is not
stamped, and a person nothing was ever heard from still shows nothing.

**Voice was proposed as the signal and rejected as the primary one.** The
proposal that opened this was to stamp on activity — voice detected or an
action taken — since one can be absent through a crash or a force-quit without
ever stepping out. That half is right and is what the change implements. Voice
is the wrong half here, because this app silences the room by design: with one
person holding the floor, a voice-driven timer would mark the entire listening
audience idle while they are doing exactly what the product is for, which is
worse than what it replaced. A socket held while present is the activity that
answers "are you there" for a listener as well as a speaker. Voice would answer
a second question — connected but disengaged, the phone in a pocket — which is
real, left to the reader, and deliberately not blended into this number. The server
does not currently know who is speaking at all: `ActiveSpeakersChanged` goes
from LiveKit to the client, and nothing in `server/` subscribes to it.

**What the socket cannot see, and self-mute is the sharpest case.** This entry
first claimed that a socket held while present answers "are you there" for a
listener as well as a speaker. That is too strong, and the correction is worth
more than the claim was. A self-muted participant publishes nothing, taps
nothing, and holds a socket that stays open *because the audio session holds
the process up* — `UIBackgroundModes: ["audio"]`, measured on 2026-08-08 at six
minutes backgrounded with zero suspensions, in
`DECISIONS-2026-08-07-to-2026-08-13.md` under
`## Backgrounded audio was ruled out`. So in a channel the socket is evidence
that the machinery is running; outside one, where iOS suspends the process, it
is evidence about a person. Mute, pocket, walk away, and the roster says
"Present · muted" for as long as the battery lasts, with the idle clock
starting only when the process finally dies.

**And nothing else can see it either, which is why no rule was built on it.**
Reading mute or backgrounding as absence is the same mistake in the other
direction: a locked phone, headphones in, mic muted, listening closely is
indistinguishable at every layer — same socket, same subscription, same
silence — from the phone being in a bag in another room. Voice cannot separate
them, a muted track producing no samples to detect. The limit is real and it is
a limit rather than a defect: what the number reports is the last evidence of
the *client*, which is the most anybody here can honestly claim.

**And the mute is not annotated, which was the near miss.** The tempting
consolation was to show how long a self-mute had been held — `Present · muted
20 minutes`, from a `mutedAt` stamped on `SET_SELF_MUTE` — on the grounds that
it asserts nothing about presence and hands the reader a fact that bears on it.
Declined the same day as complication for something the reader does without
help: somebody who is present, silent and quite possibly muted already reads as
somebody who may not be paying attention, and putting a number under that
inference does not make it more available, only more official. **Idleness
measures one thing — the time since an open socket last checked in — and the
roster says `Present · muted` as it always has.** A settled negative rather
than deferred work, which is why it is written here and not in BACKLOG.

**Not emitted, and not committed.** A heartbeat pushes no snapshot. Nothing a
client can read changes while somebody is present — `idleMs` is null for them
whatever the stamp says — so a push per heartbeat per participant would spend a
fan-out redrawing an identical screen. The value becomes readable only when
presence ends, and every route out of a channel emits on its own account, so it
is fresh at the one moment anybody can see it. It skips `commit` too: that path
reconciles the floor, the recording, the egresses and the room against a
transition, and a heartbeat is not one.

**Stored at minute resolution.** `durableOf` floors the stamps, because
`persistChannel` writes whenever the projection changes and at full resolution
a four-person conversation would rewrite its row forty-eight times a minute to
move a number no screen can show. A restored value can be up to a minute early,
which is inside the sixty seconds `agoOrNull` already treats as no gap at all.
The live value stays exact.

**No wire change.** `lastPresentAt` keeps its name and its type; only what
feeds it changed, and the new meaning is a strictly better answer to the
question the old clients were already asking. Build 51, in App Review as this
was written, reads it through its own bundled copy of `idleMs` and needs no
alias, no shim and no two-step. `core/protocol.ts` is untouched by this change,
though it is no longer unchanged since `build/51` for other reasons — see
`## Home says whether you are in the app` above.

**Home was already right.** `accounts.last_seen_at` has always been written per
message rather than at the socket's edges, so it has always measured evidence.
The name is the only thing about it that says "seen" rather than "heard from".

## The record button is called Record, 2026-08-18

It had three labels: `Start recording` the first time, `Record again` once the
channel had one, and `Try recording again` after a failure. The state each
reported is already on the screen — the previous recording is listed directly
below the button, and a failure is stated directly above it — so the label was
spending the one place a person looks to find out what a tap does on saying
something they could already see.

Three labels also make the button read as three different things, and the
recording it starts is the same in all three cases. It is `Record` now,
unconditionally.

The test that covered the failure case asserted `Try recording again`, and its
point was that a failure does not consume the channel's recording — which was
written when a channel held one. It now asserts the button is offered
unchanged, which is the same guarantee under a label that no longer varies.

**Needs a build to reach anybody**, as any copy change does.

## The speaking dot outlived the speaker, 2026-08-18

Observed from a screenshot: a card reading `Stepped out a few seconds ago` with
the speaking dot still lit beside it. It had been that way for well over the
two-second hold, which is the fact that identifies the cause rather than
complicating it.

**The hold was never involved.** `speaking.ts` keeps two sets — `active`, who
the room says is speaking now, and `releaseAt`, who has stopped and when to drop
them. Only `releaseAt` has a clock; `shownAsSpeaking` emits `active`
unconditionally, deliberately, because `ActiveSpeakersChanged` fires on
*changes* and somebody talking uninterrupted for a minute produces one event and
nothing after it. Somebody who leaves mid-word never transitions from `active`
to `releaseAt` — no event names them again — so they were never on a clock at
all. The dot was not lit for two seconds too long. It was lit indefinitely.

**LiveKit does not re-emit on a departure, and this is worth knowing before
trusting the event for anything else.** `Room.handleParticipantDisconnected` in
`livekit-client` deletes the participant and emits `ParticipantDisconnected`; it
never prunes `activeSpeakers` and never emits `ActiveSpeakersChanged`. Worse, a
later delta saying the departed participant is no longer active hits an early
`if (!p) return` in `handleSpeakersChanged`, because they are already out of
`remoteParticipants` — so the `lastSpeakers.delete` on the next line is never
reached, and the rebuild above it puts them back. They are sticky in LiveKit's
own list too, not merely in ours.

So the clearing paths were: our own disconnect, an effect teardown, or somebody
*else* speaking. **In a two-person channel that last one is nobody**, which is
why this was not a flicker but the rest of the session.

The fix is `onParticipantGone` in `speaking.ts`, wired to
`RoomEvent.ParticipantDisconnected` in `useSessionAudio.ts`. **The departure is
dropped outright rather than given the hold**: the hold smooths live speech so a
breath does not put the dot out, and somebody who has left is not between two
words — holding them would light a card that already reads "Stepped out". It
sweeps `releaseAt` as well as `active`, since they may have stopped talking and
left before the hold ran out.

**Not fixed at the render site**, which was the other candidate — intersecting
`audio.speaking` against `isPresent` in `ChannelView.tsx`. That masks a stale
set rather than emptying it, and leaves it wrong for anything else that reads
`audio.speaking`.

**The information was already arriving at the hook.** `TrackUnsubscribed` fires
on a departure and prunes its own set, but that set feeds `othersAudible` and
nothing else. The event needed was one listener away the whole time.

Seven tests, in the pure module where the existing eight live. One of them
asserts the *old* behaviour deliberately — that without this, an hour passes and
the id is still shown — so the claim about what the speaker event alone does is
guarded rather than merely described here. There are still no tests for
`useSessionAudio` itself, which is where the listener now sits; that gap is
unchanged and is the reason this class of bug is cheap to reintroduce.

**Needs a build to reach anybody.** The server is not involved: the speaking
indicator is driven by the room rather than the reducer, which is the whole
reason presence changing did not clear it.

## Home is a list of channels, and a contact is one of them, 2026-08-18

Four things at once, because they are one thing: Home now shows channels in
three sections ordered by how long since anybody was in them, and the contact
list is gone because an accepted contact *is* a channel.

**`lastActiveAt` could not carry idleness, and pretending otherwise was the old
sort's whole complexity.** It is written on an entry and on an exit and at no
point between — `core/types.ts` has said so at length since it was added — so a
channel two people had been talking in for an hour carried the hour-old moment
the second of them arrived, and sank below one somebody had walked out of five
minutes ago. `orderChannels` corrected for that by asking `presentCount`
separately and sorting occupied channels to the top of each group. That works
and says nothing: a card could not tell you whether the room went quiet four
minutes ago or in March, which is the fact that decides whether stepping in is
joining something or turning a light on in an empty house.

The number was already in the state and Home had never seen it.
`ChannelState.lastPresentAt` is per participant and is refreshed by
`STILL_HERE` every few seconds while somebody is present — it exists for the
channel roster's "Stepped out an hour ago". `lastPresenceAt` in `core/channel.ts`
is the maximum across participants, and it is the **maximum** rather than the
minimum on purpose: a channel is as idle as its *least* idle member. Somebody
who wandered off a week ago says nothing about a room two other people were in
an hour ago. It folds in `lastActiveAt` as well, which is not belt and braces —
the server floors persisted stamps to the minute (`quantise`), so after a
restart the exit recorded in `lastActiveAt` can be the fresher evidence of the
very same departure.

**The sections are a priority ladder, not a taxonomy.** Live, Invitations, the
rest; each channel appears once, in the first section it qualifies for. So an
invitation with somebody in it sits under Live rather than under Invitations,
which is the case worth getting right — it is the most urgent thing on the
screen, and filing it by classification would bury it under channels nobody is
in. Its card still says who asked you in.

**The named-above-unnamed grouping went, deliberately.** It held that a name is
a thing somebody chose to write, so named channels were the ones being kept and
should not be buried among the rest. The cost was that the stalest named channel
outranked the freshest unnamed one, and most channels have no name — so the rule
sorted the screen by an attribute rather than by what was happening in it. The
distinction survives where it was always doing the work: a name is asserted in
`type.body`, a description is italic.

**A contact is a channel, which deletes `channelWith` and everything under it.**
The contact list was the only way to open a one-to-one channel with somebody, so
a contact row had to work out whether such a channel already existed, say
"Channel already open", offer to join rather than start — sixty lines of comment
about a question that need never have been asked, and wrong twice (it matched
any channel the contact appeared in, so a named three-person channel made a
contact read as already open). `ensurePairChannel` gives every accepted pair an
unnamed channel at the moment they accept, from all three routes that make a
contact, and `backfillPairChannels` gives one to every pair that predates the
rule. `unnamedChannelFor` — the one-unnamed-channel-per-set rule `create`
already enforced — is what makes all of that idempotent.

Three things had to give way, and each was a real bug rather than a fixture
change:

- **`rejoinableFor` and `invitesFor` read one rule from opposite ends.** A
  standing channel fails the "have you ever been present" test for *both*
  members, so it appeared in neither list. It is now in `rejoinableFor` when
  nobody has been present, and skipped by `invitesFor` on the same condition:
  nobody asked anybody into a standing place. Change either without the other
  and a channel is on nobody's screen.
- **The first entry into a standing channel is a start, not an arrival.** It
  used to be `create` that said "Started a channel with you", with a month of
  notification lifetime; now the first tap usually takes `create`'s
  already-exists branch, or comes from a Home card as a bare ENTER and never
  touches that route at all. So `announceStarted` fires from `commit` on
  `everPresent` going from empty, and without it the invitation arrived as
  "Alice stepped in", five minutes' lifetime, about a channel the recipient had
  never heard of. It deliberately does not stamp `lastAnnouncedAt`: that map
  absorbs a flapping connection's repeated empty-to-occupied transitions, and
  stamping would silence the next genuine arrival.
- **An invitation is from whoever walked in, not from the recorded initiator.**
  A standing channel has an arbitrary initiator and an `invitedBy` naming them,
  neither describing anything that happened, so `invitesFor` credited the viewer
  with inviting themselves about half the time — and then dropped the invitation
  by its own never-from-yourself guard. It now falls through to
  `everPresent[0]`, which is the honest answer generally.

**`everUsed` on the wire, because the stamp alone lies about these channels.** A
standing channel's `lastPresenceAt` is the moment it was created, so a contact
you have never spoken to would read "3 weeks ago" and — worse — sort
to the top of the list as the freshest thing on it. The card says "Not used yet"
and sinks to the bottom of its section, ordered among the others by name.

**Availability moved to the profile rather than being deleted.** "In the app
now" and "last seen 3 hours ago" were the contact rows' second line, and a
channel's idleness is not the same fact: a room nobody has been in for a week
says nothing about whether its other member is holding a phone right now.
Nothing that computes it changed — `accounts.last_seen_at`, `ContactView.inApp`
and `ContactView.lastSeenAt` are all untouched and still on the wire — and
`GET /profiles/:id` composes the same two fields for a contact and **withholds
them from everybody else**. That last part is the point: a profile is readable
by anyone sharing a channel, which is a wider audience than a contact list ever
had, so the audience for this one fact is narrowed back to the one it always
had. It must not pre-empt the open "Idleness Privacy" entry in `TASKS.md`.

The cost, taken knowingly: being in the app without entering a channel now goes
unnoticed unless somebody opens your profile.

**Removing a contact leaves every two-person channel, named or not.** A channel
with a third person in it is a place that survives the pair falling out — it is
not *about* them. A channel of exactly the two is the relationship. A name
distinguishes two channels holding the same people; it does not make one of them
about somebody else, so leaving the standing channel while staying in "Weekly
Convo" would be a half-exit that left the removed contact on Home under another
heading.

The far side turns on whether anything was ever kept there. **Nothing recorded**
— nearly all of them, these being created by the dozen for pairs who have not
spoken — and the channel goes for both: left behind, it is a member-of-one
channel reading "Just you", one per contact who ever removed them, each naming
nobody. **Recordings in it** and it stays, and they keep it: those are as much
theirs as yours, and a channel is what names a recording and holds it, so ending
it would delete another person's audio as a side effect of your tap. Asked
before the first leave, while the row is still there to ask about.

Deletion is mutual because the contacts row *is* the pair. A one-sided block
would need a new state and is not this change; the confirmation says so in
words, since neither consequence is guessable from the button.

**What Home gave up and has not got back yet** is in `TASKS.md` under
`## Contacts View`: the contact list itself, a profile reachable without
entering a channel, and the availability display whose data never stopped being
sent. Requests and "Add contact" are still on Home in the meantime, because an
incoming request is time-sensitive and would be invisible behind a screen nobody
has built.

**Needs a deploy before a build.** Every wire change is additive and optional —
`lastPresenceAt`, `everUsed`, the two profile fields — so build 51 ignores them
and a pair channel is an ordinary channel to it. The server half is safe alone;
the client half is not, since it reads fields an older server does not send.

## The audio session follows the channel, not you — 2026-08-18

Two bugs reported from a phone on the same day, both in the audio session, and
both the same shape once diagnosed: **the session is reconfigured on an edge and
nothing afterwards checks the reconfiguration took.** The audit that found them
is `STATES.md`, which shipped with them and is the standing reference; this is
the reasoning behind the two fixes.

### Self-mute lost the Bluetooth route

Reported: on Bluetooth headphones, self-muted mid-conversation, and the output
jumped to the phone's loudspeaker. Unmuting brought the headphones back.

The mechanism is physical rather than a bug in anybody's code. A headset cannot
carry a microphone and high-quality stereo at the same time — A2DP is one-way
and full-bandwidth, HFP is two-way and mono, and they are different link types.
`CALL` is `playAndRecord` and so implies HFP; `LISTENING` is `playback` and so
implies A2DP. Self-muting flipped `micOpen`, which flipped the category, which
forced the profile handover — and the route was lost inside it. Unmuting
rebuilt the route from scratch against the full eligibility list, which is why
it came back and why the bug looked self-healing.

The first fix considered was a **hold**: stop the microphone immediately but
delay the session handover by thirty seconds, so a cough or an aside costs
nothing and only a sustained mute pays for stereo. It follows the trailing-edge
idiom `speaking.ts` already uses and for the same stated reason. It was
abandoned because it infers intent from *duration*, which is a proxy, and
because it needs a threshold constant that nobody can defend the value of.

What shipped reads intent off the channel instead:

> Stay in the mic-enabled configuration whenever **any present participant's**
> microphone is open, whether or not that participant is you. Hand over to high
> quality only when nobody's is.

High-quality audio is wanted in exactly two situations and they are the same
situation — nobody is talking, so what matters is either another app's audio or
the channel's own playback. `anyMicrophoneOpen` in `app/src/audio/micNeeded.ts`
tests precisely that. No timer, no threshold, and **no special case for
playback**: a played track arrives as a remote track, so `othersAudible` already
chooses between `LISTENING` and `IDLE` without anything naming playback.

It asks about microphones rather than about `selfMuted` directly, and that is
load-bearing. Alone and unmuted, "everybody present is muted" is *false*, so a
literal reading takes the session as a call and silences the music somebody is
sitting alone listening to — exactly what `IDLE` and its `mixWithOthers` exist
to prevent. Being alone already closes the microphone via `microphoneNeeded`, so
asking the question this way gets that case right without naming it.

**It changes exactly one row of the decision table** — self-muted while somebody
else is still talking — which is the buggy one. Everything else is what already
shipped. That bound is why a change to the most delicate subsystem in the app
was acceptable at all, and the tests in `micNeeded.test.ts` assert every row
rather than only the one that moved, since the claim is about the others too.

**The audible transition is a feature and is documented as one.** Crossing the
boundary is a profile switch you can hear: a drop to mono says somebody's
microphone is open in this channel, a bloom to stereo says nobody's is. The rule
*extends* the first cue to the person who most needs it — somebody muted and
lurking, who under the old rule stayed in `LISTENING` and got no signal at all
when a person walked in. Stated precisely because it is otherwise a false safety
cue: the mono drop means the room is live, which is a superset of *you are
audible*. It is recorded in `STATES.md` under `Audio Session Configuration`
with an instruction not to pin `CALL` on or debounce the switch, both of which
read as obvious cleanups and both of which delete it.

Two costs, accepted knowingly. Two people listening to the channel's music
without muting stay in mono — "mute to get quality" has to be learnt, and the
cue above is what teaches it. And the session now depends on somebody else's
mute state, which arrives a round trip later, so an unmute-then-immediately-speak
can clip the first moment during the switch; `App.tsx` already carries the same
round-trip caveat for `recordingAsked`.

### A dropped room was never rebuilt

Reported: speaking in a channel, placed a Telegram VoIP call, came back to a
live channel with dead audio. The only recovery was force-quitting the app.

CallKit seizes the audio session and the LiveKit connection dies under it.
`livekit-client` retries internally and fires `Disconnected` only once it has
given up — and the handler turned that into `status: 'idle'` and stopped. The
connect effect is keyed on `[mediaRoom, token]`, neither of which changes when a
connection dies, so it never re-ran; the configuration effect early-returns
unless the status is `connected`. **There was no path from `idle` back to
`connecting` at all.** Remounting the hook was the only thing that rebuilt the
room, which is precisely what force-quitting does.

The socket never had this bug. `realtime.resume()` has run on foreground since
long before, under a comment reading "Nothing else does." The audio had simply
never learned the same lesson, and the asymmetry is the whole story: one
connection knew about foregrounding and the other did not.

Fixed with a reconnect generation in the connect effect's dependencies, bumped
from the `Disconnected` handler and from an `AppState` `'active'` listener, with
backoff mirroring `api/socket.ts` deliberately — the two connections fail
together often enough that two rhythms would only make the pair harder to reason
about. A foreground resets the backoff rather than waiting it out, for the reason
`socket.resume` already gives: a delay grown to ten seconds was earned by
failures in a network condition the phone may no longer be in.

**Telegram is incidental.** Any permanent disconnect dead-ended identically — a
long background, a tunnel, a network switch outlasting the retries — and the
Zoom regression reported separately is the same bug reached by a different door.

`describeAudio` gained `'reconnecting'` in the same change. Dead audio had been
rendering as "Audio not connected", which is also what a channel nobody has
joined says, so the screen was quietly wrong about the one thing it is there to
report.

The test asserts that a **second room is constructed** rather than asserting
anything about the resulting state. The regression here is *nothing happening*,
and a hook that has given up is indistinguishable from one about to try again
for as long as the backoff lasts. Verified by reverting the fix: the test fails
on that assertion and no other.

### What the audit found that was already right

Two of the five original items needed no work. Recording alone has been allowed
since `canStartRecording` was written to require presence and nothing more, with
the matching exception in `microphoneNeeded` so a solo run does not capture
silence. Stepping out has cleared the self-mute since the rule that distinguishes
it from `DISCONNECT_EXPIRED` was added. Both were tested already. Confirming
them cost an hour and is why they are recorded here rather than rebuilt.

### What could not be settled from the source

Whether audio from a background app on a Bluetooth speaker loops back into the
channel. The configuration half-answers it — `CALL` carries no `mixWithOthers`,
so the background app is interrupted — but whether iOS honours that against an
already-active external route is not something this codebase can observe.
**Nothing in this stack can read the audio route**: `getAudioOutputs` offers iOS
only `default` and `force_speaker`, and there is no route-change event. That is
why the self-mute bug was found by ear and settled by reasoning, and it is the
strongest argument for the route picker staying until something proves it is not
needed.

Development builds now write an `[audio]` line on every session write so that
what is heard can be correlated with what was asked for. **The obvious way to
extend that is a trap**: `audioDeviceModuleEvents.setWillEnableEngineHandler`
looks like subscribing and is not — the setters hold a single handler each and
`setupIOSAudioManagement` has already installed the native audio policy in both,
so registering ours would silently replace it, with an echo or a lost route
surfacing weeks later in a build nobody connects to logging. The ordering
question it looks like it would answer needs no code: the observer already logs
to `os_log` under `com.livekit.react-native-webrtc`.

---

## The meter is two tables and a script, 2026-08-19

TASKS.md § *Track Usage* asked for per-user minutes and timestamps of WebRTC,
of media playback including recordings, of recordings attributed to whoever
started them, bytes of egress and export, and minutes of conversation shared by
pairs. This is what was built and what it deliberately is not. It absorbs
`planning/USAGE.md`, which was the design and is deleted with this entry.

**Why at all.** Nothing here measured anything, and several load-bearing claims
were reasoned rather than counted: `track_cpu_cost: 0.15` caps the box at about
ten simultaneous recorded participants and nobody knew how close it had come,
and MIGRATION.md argues sizing in both directions on judgement alone. The deploy
history says which builds kept working and nothing about what the server was
carrying while they did.

**What it is not for, which is the load-bearing half.** There is no read
surface: no endpoint, no protocol addition, no screen. Two tables and
`bin/usage`, which runs the queries against the box over ssh from outside. That
is what keeps this instrumentation rather than a feature — a figure the
application can see is a figure the application will eventually decide something
with. `usage.ts`, `db.ts` and `channels.ts` all point at this section rather
than carrying the argument again.

### The four streams, and who is the authority for each

A channel's WebRTC cost decomposes into four, and this server is the authority
for three. It does not have to ask LiveKit what it is doing itself.

| Stream | Published by | Authority |
| --- | --- | --- |
| Mic uplink, per person | the phone | **the room**, via `MediaServer.audioTracks` |
| Downlink, per listener | the SFU | derived — present listeners × publishing speakers |
| Playback | **this server's own participant** | `ChannelState.playback` |
| Egress, per stem | **this server's own jobs** | the `capturing` handles |

Only the microphone is published by a device this process does not control, so
only the microphone is asked about. Polling LiveKit about playback or egress
would be asking it to confirm something this process did itself, and would
introduce a second answer that can disagree with the first for no gain.

**The microphone can be modelled, and the model is not good enough.**
`microphoneNeeded(channel, me) && !selfMuted[me]` is exactly what the app
computes to decide whether to publish, and the server holds every input to it;
the room is created with `stopMicTrackOnMute: true`, so a closed microphone
genuinely unpublishes and there is no third state. It would work — except in the
case STATES.md § *Audio Connected* is about, where the LiveKit room is dead while
the websocket is alive. A tester hit it on 2026-08-18 when a Telegram VoIP call
seized the audio session: the channel looked live, the roster was right, the
audio was dead until a force-quit. Presence says a stream exists; there is no
stream. The over-count is rare, one-directional and **unbounded in duration**,
since the socket recovers on foreground and the room does not. Asking the room
costs one round trip per occupied channel per interval and removes the class.

### Shape, and where spans open and close

Two tables, `usage_spans` and `usage_bytes`, defined in `db.ts`. Spans open with
a null `ended_at` and are stamped when they close, the convention `recordings`
already uses and for the same reason: a span interrupted by a restart has to be
recoverable rather than silently absent. `source` — `'room'` or `'state'` —
records which authority wrote the row, and is not a hedge: a `'mic'` row reading
`'state'` means the poll stopped and the meter fell back, which is a defect and
should be visible as one rather than averaged into a total. No migration and no
backfill; there is no honest figure for a week that was never measured.

`commit` is the chokepoint for everything the server is authoritative about, and
`trackFloorWindows` was the precedent for the shape.

- **playback** — one span per present person while `status` is `'playing'`,
  restated whenever presence moves, so arriving and leaving mid-track both fall
  out of the restatement rather than needing a case each. The playback
  *participant* opens on the first track and stays for the channel's life
  publishing silence between tracks, so its stem keeps its place in a recording;
  participant lifetime and playing time are different quantities and the meter
  wants the second.
- **egress** — one span per identity, opened as it joins `run.requested` and
  closed as it leaves, carrying the run id, which is also the recordings row id.
- **pair** — on any change to `present`: close the channel's open pair spans and
  reopen one per co-present pair, canonically ordered by `pairKey`.

`mic` and `listen` come from `reconcileUsage`, on its own timer at
`USAGE_POLL_INTERVAL_MS = 15_000` rather than folded into the 500ms tick. An
identity in `audioTracks` with a non-empty track list has an open microphone;
the playback participant appears there too and is skipped, being metered from
state. **Sampling error is bounded by the interval and is not corrected for** —
a microphone opened and closed inside one window is invisible and every edge is
good to ±15s. Noise across a month of minutes; not noise across a single
conversation, and a query that slices thinly enough will find it.

**Restarts.** `restore()` calls `closeStrays`. An open span at boot belonged to
the dead process and is closed at **its own `started_at`** rather than at boot:
the process died at an unknown moment, and crediting it the whole of the
downtime would invent minutes nobody spent. The row is kept at zero length
rather than deleted, because "a span was open when the server died" is a fact
about a restart and worth counting.

### Bytes, and what cannot be seen from here

`RecordingStore.get`/`put` are the only paths by which this process moves
recording audio, so the counts are exact where they are visible. They are taken
at the call sites that know who asked rather than inside the store, which does
not: the export route and the play route with an account, the stem reads and mix
write inside `mix` with none, because nobody asked for those directly and they
are the cost of a recording existing at all.

**Stated bound: stem uploads are invisible.** The egress jobs write to S3 on the
`thefloor-egress` PutObject-only credential, never through this process. Those
bytes — the largest single category, being every participant's raw audio — are
not in `usage_bytes` and cannot be made to be without a second source. They are
derivable from recorded duration times bitrate, or from S3's own metrics. A
total read off this table is egress *this server served*, not egress the bucket
carried, and the two are far apart.

### Thirty days, having been seven

`USAGE_RETENTION_MS` in `core/constants.ts`, swept hourly on the existing
`sweepTimer` and again at boot. It shipped at seven days on the reasoning that
the shorter horizon is the more defensible one, and **moved to thirty on
2026-08-19, days later**, because a week cannot show a month's shape and every
question this exists to answer — is the box big enough, is anything growing, was
the egress cap ever approached — is asked over months. A week of data answers
none of them and a rolling month answers all three without becoming a history.

It is deliberately its own constant rather than a reuse of
`DELETED_RETENTION_MS`, which was the same seven days when both were written.
That is exactly why: they mean different things — one is a recovery window for a
mistake, the other the horizon past which nobody is entitled to know what
anybody did — and a single constant would have moved the deletion window to a
month as a side effect of this change. The two now visibly disagree, which is
the healthier state for them to be in.

Open spans are left alone by the sweep. One open past the horizon is a leak, and
deleting it would hide the leak rather than the row; `bin/usage defects` looks
for exactly that.

**Account deletion takes usage with it.** `deleteAccount` calls `forget`, which
removes rows naming the account in either table and on both `account_id` and
`peer_id` — the pair row where you are the peer and somebody else is the account
being the one easily missed. The privacy policy promises nothing identifying
remains, and a metering row naming a deleted account would falsify it.

### The privacy policy stopped being true, twice

`/privacy` read "There is no analytics, no advertising, no tracking of any
kind". The last clauses survive; the first did not, and `privacy.test.ts`
asserted the words `no analytics` — so the guard fired and the paragraph was
rewritten rather than quietly outlived, which is the whole reason the policy
lives beside the code. The assertion now names the narrower claims that survive
— no third-party analytics, nothing that profiles anyone — plus the two the
meter obliges us to make.

The retention change moved it a second time. `RETENTION_DAYS` in `privacy.ts`
had been serving both promises on the strength of their agreeing; it is now two
constants, and the test reads `USAGE_RETENTION_MS` and fails if the page has not
moved with it. The numbers are restated in `privacy.ts` rather than imported, so
that lengthening a retention cannot silently lengthen a published claim — the
prose has to be re-read by somebody deciding whether it still sounds honest at
the new number. `PRIVACY_UPDATED` moved both times, the substance having changed
rather than the wording.

**The page is served live and is not versioned per build**, so there is no
population left reading an old claim while being metered: the moment
`bin/deploy` runs, everyone on every build reads the amended page. That is why
there was no build gate on the meter — a gate would only matter if people had to
update in order to re-consent, and a served page does not work that way. The
deploy was held until build 51 cleared App Review, the page being under review as
it stood; `core/protocol.ts` was untouched by any of this, so there was no client
half to sequence.

### Where the build differed from the design

**Playback is metered per person, not per channel.** The design had one span per
channel, which is what the *stream* costs — a shared track is one publication
however many hear it. But the request asks what each person played, and a track
everybody hears is played by everybody. So: a span per present listener. Note
what that does to a total — summing playback gives **listening time, not stream
time**, and the stream's own cost is under `listen`. Neither is the other's
total.

**`peer_id` carries two meanings**, and the second was not planned. On a `pair`
span it is the other person; on an `egress` span it is whose stem is being
captured, `account_id` there being whoever started the recording — which the
request asks for and is not usually the same person. Without the second column
an egress span could say who was charged or whose voice it was, not both.

**Nothing knew who started a recording.** `RecordingState` carries no actor and
the `recordings` row's `initiator_id` is the *channel's* initiator, a legacy
anchor column predating channels holding more than two people. The answer exists
only on the action, so `ChannelRegistry.apply` now catches it into a
`runInitiator` map on its way past. In memory, like the run itself.

**Listen spans are per listener, not per speaker.** One person talking to four
costs four downlinks, and that is what the table says. Nobody alone in a room
gets one, which is also what the SFU does.

**`pollUsage` is public**, like `tick`, so a test can step it rather than wait
fifteen seconds for a timer.

**`microphoneNeeded` and `anyMicrophoneOpen` moved to `core/micNeeded.ts`** from
`app/src/audio/`, unchanged. The server needs the predicate to cross-check the
room's answer and could not reach it in `app/`. Moving rather than restating is
the reason `core/` exists: two statements of the same rule drift, and this one
would have drifted silently — as wrong minutes, months later, with nothing to
point at.

### The queries are `bin/usage`

The design left the queries in prose, to be pasted into `bin/db` by hand. They
are a script now, one report per question — `minutes`, `pairs`, `peak`, `bytes`,
`defects` — read-only with no `--write` to be got at, and each query carrying
the comment that says what its answer does *not* include. `peak` is the one with
an operational answer attached: it counts concurrent egress jobs against the ~10
that `track_cpu_cost: 0.15` implies, and raising that figure is the first move
if it ever bites.

Two of the `defects` reports are new and neither was in the design: spans still
open a day later, which is the leak the sweep deliberately does not tidy away,
and zero-length spans, which count restarts that interrupted something. Both are
questions the tables could always answer and nobody had thought to ask.

This is still not a read surface. It is a thing an operator runs, on a machine
that is not the server, against a database no request handler consults.

## Backgrounding costs presence in about a hundred seconds, and only a live microphone buys any of it back — 2026-08-20

Measured rather than reasoned about, on putnam — iPhone 13 mini, iOS 26.6,
build 55 installed from TestFlight, no debugger attached, which matters because
a debugger-held process is never suspended and would have answered the question
with its own reflection. The tool is `bin/suspend-log`, whose `--help` carries
the method; what follows is what it found.

**`UIBackgroundModes: ["audio"]` buys nothing unless audio is actually
flowing.** Backgrounded while alone in a channel, the process was suspended
**0.3 seconds** later. Backgrounded on Home with no channel at all: also 0.3
seconds. The two are not merely similar, they are *indistinguishable in the
device log* — `IDLE` is `playback` with `mixWithOthers` and nothing playing,
and iOS grants it no background-audio assertion whatsoever, so there is nothing
to tell apart. With the microphone capturing it is a different system entirely:
one episode ran **twenty-five minutes and was still running** when the capture
ended, its assertion already an hour old at the first sighting, which agrees
with the six minutes seen on 2026-08-08 and extends it.

So the shape of it is: the assertion is granted for audio *in flight*, not for
intent, and `core/micNeeded.ts` closing the microphone when you are alone —
correct on its own terms, and argued at length there — is also the thing that
ends the process a moment after the phone goes in a pocket.

**The presence chain, timed end to end for the first time.** Suspension at
01:32:33.4 by the phone's clock; the server stamped the presence drop at
01:34:18.27 by its own, the two clocks being within 400ms of each other.
**104.9 seconds**, against the 72 to 77 that HEARTBEAT_TIMEOUT_MS and
DISCONNECT_GRACE_MS predict between them. The missing half-minute is `ws`'s
`closeTimeout`, 30 seconds by default in 8.21.2: `sweep` in `server/src/ws.ts`
calls `socket.close()`, which sends a close frame and waits for one back from a
phone that is frozen and is never going to send it, and only when that times
out does the close handler run and the grace period begin.

Worth being careful about what that is. It is not a defect and is not filed as
one — 30 seconds of slack before declaring somebody gone may well be what is
wanted. What is true is that nobody chose it: it is a library default that
arrived through a call written for a different purpose, and the documented
budget in this repo was 72 to 77 seconds while the real one was 105. Whether
that is the right number is in TASKS.md.

**What it means for the product.** Stepping into an empty channel to wait for
somebody is not a thing that works, and the failure is invisible from inside:
about a minute and three quarters after the phone goes into a pocket the room
is empty to whoever arrives, while the person who went to wait in it has no
indication anything happened. What actually serves waiting is the notification
path — `announceActive` tells an absent participant that somebody has arrived,
and absent is what you become. Presence was never going to survive a pocket;
the value of measuring it is knowing that it lasts a hundred seconds rather
than the several minutes the audio background mode makes it look like.

## Waiting is an absence nobody chose, and it is the idle clock under another name — 2026-08-20

Built the same day as the measurement above, which is what prompted it. Once
you know that backgrounding suspends the process in 0.3 seconds, you know what
the roster has been saying about anybody who stepped into an empty channel to
wait for somebody: **"Stepped out 2 minutes ago"**, the one thing they did not
do. A tap and a pocketed phone left the same absence behind and were described
in the same words, and the words were the ones that tell whoever has just
walked in to give up.

**One bit, and the same clock.** `waiting` is a `UserId[]` on `ChannelState`,
added by `stepOut` when its new `chosen` flag is false — which is to say by
DISCONNECT_EXPIRED and nothing else — and cleared by `ENTER` and by either
deliberate exit. There is deliberately no second timestamp: *how long* is
`idleMs`, the same value either way, and `WAITING_WINDOW_MS` decides only how
long it keeps the better name. Fifteen minutes of "Waiting for 15 minutes"
therefore becomes "Stepped out 16 minutes ago" and never a fresh zero, which
was the requirement and is the reason a second clock was refused: two clocks
can disagree and this pair would have, by exactly a grace period.

`isWaiting` applies the window rather than a tick pruning the array, because
the only reader already has the clock in its hand and the tick already walks
every channel every 500ms — see BACKLOG.md. The array outliving its meaning
costs nothing and is never read raw. It is volatile, like `present` and
`disconnectedAt`: a restart drops every socket at once, which is not evidence
that any of them had been holding on for anybody.

**Two reversals in `lastPresentAt`, and both were prerequisites.**

`DISCONNECT_EXPIRED` no longer re-stamps it. `stepOut` stamped on every route
out, on the reasoning that one exit means one place to write — but a grace
period running out happens DISCONNECT_GRACE_MS *after* the last thing anybody
heard, and `stillHere` is driven by the transport rather than by the tick, so
the honest value was already sitting there and was being overwritten by one a
minute later. `## "Are you there" is measured by evidence, not by departures`
had already settled that the field means evidence; the assertion in
`idle.test.ts` that it should run "from a lost connection giving up, not from
when it dropped" was the older, departure-based model, surviving that change
because nothing forced it to be revisited. Without this the handover from
waiting to idleness would have jumped backwards by a minute.

And `ENTER` now stamps it. `persistence.test.ts` asserted that an entry with no
socket behind it manufactured no evidence — where the sound intention was that
*a missing socket is not evidence of leaving*, which is true and is a different
claim. Entering is something a person did, `create` dispatches ENTER from an
HTTP request that has no socket at all, and discarding it left `idleMs` null
and the roster rendering a bare **"Stepped out"** with no time under it: a
departure asserted with nothing behind it, which is precisely the near fix the
evidence model was chosen over in the first place.

**Announcements are consumed rather than merely timed.** `lastAnnouncedAt` was
keyed by channel, so telling one person silenced everybody for five minutes —
including anybody who had been *in* the room when it fired and had therefore
been excluded from `absent` and told nothing at all. Three people, one of them
in the channel: they leave, somebody walks in four minutes later, and the
person most likely to care is refused on the strength of a notification they
never received. It is now keyed channel-and-target, like `lastPingedAt` has
been all along.

The rest of the rule is that **entering the channel spends whatever notice you
were holding**. The window is a proxy for "they probably still have it on their
lock screen"; walking in is direct evidence that they do not, and the next
arrival is news rather than a repeat. The flap the window exists to absorb is
one connection ringing one phone over and over, and per-recipient keying still
absorbs exactly that — the people who did not flap have no stamp to suppress
them. The case this most matters for is the one the whole change is about: a
waiter's own entry into an empty channel is itself an announcement, and under
the old rule it started the five minutes that would later silence their arrival.

**"Invited" replaced "Waiting for them to join…"** for somebody who has never
been present. Two adjacent rows in one list, both beginning "Waiting", meaning
opposite things — one person who has not come, one who has and is still there.

**And a ping now says when, rather than being refused.** `PING_INTERVAL_MS`
has always been enforced, and the composer was offered anyway — so the only way
to learn you were inside the window was to type something and be told no, which
loses the words along with the ping. `ChannelView` carries `pingableAt`, a map
of the windows still open, composed once per snapshot rather than per viewer
because the limit protects whoever is being pinged rather than bounding whoever
is sending. Only open windows are listed, so absent means pingable and a client
can read a missing entry as "go ahead" without knowing the interval.

It is on the view rather than on `ChannelState` because no reducer knows about
it: `core/` has never heard of the ping limit, and this is server bookkeeping
about who has recently been bothered. It is optional on the wire, and it only
ever *withdraws* an affordance the server would refuse anyway — so every build
up to 55 goes on offering the button and being told no, exactly as it does
today.

Two details worth keeping. The countdown ages on the 500ms tick that already
runs while a channel snapshot is held, so it needed no timer of its own. And
"Sent." is deliberately *not* conditional on the window having arrived: a
snapshot is half a second behind the send, and hanging the confirmation on it
made the screen look, for that half second, as though it had swallowed
somebody's words. That was caught by a test rather than by reading, which is
the argument for the test.

`lastPingedAt` is in memory, so a restart forgives everybody — the notice
disappears and the composer returns and the ping then works. Consistent rather
than wrong, and it was already the intended way for this to fail.

**What was deliberately not built.** Nothing fights iOS for the process.
Holding the microphone open would drag Bluetooth to the hands-free profile and
silence every other app, which is what `core/micNeeded.ts` exists to prevent;
playing silence to keep the audio assertion is the paradigm case of the
guideline against declaring background audio you do not use; the `location`
mode would work and would deserve to be rejected. Waiting is an intention, and
an intention has no business depending on a radio.

The `beginBackgroundTask` handshake — the app telling the server, from the
expiration handler, that it is about to be suspended — was designed and
deferred rather than dropped. It stopped being a correctness requirement once
`Present · reconnecting…` was read as *wants to hear you and is likely coming
right back* rather than as *can hear you*: on that reading the sixty seconds a
frozen phone spends there is a softening that resolves into "Waiting for a
minute", not a lie. What it would still buy is tightening those sixty seconds
to nearly nothing and emptying a channel promptly enough to shorten a forgotten
recording's tail. It needs native code, and everything above shipped without
any.

`lastActiveAt` is still stamped at grace expiry, so the *channel's* clock is
optimistic by a minute where the person's no longer is. The same argument
applies and it feeds Home's ordering, which is a visible change nobody asked
for; left alone knowingly.
