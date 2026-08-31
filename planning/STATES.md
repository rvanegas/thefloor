# The states, and who owns each one

Standing reference, not deferred work. Read it before changing anything about
the floor, the microphone, presence, or the iOS audio session — and especially
before changing something that looks like it is stated twice.

It exists because a state in this project is routinely three things at once: a
field in `ChannelState` that the reducer owns, a consequence the server applies
to the media plane, and a value the app derives locally to render. Those three
can disagree without any of them being wrong by its own lights, and until this
file there was nowhere that said which one is authoritative. Two shipped bugs
came out of exactly that gap; both are recorded below under the state they
belong to.

Written 2026-08-18, from TASKS.md's "Review Logic for States", which asked for
three things about each state and is answered in that shape:

- **Name in source** — what to grep for, in each layer that has a word for it.
- **Conditions** — when it holds, according to the code rather than the name.
- **Where the sources disagree** — the part worth the file.

The request named eleven. This carries thirteen: `Audio Session Configuration`
was missing and is the one the audio items all turn on, one of the eleven
turned out not to be a state at all, and `Party-Muted` arrived with the watch
party on 2026-08-23 — the third reason a microphone can be quiet, and not
either of the other two.

---

## Self-Mute

**Name in source.** `ChannelState.selfMuted[userId]` (`core/types.ts:209`), a
total map over participants. Written by `SET_SELF_MUTE`, guarded by
`canSetSelfMute` (`core/channel.ts:250`). In the app, `iAmSelfMuted`
(`ChannelView.tsx:205`), passed to `useSessionAudio` as `selfMuted`.

**Conditions.** Unilateral and unlimited, with one exception: `canSetSelfMute`
refuses only *muting*, and only to the floor-holder — a muted holder is the one
configuration in which the whole channel is inaudible. Unmuting is always
allowed. **Cleared by every departure**, inside `stepOut` itself, which
`STEP_OUT`, `DISCONNECT_EXPIRED`, `LEAVE_CHANNEL` and `DELETE_CHANNEL` all pass
through. Also cleared on `CLAIM_FLOOR` (nobody claims the floor in order to
stay silent), and set false for an invitee on `INVITE`. Removed entirely on
`LEAVE_CHANNEL`, membership being gone.

**Scoped to a conversation, not to a person.** Until 2026-08-21 this was the
one rule that distinguished losing your connection from stepping out:
`DISCONNECT_EXPIRED` kept the mute, on the reasoning that a phone that dropped
for a minute must not come back with a live microphone its owner had
deliberately closed, the reconnect path re-entering by itself. What retired it
is that the surviving mute had no way to be described — the roster read
`Stepped out 2 hours ago · muted`, which asserts a present-tense act by
somebody who is not there. **Note what did not change: nothing is cleared
during the grace period**, so a connection that flaps and returns inside
`DISCONNECT_GRACE_MS` keeps the mute, because nobody has left. The exposure
traded away is bounded by `microphoneNeeded`, which keeps the device shut until
somebody else is present. See decisions/DECISIONS-2026-08-20-to-2026-08-21.md §
*Every departure clears the self-mute, and the microphone is not the reason
why*.

**Not the only reason a microphone is quiet, and the newest one is deliberately
kept apart from it.** `Party-Muted` below withholds the whole room for a watch
party and writes nothing here, so clearing it restores each person's own mute
as they set it. A control that folded the two together could not do that.

**Where the sources disagree.** *One person's self-mute is an input to
everybody's audio session — under the default rule, and only under it.* Since
2026-08-18 the session has been chosen from `anyMicrophoneOpen`
(`core/micNeeded.ts`) — a question about the whole channel that excludes the
self-muted — while `micOpen` remains a question about you. So your session can
be a call while your own microphone is shut, which is not a bug and is what
stops a Bluetooth route being lost. **`channelHasAudio`, which the
`steadyHeadset` setting selects instead, does not consult `selfMuted` at all**,
so on a phone with that on, nobody's mute moves anybody's session. See `Audio
Session Configuration`.

---

## Muted-by-Claim

Three names for one thing, and the largest naming disagreement in the codebase.

**Name in source.** Server-side it is a *withheld subscription*:
`MediaPlane.setSilenced` (`server/src/media.ts:62`, real implementation at
`:271`), remembered in the `muted` map (`:468`) and re-stated by
`reconcileSilence` (`server/src/channels.ts:1801`). App-side it is
`SessionAudio.mutedByServer` (`useSessionAudio.ts:65`), observed from
`RoomEvent.TrackMuted`. In the interface it is **"silenced"**.

**Conditions.** Downstream of `floor.holder` and nothing else: while somebody
holds the floor, everyone else's audio is withheld from every other listener.
Enforced entirely server-side — the join token sets `canPublishData: false` and
`canUpdateOwnMetadata: false` so a participant cannot republish their way out of
a mute nor mute anybody else.

**Where the sources disagree.** None of the three is derived from the others,
and they can differ for a window:

- The server's statement is made against a **track id**, and tracks are
  replaced under it. A phone whose connection flaps rejoins publishing a new
  track, which the old statement does not name and which is subscribed to by
  default. The transition is for latency and `reconcileSilence` is for truth;
  do not collapse one into the other. See AGENTS.md and
  decisions/DECISIONS-2026-08-13-to-2026-08-15.md.
- The app's `mutedByServer` is an observation of an event, so it lags.
- The word on screen is "silenced", which appears in neither layer.

---

## Party-Muted

Added 2026-08-23 with the watch party's mute-all. **The third reason a
microphone can be quiet, and it is not either of the other two** — which is the
whole reason it has an entry rather than a clause in one of theirs.

**Name in source.** `ChannelState.watch.mutedAll` (`core/types.ts`) is the
**intent**, written by `SET_WATCH_MUTE` and guarded by `canControlWatch`,
which is `canControlPlayback`'s rule exactly — occupation plus the floor. What
actually holds is `partyWithholds(watch)` (`core/watch.ts`) — the intent
**and** `status === 'playing'` — surfaced as `isPartyMuted(state)` and combined
with the floor by `isWithheld(state, speaker)` (`core/channel.ts`), which is
the only thing either end should ask. `partyMuteRequested(state)` reads the
intent, for the interface. In the interface the effective state is
**"party-muted"**, said once under the roster.

