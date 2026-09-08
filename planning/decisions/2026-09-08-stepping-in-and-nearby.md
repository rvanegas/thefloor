# 2026-09-08 — Stepping in, and stepping in nearby

Presence and the audio session, rebuilt together. Rodrigo's design, stated the
night the bench in `AudioLabView.tsx` was run for the first time; this is what
survives of `AUDIO-PRESENCE-DESIGN.md` and `AUDIO-LAB-FINDINGS.md`, both of
which were temporary and both of which this replaces.

**The whole of it reduces to one rule: a session is held if and only if the
phone is stepped in.**

## Two ways to be in a room

The difference between them is whether you claim the audio system.

- **Stepped in** — the phone takes `playAndRecord` immediately, **exclusively**:
  no `mixWithOthers`. Another app's audio stops. You publish and you subscribe.
- **Nearby** — no claim on audio at all, and no subscription to the media room.
  Another app plays untouched.

Nearby is reachable three ways: **declared** — step in nearby, or step in and
then declare nearby, which abandons the claim — or **inferred**, which is what
the word already meant.

## Why exclusive, which is the change

**So that an arriving voice is not competing with a podcast.** The point of
standing in a room is to hear somebody the moment they speak, and a voice mixed
under another app's audio is a voice you have to attend to rather than one you
simply hear.

This **reverses** `core/micNeeded.ts`'s standing principle — *being in an empty
channel should cost the speakers nothing* — deliberately. The cost is paid
knowingly and **nearby is the escape hatch**: somebody who wants to be
reachable without their music stopping steps in nearby instead. The old rule
tried to serve both intentions with one state and had to guess which was meant.

## What the device said, which is why exclusivity is a choice

Nine configurations, measured on a device between 00:02 and 01:18 on
2026-09-08, from the bench in `app/src/ui/AudioLabView.tsx`. **Every line here
is a reading, not an argument.**

**The one sentence: a capturing session can let another app go on playing, at
full rate. The category was never what cost that — the mode was.**

### What was falsified

Two source files and several decisions asserted that a `playAndRecord` session
is exclusive, from commit `0fd88c7`'s conclusion that *"the option bought
nothing and the category cost everything"*. **The category costs nothing.**
`playAndRecord` + `mixWithOthers` + `default` let a podcast play at 48 kHz with
an input tap running, four phases, twice. That experiment held
`audioMode: 'videoChat'` fixed while varying `mixWithOthers`, so it could not
separate the two; Apple's header documents the combination as valid, and the
voice-chat modes are documented as asserting `duckOthers` behind the caller's
back.

The two comments that carried the refuted version — the header of
`channelHasAudio`, and the `SessionWant` comment saying *there is no
configuration that both holds the call route and lets another app play* — were
corrected in the same commit as the behaviour.

### Speaker pass, four rows, four phases each

| row | mode | options asked | other app | rate |
| --- | --- | --- | --- | --- |
| 1 | `default` | mix + defaultToSpeaker | **playing normally** | 48000 |
| 2 | `spokenAudio` | mix + defaultToSpeaker | **playing normally** | 48000 |
| 3 | `videoChat` | mix + defaultToSpeaker | ducked | 48000 |
| 4 | `default` | duck + defaultToSpeaker | ducked | 48000 |

Every readback matched the request exactly; `err=none` throughout.

- **Row 2 resolves an ambiguity in Apple's header.** The mixing description is
  scoped *"with `AVAudioSessionModeDefault`"*, and the grammar does not say
  whether that binds `playAndRecord` or only `multiRoute`. It does not bind
  `playAndRecord`: `spokenAudio` mixes identically.
- **Row 3 is the control and it failed as required**, which is what makes rows
  1 and 2 mean anything. **Its readback still contained `mixWithOthers`** — the
  option was asked for and granted, and the mode ducked anyway, so `videoChat`
  does not win by clearing the bit. **`categoryOptions` cannot see this**,
  which is why no diagnostic panel in this repository could ever have caught
  it. Only the ear did.
- **Row 4: iOS edits the request.** Asked `[duckOthers, defaultToSpeaker]`, got
  `[mixWithOthers, duckOthers, defaultToSpeaker]`. Apple's header says it will.
- **Capture is not what interrupts.** `input on` and `input off` changed nothing
  in any row; the ducking in rows 3 and 4 was already present at `@applied`.
  **Activation is the event, not the microphone.**
- **Nothing ever stopped.** Row 3 ducked. Build 150's *"podcast played for a
  fraction of a second and stopped"* did not reproduce. One partial run read
  `silent` at 00:18:47 and did not repeat in the clean run; **unexplained
  rather than dismissed.**

