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
| `DECISIONS-2026-08-31-to-2026-09-04.md` | the iPad's two panes, the web app as a versioned client, and the address that names a place | nothing — closed by rollover |
| `DECISIONS.md` — this file | 2026-09-05 onward | live |

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
entries: `## Contact requests are in the contacts, not the channels — 2026-09-05

They had been drawn at the foot of the channel list since that list was the
whole app, and stayed there through the 2026-09-01 split into two tabs on no
argument at all — `ChannelsView` said so in its own header, that they were
there "because that is where they have always been drawn, not because it was
answered". This answers it.

**A request is not a channel, and being not-yet-a-contact is not a reason to
file it under the thing it is further from.** The case for leaving it was that
an unanswered request has nobody to talk to, so it cannot be a row in a list of
rooms — which is an argument for it not being a *channel*, not an argument for
it living among them. Everything else points the other way: what accepting one
produces is a row in the contact list, what withdrawing one removes is a row
that would have been, and the form that *sends* one is already at the top of
that list. Asking and being asked were on two different tabs.

So the section moved to `ContactsView`, under *Requests*, above *You* and above
the contacts. Above, because it is the only thing on either tab with something
outstanding to do about it, and because sorting a request in among people you
know would say it was one. `RequestRow` moved with it unchanged: it is still
the one row on that list that opens nobody — an outgoing request is an address
rather than a person, the server withholding the id and the name deliberately —
so it carries Accept, Decline or Withdraw on itself where a contact's row is a
single target.

The channel list now holds channels and nothing else, which is what it was
called after.

**A test that presses an async handler must await its `act`.** Not part of the
decision, but the thing that cost the time: `act(() => onPress())` on the
Withdraw button returns a promise into a synchronous `act`, and React leaves
the renderer mid-scope — every subsequent test in the file rendered empty
text, 63 failures from one press. The console warning says so plainly and
scrolls past above the first failure.

## The deploy history`, which is newest-first and grows at the top,
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

## A hold with nothing to hold — 2026-09-06

**`connect muted CALL` is a state that should not exist.** The `muted` intent
means *leave the device exactly as it is* — still open if open, and
deliberately **not opened if shut**, because publishing a track and muting it a
moment later leaves a live microphone on the wire for two awaits. That is the
right rule for what it was written for on 2026-08-20: a device held across
somebody's self-mute.

**A connection has no device by definition.** It is a new `Room` with nothing
published, so at connect the intent expresses nothing and `holdMicrophone`
returns having done nothing. Observed in the field: the call session was taken,
no microphone was ever opened, nothing was capturing, and a silent wait that
should have held presence lapsed to *Nearby* with nothing on screen to say why.
It read as flaky — a force-quit "fixed" it — which is what an ordering bug
looks like from outside.

**Nobody had touched a mute.** `selfMuted` in the hook is derived: when a track
is subscribed and the microphone is not otherwise needed, `holdForPlayout`
forces `muted` to preserve a device that is rendering. So *somebody else's
track lingering after they stopped being present* was enough to produce it, on
a connection that had published nothing.

**Only a hold that nobody asked for is overridden**, and that distinction is
the whole of the fix. A `muted` intent arising from an actual self-mute is left
alone: the person said they did not want to transmit, and the cost — no device,
so nothing keeps them alive, so they lapse — is theirs to have chosen. What is
overridden is the *forced* hold, which exists to preserve a device and
therefore has nothing to say when there is none.

**Fixed at the apply site rather than at `holding`.** Conditioning the hold on
whether a device exists would make the 2026-09-05 freeze fix depend on state
its own effect sets, which is a loop worth avoiding in the one mechanism that
stopped playout freezing. The override leaves the hold untouched for the case
it was built for.

**Left alone knowingly:** a genuine self-mute at connect still logs `muted`
where `released` would describe it exactly. The outcome is identical — nothing
is published — and the `muted` branch is the only one that does not re-state
the audio configuration, so collapsing it would add a session write to a path
that has none.

---

## The other-audio flag is honest only before our own session — 2026-09-06

**Build 153 took a *silent* wait with music plainly playing**, held a
microphone, and stayed present while its owner expected to lapse to *Nearby*.
The log: `connect capturing CALL` at the step-in, and the app still processing
a subscription eighty-five seconds after being backgrounded, because capturing
keeps a process alive.

**The reading was taken on the tick that connects.** It was keyed on
`[foreground, mediaRoom]`, so entering a channel fired it — and the connect
path activates this app's own audio session, after which iOS reports no other
audio. The answer was false, the branch went to the silent wait, and everything
downstream followed correctly from a wrong premise.