**The intent and the state are deliberately two things**, which is the whole
shape of this entry. A mute holds while the video plays and lifts the moment it
pauses, so pausing to talk about what you are watching needs no second tap and
resuming does not need anybody to remember. Derived rather than written on
every play and pause, for the reason `isSilenced` is derived from
`floor.holder`: there is no transition that can forget to write it, and every
route out of `playing` gives the room its voice back for free — a video running
out under `TICK`, a channel emptying through `settleEmpty`, the party stopped,
the channel ended.

**Conditions.** Set only while a party is loaded; `setPartyMute` refuses
otherwise and `stopParty` clears it, so it cannot outlive the thing it was for.

**The default is muted, since 2026-08-23**, and it is a default rather than an
inheritance: `startParty` returns `mutedAll: true` whatever the last party was
left at, so an explicit *unmute* does not carry into the next video. The
default is only tolerable because the state is derived — a mute that held
regardless of the transport would silence a channel from the moment somebody
pasted a link and keep it silent through every pause. What it actually asserts
is quiet over a running film, and a party starts paused, so the first thing the
default can do is the thing it is for.

**Restored across a restart**, which it deliberately was not until the default
moved. The old rule dropped it, on the reasoning that a silence nobody set is
one nothing explains; that held while unmuted was the norm and a mute ignored
the transport. Now a party revives paused, so a restored mute withholds nothing
until somebody presses Play — at which point it does what a fresh party would
do anyway. What survives is the room's own answer, including an explicit
unmute, which is the only case where the stored value carries information.

**How it differs from the two it will be mistaken for.**

- **Not a self-mute.** It writes nothing to `selfMuted` in either direction, so
  clearing it gives every person back the mute they chose. Implementing it as
  "mute everybody individually" is the obvious shortcut and destroys exactly
  that: unmuting could then never restore what people had set. The requirement
  was stated in those words when it was asked for.
- **Not a claim.** A claim withholds everybody *but one* and confers control of
  the channel; this withholds everybody, holder included, and confers nothing.
  A claim and a party mute can hold at once, and `isWithheld` returns true for
  everyone while they do — clearing the mute drops back to the claim's own
  answer rather than to everybody audible.

**Where the sources disagree.** They do not, and the reason is worth stating
because it took an extra decision to get there: **both ends read the same
predicate.** The server states subscriptions from `isWithheld`, and the app
closes its own microphone from `microphoneNeeded`, which returns false for a
muted room. Either alone would be incomplete — the server's half is what makes
it true for builds that predate the rule and go on publishing, and the app's
half is what stops the microphone hearing the video at all, which is the
problem the feature exists for.

That second half has a consequence which falls out rather than being arranged:
`anyMicrophoneOpen` is false for the whole room while it holds, so every
audio session goes to its high-quality configuration for the length of the
film — and back to the call one at each pause, which is the existing mono/stereo
cue arriving for a new reason and saying exactly what it always said: somebody
can be heard now. See `Audio Session Configuration`.

---

## Claimed Floor

**Name in source.** `FloorState` (`core/types.ts:3`) — `holder`, `claimedAt`,
`lastClaimedAt`, `lastReleasedAt`. Rules in `core/floor.ts`; guard
`canClaimFloor` (`core/channel.ts:220`).

**Conditions.** `holder` is non-null exactly while a claim is active, and
`claimedAt` is non-null iff `holder` is. Claims expire under `TICK` and are
released by `RELEASE_FLOOR` or by the holder's departure — `STEP_OUT` releases,
being a departure somebody chose. The claim delay is derived from the ordering
of `lastClaimedAt`, so absent means never claimed, which counts as having spoken
longest ago: anyone who has not taken a turn may always claim immediately.

**Members only, since 2026-08-30.** A guest could claim until then, on the
argument that the floor is about who is talking and a guest with the microphone
is talking. What that leaves out is what a claim does to everybody else: it is
not permission to speak — an unclaimed floor already leaves a granted guest free
to talk — it is a demand that the rest of the room be silent, enforced on the
media plane. So `canClaimFloor` asks `isParticipant` and `isPresent`, and
`CLAIM_FLOOR`/`RELEASE_FLOOR` left `GUEST_ACTIONS`.

**The two counts inside that guard ask different questions, and must not be
merged.** *Is there anybody here to be quiet* is `roomOccupants`, guests
included — a member alone with a talking guest is exactly who a claim is for.
*Who is in the queue* is `state.present`, members only: a guest never claims, so
their `lastClaimedAt` is always absent, which the ladder reads as having spoken
longest ago — every guest in the room would otherwise add a step to the wait of
every member who has spoken, behind somebody who can never take the turn. The
paths that release a claim held by a guest (`guestGone`, `settleEmpty`) are kept
and are now unreachable: a state blob written before this can still name one.

**And by `DISCONNECTED`, since 2026-08-27 — the one thing a grace period does
not protect.** Everything else the grace holds belongs to the person who
dropped: their place in the room, their membership, their recording's stem. A
claim is the opposite, being a lock on everybody else — they are silenced by
it, and `satisfiesEligibilityRule` refuses a claim outright while it is held,
so nobody can take it back. Before this the room waited out whichever of the
two bounds came first, and both are a minute: `DISCONNECT_GRACE_MS` from the
drop and `FLOOR_CLAIM_MS` from the claim. A room whose speaker vanished spent
the rest of that minute unable to speak, for a turn nobody was taking.

The cost is that **a returning holder rejoins the queue rather than resuming**,
and in a pair that is one step of `FLOOR_CLAIM_DELAY_STEP_MS` before they may
claim again, because `claimDelayMs` ranks by recency and they spoke most
recently. Deliberate in both directions: whoever stayed keeps the room moving,
and a flapping connection cannot take the floor, vanish, and take it again on
the strength of having just had it.

**Where the sources disagree.** They do not, and that is worth recording as a
positive result — the app's controls are driven by the same `core/` guards the
server enforces with, so a greyed-out button and a refused action cannot
disagree. A claim also clears the claimant's self-mute, which is a write to a
different state from the one being claimed.

---

## In-App

