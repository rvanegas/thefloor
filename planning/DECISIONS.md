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
| `DECISIONS.md` — this file | 2026-08-20 onward | live |

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

## A restart freezes last-seen rather than forging it, and that is the branch to want — 2026-08-20

TASKS.md's "What a Restart Does to Last-Seen" named two untrue things a
restart could leave in `accounts.last_seen_at` — everybody stamped at the
moment of the deploy, or everybody frozen at their last message before it —
and asked which. It is the second, and the entry's instinct to observe rather
than reason was right, because the answer turns on an ordering that neither
`ws.ts` nor `index.ts` states.

**Observed, not deduced.** A server on a scratch database with one
authenticated socket held open, quiet for five seconds after its last `ping`,
then SIGTERM — which is what systemd sends, `KillMode` being
`control-group` by default, so `npm start`'s node child receives it directly
however badly npm forwards signals. Four runs. The stamp was still the ping's
in every one: 5,059ms, 5,036ms and 5,057ms before the signal across three
timed trials, and 13 seconds before it in the first. Not once did it move to
the moment of the signal.

**Why.** `index.ts` calls `app.fastify.close().finally(() => process.exit(0))`,
and that resolves in **115ms** with a live socket attached — measured twice.
The client sees its close (code 1005) about 36ms after the signal, so the
server does tear the socket down; what it does not do is wait for its own
`'close'` handler, which is an I/O callback needing a further turn of the loop
that `process.exit` never grants. So the `markSeen` in that handler, and the
`report(DISCONNECTED)` and `announcePresence` beside it, do not run at
shutdown. The other two lose nothing — the presence they would report is
in-memory state that is dying anyway.

Note this is also evidence for the *other* shutdown question: `fastify.close()`
does not sit through `ws`'s 30-second `closeTimeout`. That delay is `sweep`'s
alone.

**And the branch we landed on is the one to want.** The error is bounded by
`HEARTBEAT_INTERVAL_MS`, which is five seconds: a live client writes this
column every ping, so a frozen stamp is at most one heartbeat stale, which is
exactly the case `PRESENT_MS` in `relativeTime.ts` was given a 60-second floor
to absorb and already documents in those words. Home needs no null case of its
own. The alternative would have been the damaging one — stamping every
connected account at the deploy asserts freshness on behalf of a phone that may
have been frozen in a pocket for the ninety seconds before it, which is a lie
the reader has no way to see through. What a restart leaves behind is the last
moment the person actually proved they were there, which is what the column
means.

`inApp` makes the whole thing quieter still, being recomputed from live sockets
per snapshot, and the clients reconnect within a second or two and start
stamping again.

The experiment did cost one real sign-in code, sent through SES to
`probe@example.com`: `server/.env` is loaded by `process.loadEnvFile()` from
the working directory, so a server started by hand in `server/` is a server
holding production's mailer, LiveKit and S3 credentials. Blank them on the
command line — `MAIL_FROM= LIVEKIT_URL= ...` — before running one locally.

## A closing socket stamps what it last heard, and last-seen never goes backwards — 2026-08-20

Decided by Rodrigo, in one word: sixty. TASKS.md's "Should a Closing Socket
Stamp Now, or the Last Thing It Heard" asked whether somebody who has gone
should stop reading as present after sixty seconds or a hundred, that being the
only thing the change turns on. It is sixty, and the entry is closed.

`ws.ts`'s close handler now passes `connection.lastSeen` instead of `now()`.
The hundred seconds were never a chosen number: `sweep` takes up to
HEARTBEAT_TIMEOUT_MS to notice a frozen phone, `socket.close()` then spends
`ws`'s 30-second `closeTimeout` waiting for a close frame that is never coming,
and stamping the moment the handler finally ran filed those forty-odd seconds
as evidence of presence. `agoOrNull`'s sixty-second floor then sat on top of an
already-inflated number. `connection.lastSeen` is never later than the truth
and is at worst one five-second heartbeat early, which the same floor absorbs —
the residual error now understates rather than overstates, which is the
direction to be wrong in.

**`markSeen` became monotonic in the same change, and had to.** It is a `MAX`
now rather than an assignment. Stamping the close with what the socket last
heard means a socket can write a time *older* than what is already stored — a
flapping phone has its replacement connected and stamping the present while the
corpse is still waiting on that close frame, and the corpse dies second. Under
`now()` that could not happen, because `now()` only ever moved forward; it is
created by the fix and is exactly the sort of thing that would have shown up
months later as a contact reading "last seen 40 seconds ago" while they were
demonstrably typing. Two tests cover the pair, and both were checked against
the unmodified server and fail there, as were the two existing ones this
rewrote.

This does not touch the *other* thirty seconds. `closeTimeout` still delays the
channel-side departure and everything keyed on a channel emptying, which is
what "Is a Hundred Seconds the Right Time to Declare Somebody Gone" is about
and is still open. What is settled is only that Home no longer inherits that
delay as a claim about presence.

Server-only. `lastSeenAt` is unchanged on the wire, so there is nothing for a
client to learn and nothing to sequence around a release.

## The native observer is agreed with rather than argued with — 2026-08-20