**So the earlier conclusion was too generous and is corrected here.**
`isOtherAudioPlaying` was said to be honest *while the app is active*. It is
honest **before this app's own session is in play**. Those coincide at a
foreground with no connection being made, and nowhere else. The read is now
keyed on `[foreground]` alone.

**And it is logged.** `other audio T/F (asked)`, at the moment it decides.
Every diagnosis tonight that cost more than one build was one where the app did
not record what it believed — this value was previously legible only two steps
downstream, inferred from which session got chosen. One line ends that.

**A caution for anyone who reads a roster during a trial.** The same evening,
"still shows me as present" was read as a presence bug when the server had
nobody present at all: the observing client's snapshot was stale. A watcher who
is a member but not *present* may not be in the emit audience — `roomOccupants`
is what builds it — so a watching device can show a roster minutes out of date.
Unconfirmed, and worth confirming before anybody trusts a second screen as an
instrument.

---

## An accompanied wait gives up presence, and ducking went with it — 2026-09-06

**Being heard without being able to answer is worse than being absent.** With
music playing and the phone backgrounded, the ducking below worked exactly as
built: the arriving voice carried over the music and was easy to understand.
And it could not be answered, because iOS grants a backgrounded app no
microphone. The other person talks to somebody who cannot reply and has no way
to learn that. Reported from the field in those terms, and it decided the
question.

**So the accompanied wait is no longer kept alive.** The phone suspends, its
presence lapses after about 105 seconds, the roster reads *Nearby*, and the
arrival notification does the work it was always for. Which is where this
started: the ping-pong that opened the whole investigation.

**And that made ducking unreachable, an hour after it shipped.** `DUCKED` fired
only when the app was alive, backgrounded, with another app playing and
somebody audible — exactly the state now allowed to suspend. In the foreground
an arrival makes `hasAudio` true and takes `CALL`, which stops the music
outright. Both are removed rather than left as code nothing can reach. The
experiment is worth its hour: it established that ducking works and is cheap,
which is a fact this project can now spend rather than rediscover.

**The silent wait is untouched** — microphone held from step-in, kept alive by
capturing, heard *and answerable* on a locked phone. That is the half that
works, and the asymmetry above is precisely what it does not have.

**A bug found by being disbelieved.** Asked how one could ever be backgrounded
with music playing while stepped in, the answer turned out to be *start the
music first*. Pressed on why stepping in had once stopped the music anyway, the
teardown proved to be at fault: leaving a channel called `pushPolicy('idle')`,
which only tells the SDK's observer what to use next, and **never wrote the
session back**. `stopAudioSession` does not clear the category either. So a
phone that had been in a call sat on the Home screen holding `playAndRecord`
with no channel behind it, and the next thing to make a sound met a call
session — music started there died instantly, and a wait that should have been
*accompanied* stopped the music it was meant to leave alone. The route log
showed `PlayAndRecord/VideoChat` against `screen home`, a state that should not
exist. `applyFor('idle')` on teardown closes it, and it explains why the same
test gave different answers depending on whether the app had been force-quit.

---

## The other app is turned down rather than talked over — 2026-09-06

**An accompanied wait now ducks.** Standing in a channel with music playing,
backgrounded, somebody steps in and speaks: until this change you heard them at
full music volume, which in the field was *"barely audible"* — the voice and the
music competing on equal terms. `DUCKED` is `IDLE` plus `duckOthers`, applied
**only while somebody is actually audible**, because the keep-alive silence
plays for the whole wait and a permanent duck would quiet somebody's music for
fifteen minutes to make room for nothing.

**It stays in the `playback` family**, which is the point of building it as a
variant of `IDLE` rather than of `CALL`: no category change, no mode change, no
route change, so a Bluetooth headset keeps A2DP through it. The only thing that
moves is how loud the other app is.

**The alternative was hearing nothing**, and it was the standing ruling until
now. P4 said an arrival in the accompanied wait is not rendered until the app is
foregrounded, on the grounds that hearing it under `playback` guarantees a
change of character when the conversation actually starts. That is P1, and P1 is
what this weakens.

**P1 was weakened at the prompt, and the weakening is the interesting part.** It
had been stated as *a voice is heard exactly as it will be heard once the
conversation runs*. The ruling: **continuity is about what the ear experiences,
not about which category produced it** — "speaker, mixed with ducked music" is
continuous enough with "speaker". On that reading the principle survives and the
implementation changes; on the old reading the only conforming behaviour was
silence. Worth recording because P1 in its strict form is what cost builds 146
through 150, and a later reader should know it was retired by argument rather
than by being forgotten.