### Headset pass, five rows — device `wachowskis`

| row | mode | Bluetooth option | output | input | rate | other app |
| --- | --- | --- | --- | --- | --- | --- |
| 5 | `default` | `allowBluetooth` | HFP | HFP | 24000 | mono |
| 6 | `default` | `allowBluetoothA2DP` | **A2DP** | **built-in** | 48000 | normal |
| 7 | `videoChat` | `allowBluetooth` | HFP | HFP | 24000 | mono |
| 8 | `default` | `allowBluetoothA2DP` | **A2DP** | **built-in** | 48000 | normal |
| 9 | `videoChat` | `allowBluetoothA2DP` | **Speaker** | built-in | 48000 | off the headphones |

**Row 7 is what ships.** `CALL` differs from it only by omitting
`mixWithOthers` — inert under a voice mode, as row 3 established — and
`allowAirPlay`, which does nothing while a Bluetooth headset is connected. So
the first line of this table is a measurement of the shipping app: on a headset
it is hands-free in both directions, mono, 24 kHz. **Row 8 is what that costs.**

- **Rows 5 and 7 are indistinguishable in every reading**, which says the
  handover is not the mode's doing: `playAndRecord` plus `allowBluetooth` needs
  input from the headset, only HFP carries a microphone, and the whole route
  goes. **Leaving the voice family buys nothing on a headset.**
- **Rows 6 and 8 are the same configuration asked two ways** and they agree. The
  split is real: A2DP stereo out at 48 kHz, the phone's own microphone in,
  another app playing normally, an input tap running.
- **Row 9 is the price.** Under `videoChat`, `allowBluetoothA2DP` does not keep
  the split — the route leaves the headset altogether. A2DP carries no
  microphone, so a voice mode will not hold a Bluetooth output it cannot also
  capture from.

**The A2DP split is declined rather than unavailable.** It costs the echo
canceller, and it is unsafe with a mic-less Bluetooth speaker, where the far end
comes out of a loudspeaker into an open microphone in the same room. **Being
nearby is how you keep stereo**, because being nearby claims nothing.

**The question it hands over, undecided and unmeasured:** whether to condition
the *mode* on the output route — `default` while output is A2DP headphones,
`videoChat` when output is a loudspeaker. Headphones in somebody's ears are not
loudspeakers, and the echo path a voice mode exists to cancel is weak or absent
in an ear canal. Rows 8 and 9 show the route; whether the split actually echoes
needs a far end and a second person.

### Measurement notes, for whoever runs it next

- **HFP is 24 kHz on this device, not 16.** Wideband mSBC. Older comments said
  16 or 8, which is narrower than at least one real headset.
- **The rate reported at `apply` is not trustworthy.** At 01:15:53 the same
  configuration read 48000 at apply and 24000 after `input on`. **Read the rate
  after the input is running.**
- **Ducking cannot be judged on a Bluetooth headset, and this is structural.**
  Applying either of rows 5 and 7 hands the profile over in the same instant,
  and mono at a third of the bandwidth is itself an apparent drop in loudness.
  And the pair cannot be fixed: `videoChat` will not hold A2DP at all, so on
  Bluetooth there is no configuration pair that varies the mode and holds the
  route. **Wired headphones are the rig that would isolate it**, having no
  profile to negotiate.
- **Release recovered cleanly every time** — A2DP, 48000, empty input, other app
  playing normally. `setActive(false, .notifyOthersOnDeactivation)` is what does
  that, and a row run without it would measure the previous row's leftover.

## The three audio states

| | configuration | who |
| --- | --- | --- |
| **CALL** | `playAndRecord`, exclusive | stepped in — member, or guest who may speak |
| **LISTENING** | `playback`, exclusive | guest without a speech grant |
| — | **deactivated** | nearby, or not in a room |

**`LISTENING` is a restoration and it returns for the reason it was removed.**
It was `IDLE` without `mixWithOthers` and went at build 90 for interrupting
other apps — which is the intent here rather than the defect. A guest's audio
should resemble a member's in every respect except permission to speak, and
letting somebody's podcast play over the voices a guest is listening to would
single out the one person who cannot do anything about it.

**So *stepped in* names two session configurations, and the two predicates do
not collapse into one.** That was the hope once the roster left both; the guest
is why it cannot happen. The divergence is narrower than it was and it is
permanent.

**One consequence, audible.** A guest granted permission to speak crosses from
`playback` to `playAndRecord`, which on a Bluetooth headset is an A2DP to
hands-free handover — stereo to mono, at the moment they are told they may talk.
Nothing is wrong with it and nobody will expect it.