**Name in source.** `ContactView.inApp` and `ProfileView.inApp`
(`core/protocol.ts:91` and `:49`), both optional. Composed by
`reachability.inApp` (`server/src/ws.ts:207`, interface at `:73`).

**Conditions.** True iff the account has a live websocket at the moment the
snapshot is composed. Not persisted and never stored; recomputed per snapshot.

**Where the sources disagree.** With `accounts.last_seen_at`, which is a
different fact with a different failure mode — a timestamp minus an advancing
clock is an inference that ages badly, where this is an observation. Read
`inApp` first. It is also **optional twice over**: absent for a non-contact
(availability is withheld from anyone who is not one) and absent from a server
that predates the field. A client cannot tell those apart and does not need to.

The open question about what a restart does to `last_seen_at` is not settled
here; it has its own TASKS.md entry, "What a Restart Does to Last-Seen".

---

## Present-in-Channel

**Name in source.** `ChannelState.present` (`core/types.ts:201`), predicate
`isPresent` (`core/channel.ts:142`), surfaced as
`RejoinableView.presentCount`.

**Conditions.** A subset of `participants`. Grows on `ENTER`; shrinks on
`STEP_OUT`, `LEAVE_CHANNEL` and `DISCONNECT_EXPIRED`. **Not durable** — a
restart drops it, along with `disconnectedAt`, the floor and any recording in
flight.

**Where the sources disagree.** The request's list flattens three different
things that this file keeps apart:

- **Membership** — `participants`. Changed only by `INVITE` and
  `LEAVE_CHANNEL`. Survives everything.
- **Presence** — `present`. Whether you are in the room now.
- **Connectivity** — `disconnectedAt`. Whether your socket is up. A socket that
  drops and returns changes nothing about presence; only outlasting
  `DISCONNECT_GRACE_MS` does.
- **Standing** — `Realtime.enteredChannel` on the client, mirrored into the
  app as `AppProvider.standingIn`. Which channel *this copy of the app* is in.
  **Presence is an account's and standing is a device's**, and the two come
  apart whenever somebody is signed in twice: the account is present while a
  phone holds the room, and a second phone that has opened the same channel is
  present-but-not-standing. There is no server-side name for this, because the
  server has no reason to hold one — an account is present or not, and which
  of its devices is doing it is settled by `displaceOtherSessions` telling the
  others they are not. See disagreement 12.

- **Watching** — `Connection.watchingChannels` on the server,
  `Realtime.watchedChannel` and the mounted `ChannelView` in the app. Whether
  snapshots are being sent to you. **Watching is not being there**, and since
  2026-08-22 the app can be in that state on purpose: with the Home setting
  "Tap a channel to step in" turned off, a tap opens the channel screen and
  dispatches no `ENTER`, so the screen offers **Step In** where it offers
  **Step Out** to somebody present. A notification tap has always landed this
  way. The microphone card and the knocks are hidden, because neither is true
  of somebody outside the room.

  **This said the screen's other controls needed no special case, on the
  grounds that every `can…` already asked about the room. That was wrong in
  both directions and was corrected the next day.** Some guards asked about
  membership only, so a watcher could rename an occupied channel, invite into
  it, mint a link onto it and rename or delete its recordings; the two guest
  controls were not wired to their guard at all and were refused silently by
  the reducer. See **Occupation**, below.

- **Occupation** — `hasTheRoom` in `core/channel.ts`, which is `present` being
  empty *or* you being in the room. Not a state of a person but of a channel
  seen from one: whether what you are looking at is somebody else's
  conversation. Since 2026-08-22 it governs the channel's name and description,
  inviting a contact, minting and revoking a guest link, the shared track, the
  clipboard, guest management, and — at the two HTTP routes, through
  `Channels.hasTheRoomIn` — renaming and deleting a recording. **Membership is
  standing over a channel; it is not standing over an occupation of it.**

  It does **not** govern leaving, exporting a recording, reading the guest
  links, or anything already about presence for its own reasons: the floor,
  self-mute, starting a recording, answering the door.

  **Since 2026-08-24 it governs *driving* what the channel attends to but not
  *putting something on*.** `canControlPlayback` and `canControlWatch` are
  occupation plus the floor and are the same function; `canLoadTrack` and
  `canStartWatch` add presence on top, through `mayPutSomethingOn`. The seam is
  that driving is tidying — an absent member stopping a film somebody left
  running on an empty channel is clearing up after a room that has gone home —
  while starting leaves something behind for whoever steps in next, chosen by
  somebody who is not there. `canOpenWatchScreen` is a third combination,
  occupation without the floor, because a follower page changes nothing.
  decisions/DECISIONS.md § *Starting is for whoever is in the room; driving is
  for whoever the room belongs to*. `present` counts members only, so a guest
  never holds a room — though `settleEmpty` means a guest cannot be in an empty
  one either, and `canManageGuest` therefore gets no behaviour from the empty
  half. The reasoning is decisions/DECISIONS.md § *Nobody reaches into a
  conversation they are not in*.

`lastActiveAt` says nothing about a channel that is occupied now — there is no
write between an entry and an exit, so an hour of conversation moves it not at
all. Anyone ordering on it must ask about occupancy separately.

### How recent a channel is, which has one answer and a second thing beside it

Since 2026-08-26 there are **two measures of a room's recency and they are not
interchangeable.** `lastPresenceAt` (`core/channel.ts`) is the maximum across the
per-person stamps *and* `lastActiveAt`, is always a number, and **includes the
reader**. `lastPresenceByOthers` is the same fold with the reader's key removed.

**Home reads the second, for both the line it draws and the order it draws it
in.** The first counts you, and presence is exclusive — `stepOutOfOthers` takes
you out of every other channel when you enter one — so somebody announcing
themselves down a list was rewriting the top of that list with their own
footsteps. `lastPresenceAt` is still carried and still does two jobs alone: it is
the fallback against a server too old to send the other, and it orders the tier
of channels nobody but the reader has ever been in.

Three things follow, and each has bitten somebody in an earlier draft:

- **It cannot include `lastActiveAt`**, that stamp being unattributed — it moves
  on anybody's entry or exit including yours. So it is **minute-coarse after a
  restart**, having given up the correction `lastPresenceAt` carries for
  `quantise`'s flooring. The test asserts that bound rather than a value.