**What is not built, deliberately:** the withholding P4 asked for. There is no
`deferSubscribe` on an accompanied arrival any more, because the arrival is now
meant to be heard.

---

## No microphone is a state, not a failure — 2026-09-06

**A Mac mini has no built-in input, and asking WebRTC to capture from a device
that does not exist kills the process.** Five identical crashes, App Store build
127, `EXC_BAD_ACCESS` / `KERN_INVALID_ADDRESS at 0x20`, a null dereference
inside `AVFAudio` reached from the audio device module's worker thread.
Connecting AirPods to the same machine made it work.

**Pre-existing, and this project was about to make it constant.** On 127 the
Mac only opens a microphone when somebody else is present, which is why it took
a shared channel and twenty-four builds to find. The silent wait makes
`micNeeded` true whenever somebody is *alone* in a channel — so without this,
build 151 would have turned "crashes when there is company" into "crashes on
stepping into anything".

**The rule, stated at the prompt: if no input is available, publish nothing,
show the mute status as muted, and disable the control.** All three parts
matter. Publishing nothing is what avoids the crash. Reading *muted* is what
makes the screen true — "your microphone is open" would be a lie. And disabling
the control is what stops the interface offering an Unmute that the reducer
would happily accept and nobody would ever hear.

**It listens.** `hasAudio` is untouched, so the session still goes to `CALL`
and everybody else is still heard. A machine with no microphone can take part
in a conversation without speaking, which is a good deal better than refusing
to connect.

**`inputAvailable` is read at the same edges as the other-audio flag** — at
step-in and each foreground — and is mirrored into `SessionAudio` so the
interface reads the same fact the audio path acts on. **Unreadable counts as
available**, because the only place the engine cannot be read is off iOS, where
none of this applies; the sole way to be told *no* is for the engine to say so.

---

## The third audio configuration, deleted a day after it arrived — 2026-09-06

**`WAITING` was `CALL` plus `mixWithOthers`**, shipped on 2026-09-05 so a quiet
channel could hold the hands-free route and an arriving voice would need no
handover at the one moment iOS refuses to give one. It is gone, and the reason
is one sentence: **a call-shaped session stops another app's audio whether or
not it carries `mixWithOthers`.** The option bought nothing; the category cost
everything.

**It took three builds to see, because the failure kept arriving in disguise.**
147 relocated YouTube Music to the earpiece — with our own route reading
`Speaker(Speaker)` and every option we asked for in force, so nothing in the
configuration could have been wrong. 148 and 149 flipped between `WAITING` and
`IDLE` on a Bluetooth headset, dragging it between HFP and A2DP. 150 finally
made it unmistakable: a podcast resumed from Control Centre played for a
fraction of a second and stopped.

**The branch it was chosen by cannot be built as it stood, and that is the more
useful finding.** `isOtherAudioPlaying` does not report other apps. It reads
true only while *this* app is the active one — a fact about our own foreground
state wearing somebody else's name. Build 150's log shows it flipping with
every `app inactive`, which is what pulling down Control Centre produces, and
that is precisely how the podcast came to be killed by the act of reaching for
its play button.

**The event that would have replaced it does not exist.**
`AVAudioSession.silenceSecondaryAudioHintNotification` was observed in build
150 and **never fired** — foregrounded, in a channel, playing silence as
unambiguously secondary audio, with the other app's audio paused and resumed.
The observer is kept as the record of that negative result: it costs one log
line at an edge that never comes, and it is cheaper to keep than to rediscover.

**What survives, and is built in the same change.** The timing rule the whole
area rests on is untouched: iOS grants a backgrounded process playback and
refuses it a microphone, so the session a voice arrives under is fixed before
the phone is locked. And the polled flag is *sound while the app is active* —
which is the only moment the decision has to be made. So the wait that keeps a
microphone open is decided at step-in and held for the visit.

**The silent wait.** A quiet channel with nothing else playing asks for `CALL`
and opens the microphone, unmuted, at step-in. An arriving voice is then heard
*and answerable* without touching the phone, which is the capability this whole
area exists for. It needs no keep-alive of its own: capturing holds the process
up by itself, measured at 22m 30s backgrounded with zero drops on 2026-09-06,
against about a second for a session with nothing flowing.