### Nearby holds no session at all

**Not `IDLE`. Nothing.** `IDLE` made sense while a nearby-ish phone was still
*connected*: you hold a playback session because a voice could arrive at any
moment. Under this design nearby has no media subscription, so nothing can
arrive. The session would assert a readiness for audio that cannot happen, and
it would not even buy process lifetime, an active session with nothing flowing
being exactly what iOS suspends.

**And deactivation is the thing that gives the audio system back**, which is
why it is deactivation rather than a quieter configuration. Going nearby is
*meant* to give somebody their podcast back; holding a mixing playback session
leaves us gripping something and tells the interrupted app nothing.

**`IDLE` therefore leaves the codebase, and with it the last use of
`mixWithOthers` anywhere.** Nothing mixes: a phone has either claimed the audio
system or released it.

### Releasing is one operation, coupled to the teardown

**The SDK's observer already does it.** `IOSAudioSessionPolicy` carries
`deactivateOnStop` beside the two configurations, so the release happens
natively at the engine transition, on the audio worker thread with no
JavaScript in the path. `policyFor` becomes `{ recording: CALL, playout:
LISTENING, deactivateOnStop: true }` — a constant — and **the observer's three
engine states are this design's three audio states**, which is why the whole of
it fits the SDK rather than fighting it.

**Set `deactivateOnStop` explicitly rather than relying on the default**: the
native setter reads a missing key as *false* where the SDK wrapper defaults it
to *true*, so a call that omits it can leave the session active after the last
engine stop, silently.

**One thing the SDK does not do, and it had to be added.** Neither
`AudioSession.stopAudioSession` nor the observer's `deactivateOnStop` path
passes `notifyOthersOnDeactivation` — both are a bare `setActive(false)`. That
option is what tells the interrupted app it may resume, and it is what every
`Release` in the lab run used. `releaseSession` in `app/modules/audio-route` is
that call, made on the connection's teardown after the SDK has stopped its own
session. **Whether the notification still reaches the other app from there is a
device question** — a headset, a podcast, and a step-out — and it is the first
thing to check if somebody reports their music not coming back.

**Every exit from stepped-in takes the same path**: a tap on Step Out, declaring
nearby, Rule B retiring an unattended phone, being displaced. A process
suspended outright releases nothing because it cannot — the session dies with
it, which is the same outcome by a different route and needs no code.

### Android

**Two of the three states were already right and the third is the only work.**
Android has no `deactivateOnStop` and no observer to agree with, so nothing
releases focus on this app's behalf.

| state | Android | status |
| --- | --- | --- |
| **CALL** | `ANDROID_CALL` — `inCommunication`, voiceCall stream, `gain` | already correct |
| **LISTENING** | `ANDROID_LISTENING` — media stream, `gain` focus | already correct; **renamed**, it was only ever called idle because iOS's `IDLE` mixed |
| **no claim** | `ANDROID_RELEASED` — `manageAudioFocus: false`, `audioMode: 'normal'` | the gap, now closed |

**Both halves, deliberately.** A nearby phone never starts an audio session, so
nothing configures anything — that may already be enough — **and** the release
is asserted on any path that could have configured it earlier. Being explicit is
what iOS gets for free.

**A bonus worth noticing**: both presets already requested `gain` focus, so
**the mixing this platform never verified is mixing it never did.**
`ANDROID_LISTENING`'s old note calling that an unverified risk now describes
nothing.

## Promotion

Nearby, **foreground**, somebody **steps in** → the phone takes the exclusive
`playAndRecord` and **the user becomes audible.** Not listen-only.

**The trigger is the arrival, not the first word**, and that is the whole of
what makes it affordable. First words typically come a few seconds after
somebody steps in, and those seconds are what the media connection has to get up
in. Keying it on speech would start the reconnect at the exact moment there was
already something to miss.

It is also a fact the app already has: an arrival comes over the ordinary
websocket in channel state, which a nearby phone is still receiving. Nothing
here needs the media room.

**Somebody already stepped in does not promote you, and this is the common case
rather than a corner.** Declaring nearby in a room where somebody is already
talking leaves you nearby, hearing nothing, until the next person steps in.
That is intended: you chose nearby, and promotion is for arrivals.

**The screen must not contradict the silence.** A speaking indicator is the
visual accompaniment to audio and the two are present or absent together —
somebody not subscribed sees nobody speaking. **This already holds by
construction**, `audio.speaking` being the LiveKit room's active speakers. The
roster still shows who is *present*, which is honest: it says they are there,
not that you can hear them.