- **It is null-capable**, where `lastPresenceAt` never is, and null is an
  ordinary state rather than a gap: a channel a pair get for becoming contacts,
  or one only the reader has opened. It gets words — "nobody else yet" — and its
  own tier in the sort, never the room's own number.
- **Guests are not in it, and that is settled** rather than incidental. They move
  `lastActiveAt` and never `lastPresentAt`, `STILL_HERE` being guarded on
  `isPresent`. Home's recency is a claim about members.

Beside it, and **not a measure at all**, is `steppedInAt`: the moment *this
reader* last stepped into this channel. The server holds the last entry per
channel on `ChannelRegistry`, in memory, and the view answers with the time when
that entry was the reader's own. **Fifteen minutes wide (`WAITING_WINDOW_MS`),
which is the same window that keeps somebody's roster card reading "Nearby"
rather than "Stepped out"** — the mark and that line are one visit described to
two audiences, so they expire together. It read `PRESENCE_LIFETIME_MS`, the
push's five minutes, from 2026-08-26 to 2026-08-27. Cleared by the next arrival
overwriting it, draws `↗` on the row, and orders nothing.

The two clocks are not the same instant and the difference runs the safe way:
this measures from the **arrival**, where `nearby` measures from the last thing
heard from that person, so on a long visit the mark expires first and can never
outlive the state it is aligned with. Nothing on the wire depends on the choice
— the server sends a moment and each client decides how long it is worth
drawing.

**It is the act, not the notification** — an earlier draft recorded the arrival
push instead and lost every step-in that was suppressed or had nobody to notify.
And it is **not** the reader's `lastPresentAt`, which the heartbeat refreshes and
every route out re-stamps: that says when you were last here, this says when you
arrived, and only the second outlives a departure. decisions/DECISIONS.md § *Home
counts other people, and marks your own step-in separately*.

---

## Mic Open

**Name in source.** `SessionAudio.micOpen` (`useSessionAudio.ts:88`), computed
as `micNeeded && !selfMuted`, where `micNeeded` is `microphoneNeeded`
(`core/micNeeded.ts:19`).

**Conditions.** `microphoneNeeded` is true when somebody else is present, or
when a recording is active — the exception being load-bearing, since one person
alone may record and a rule written as "alone means closed" would capture
silence and report success. **And false for everybody while the room is
party-muted**, which is answered here rather than at the call site because it
is the same question this function already asks: whether the microphone has
anything to capture *for*. See `Party-Muted`. `App.tsx` widens it with `recordingAsked`, because
server state arrives a round trip after the tap and that round trip is when a
short run recorded nothing at all.

**Where the sources disagree.** **There are now two senses of this state and
they are both wanted.** `micOpen` decides whether *we publish*.
`anyMicrophoneOpen` (`core/micNeeded.ts:65`) decides what configuration *everyone's
session is in*. They part company in exactly one case — self-muted while
somebody else is still talking — and that case is the whole point. Do not
collapse them.

---

## Speaking

**Name in source.** `SessionAudio.speaking` (`useSessionAudio.ts:80`), held on
the trailing edge by `app/src/audio/speaking.ts`.

**Conditions.** The room's own judgement, from published audio level, by account
id. Includes you. Held on release rather than followed exactly: the room drops
somebody for the length of a breath, and following that makes the indicator
flicker through every pause in a sentence. A hold running out is the one
transition the room does not announce, so a timer publishes it.

**Where the sources disagree.** Never derived from `ChannelState` at all — this
is the one state with a single source. Empty while disconnected, which is
honest: a stale name pulsing on a screen whose audio has dropped would be the
one reading that matters. `ParticipantDisconnected` is handled because the
speaker event does not report a departure.

---

## Recording

**Name in source.** `ChannelState.recording` (`core/types.ts:210`), a
`RecordingState` whose `status` is `'idle' | 'recording' | 'paused'`
(`:32`). Single predicate `isRecordingActive` (`core/recording.ts:28`).

**Conditions.** `runId` is non-null exactly while a run is in progress — total
by construction, because there is no `'stopped'`: a stopped run is simply over
and the channel returns to idle, which is what makes several recordings in one
channel possible. Guarded by `canStartRecording` (`core/channel.ts:275`), which
requires the actor to be **present** and nothing more. One person alone may
record; the run stops the moment nobody is present.

**Where the sources disagree.** `failure` exists because this is the one feature
whose interface makes a promise about the world rather than about itself. A red
dot saying audio is being kept, while capture is not running, is not a nicety —
somebody may be speaking on the strength of it.

---

## Playing

**Name in source.** `ChannelState.playback` (`core/types.ts:213`), status
`'idle' | 'playing' | 'paused'` (`:86`). Gated by `canControlPlayback`
(`core/channel.ts:376`).

**Conditions.** `track` is null iff status is `'idle'`. While a claim is active
the floor-holder has exclusive control, a claim being about governing what is
heard and this being part of what is heard. `volume` is shared rather than
per-listener: it is applied before the samples are published, so it reaches both
parties and the recording alike.

**Where the sources disagree.** Playback reaches each client as a *remote track*,
so it counts toward `othersAudible` and therefore chooses between the two
non-capturing configurations without anything naming playback explicitly. That
is why the audio rules need no special case for it.

---

## Audio Connected

**Two unrelated connections that the code names alike**, and the disagreement
that cost a force-quit.

**Name in source.** `SessionAudio.status` (`useSessionAudio.ts:35`) is the
**LiveKit room**. `ChannelState.disconnectedAt` (`core/types.ts:224`) is the
**app's websocket to the server**. Nothing names the pair.

**Conditions.** Either can be down with the other up, and both readings are
correct. That is precisely what a tester hit on 2026-08-18: a Telegram VoIP call
seized the audio session, the room died, the socket recovered on foreground via
`realtime.resume()` — so the channel looked live, the roster was right, and the
audio was dead until the app was force-quit.

**A third reading, since 2026-08-27: `SessionAudio.failing`.** The SFU's own
continuous judgement of every participant's connection, from
`RoomEvent.ConnectionQualityChanged`, kept for those reporting
`ConnectionQuality.Lost` — which livekit-client documents as what it reports
*before* the timeout that would produce `ParticipantDisconnected`. It is the
earliest warning anything here has that somebody is dropping out, and it is
about the connection the conversation is actually travelling on.