**Never asked is not nothing playing.** `otherAudioPlaying` is read only while
the app is active, so a launch straight into the background has had no honest
moment — and takes no microphone rather than assuming silence and stopping
audio it never looked for.

**And presence had to be bounded before this could ship.** A held microphone
keeps a pocketed phone alive indefinitely, so `useAttention` stopped being an
empty stub on iOS: the same rules the web has used since 2026-08-22, with the
foreground as the only thing a phone can offer as a hand. It is the client half
of the pair whose server half is Rule A — one retires a device that is not
attending, the other a room in which nothing at all is happening, and neither
can see what the other sees. The keep-alive's own fifteen-minute timer is gone
with it: one clock, living with the rule about presence.

**Accepted at the prompt, in advance of building it:** during such a wait,
starting another app's audio will not work — it will play for a fraction of a
second and stop — until The Floor is next foregrounded, and it will not resume
by itself. Nothing in iOS will tell us it happened; the only candidate event
has now been tested and does not fire. The app cannot detect or repair this,
only avoid creating it, and the fifteen-minute attention window bounds how long
it can last.

---

## A room nobody is attending is retired, because presence means responsiveness — 2026-09-06

**Presence had quietly stopped meaning anybody was there.** `holdForPlayout`
holds a microphone open and muted, and an open microphone is capturing, and
capturing keeps a backgrounded process alive — so from build 143 a pocketed
phone could hold a channel open indefinitely. Build 145 made it deliberate. The
native `useAttention` stub had ruled the state out in as many words: *"There is
no state in which an iOS app is holding a channel that nobody is near, so there
is nothing here to measure."* Our own work voided that premise and nothing
noticed.

**The cost was not untidiness, it was silence.** `announceActive` notifies only
*absent* participants and fires only on the empty-to-occupied edge. A room held
occupied by ghosts can never produce that edge again, so **every arrival into
it notifies nobody** — not the ghosts, and not the people who would have come.
Found live on 2026-09-06 in a channel that had read as occupied for
twenty-four minutes with one real speaker in it. The keep-alive was suppressing
the notifications it existed to make unnecessary: the feature was eating itself.

**Rule A.** A channel in which nothing is published unmuted, and no media is
playing, for `WAITING_WINDOW_MS`, steps everybody out. Two things make it
expressible at all, and neither existed a day earlier:

- **`publishing` excludes muted tracks**, which needed `TrackInfo.muted`
  carried through `MediaPlane.audioTracks` — landed the previous afternoon for
  metering. Without it a held microphone and an open one are the same fact, and
  every ghost room looks busy.
- **"No media playing" is asked of `playback.status`, not of the roster.** The
  pump publishes continuously, silence included, so a roster test would find
  every channel occupied by its own shared track.

**The watch party is safe by mechanism rather than by exception**, which is
worth knowing before somebody adds one. Withholding is done by unsubscribing
listeners and never by muting speakers, so tracks stay unmuted for the length
of a film and the predicate cannot fire. That was argued at the prompt from the
per-speaker/imposed distinction; the implementation gives the same answer for a
simpler reason.

**A stuck member in a room somebody else is holding open is left alone,
deliberately.** The room is not misrepresented while a real person is in it,
and they may yet wake — one did, mid-conversation, while this was being
designed.

**`Exit` replaced a boolean, and the third row is why.** A departure differs
only in whether `lastPresentAt` is stamped and whether `waiting` gains the
person. `chosen` stamps and clears; `dropped` neither stamps nor clears;
**`inattentive` does not stamp but does clear** — because *Nearby* is the rung
above this one, and somebody retired for fifteen minutes of inattention
arriving there as "nearby for 0s" would restart the claim that expiring was
meant to end. Nobody should be told to ping a person the room has just given up
on.

**Accepted at the prompt:** the forced exit runs `settleEmpty`, which ends a
running recording — leaving at most a bounded fifteen-minute silent tail, since
the pump records silence at its true duration — and revokes guest links
permanently.

**What this does not do.** It is a mitigation of BACKLOG.md § *Presence follows
the websocket, not the room*, not a fix: presence still derives from a socket,
and this retires the worst consequence rather than the cause. Rule B — a
backgrounded member retiring themselves — is the client half and is not in this
change.

---

## Waiting takes the hands-free route up front, because it cannot be taken later — 2026-09-05

**A quiet channel is no longer `IDLE`.** `WAITING` is `CALL`'s category, mode
and eligibility list with `mixWithOthers` added, and it is what this app holds
while standing in a channel with nothing in it yet. So the wait is spent on the
hands-free route — mono, 24 kHz — with another app's music still playing
through it.