Self-muting with somebody else still talking played a tone, and unmuting played
its inverse. That is a Bluetooth profile handover, and it is the exact thing the
channel-wide audio rule adopted two days earlier exists to prevent: with
somebody else's microphone open `anyMicrophoneOpen` stays true, `sessionFor`
returns `CALL` both sides of the mute, and `useSessionAudio`'s `appliedRef`
comparison correctly finds nothing to do. The app's writer did the right thing
and the category moved anyway.

**The second writer did it, and it was doing what we told it to.**
`app/index.ts` installed the SDK's native policy as
`{ recording: CALL, playout: IDLE }`. That policy asks whether *this device* is
capturing — the per-self rule STATES.md already recorded as wrong — so
`setMicrophoneEnabled(false)` took the engine to playout-only, the observer
applied `IDLE`, and `playAndRecord` became `playback`. HFP down, A2DP up, one
tone.

It wins because it is not a competing JavaScript write. `applyFor` re-states
`CALL` a moment later, but that is a round trip through the bridge landing after
a native policy applied on the audio worker thread at the transition itself.
**Anything that races the observer loses**, which is why the fix is to agree
with it rather than to write after it.

**The licence was argued about the wrong axis.** `index.ts`'s comment permitted
the two writers to differ and justified it entirely in terms of `mixWithOthers`:
an unrequested write "can only ever let another app back in and never take one
away." True, and beside the point — `IDLE` and `CALL` also differ in
**category**, and the category is the route boundary. The licence was written as
though the observer could only ever cost somebody's music. It could also cost
the profile, which is the thing the channel-wide rule was adopted to protect.
This was disagreement 5 in STATES.md, filed as a hazard; it was a bug.

**`policyFor` is the fix and it is four lines.** The observer's playout value
becomes whatever `sessionFor` would return for the same inputs, re-pushed at
every edge. `recording` stays `CALL` unconditionally and that is not a special
case: it is read only while this device captures, which implies `anyMicOpen`,
for which `sessionFor` returns `CALL` anyway. There is now no input on which the
two writers disagree, so the licence is not narrowed — it is gone, and with it
the class of bug rather than this instance.

**Two things about pushing a policy that are not obvious and are load-bearing.**
It must be pushed *before* the call that causes the transition, because the
observer reads whatever is stored when the engine moves — a push afterwards
describes something that has already happened. That is safe to do first in both
directions only because pushing is **not a write to the session**: natively
(`WebRTCModule+RTCAudioDeviceModule.m`) it is one atomic property assignment on
a blocking-synchronous method, touching neither session nor engine, read later.

And it is pushed through `setupIOSAudioManagement` rather than the native setter
it wraps. Calling `AudioDeviceModule.setAutomaticAudioSessionConfiguration`
directly looks more targeted and carries a trap: it takes `deactivateOnStop` and
reads a **missing key as false**, where the SDK wrapper defaults it to true. Omit
it and the session stays active after the last engine stop, silently and
forever. Re-pushing mid-call is supported — activation is decided against
`RTCAudioSession`'s own state — and the SDK's caution about switching mid-call
is about switching *paths* (the deprecated JS callback against the native one),
not about replacing a policy on the path you are already on.

**The teardown push is the one an outsider would delete.** Leaving a channel
re-pushes the nobody-here-yet policy. Without it, disconnecting while somebody
was still talking leaves the observer armed with `CALL`, and the next engine
transition — in no channel at all — takes `playAndRecord`, exclusive and mono on
a Bluetooth route, for nothing. A test covers it because the state it leaves
behind is invisible until something unrelated moves the engine.

**Considered and not taken: stop tearing down capture on a self-mute.** The
other way to have no transition for the observer to fire on is to leave the
engine recording, which means `stopMicTrackOnMute: false`. That flag is
load-bearing three ways over — it is why the orange recording indicator goes
out, why a Bluetooth speaker is released at all, and why closing the microphone
stopped being a one-way door — and `server/src/channels.ts` reasons about a
closed microphone genuinely unpublishing. Trading all of that for a tone is a
bad exchange, and it also rests on the engine behaviour being what we think it
is, where `policyFor` is correct either way.

**What is not settled: nobody has heard it.** The diagnosis is sound from source
and the tests pin both the values and the ordering, but the report was a sound
and the confirmation has to be a sound. STATES.md's disagreement 5 is marked
fixed-in-source, unconfirmed-on-device, and says not to stamp it closed from the
diff.

**A correction to the standing warning, while it was open.** Both
`useSessionAudio.ts` and STATES.md said not to instrument this with
`audioDeviceModuleEvents`, because the setters hold one handler each and the
native policy is installed in them. That is true of **two** slots, not six: the
policy is applied from inside `willEnableEngine` and `didDisableEngine`, each
guarded on whether a JS handler is registered, so registering on either replaces
it. `willStartEngine` and `didStopEngine` are untouched by the policy, carry the
same `isPlayoutEnabled` / `isRecordingEnabled` pair, and are the supported way
to watch engine transitions from JS — `__DEV__`-only and log-only, since the
handler blocks the audio worker thread until it returns. The over-broad version
of the warning was closing off the cheapest instrument for the next audio bug.

App-only. No wire change, nothing for the server to learn, nothing to sequence
around a release.
