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

**Where the sources disagree.** *One person's self-mute is now an input to
everybody's audio session.* Since 2026-08-18 the session configuration is chosen
from `anyMicrophoneOpen` (`core/micNeeded.ts:65`) — a question about
the whole channel — while `micOpen` remains a question about you. So your
session can be a call while your own microphone is shut, which is not a bug and
is what stops a Bluetooth route being lost; see `Audio Session Configuration`.

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

**Name in source.** `IDLE`, `LISTENING` and `CALL` in
`app/src/audio/session.ts` (`:39`, `:56`, `:98`), chosen by `sessionFor`
(`:137`).

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
| `LISTENING` | `playback` | *(none)* | `spokenAudio` |
| `CALL` | `playAndRecord` | `allowBluetooth`, `allowAirPlay`, `defaultToSpeaker` | `videoChat` |

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
  other participants, who arrive as tracks inside our own output. `IDLE` and
  `LISTENING` are identical but for this, and that difference is the whole of
  "the podcast pauses when somebody starts talking".
- **`videoChat`** — switches on the system echo canceller. See
  POSTMORTEM-echo.md before touching it.

**Conditions.** `sessionFor(anyMicOpen, othersAudible)`: `CALL` if any present
participant's microphone is open; otherwise `LISTENING` if anything is audible
and `IDLE` if not.

**The rule is channel-wide on purpose**, and this is the substance of the entry:

| Situation | Session |
| --- | --- |
| Alone, not recording | `IDLE` — other apps keep playing |
| Alone, recording | `CALL` |
| Others present, I am unmuted | `CALL` |
| Others present, I am muted, they are not | `CALL` |
| All present muted | `LISTENING`, or `IDLE` if nothing is audible |

Keyed on your *own* microphone, row four was `LISTENING` — so self-muting
mid-conversation crossed the category boundary, forced an HFP→A2DP handover,
and lost a tester's headphones to the phone speaker until they unmuted. Keying
it on anybody's microphone is the fix, and it changes only that row.

It asks about microphones rather than about `selfMuted` directly, which matters
for row one: alone and unmuted, "everybody present is muted" is *false*, so a
literal reading would take the session as a call and silence the music somebody
is sitting alone listening to.

**The transition is audible, and that is a feature.** Crossing the boundary is a
Bluetooth profile switch — stereo to mono and back — and it carries two honest
signals for free:

- **Drop to mono** — somebody's microphone is open in this channel.
- **Bloom to stereo** — nobody's is, including yours.

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

Stated precisely, because it is otherwise a false safety cue: the mono drop
means *the room is live*, which is a **superset** of *you are audible* — when
you are self-muted it fires while your own microphone stays shut. The
channel-wide rule extends the cue to exactly the person who most needs it and
did not have it before: somebody muted and lurking, least likely to be watching
the screen, now hears when a person walks in.

**The pair on your own mute and unmute is gone since 2026-08-20**, and that is
the point rather than a loss: self-muting no longer releases the device, so
there is no handover to hear. What survives is the crossing that carries the
meaning — somebody arriving, the last person leaving — which is arguably what
this section should have claimed from the start.
decisions/DECISIONS-2026-08-20-to-2026-08-21.md § *Muting and letting go are
two different closes*.

**So do not pin `CALL` on, and do not debounce the transitions that are left.**
Both read as obvious cleanups. Both delete the cue.

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

**Six are closed: 2, 5, 6, 8, 9 and 10.** Everything else is open, but two of
those are open in a way that reads like closure and is not — **3 and 7 are open
by design**, 3 because the one case the two names differ in is deliberate and 7
because `orderChannels` already consults `presentCount`. Both are written down
here precisely so that a later reading does not "simplify" them; neither is
waiting on work. The ones actually waiting are **1 and 4**, and neither is
urgent.

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
   exactly one case, deliberately. Open by design; documented above so it is not
   "simplified". **A third sense arrived 2026-08-20 and is the one to watch**:
   the *device* can be open while `micOpen` is false, which is precisely what a
   self-mute now is. `micOpen` answers "is anything going out", the device
   answers "is the hardware running", and only iOS reports the second — in the
   orange indicator, which this app deliberately does not second-guess.
4. **The audible mono/stereo transition is designed behaviour with nothing in
   the code calling it so** — until this file. Open: it is one refactor away
   from being deleted as a blemish.
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
   2026-08-21.* `session.ts` hands the native observer `recording: CALL`
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