**Asked for at the prompt, and the reasoning is about volume rather than
fidelity.** Under `playback` an arriving voice appears on the *media* volume
rail with no warning, which is jarring, and on a speaker it is worse. The
alternative — hold A2DP and switch to hands-free when somebody arrives — was
considered and is **impossible**: iOS refuses `playAndRecord` from the
background, which is the refusal documented in the entry below, and an arrival
is precisely when the phone is in a pocket. There is exactly one moment the
route can be taken, and it is at step-in while the app is on screen. So it is
taken then and held.

**Two things fall out that were not the reason for doing it.** The deferred
promotion to `CALL` now costs nothing audible — `WAITING` is already
`playAndRecord`, so withholding the microphone moves no route and the arriving
voice is simply rendered. And `mixWithOthers` is the only thing that changes on
promotion, so nothing is handed over at the moment somebody starts talking.

**The cost is stated and was accepted before it was built:** media playback is
mono at 24 kHz for the whole wait, capped at `WAITING_WINDOW_MS`.

**It was applied unconditionally for one build, and that was wrong — corrected
the same evening.** Build 147 took the hands-free route whatever else the phone
was doing, and with YouTube Music playing, stepping into a channel moved *that
app's* audio to the receiver. The diagnostic panel is what settled it and what
refuted the obvious explanation: this app's own route read `Speaker(Speaker)`
at 48 kHz with `defaultToSpeaker` among the options actually in force. Nothing
about the configuration was wrong, so no change to the configuration could have
helped. **A call-shaped session alongside a media app relocates the media
app**, and the only remedy is not to take one.

So there are two cases, asked for at the prompt in those terms:

- **Nothing else playing** — hold the hands-free route. Safe by construction:
  the harm needs another app's audio to do it to.
- **Something else playing** — `IDLE`, A2DP, that app untouched, exactly as
  before `WAITING` existed. The keep-alive and the background deferral carry
  the feature there, and both were measured working under `playback`.

`otherAudioPlaying` from `modules/audio-route` is the test. **It is read at the
edges this app already acts on — connecting, foregrounding, a route change —
because there is no notification when another app starts**, so music begun
mid-wait relocates until the next of those.
`AVAudioSession.silenceSecondaryAudioHintNotification` is the event that closes
it and is deliberately left for its own change rather than bundled here.

**Two conclusions were reached by being wrong first**, which is worth the line:
the earlier reasoning that other-app detection was unnecessary held only while
waiting stayed on `playback`, and the reasoning that it was impractical rested
on needing a continuous poll — where a read at an edge, which `routeRecovery`
already does, turns out to be enough for every case but one.

**`IDLE` survives for one case**, and it is the case it was always best at: a
watch party withholding for its film, where the claimant on the route is
somebody else's player and there is nobody to wait for. `isPartyMuted` is the
test, and `App.tsx` passes it in — the third input the hook now takes.

**One risk carried knowingly.** `WAITING` is `playAndRecord` with nothing
capturing, and the 2026-09-05 device capture measured a non-capturing
`playAndRecord` session being suspended in seven seconds. The silence is what
keeps it alive — audio flowing is what buys background time, not the category —
so `modules/keep-alive` moved from a convenience to a load-bearing part of this
design, and a build where it fails to start now loses the wait entirely rather
than merely shortening it.

---

## A backgrounded app may keep a call session and may not start one — 2026-09-05

**Found by the keep-alive rather than caused by it.** With the phone locked and
alone in a channel, somebody stepped in and spoke. The app stayed present — the
silence did its job — and heard nothing for four minutes, until it was opened.

**The log said it worked.** `capturing CALL` is written before anything is
attempted, and the promise chain that follows carried `.catch(() => {})`. The
only evidence of failure was an absence: the route observer, recording other
events in the same seconds, never reported a `categoryChange`. iOS had refused
the session and said so to nobody.

**`UIBackgroundModes: ["audio"]` grants playback, never a new microphone.**
Opening one from the background is what CallKit and PushKit are for, and
BACKLOG.md § *Notifications do not ring* already records that this app has
neither.

**The refusal was about capture and the cost fell on playout**, because
`sessionFor` answers one question for both jobs: audio present ⇒
`playAndRecord`. Denied the category, WebRTC's engine never started, and a
track subscribed two seconds earlier rendered into nothing. `playback` would
have carried that voice perfectly well — the silent keep-alive was playing
under it throughout the same window, which is the proof that nothing was wrong
with *playing* in the background.