It does not replace `disconnectedAt` and is not replaced by it. That one is the
server noticing a *control* socket went quiet, which cannot beat the heartbeat:
up to `HEARTBEAT_TIMEOUT_MS` plus a sweep phase before any screen can say a
word. This one says *your voice is not reaching them right now*, which is what
somebody mid-sentence needs; the server's says *they have given up their
place*, which is what the roster is for. Both are drawn on the roster row, and
`failing` takes precedence because it is the one that is still actionable.

`Poor` is deliberately not surfaced — ordinary on a phone, and warning on it
would put a red line under half of every conversation. Never shown about
yourself either: the audio status line already says that, in the first person.

**Where the sources disagree.** The room had **no path from `idle` back to
`connecting`**: the connect effect is keyed on the room name, which does not
change when a connection dies. Fixed by a reconnect generation bumped from the
`Disconnected` handler and from an `AppState` `'active'` listener, mirroring
what the socket had done all along under a comment reading "Nothing else does."
`'reconnecting'` was added as a distinct status in the same change, because a
dead connection had been rendering with the same words as a channel nobody has
joined.

---

## Audio Output Selection

**There is no such state**, and the absence is deliberate rather than an
oversight.

**Name in source.** None. `app/src/audio/routePicker.ts:21` shows iOS's own
`AVRoutePickerView` and hands the entire question to the system.

**Conditions.** Nothing in this stack tells JavaScript what the route is.
`AudioSession.getAudioOutputs` offers iOS only `"default"` and
`"force_speaker"`; `enumerateDevices` returns the built-in microphone and no
outputs at all; no package here surfaces the current route, and there is no
route-change event to subscribe to.

**Where the sources disagree.** They cannot, there being only one. The cost is
that **routing failures are undiagnosable from inside the app** — item 7 was
found by ear and settled by reasoning, and no log line could have reported it.
Anything that wants to verify a route has to be a person with the phone.

---

## Audio Session Configuration

The twelfth, absent from the request's list, and the one the audio items all
turn on.

**Name in source.** `IDLE` and `CALL` in `app/src/audio/session.ts`, chosen by
`sessionFor` from a single boolean — which **one of two rules** in
`core/micNeeded.ts` computes, `anyMicrophoneOpen` or `channelHasAudio`.
`App.tsx` is the only caller of either and picks between them on the
`steadyHeadset` setting, off by default.

**These are our names, not Apple's, and they are requests rather than states.**
Each is an `AppleAudioConfiguration` bundling three AVAudioSession settings — a
category, its options, and a mode. We write; iOS disposes.

**"Nothing reads the result back" was true until 2026-08-21 and is the sentence
this whole file was missing.** `app/modules/audio-route` reads the category,
mode and options the session *actually* has, and
`app/src/audio/diagnostics.ts` sets them against what was asked for. A request
and a state are still two different things — that is why this entry is worded
as it is — but they can now be compared rather than assumed equal. See
disagreement 10.

| | category | options | mode |
| --- | --- | --- | --- |
| `IDLE` | `playback` | `mixWithOthers` | `spokenAudio` |
| `CALL` | `playAndRecord` | `allowBluetooth`, `allowAirPlay`, `defaultToSpeaker` | `videoChat` |

**There were three until 2026-08-27.** `LISTENING` was `IDLE` without
`mixWithOthers`, applied when something was audible but nothing was capturing,
so that shared playback interrupted another app rather than mixing with it. It
was switched off in build 90 on suspicion of racing the engine's own start, and
deleted with the rule change below — what it existed for now arrives as a
consequence, `CALL` being exclusive already.

**`allowBluetoothA2DP` was in that row and came out in build 65**, and its
absence is the point rather than an omission. A2DP is output-only, so listing
it under `playAndRecord` made a Bluetooth speaker with no microphone an
eligible *output*: iOS kept the far end on the speaker and took input from the
built-in mic in the same room, which is an echo path. `session.ts` carries the
argument, and it is the second time this option has been removed — build 19
took it out for a different reason and put it back on a reading that was
probably wrong.

Three settings carry all the behaviour:

- **`playback` vs `playAndRecord`** — whether the microphone is in the session.
  A Bluetooth headset cannot carry a microphone and high-quality stereo at once:
  A2DP is one-way and full-bandwidth, HFP is two-way and mono, and they are
  different link types. So asking for capture *is* asking iOS to tear one down
  and bring the other up.
- **`mixWithOthers`** — whether other **apps** keep playing. Nothing to do with
  other participants, who arrive as tracks inside our own output. It is the
  only thing `IDLE` is for.
- **`videoChat`** — switches on the system echo canceller. See
  POSTMORTEM-echo.md before touching it.

**Conditions.** `sessionFor(hasAudio)`: `CALL` when the rule in force says
there is audio, `IDLE` when it says there is not. The two rules:

- **`anyMicrophoneOpen(channel)` — the default**, and what has shipped since
  2026-08-18. *Is anybody present capturing*:
  `microphoneNeeded(channel, id) && !selfMuted[id]` over the room's occupants.
- **`channelHasAudio(channel, me)` — when `steadyHeadset` is on.** *Does this
  app have any audio at all*, in four tests asked in this order: a withholding
  watch party is `false`, anybody else in the room is `true`, a recording
  running is `true`, and a playback track loaded (`status !== 'idle'`, which
  includes paused) is `true`.

**A second rule arrived on 2026-08-27, and it is a setting rather than a
replacement.** The default rests on a premise that had never been written down:
that a room with no open microphone has somebody in it who wants the stereo
route. Exactly one claimant on that stereo survives examination — **another
app.** Voices are already degraded by the codec, and shared playback is not
trying to be a media player, so its quality should not depend on whether
somebody is talking over it. The second rule drops the fidelity question
entirely and asks an ownership one: does this app want the audio system, or
should it hand it back?

**It is a setting because the answer is a trade rather than a fact.** What is
being weighed is sound quality while the room is quiet against a link that does
not move under the first word somebody says, and which is worth more depends on
the headset and the person. See decisions/DECISIONS.md § *Hands-free only*.