**iOS permits this and would not permit the reverse.** A backgrounded app is
refused a *new* microphone — measured on build 146, four minutes with no engine
start — so promotion happens in the foreground, and this design only ever asks
for it there. In the background others see *Nearby* and may ping; the arrival is
not consumed, and the promotion fires when the phone is picked up.

**Only a declaration made on this device promotes it.** `AppProvider.nearbyIn`
is that record, beside `standingIn` and for the same reason: promotion opens a
microphone nobody asked for, and a wait somebody's *other* phone is in the
middle of is not an ask. The server's `waiting` is read back as well, so a
declaration that has lapsed to *Stepped out* promotes nobody.

## Nearby has three ways in and one clock

- **Declared** — step in nearby.
- **Declared** — step in, then declare nearby, which abandons the claim.
- **Inferred** — stepped in, and the websocket goes before the inattention
  clock expires. Whichever expired first is what describes it.

**One clock governs all three, and it measures the last sign of life** rather
than the moment anything was declared. That is the same question in every case:
how long since we heard from you, which is how likely a ping is to reach you.
`ATTENTION_WINDOW_MS = WAITING_WINDOW_MS` already; the unification is a
principle being stated, not a change being made.

Traced through, a declared nearby reads: **foreground** — the app is alive,
`stillHere` keeps stamping, and the card reads *Nearby* continuously, which is
true; **pocketed** — no audio claim, so iOS suspends within about a second, the
socket goes, and `lastPresentAt` freezes at the last thing actually heard;
**then** — *Stepped out*, at fifteen minutes. So *nearby is not kept alive* is a
statement about the **process**, and the roster label follows from it rather
than fighting it.

**The attention rules need no nearby case.** Rule A and Rule B act on people in
`present`, and a nearby person is not one.

## How it reaches other clients

**The observer side needs no new field.** *Nearby* is carried by
`state.waiting`, already on `ChannelState` and already sent; clients render it
through `isWaiting`, with a ping. So a declared nearby has only to land in
`waiting`, and **every existing build renders it correctly, unchanged.**

**The wire addition is one new client→server action**, `DECLARE_NEARBY`, and
nothing in the snapshot. It serves both buttons: the reducer branches on whether
you were present. **It must be deployed before a client that sends it ships** —
AGENTS.md § *Never ship a wire change to a server before the client can speak
it* — and it is the only step in this design with that constraint.

**A fourth `Exit` reason was added for legibility**, behaving exactly as
`'dropped'` does in both fields it touches: joins `waiting`, and does **not**
stamp `lastPresentAt`. The second half is what implements the one clock — the
stamp is left to the transport, so it stays fresh while the app is alive and
freezes when the phone suspends. Filing a deliberate declaration under
`'dropped'` would work and would read as a lie in every log that prints it.

## Three states, and they are distinct

**Stepped in unmuted · stepped in muted · nearby.** Not two.

Stepped in muted and nearby are the pair that reads alike from outside and is
not alike at all: a muted person **hears the room**, holds the audio claim, and
is an occupant. A nearby person hears nothing, claims nothing, and is not.
Muting is about what you send; being nearby is about whether you are in the room
at all.

## Watch parties

**`playAndRecord` throughout, and no special case.** The film plays on another
*device*, so a phone holding the audio system does not silence it. While the
video runs, occupants are **muted but still publishing and subscribing** — which
is ordinary self-mute, not a fourth state.

**So the withholding clause left both core predicates.** `partyWithholds` stays
in `core/watch.ts` for the server's half, which is a different question and still
does work.

**The sentence that made this look wrong has been corrected.**
`core/micNeeded.ts` said the film *"is coming out of another app"* — true, and
it reads as though it means another app on the same phone, which is the reading
that would make an exclusive claim silence it.

## Occupancy

**An occupant publishes or subscribes, at least one.** A nearby person does
neither and is therefore not an occupant. Which settles three predicates without
further argument: a nearby person does not open anybody's microphone, does not
make anybody's session a call, and does not make a recording legal. **Somebody
alone in a room with three nearby people is alone.**

## Notifications

**Suppress an arrival notification only for the occupants of that room**, where
it used to be suppressed whenever the recipient was in the app.

That is the whole point of the pair. Somebody nearby with the app open is
*asking* to be told, and is exactly the person the old rule silenced. It also
silenced somebody sitting in a different channel, or on Home, about a room they
were not in.