**So the promotion is deferred, not the state demoted.** A backgrounded app
with audio takes `IDLE` and hears the person; it takes `CALL` at the
foreground, when iOS will grant it. A session already `CALL` is left alone,
because backgrounding a live conversation is the ordinary case — switching apps
mid-sentence — and iOS permits capture to continue. Demoting there would cut
somebody's microphone every time they checked a message.

**This is `LISTENING` returning in effect and not in name.** That third
configuration was deleted at build 90 for interrupting other apps, which was a
property of it lacking `mixWithOthers` rather than of listening. `IDLE` has
`mixWithOthers` and is the listening configuration already, so nothing new is
defined.

**The consequence, stated rather than discovered later: you cannot start
transmitting from a locked phone.** Somebody who arrives hears nothing from you
until you pick it up. That was already true — iOS was refusing all along. What
changes is that the app stops pretending otherwise, and you hear them meanwhile.

**Two repairs came with it.** The empty `.catch` now records the failure, which
is the smallest change here and the one that would have saved the afternoon.
And the keep-alive's fifteen-minute timer is re-armed at every foreground: keyed
on `[mediaRoom, hasAudio]` it fired once and never again while somebody stayed
in one quiet channel, so a phone became suspendable for good — observed as
silence expiring at 13:37 and the same channel still going without it at 14:41.
Re-arming on a foreground also matches `isWaiting`, which measures its window
from the last thing heard rather than from arrival.

---

## Silence, so a phone waiting alone is still there when somebody arrives — 2026-09-05

**Stepping into an empty channel and pocketing the phone used to end the
visit.** iOS suspends the process, the websocket dies with it, and sixty
seconds later the grace period takes the person out of the room. Whoever
finally arrives sees them as *Nearby* and has to ping them back in — and since
each of them is doing the same thing to the other, two people can miss each
other several times before they synchronise. `modules/keep-alive` now loops an
inaudible buffer for as long as the session is `IDLE`, which gives the `audio`
entitlement something to be true about and keeps the socket up.

**`UIBackgroundModes: ["audio"]` was believed to cover this and does not.**
`modules/call-service`'s header said in as many words that on iOS "the system
does the rest". The entitlement keeps a process alive while it is *producing
audio*; an empty channel produces none. TASKS.md § *Websocket Lost* had already
reasoned its way to the same sentence about a phone call without noticing it
applied with no phone call at all.

**Measured before written, and the gate was real.** One phone, locked five
minutes, alone in an empty channel: `bin/health` went from `0 0 0` to `drops 2
(recovered 0, expired 2)`, and `bin/live` was empty. Zero recovered is the load-
bearing number — the socket did not go quiet and come back, the process was
gone. The plan said to stop and look elsewhere if it read `Present`.

**Silence rather than holding the microphone open, which was the first design
and is worse on every axis.** A held microphone needs `playAndRecord`, and
`playAndRecord` is what scopes A2DP away — so that version would have paid the
stereo route, for the whole wait, on a phone where nobody was saying anything.
It also lights the recording indicator and publishes a track the meter has to
be taught to ignore. Silence changes no category, so it costs no fidelity, no
indicator and no metering. **And it dissolved its own hardest requirement**:
the microphone version had to know whether another app was playing, because
seizing the session would have stopped a podcast. Silence under `mixWithOthers`
interrupts nobody, so the question stopped needing an answer — which is just as
well, since `otherAudioPlaying` is readable only through `snapshot()` and
polling that is the bug AudioDebugPanel.tsx forbids by name.

**Bounded by `WAITING_WINDOW_MS` rather than by a number chosen here.** Fifteen
minutes is how long the roster goes on calling somebody *Nearby*, on that
constant's own argument that waiting is an intention with a shelf life. Past
it, holding a phone awake would be spending battery on an eagerness the app has
already stopped reporting, so the silence stops and the phone suspends exactly
as it did before. The feature buys fifteen minutes of true presence and then
gets out of the way.

**Confirmed in the field the same night, by `bin/suspend-log` against a cabled
phone.** Alone in a channel on build 144: `audio: no assertion`, **suspended
after 1.1s** — four such episodes, 0.3s to 1.1s. The same phone on 145, same
state: an assertion held, **never suspended, ran the whole 4m 48s lock** and
ended only because the app was reopened. The bound was exact — `silence stopped
(expired)` at 15m 00s after entering the channel, suspended five seconds later.
And another app's audio kept playing throughout, which is the property the
whole design was chosen for.