| Situation | Default | `steadyHeadset` |
| --- | --- | --- |
| Not in a channel | none | none |
| Alone, nothing running | `IDLE` | `IDLE` |
| Alone, recording | `CALL` | `CALL` |
| Alone, a track loaded or playing | `IDLE` | **`CALL`** |
| Others present, anybody unmuted | `CALL` | `CALL` |
| Others present, I am muted, they are not | `CALL` | `CALL` |
| Others present, **everybody** muted | `IDLE` | **`CALL`** |
| Watch party, while the video plays | `IDLE` | `IDLE` |

Two rows differ. **All present muted** is the one that matters: a muted room is
not a silenced room, it is a live room that happens to be quiet. Every mute is
unilateral and instant — `canSetSelfMute` refuses only the muting — so handing
the route back there hands it back on a state anybody can leave in the time it
takes to start a sentence, and the profile handover then lands on that
sentence's first syllable. **Alone with a track** is the other, and under
`steadyHeadset` the session takes the route from the moment the track is
*loaded* rather than when it is heard: the category write then happens before
anything is published, instead of at the moment the track arrives and the
engine starts.

Every other row is identical, which is worth knowing before reading a symptom
as evidence about the setting.

**The watch-party row agrees under both rules, and for different reasons.**
Under the default it falls out: no microphone is open. Under `steadyHeadset` it
is the one answer that is *arranged* rather than falling out — the withhold is
asked ahead of the occupants, who are present throughout. The Floor carries no
video, each person's own player follows a transport clock, so the film is
coming out of another app and every voice is withheld while it plays. This app
has nothing to play and nothing to capture, and the claimant on the route is
the player.

**Self-mute is an input to the audio session only under the default rule.**
That default is the largest single claim this file has to make, and has been
since 2026-08-18: `anyMicrophoneOpen` excludes the self-muted, so one person's
mute moves everybody's session. Nothing in `channelHasAudio` consults
`selfMuted` at all — which is why the 2026-08-19 route loss stays fixed under
both, by two different arguments. The default keeps the session a call because
somebody else is still capturing; the other because somebody else is still
*there*.

**The transition is audible, and that is a feature — but it now says one of two
things.** Crossing the boundary is a Bluetooth profile switch, stereo to mono
and back, and what it means depends on the setting:

| | Drop to mono | Bloom to stereo |
| --- | --- | --- |
| Default | somebody's microphone is open | nobody's is, including yours |
| `steadyHeadset` | somebody has arrived, or a track is loaded | the room is empty, or the track is cleared, or the film has started |

The second is coarser and follows the room's shape rather than its mute states,
so it does not fire on everybody happening to be muted at once — a state nobody
announces and nobody chose. Both agree on the crossing that carries the
meaning: somebody walking in, and the last person leaving.

**Which means the cue is no longer the same cue for everybody**, and that is
the honest cost of making this a setting. A reading of the route is now a
reading of the route *and* a reading of a preference, and neither the code nor
the screen says which. It is one more reason not to reason from the route.

**On a mic-less speaker the cue is a route change rather than a profile
change, and it was nothing at all before build 65.** A Bluetooth *speaker*
usually has no microphone, so there is no hands-free link to move to. While
`CALL` carried `allowBluetoothA2DP` the speaker stayed an eligible output under
`playAndRecord`: iOS kept stereo on it and took input from the phone instead,
and nothing was audible at the boundary — which is the echo path the option was
removed for. With the option gone the speaker is no longer eligible while
capturing, so crossing the boundary *evicts* it to the phone's own loudspeaker,
which is not subtle. **Verified on a device 2026-08-21**, as the first of the
three checks in decisions/DECISIONS.md § *No output that cannot also capture*.

**The silent version of this misled the author on 2026-08-20**, before the
fix — alone on a Bluetooth speaker, a second person arrived, the audio stayed
in stereo, and the good quality was read as proof the microphone was shut. It
was open; `microphoneNeeded` opens it the moment anybody else is present, and
`ChannelView` said "Open" on screen throughout. The screen is the truth here
and the route is not — which still holds, since a cue that depends on the
hardware is not one to reason from.

Stated precisely, because it is otherwise a false safety cue: under either rule
the mono drop is a **superset** of *you are audible* — it fires while your own
microphone is shut, whenever somebody else's is open under the default and
whenever anybody is merely present under the other. Do not read it as a
microphone indicator. iOS has one of those, and this app deliberately does not
second-guess it.

**So do not debounce the transitions, and do not pin `CALL` on.** Both read as
obvious cleanups. The first deletes the cue; the second costs somebody sitting
alone in a channel the use of their own speakers, which is the one thing `IDLE`
is for under either rule — and it is also what the setting already offers to
anybody who wants it, which is the answer to "why not just always".


**Where the sources disagree.** Three writers touch this, and it is **process-
wide shared mutable state** (`RTCAudioSessionConfiguration.webRTCConfiguration`):
this app, the SDK's native policy observer on every audio-engine transition, and
WebRTC re-applying its own defaults. Last writer wins, and the observer wins
every race it enters — it runs on the audio worker thread at the transition
itself, so a re-statement from JavaScript always lands after it.

**The observer used to be handed a constant, and that cost the route.** It took
`IDLE` as its playout value on the argument that an unrequested write could then
only let another app back in and never take one away. That argument is about
`mixWithOthers` alone, and the two configurations also differ in **category**,
which is the Bluetooth profile boundary — so a self-mute with somebody else
still talking dropped the engine to playout-only, the observer applied `IDLE`,
and the route moved. Reported 2026-08-19 as a tone on self-mute and its inverse
on unmute.

**`policyFor` did not fix the reported tone, and the entry below says what is
now believed instead.** It closes a real disagreement and is worth keeping —
the observer should not be writing `IDLE` while somebody else is talking — but
build 56 was tested on a device on 2026-08-20 and the tone was unchanged. Read
the rest of this paragraph as *what `policyFor` does*, not as a cure.

`policyFor` in `session.ts`: the observer's playout value is
whatever `sessionFor` would return, re-pushed at every edge by `useSessionAudio`
*before* the call that causes the transition. There is nothing left for a
licence to permit, and the invariant — the two writers give the same answer for
the same inputs — is pinned by `app/src/audio/__tests__/session.test.ts`.
Pushing a policy is not a write to the session: natively it is one atomic
property assignment, read only when the engine next moves.