**Say it as *suppress for occupants*, not as *suppress in `playAndRecord`*.**
The two were taken to be the same, on the grounds that everybody stepped in
claims the audio. **Guests are where they come apart**: a guest without a speech
grant subscribes, so they are an occupant, and takes playback only, so they hold
no claim. The `playAndRecord` phrasing would notify somebody about an arrival
they are sitting there listening to.

**In the code this is one field.** `notifications.arrived` is sent only to the
channel's **absent** participants, and an absent participant is never an
occupant — so the suppression set is empty and `reachesInApp: true` says so.
That also pulls `collapseKey` and `reachesInApp` apart for the first time,
which is why they were two fields.

## Behind Labs

**Stepping in nearby, and declaring nearby, both sit behind `labs`** until there
is a UI worth shipping. **Both are plain labelled buttons in the scrollable body
of the channel view**, not icons in the footer: the footer is for the controls
somebody reaches for without reading, and a way of being in a room that has to
be explained is a button with words on it.

**Off means the declarations do not exist.** It does not mean a nearby person is
rendered differently, and it has no bearing on the inferred kind, which is not
an experiment and predates all of this.

**Nothing else here is gated.** The exclusive claim on step-in, the notification
rule and the watch-party simplification are the design rather than the
experiment, and hiding them behind a flag would mean shipping two audio designs
at once — which is the thing this whole review existed to stop.

## What this removed

Half the work was deletion, and it is the half that makes the claim of
simplicity true. Each of these existed to answer a question this design stops
asking.

| what | why it went |
| --- | --- |
| `otherAudio` — the tri-state, the `[foreground]`-keyed read, the `null`-is-not-`false` rule | Its whole job was choosing between CALL and IDLE for a quiet channel. Step-in claims unconditionally. **The least trustworthy input in the system left with it** — it reads true only while this app is active, which is a fact about our own foreground wearing another app's name. |
| `onOtherAudio`, `secondaryAudioHint`, the silence-hint observer | Instruments for the question above, and one is a recorded negative: `silenceSecondaryAudioHintNotification` never fired once. The negative is kept here; the code had nothing left to measure. |
| `waitingAlone` | The solo wait existed to keep a phone alive in an empty room *without* claiming audio. Step-in claims outright; nearby is deliberately mortal. No middle case left. |
| `app/modules/keep-alive`, whole | It played silence when `hasAudio` was false. Stepped in is always a claim, and nearby is meant to be suspended. |
| the occupancy clause in both core predicates | **The single largest simplification.** The session follows your own mode, not who else is in the room. |
| the watch-party clause in both core predicates | See above. `partyWithholds` stays for the server. |
| `handBack` | It carried the watch-party answer into the session. Nothing carries it now. |
| `IDLE`, and every use of `mixWithOthers` | See *Nearby holds no session at all*. |
| `recordingAsked` as an input to the audio predicates | It existed because a recording reopened a microphone that being alone had closed, a round trip after the tap. The device is open before the button now. Its other job, holding `START_RECORDING` until a track exists, is unchanged. |

**`holdForPlayout` was on that list and is still here.** It holds the microphone
open, muted, while anything is subscribed, so the engine is never restarted
under a rendering receiver — and stepping in now *is* an open microphone, so for
a member the restart it guards cannot happen. It is scoped so it can never open
one for a guest, and otherwise left alone: it was one of two fixes for a fault
that took weeks to find, and the argument that it is unreachable is an argument
rather than a measurement. **It leaves when a device says the freeze does not
come back without it.**

**The bench is still here too.** `app/src/ui/AudioLabView.tsx`, with `configure`
/ `startInput` / `stopInput` in `AudioRouteModule.swift`, reached from Home for
an account with the `debug` column. It never established whether any of this
survives LiveKit — every reading above was taken outside a channel, with only
iOS writing the session — and that is the question it is being kept for.

## What is still open

**The design is decided. These are things to measure, not things to choose.**

- **Does self-mute disable the recording engine?** The gate on the most. If it
  does, the observer sees playout-only at every mute and crosses `playAndRecord`
  to `playback` — a category change, a Bluetooth route handover, and the
  2026-08-19 route loss from a new direction. It decides whether
  `holdForPlayout` can go and whether a mute is audible on a headset. **Two
  phones and a mute.**
- **Does any of this survive LiveKit?** Every reading above was taken outside a
  channel with only iOS writing the session — deliberately, that being the right
  first question. Three writers share this session and the bench measured one.
- **Does `notifyOthersOnDeactivation` still reach the other app** when the SDK
  has already deactivated a moment earlier? See *Releasing is one operation*.
- **Does the A2DP split echo?** Needs a far end and a second person.
- **The UI beyond the two buttons.** Undecided, and the reason the pair is
  behind `labs`.