**`SoloAmbientSound` in the capture was not a mislabel, and reading it as one
cost a build.** iOS named the assertion's category `SoloAmbientSound` where
`session.ts` sets `playback` with `mixWithOthers`, and because music in another
app had been observed to keep playing, that was written off as a quirk of the
tool. It was the category. `AVAudioPlayer.play()` activates the session, and on
a **fresh launch** the category is still the process default — `soloAmbient`,
which does not mix. The music test that passed had been run on an app that was
already running and had configured the session on an earlier connect, so it
never exercised the losing order.

Build 146 duly stopped a podcast on step-in, with the field log reading
`silence started` one line above `connect released IDLE`. **Fixed by ordering:
`sessionConfigured` gates the keep-alive on this app having written a category
at least once**, rather than by letting `modules/keep-alive` set one of its own
— three writers already contend for that process-wide object and the last one
wins, and a fourth that wrote only at startup would be the hardest to reason
about. The silence log line now names the category it actually started under,
so the next occurrence is one line rather than an afternoon.

**The lesson worth more than the fix: a passing field test does not establish
the property it appears to.** The music test was real, and it was run in the
one state where the bug is invisible. When a measurement contradicts a label,
the label is not automatically the thing that is wrong.

**A reading trap that cost an hour here.** `/healthz`'s `drops` counters are
cumulative and process-lifetime, so a trial read off them is only as good as
what else happened in between. This session read `drops 2 → 6` across the
verification trial and concluded the fix had failed; the capture then showed
the trial episode never suspended at all, and the two expirations belonged to
backgroundings at 12:50 and 12:53, before 145 was installed. **`bin/health` can
say something went wrong and cannot say what did it.** `bin/suspend-log` is the
instrument that attributes.

**Two things it does not do.** An interruption — a call, an alarm — stops the
player, and nothing restarts it, so a cellular call suspends the app as before;
TASKS.md § *Websocket Lost* stays open and now names the observer that would
close it. And a continuously streaming A2DP link keeps a paired headset awake
rather than letting it idle-sleep, which the fifteen-minute bound caps.

**It is a patch at a symptom and BACKLOG.md § *Presence follows the websocket,
not the room* is the cause.** That item observes that every symptom of the
split has been patched at its own site; this is one more, entered knowingly,
because the real fix touches the push window, the disconnect grace and the
eviction path together. A presence that followed room membership would need
none of this.

---

## A `mic` minute means transmitting, not published — 2026-09-05

**`meterRoom` now ignores a track its publisher has muted.** The poll asks
LiveKit which participants are publishing audio; it counted every track in the
roster, so a self-muted person was billed for an open microphone. That was
tolerable while a muted track meant somebody had chosen not to speak for a
moment. It stopped being tolerable the same day: `holdForPlayout` holds a muted
microphone open for as long as anything is subscribed, so the commonest state
in the app became one the meter read as a live microphone, and `bin/live`
credited a silent listener with the whole length of a conversation.

**The flag was always on the wire and the map was throwing it away.**
`livekit.TrackInfo` carries `muted`, and `MediaPlane.audioTracks` mapped each
track to its sid alone. Widening the map value to `{ sid, muted }` was the whole
fix; nothing new is asked of LiveKit and the poll costs exactly what it did.

**The two readers of that roster want opposite things, which is why the filter
is at the call site rather than at the source.** `meterRoom` wants only tracks
carrying audio — a held track costs no uplink and gives its listeners no
downlink, so it must not open a `mic` span and must not count toward anybody's
`listen`. `reconcileSilence` wants every track including the held ones, because
a mute belongs to the publisher and is revocable in the time it takes to say a
word: a silence that skipped a muted track would become audible the instant its
owner unmuted, which is the build 34 bug arriving by a second road. Filtering
inside `audioTracks` would have been one line and would have reintroduced it.

**`participant` spans are unchanged and that is deliberate.** A held track is
still a WebRTC connection, still costs the box what a person costs, and that
kind answers load rather than attendance.

**The numbers already written are wrong and stay wrong.** Spans are written
from what the poll saw, so the hold's first night overstates `mic` and `listen`
for everybody who was holding, and no backfill is possible. This wants a
deploy; until it has one, `bin/usage minutes` read cold will overstate.

---

## One audio-session rule, and a headset setting retired — 2026-09-05