**Two of the six handler slots are mined; the other four are not.** The native
policy is applied from inside `willEnableEngine` and `didDisableEngine`, each
guarded on whether a JS handler is registered — so
`audioDeviceModuleEvents.setWillEnableEngineHandler` does not subscribe
alongside the policy, it **replaces** it, and the setters hold one handler each.
`willStartEngine` and `didStopEngine` are untouched by the policy, carry the
same `isPlayoutEnabled` / `isRecordingEnabled` pair, and are the supported way
to watch engine transitions from JS. Keep any such handler `__DEV__`-only and
log-only: it blocks the audio worker thread until it returns.

The observer also logs to `os_log`, which needs no code at all — but **not via
`log stream`**, which reads this Mac's logs and has no device options on current
macOS, so aimed at a phone it succeeds and prints nothing. The relay wants
**USB**; a network pairing is not enough:

    idevicesyslog -m "Native auto-config"

Console.app is the same thing with the device chosen in its sidebar. Its lines —
including `Native auto-config: setting category …` — interleave by timestamp
with the `[audio]` lines `useSessionAudio` writes in development builds, and
**the observer's half works from a TestFlight build**, being native.

---

## Disagreements, numbered

Each is phrased to lift into TASKS.md or BACKLOG.md as it stands. Those already
closed say so.

**Seven are closed: 2, 5, 6, 8, 9, 10 and 12.** Everything else is open, but two of
those are open in a way that reads like closure and is not — **3 and 7 are open
by design**, 3 because the one case the two names differ in is deliberate and 7
because `orderChannels` already consults `presentCount`. Both are written down
here precisely so that a later reading does not "simplify" them; neither is
waiting on work. The ones actually waiting are **1, 4 and 11**, and none is
urgent.

**3 and 11 were briefly written up as closed on 2026-08-27 and are not.** The
work that would have closed them — replacing `anyMicrophoneOpen` outright —
became a setting instead, so the function is still here and still the default.
Both entries now carry what changes when `steadyHeadset` is on, which is a
different and more useful thing for them to say: each names a disagreement that
one of the two rules has and the other does not.

**9 was the live one and closed on 2026-08-21**, on a device, after six builds.
It is worth reading even though it is closed: it is the longest-running wrong
premise this project has had, and both of its lessons are about evidence rather
than audio.

**The list is not in numeric order.** 9 sits between 5 and 6, next to the entry
that hands off to it, since 5's closure is only legible alongside the fault it
was mistaken for — and now that both are closed the pairing is the point, one
having been recorded as fixed before anybody listened and the other having been
fixed without anybody recording it. 10 sits under 8 for the same reason: it is
what gave 8's module a caller again. The numbers are stable references and are
not to be reassigned to tidy this up. The numbers are stable references and are not to be reassigned to
tidy this up — renumbering would silently repoint anything that has already
lifted an entry elsewhere.

1. **"Silenced", `mutedByServer` and a withheld subscription are one state under
   three names**, in three layers, none derived from the others. Open. Nothing
   is wrong today; the risk is a fourth name.

   **And one of the three names may denote nothing at all.**
   `SessionAudio.mutedByServer` is written from `RoomEvent.TrackMuted` and read
   by nothing, and since the floor withholds *subscriptions* rather than muting
   the publication, it is not clear it is ever true — no test asserts that it
   becomes so. The silenced-speaker cue deliberately did not use it and built
   its own answer from `isSilenced` off the snapshot. **Settle it by asking
   whether the field can be true, not by deleting it on the argument that
   nothing reads it**: if it can, it is a fourth name for this state arriving
   by a different route, which is exactly what this entry warns about; if it
   cannot, it is dead and goes. Noted here 2026-08-21, when TASKS.md § *Being
   Silenced Without Looking* closed and named this the one thing it left.
2. **`SessionAudio.status` and `ChannelState.disconnectedAt` are both "audio
   connected"** and are unrelated connections. *Closed 2026-08-18* by the
   reconnect path and the `'reconnecting'` status, but the naming stands.
3. **`micOpen` and `anyMicrophoneOpen` are both "mic open"** and differ in
   exactly one case, deliberately. Open by design; documented above so it is
   not "simplified". **The collision is a property of the default rule only**:
   `channelHasAudio`, the alternative, is not a question about microphones at
   all, so under `steadyHeadset` there is nothing here to confuse. That is not
   an argument for the setting — it is a note that a reader chasing this
   entry's symptom should check which rule the phone was on.
   **A third sense arrived 2026-08-20 and is the one to watch**:
   the *device* can be open while `micOpen` is false, which is precisely what a
   self-mute now is. `micOpen` answers "is anything going out", the device
   answers "is the hardware running", and only iOS reports the second — in the
   orange indicator, which this app deliberately does not second-guess.
4. **The audible mono/stereo transition is designed behaviour with nothing in
   the code calling it so** — until this file. Open: it is one refactor away
   from being deleted as a blemish. **And since 2026-08-27 it means two
   different things depending on a setting**, which is worse for this entry
   rather than better: under `steadyHeadset` the drop to mono says the room is
   not empty rather than that somebody's microphone is open. Fewer crossings, a
   coarser claim, and nothing in the code calls either of them a signal — so a
   reading of the route is now a reading of a preference too, and the entry
   stays open for that reason as much as the original one.
5. **`app/index.ts`'s licensed writer disagreement is argued only about
   `mixWithOthers`, never about the route.** *Closed.* The licence is gone —
   `policyFor` gives the observer the same answer we give — and a test pins the
   two together. **This did not stop the tone**, which was a separate fault
   sharing a symptom; see 9. The lesson is the process one: this was reasoned
   from source, shipped, and documented as a fix before anybody had heard it,
   and the entry said so and was believed anyway.
