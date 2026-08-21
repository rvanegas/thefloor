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

The request named eleven. This carries twelve: `Audio Session Configuration`
was missing and is the one the audio items all turn on, and one of the eleven
turned out not to be a state at all.

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
somebody else is present. See DECISIONS.md § *Every departure clears the
self-mute, and the microphone is not the reason why*.

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

- The server's statement is made against a **track id**, and tracks are replaced
  under it. A phone whose connection flaps rejoins publishing a new track, which
  the old statement does not name and which is subscribed to by default. The
  transition is for latency and `reconcileSilence` is for truth; do not collapse
  one into the other. See AGENTS.md and DECISIONS-2026-08-13-to-2026-08-15.md.
- The app's `mutedByServer` is an observation of an event, so it lags.
- The word on screen is "silenced", which appears in neither layer.

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
silence and report success. `App.tsx` widens it with `recordingAsked`, because
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
category, its options, and a mode. We write; iOS disposes; nothing reads the
result back.

| | category | options | mode |
| --- | --- | --- | --- |
| `IDLE` | `playback` | `mixWithOthers` | `spokenAudio` |
| `LISTENING` | `playback` | *(none)* | `spokenAudio` |
| `CALL` | `playAndRecord` | `allowBluetooth`, `allowBluetoothA2DP`, `allowAirPlay`, `defaultToSpeaker` | `videoChat` |

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

**And it is only a cue on hardware that has a microphone.** A Bluetooth
*speaker* usually has none, so there is no hands-free link to move to:
`CALL` carries `allowBluetoothA2DP`, iOS keeps stereo output and takes input
from the phone instead, and nothing is audible at the boundary at all. The
signal below is therefore absent on exactly the devices where the sound is
nicest. **This misled the author on 2026-08-20** — alone on a Bluetooth
speaker, a second person arrived, the audio stayed in stereo, and the good
quality was read as proof the microphone was shut. It was open;
`microphoneNeeded` opens it the moment anybody else is present, and
`ChannelView` said "Open" on screen throughout. The screen is the truth here
and the route is not.

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
this section should have claimed from the start. DECISIONS.md § *Muting and
letting go are two different closes*.

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

**Four are closed: 2, 5, 6 and 8.** Everything else is open, but two of those are
open in a way that reads like closure and is not — **3 and 7 are open by
design**, 3 because the one case the two names differ in is deliberate and 7
because `orderChannels` already consults `presentCount`. Both are written down
here precisely so that a later reading does not "simplify" them; neither is
waiting on work. The ones actually waiting are 1, 4 and 9, and **9 is the
live one** — waiting, since 2026-08-20, on somebody *hearing* it rather than on
somebody writing anything. It has been fixed in source twice in a day and
neither fix has been put to a Bluetooth headset.

**The list is not in numeric order.** 9 sits between 5 and 6, next to the entry
that hands off to it, since 5's closure is only legible alongside the fault it
was mistaken for. Scanning by number is how 9 gets missed, which is the wrong
one to miss. The numbers are stable references and are not to be reassigned to
tidy this up — renumbering would silently repoint anything that has already
lifted an entry elsewhere.

1. **"Silenced", `mutedByServer` and a withheld subscription are one state under
   three names**, in three layers, none derived from the others. Open. Nothing
   is wrong today; the risk is a fourth name.
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
9. **A self-mute moved the Bluetooth profile, and the category was not why.**
   *Fixed in source, unverified on a device.* Muting used to stop capture, and
   stopping capture is what releases the hands-free link. Muting and letting go
   are now two different closes — `MicIntent` in `useSessionAudio.ts` — and only
   the second touches the device. **Do not stamp this closed from the diff**;
   the entry above it is what happens when somebody does.
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