**`steadyHeadset` is gone and `channelHasAudio` is the only rule.** The setting
had picked between two predicates since 2026-08-27 — `anyMicrophoneOpen`, *is
anybody capturing*, which handed the session back to `playback` whenever nobody
was, and `channelHasAudio`, *does this app have any audio at all*. The one that
asked about microphones has been deleted.

**It was not retired because its argument was refuted. Its choice stopped
existing.** The playout fix of the same night holds the microphone open, muted,
for as long as anything is subscribed — see PLAYOUT.md — which makes the session
`playAndRecord` whenever there is anything to hear. The high-fidelity A2DP route
the other rule existed to protect is therefore unreachable in any channel that
has audio in it. The two predicates now differ only where nothing is subscribed,
which is where nothing can be heard, and **a setting that cannot change what
anybody hears is not a setting.**

`planning/HF-ONLY-WALK.md` was the device check that was going to decide between
them on fidelity grounds, and its own header said the walk's job was "which
setting to keep, and what to recommend". It was never run, and it is deleted
rather than answered. Nobody established that stereo-while-quiet was not worth
having; it stopped being on offer. That distinction is the reason this entry
exists — a later reader finding one rule where two were argued for should not
conclude the argument was won.

**Which one survives was decided mechanically as well as semantically.**
`hasAudio` is read at connect, from channel state, before anything is
subscribed. Under `anyMicrophoneOpen` a channel would come up `IDLE`, the
subscription would land a moment later, the hold would flip `hasAudio` true, and
the session would be rewritten to `CALL` — an engine transition immediately
after every connect. That is the collision build 90 was written to remove and
the exact class of event that orphans a receiver, which is the fault the whole
night was about. `channelHasAudio` is already right at connect and nothing
moves.

**The cost, chosen rather than incurred:** HFP rather than A2DP for media
playback under all conditions, and a lit microphone indicator for as long as
anything is subscribed. Stated at the prompt as *"I commit to the lower quality
playback. If user wants better sound, he can use another app. We should keep the
logic as simple as possible."* On a headset this is measurable rather than
theoretical — the log reads `BluetoothHFP sr=24000` against `Speaker sr=48000`.

**Two things this closes elsewhere.** STATES.md disagreements 3 and 11 were
written up as closed on 2026-08-27, were not — the work that would have closed
them became a setting instead — and now are, by deletion rather than by
argument. 11 was also the leading explanation for TASKS.md § *The Foreground
Interruption*; closing it removes a candidate and does not close that, which
remains unmeasured and whose recipe now needs rewriting, since its
everybody-muted step no longer produces `IDLE`.

**One measurement moved and was left alone deliberately.** A held microphone is
muted but still *published*, so `publishing` in `server/src/channels.ts` counts
it and the `mic` usage span stays open for the whole hold — `bin/live` credits a
silent held device with an open microphone, and `bin/usage` will overstate.
Nothing functional depends on it: `anyMicrophoneOpen` is gone and
`channelHasAudio` never read the roster. Filtering muted publications is a
server change and wants a deploy, so it is noted in PLAYOUT.md rather than done
here, and a usage report read cold before then will be wrong about how much
anybody talked.

**Widened to everybody in the same change rather than staged**, which is the
opposite of this file's usual counsel and was checked rather than assumed:
`bin/live` showed one channel and one person online, so there was nobody to
stage it for. With a population it would have been two builds — widen the fix
first, remove the setting second — because removing the setting alone gives
every user the HFP cost while leaving them the freeze it pays for.

## The deploy history

### 2026-09-02 — `2844534` → `2d9e00f`

App-only again, and this one is worth saying so about twice over: everything
in it is `app/`, `planning/`, or a test, so the box gained no behaviour and the
deploy exists to put the sha in `deployed.json` and to carry the guest page
rebuild that `bin/deploy` does anyway. What shipped in the app half was the
start-a-channel row moving to the top of the channel list, *Close* and
*Settings* becoming glyphs across seven screens, and the channel and contact
screens gaining a word above the name saying which kind of screen they are.

**The one thing in it that was a live defect is invisible from here.** The web
shim for `@livekit/react-native` had never exported `AndroidAudioTypePresets`,
which `session.ts` reads at module scope — so every web bundle cut from master
since the Android audio work landed died at load with `Cannot read properties
of undefined (reading 'media')` and served a white page. This deploy does not
fix that for anybody: the web trains are built from tags by `bin/deploy-web`,
not from the server tree, so `/beta` stays broken until it is cut again from a
ref that has this commit. `/app` was never affected, `released` predating the
break.

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