9. **A self-mute played a tone, and neither the category nor the profile was
   why.** *Closed 2026-08-21, on a device.* The premise held for six builds —
   that muting handed a Bluetooth headset out of A2DP and back — and
   measurement killed it: build 62 read `BluetoothHFP` at 24 kHz either side of
   a mute with no route-change event, from a listener proven to fire. What was
   left was the mute itself. Build 63 moved it from Apple's voice-processing
   unit to WebRTC's own mixer node and the tone stopped.

   `MicIntent` in `useSessionAudio.ts` stays and is still right — muting and
   letting go are two different closes, and only the second touches the device
   — but it was not this bug, and neither were the other three fixes. Each
   corrected something real. **The warning this entry used to carry, "do not
   stamp this closed from the diff", is what closed it**: nobody did, the
   reading was taken first, and it disproved the thing four fixes had assumed.

   The second failure is the one to carry forward. The result was heard on
   build 63 and written down nowhere, so this entry and two others read as
   open for three builds while the answer existed. **An unrecorded result is
   indistinguishable from an untaken measurement** — the mirror of 5, which
   was recorded as fixed before anybody had listened.
6. **Membership, presence and connectivity are three states the request's list
   treats as one.** Closed by documentation; the code was always right.
7. **`lastActiveAt` cannot answer whether a channel is occupied**, and anything
   ordering on it must consult `presentCount` separately. Open, and already
   handled by `orderChannels`.
8. **Nothing could read the audio route**, so routing regressions were only
   ever found by ear. *Closed 2026-08-20*, and the way it closed is the lesson:
   this said "probably permanent" and it was sixty lines of Swift.
   `app/modules/audio-route` is a local Expo module exposing
   `AVAudioSession.currentRoute`, its sample rate, and route-change
   notifications **with iOS's own reason code**. It was written after five
   builds were spent on a routing symptom nobody could measure — the entry
   asserting the limitation was itself part of why nobody tried. See BACKLOG.md
   on removing the route picker, which assumes the default is right and would
   remove the only manual recovery there is.

   **It briefly had no caller and now has one again.** The panel that read it
   was deleted on 2026-08-21 and the module kept, which TASKS.md recorded as a
   loose end; the diagnostic panel built the same day reads it, so the module is
   load-bearing rather than parked. See 10.
10. **What this app asked of the audio session and what the session actually is
   are two states, and until 2026-08-21 nothing compared them.** *Closed, in the
   sense that it is now visible; it is not a claim that they agree.* Three
   writers mutate the same process-wide configuration and the last wins —
   this app, the SDK's native observer, WebRTC's own defaults — which is the
   whole subject of `Audio Session Configuration` above. Everything in
   `session.ts` exists to make the three say the same thing, and reading back
   what we asked for could never check whether they did.

   `app/src/audio/diagnostics.ts` puts the two side by side and colours a
   difference; `AudioDebugPanel` shows it on the phone, to accounts with
   `accounts.debug` set. **The reason this is a numbered disagreement rather
   than a feature note** is that a divergence here is not a symptom of a bug in
   this subsystem, it is the shape every bug in it has taken — the build 17
   echo, the build 19 headphone fallback, the build 65 mic-less speaker. What
   changed is that the next one is readable rather than audible.
11. **"Capturing" means one thing to the audio engine and another to
   `anyMicrophoneOpen`, and `policyFor` assumes they agree.** *Open, found
   2026-08-21, and since 2026-08-27 it is **a disagreement the default rule has
   and the alternative does not**.* Under `steadyHeadset`, `channelHasAudio` is
   true in every case that can leave the engine recording — somebody else in
   the room, or a recording running, which are exactly the two things that make
   `microphoneNeeded` true — so the unconditional `recording: CALL` is safe by
   construction and there is nothing left to disagree about.

   **That makes the setting an experiment on this entry, and not a fix for
   it.** *The Foreground Interruption* still says to measure at the foreground
   before touching code, and nobody has. What the setting buys is a controlled
   comparison rather than an answer: run the recipe with it off and with it on,
   on the same phone in the same sitting. If the interruption follows the
   setting, this disagreement was the cause; if it happens under both,
   activation itself and WebRTC's defaults are what is left — and note the
   recipe's everybody-muted step means something different in each case, since
   under `steadyHeadset` the interruption there is the intended behaviour.
   **Alone in a channel is the step that means the same thing under both**,
   and it is the one to trust.

   `session.ts` hands the native observer `recording: CALL`
   unconditionally, on the argument that the observer reads that value only
   while this device is capturing and *our capturing implies `anyMicOpen`*.
   Self-mute falsifies the implication: `intentFor` returns `muted`, which
   holds the device open deliberately — `applyFor`'s header says the engine
   never leaves the recording state — while `anyMicrophoneOpen` excludes
   self-muted people by construction. So with everybody present muted the
   engine is recording, `anyMicOpen` is false, and the two writers want
   different categories for the same moment.

   That is the leading explanation for the symptom in TASKS.md § *The
   Foreground Interruption*: everybody muted
   should be `IDLE` with `mixWithOthers` and another app's audio should keep
   playing, and it is interrupted instead. **Not yet confirmed** — the
   interruption appears at a foreground, which is also an activation and a room
   rebuild, so WebRTC's own defaults and activation itself are still live
   candidates. Disagreement 10's panel is what tells them apart, and the entry
   says how.

12. **Presence is an account's and standing is a device's, and the screen
   asked the wrong one.** *Closed 2026-08-31.* `ChannelState.present` names
   the account, so it reads the same on every device that account is signed in
   on. Step In / Step Out asked it directly, and so did the gate on the audio —
   which meant a second device that merely *opened* a channel its owner was
   already in concluded it was standing there, offered Step Out, and joined the
   room. The media plane admits one participant per identity and the identity
   is the account, so the two devices then took the room from each other in
   turn.

   **`displaced` is not the same state and could not have covered it.** The
   server sends that only when another session acts; a device that has just
   opened a screen is told nothing, because nothing about the channel has
   changed. It remains the right signal for what it does say — another device
   *took* the room — which is why the screen still uses it to choose between
   two sentences, and why it is not the thing the button is computed from.

   What closed it is `AppProvider.standingIn`, mirrored from
   `Realtime.enteredChannel`, which had held the fact all along as the thing a
   reconnect re-enters from. The button, the microphone card and the audio all
   follow it now, so they cannot disagree about which device is in the room.

   **One consequence is deliberate and is the price of the distinction.** An
   app relaunched into a channel the account is still present in offers Step In
   rather than resuming, because a new process holds no room and nobody can
   hear it. Any model that tracks this per device says the same; the previous
   behaviour only looked like resumption because it was reading the account's
   presence and calling it this device's.
