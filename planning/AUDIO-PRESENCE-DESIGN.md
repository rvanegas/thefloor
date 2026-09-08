# Stepping in, and stepping in nearby

**Temporary. A design being decided**, not a record of one that was. Rodrigo's,
stated 2026-09-08, after the bench in `AudioLabView.tsx` measured what the
audio session will actually do — `AUDIO-LAB-FINDINGS.md` is the evidence half
and this is the intent half. When it ships, what survives moves to
`decisions/` and both of these go.

This is the state machine and the vocabulary. The UI is two labelled buttons
and is described under *Behind Labs*; everything beyond that is undecided.

**Where everything is.** `AUDIO-LAB-FINDINGS.md` is the evidence half — nine
configurations measured on a device, and the two source comments that assert
the refuted version. `AUDIO-PRESENCE-REVIEW.md` is the earlier survey, partly
superseded and marked as such at its top; its naming section and its warning
about `useSessionAudio`'s four positional booleans still stand. The bench that
produced the readings is `app/src/ui/AudioLabView.tsx`, reached from Home for
an account with the `debug` column, with `configure`, `startInput` and
`stopInput` in `app/modules/audio-route/ios/AudioRouteModule.swift`. **Keep the
bench until this ships** — the one question it never answered is whether any of
it survives LiveKit, every reading having been taken outside a channel with
only iOS writing the session. Its lines reach the server journal:
`journalctl -u thefloor | grep 'lab '`.

---

## The shape

**Two ways to be in a room, and the difference is whether you claim the audio
system.**

- **Stepped in** — the phone takes `playAndRecord` immediately, **exclusive**:
  no `mixWithOthers`. Another app's audio stops. You publish and you subscribe.
- **Nearby** — no claim on audio at all, and no subscription to the media room.
  Another app plays untouched.

Nearby is reachable two ways: **declared** (step in nearby, or step in and then
declare nearby, which abandons the claim), or **inferred**, which is what the
word already means today.

## Why exclusive, which is the change

**So that an arriving voice is not competing with a podcast.** The point of
standing in a room is to hear somebody the moment they speak, and a voice mixed
under another app's audio is a voice you have to attend to rather than one you
simply hear.

**This reverses `core/micNeeded.ts`'s standing principle** — *being in an empty
channel should cost the speakers nothing* — and it is deliberate. The cost is
paid knowingly and **nearby is the escape hatch**: somebody who wants to be
reachable without their music stopping steps in nearby instead. The old rule
tried to serve both intentions with one state and had to guess which was meant.

**The mixing question was worth answering even though the answer is not being
used.** `playAndRecord` turns out not to be exclusive — `AUDIO-LAB-FINDINGS.md`
— so exclusivity is now a *choice* rather than a constraint inherited from a
misattribution.

## Promotion

Nearby, **foreground**, somebody **steps in with their microphone open** → the
phone takes the exclusive `playAndRecord` and **the user becomes audible.** Not
listen-only.

**The trigger is the arrival, not the first word**, and that is the whole of
what makes it affordable. First words typically come a few seconds after
somebody steps in, and those seconds are what the media connection has to get
up in. Keying it on speech would start the reconnect at the exact moment there
was already something to miss.

It is also a fact the app already has: an arrival comes over the ordinary
websocket in channel state, which a nearby phone is still receiving. Nothing
here needs the media room, which is what nearby has no subscription to.

**Somebody already stepped in does not promote you, and this is the common
case rather than a corner.** The trigger is the *arrival*, so declaring nearby
in a room where somebody is already talking leaves you nearby, hearing nothing,
until the next person steps in. That is intended: you chose nearby, and
promotion is for arrivals.

**The screen must not contradict the silence.** A speaking indicator is the
visual accompaniment to audio, and the two are present or absent together —
somebody who is not subscribed sees nobody speaking. **This already holds by
construction** and is worth not breaking: `speakingHere` in `ChannelView` is
`audioIsThisChannel && inRoom(channel, id) && audio.speaking.includes(id)`, and
`audio.speaking` is the LiveKit room's active speakers, so no subscription
means an empty list. The roster still shows who is *present*, which is honest —
it says they are there, not that you can hear them.

Nearby, **background** → others see *Nearby* and may ping. On foreground, the
same promotion.

**iOS permits this and would not permit the reverse.** A backgrounded app is
refused a *new* microphone — measured on build 146, four minutes with no engine
start — so promotion has to happen in the foreground, and this design only ever
asks for it there.

## Bluetooth

**Mono whenever there is an audio claim at all.** `videoChat` with
`allowBluetooth`, which is today's `CALL`: the echo canceller on, and a headset
on the hands-free profile for as long as the claim lasts.

**The A2DP split is not being taken**, though it was measured to work — row 8
of the findings kept a headset in stereo at 48 kHz by capturing from the phone.
It is declined rather than unavailable: it costs the echo canceller, and it is
unsafe with a mic-less Bluetooth speaker, where the far end comes out of a
loudspeaker into an open microphone in the same room. **Being nearby is how you
keep stereo**, because being nearby claims nothing.

## Vocabulary

**One word, made more inclusive.** *Nearby* keeps its meaning — within reach,
one notification away, ping rather than give up — and stops being only what
happens *to* somebody. It is now also something you can declare.

**Nothing else about it changes**, and that is the point: nearby is not kept
alive, it lapses to *Stepped out* after `WAITING_WINDOW_MS`, and that machinery
already exists. This design adds a way in, not a lifetime.

`GLOSSARY.md` § *Nearby / Stepped out* needs its first line widened when this
lands; the rest of the entry stands.

## Nearby has three ways in and one clock

- **Declared** — step in nearby.
- **Declared** — step in, then declare nearby, which abandons the claim.
- **Inferred** — stepped in, and the websocket goes before the inattention
  clock expires. Lose the socket first and it is *Nearby*; outlast the
  attention clock first and it is *Stepped out*. Whichever expired first is
  what describes it.

**One clock governs all three, and it measures the last sign of life** rather
than the moment anything was declared. That is the same question in every
case — how long since we heard from you, which is how likely a ping is to
reach you.

**It is already one constant.** `ATTENTION_WINDOW_MS = WAITING_WINDOW_MS` in
`app/src/state/attention.ts`. The unification is a principle being stated, not
a change being made. It also covers the third case Rodrigo named: somebody
alone in a room, muted, expecting nobody, is spending the same fifteen minutes.

Traced through, a declared nearby therefore reads:

- **Foreground** — the app is alive, `stillHere` keeps stamping, and the card
  reads *Nearby* continuously. Which is true: they are sitting there and will
  see an arrival.
- **Pocketed** — no audio claim, so iOS suspends within about a second, the
  socket goes, and `lastPresentAt` freezes at the last thing actually heard.
  Fifteen minutes from there.
- **Then** — *Stepped out*. Stop pinging.

So *nearby is not kept alive* is a statement about the **process**, and the
roster label follows from it rather than fighting it.

**The attention rules need no nearby case.** Rule A and Rule B act on people in
`present`, and a nearby person is not one.

## How it reaches other clients

**The observer side needs no new field.** *Nearby* is carried by
`state.waiting`, a `UserId[]` already on `ChannelState` and already sent;
clients render it through `isWaiting`. `stepOut` adds somebody to `waiting`
when and only when `exit === 'dropped'`.

So a declared nearby has only to land in `waiting`, and **every existing build
renders it correctly, with a ping, unchanged.** Backwards compatible by
construction.

**The wire addition is the new client→server action** — *step in nearby*, and
*declare nearby* — and nothing in the snapshot.

**A fourth `Exit` reason is worth adding for legibility, behaving exactly as
`'dropped'` does** in both fields it touches: joins `waiting`, and does **not**
stamp `lastPresentAt`. The second half is what implements the one clock — the
stamp is left to the transport, so it stays fresh while the app is alive and
freezes when the phone suspends. Filing a deliberate declaration under
`'dropped'` would work and would read as a lie in every log that prints it.

## Three states, and they are distinct

**Stepped in unmuted · stepped in muted · nearby.** Not two.

Stepped in muted and nearby are the pair that reads alike from outside and is
not alike at all: a muted person **hears the room**, holds the audio claim, and
is an occupant. A nearby person hears nothing, claims nothing, and is not.
Muting is about what you send; being nearby is about whether you are in the
room at all.

## Watch parties

**`playAndRecord` throughout, and no special case.** The film plays on another
*device*, so a phone holding the audio system does not silence it. While the
video runs, occupants are **muted but still publishing and subscribing** —
which is ordinary self-mute, not a fourth state.

**So the withholding clause leaves both core predicates.** Today
`microphoneNeeded` and `channelHasAudio` each open with `if (channel.watch &&
partyWithholds(channel.watch)) return false;`, and `handBack` carries the same
answer into the session. A mute does the same work with machinery that already
exists for another reason.

**Settled: the film is a browser on another device.** `core/micNeeded.ts` says
it *"is coming out of another app"*, which is true and reads as though it means
another app on the same phone — the reading that would make an exclusive claim
silence the film. It does not. **That sentence wants correcting in the same
commit as this change**, since it is the only thing that makes this section
look wrong.

## Behind Labs

**Stepping in nearby, and declaring nearby, both sit behind `labs`** until
there is a UI worth shipping. `AccountSettings.labs` in `core/settings.ts`
already exists, defaults false, and carries the reasoning: *an experimental
feature that arrives without being asked for is not experimental — it has
shipped.*

It is account-scoped, so it follows somebody to a second phone, which is right
for this: the pair is a way of being in a room rather than a property of a
handset.

**Both are plain labelled buttons in the scrollable body of the channel view**,
not icons in the footer. The footer is for the controls somebody reaches for
without reading, and neither of these is that yet — a way of being in a room
that has to be explained is a button with words on it.

**Off means the declarations do not exist** — no step-in-nearby, no way to
declare it after the fact. It does not mean a nearby person is rendered
differently, and it has no bearing on the inferred kind, which is not an
experiment and predates all of this.

**Nothing else here is gated.** The exclusive claim on step-in, the notification
rule and the watch-party simplification are the design rather than the
experiment, and hiding them behind a flag would mean shipping two audio designs
at once — which is the thing this whole review exists to stop.

## Guests

**Playback only until permitted to speak.** A guest whose token cannot publish
does **not** take the exclusive claim: opening a device microphone that nothing
is allowed to carry would buy the full call-profile handover — a headset
dragged to hands-free, other apps stopped — to publish nothing.

**So *stepped in* names two session configurations, and the two predicates do
not collapse into one.** That was the hope; the guest is why it cannot happen.
The divergence is narrower than today's, but it is real and permanent.

**It does not mix.** A guest's session is `playback` **without**
`mixWithOthers`: exclusive, but listen-only. Guest audio should resemble a
member's in every respect except permission to speak, and letting somebody's
podcast play over the voices a guest is listening to would single out the one
person who cannot do anything about it.

**This configuration existed and was deleted.** `session.ts`: *"`LISTENING` was
`IDLE` without `mixWithOthers` and went at build 90 for interrupting other
apps."* It returns **for the reason it was removed** — interrupting other apps
is the intent here rather than the defect. Worth restoring the name with it.

**One consequence, audible.** A guest granted permission to speak crosses from
`playback` to `playAndRecord`, which on a Bluetooth headset is an A2DP to
hands-free handover — stereo to mono, at the moment they are told they may
talk. Nothing is wrong with it and nobody will expect it. A listening guest is
therefore on a *better* route than a member, which is a consequence of not
needing a microphone rather than a decision.

## Nearby holds no session at all

**Not `IDLE`. Nothing.** The session is deactivated, with
`notifyOthersOnDeactivation`.

`IDLE` — `playback` with `mixWithOthers` — made sense while a nearby-ish phone
was still *connected*: you hold a playback session because a voice could arrive
at any moment. **Under this design nearby has no media subscription, so nothing
can arrive.** The session would assert a readiness for audio that cannot
happen, and it would not even buy process lifetime, an active session with
nothing flowing being exactly what iOS suspends.

**And deactivation is the thing that gives the audio system back.** Every
`Release` in the 2026-09-08 lab run deactivated with
`notifyOthersOnDeactivation` and the other app returned to full rate every
time — see `AUDIO-LAB-FINDINGS.md`. Going nearby is *meant* to give somebody
their podcast back, and only deactivating says so; holding a mixing playback
session leaves us gripping something and tells the interrupted app nothing.

**So `IDLE` leaves the design, and leaves the codebase** — and with it the last
use of `mixWithOthers` anywhere. Nothing mixes: a phone has either claimed the
audio system or released it. That also makes *no claim on audio* literal rather
than approximate, which is what nearby was defined to mean.

### Releasing is one operation, and it is coupled to the teardown

**You hold a session if and only if you are stepped in.** Nearby, stepped out,
and not in a room are one audio state, and it is *none*. There is no case where
the app holds a session it is not using.

**And the SDK's observer already does it**, which is the thing that makes this
cheap. `IOSAudioSessionPolicy` carries a third field beside the two
configurations:

> `deactivateOnStop` — *whether to deactivate the audio session when both
> playout and recording are disabled. Defaults to true.*

So the release happens natively, at the engine transition, on the audio worker
thread with no JavaScript in the path. **Nothing has to be armed with anything
harmless, because the harmless thing is deactivation and it is what the
observer does by default.**

**The observer's three engine states are this design's three audio states**,
which is why the whole of it fits the SDK rather than fighting it:

| engine | policy field | state |
| --- | --- | --- |
| recording enabled | `recording` | **CALL** — stepped in |
| playout only | `playout` | **LISTENING** — guest without a speech grant |
| neither | `deactivateOnStop` | **deactivated** — nearby, stepped out, not in a room |

So `policyFor` becomes `{ recording: CALL, playout: LISTENING,
deactivateOnStop: true }`, and **there is no slot left that wants a mixing
configuration.**

**Set `deactivateOnStop` explicitly rather than relying on the default.** The
header on `policyFor` in `app/src/audio/session.ts` records why: the native
side reads a missing key as *false* where the SDK wrapper defaults it to
*true*, so a call that omits it can leave the session active after the last
engine stop, silently.

**Every exit from stepped-in takes the same path**: a tap on step out,
declaring nearby, and Rule B retiring an unattended phone. A process that is
suspended outright releases nothing, because it cannot — the session dies with
it, which is the same outcome by a different route and needs no code.

### The three, entire

| | configuration | who |
| --- | --- | --- |
| **CALL** | `playAndRecord`, exclusive | stepped in — member, or guest who may speak |
| **LISTENING** | `playback`, exclusive | guest without a speech grant |
| — | **deactivated** | nearby, or not in a room |

## Occupancy

**An occupant publishes or subscribes, at least one.** A nearby person does
neither and is therefore not an occupant.

Which settles three predicates without further argument: a nearby person does
not open anybody's microphone, does not make anybody's session a call, and does
not make a recording legal. Somebody alone in a room with three nearby people
is alone.

## Notifications

**Suppress an arrival notification only when the recipient holds the audio
claim** — where today it is suppressed whenever they are in the app.

That is the whole point of the pair. Somebody nearby with the app open is
*asking* to be told, and is exactly the person the current rule silences.

**Narrower than what it replaces**, and that is the point: today an arrival is
suppressed whenever the recipient is *in the app*, so somebody sitting in a
different channel — or on Home — is silenced about a room they are not in.
Suppression now reaches only the people in that room.

**Say it as *suppress for occupants*, not as *suppress in `playAndRecord`*.**
The two were taken to be the same, on the grounds that everybody stepped in
claims the audio. **Guests are where they come apart**: a guest without a
speech grant subscribes, so they are an occupant, and takes playback only, so
they hold no claim. The `playAndRecord` phrasing would notify somebody about an
arrival they are sitting there listening to.

The question underneath is *will they hear it*, and **subscribing is what
answers that** — which is also the formulation the server already holds, so it
still needs no new signal on the wire. It coheres with the promotion rule
above: the people notified are exactly the people who were not going to hear
the arrival anyway.

---

## Things an implementer needs that are not the design

**Three writers share the process-wide session, and the last one wins.** This
app, the SDK's native policy observer at every audio-engine transition, and
WebRTC re-applying its own defaults. That is why `policyFor` exists at all —
to hand the observer the same answer this app would apply, so the two cannot
disagree — and it is why **reading back the value you asked for proves
nothing.** `app/modules/audio-route`'s `snapshot()` reads `category`, `mode`
and `categoryOptions` off the live session, and that is the only evidence worth
having. See `POSTMORTEM-echo.md` before touching any of it.

**`SessionWant` probably does not survive, and does not need a third value.**
It is `'call' | 'idle'` in `session.ts`, and three functions fan out of it —
`sessionFor`, `policyFor`, `androidSessionFor`. But **the three states here are
*engine* states rather than values this app computes**: recording enabled is
CALL, playout only is LISTENING, neither is deactivated, and the observer
distinguishes them on the audio worker thread without being told. A guest
cannot publish, so their engine is playout-only without anybody deciding it.
`policyFor` stops being a function of anything and becomes a constant.

**One question decides whether that holds — and it decides `holdForPlayout`
too.** *Does self-mute disable the recording engine?* If it does, the observer
sees playout-only and crosses `playAndRecord` to `playback` at every mute,
which is a category change and therefore a Bluetooth route handover: the
2026-08-19 route loss, arrived at from a new direction. If it does not, or if
`holdForPlayout` is what prevents it, then the engine stays in recording
through a mute and the mapping is safe.

**The bench cannot answer this** — it has no LiveKit in it. It wants the real
app, two phones and a mute.

### Android

**Two of the three states are already right, and the third is the only work.**
Android has no `deactivateOnStop` and no observer to agree with — `pushPolicy`
returns early off iOS deliberately — so nothing releases focus on this app's
behalf and the release has to be explicit.

**Both existing presets request `gain` audio focus, so `ANDROID_IDLE` already
stops other apps.** The mixing this platform never verified is mixing it never
did. Which makes the mapping fall out:

| state | Android | status |
| --- | --- | --- |
| **CALL** | `ANDROID_CALL` — `inCommunication`, voiceCall stream, `gain` | already correct |
| **LISTENING** | `ANDROID_IDLE` — media stream, `gain` focus | already correct; **wants renaming**, it was only ever called idle because iOS's `IDLE` mixed |
| **no claim** | — | the gap |

**For the gap, do both halves.** Do not start the audio session at all — a
nearby phone has no media connection, so `startAudioSession` never runs and
`applyAndroidConfiguration` is never called, and this may already be free —
**and** assert `manageAudioFocus: false` with `audioMode: 'normal'` on any path
that could have configured it earlier. Being explicit is what iOS gets for free
from `deactivateOnStop`; on Android it has to be said.

**The foreground service is the other half and already works out**: it is keyed
on `mediaRoom`, so a nearby phone drops it with nothing changed. Confirm rather
than assume.

**A bonus worth noticing**: this removes Android's only unverified audio claim.
Nothing needs to mix any more, so `ANDROID_IDLE`'s note that the mixing
behaviour *"is not expressible as one flag here and has not been verified"*
stops describing a risk. `planning/ANDROID.md` is the standing document.

**One step needs the server before the client**, and only one. The new
client→server action — *step in nearby*, *declare nearby* — must be taught to
the server and deployed first, then the client shipped. Everything else is
backwards compatible by construction, because the observer side rides on
`waiting`, which every existing build already renders. AGENTS.md § *Never ship
a wire change to a server before the client can speak it* is the rule and the
reason.

## What this removes

**Half the work is deletion, and it is the half that makes the claim of
simplicity true.** Each of these exists to answer a question this design stops
asking. Nothing here is a tidy-up: leaving any of them in place leaves a second
rule about the audio session, competing with the one above.

| what | where | why it goes |
| --- | --- | --- |
| `otherAudio` — the tri-state, the `[foreground]`-keyed read, the `null`-is-not-`false` rule | `app/src/audio/useSessionAudio.ts` | Its whole job was choosing between CALL and IDLE for a quiet channel. Step-in now claims unconditionally, so there is nothing to choose. **The least trustworthy input in the system leaves with it** — it reads true only while this app is active, which is a fact about our own foreground wearing another app's name. |
| `onOtherAudio`, `secondaryAudioHint`, the silence-hint observer | `app/modules/audio-route/` (Swift and `index.ts`), `useSessionAudio.ts` | Instruments for the question above, and one of them is a recorded negative: `silenceSecondaryAudioHintNotification` never fired once. Keep the negative in `AUDIO-LAB-FINDINGS.md`; the code has nothing left to measure. |
| `waitingAlone` | `useSessionAudio.ts`, and its references in `state/useAttention.ts` and `state/AppProvider.tsx` | The solo wait exists to keep a phone alive in an empty room *without* claiming audio. Step-in claims outright; nearby is deliberately mortal. There is no middle case left to hold open. |
| `app/modules/keep-alive` — the whole module, `startSilence` and its native half | the module, plus its caller in `useSessionAudio.ts` | It plays silence when `hasAudio` is false. Stepped in is always a claim, and nearby is meant to be suspended. Nothing is left for it to keep alive. |
| The occupancy clause — `roomOccupants(channel).some((id) => id !== me)` | both predicates in `core/micNeeded.ts` | **The single largest simplification.** The session follows your own mode, not who else is in the room, so neither predicate reads the roster for this any more. |
| The watch-party clause — `if (channel.watch && partyWithholds(channel.watch)) return false;` | both predicates in `core/micNeeded.ts` | The film plays on another device. Occupants mute while it runs, which is ordinary self-mute. `partyWithholds` itself stays in `core/watch.ts` for whatever else reads it. |
| `handBack` | `useSessionAudio.ts` and `wantFor` | It carried the watch-party answer into the session. Nothing carries it now. |
| `IDLE` and every use of `mixWithOthers` | `app/src/audio/session.ts` | See *Nearby holds no session at all*. `deactivateOnStop` covers the case `IDLE` was kept for, so no slot wants a mixing configuration. `nameOf` loses its `IDLE` arm with it. |
| `holdForPlayout` — **probably, and check rather than assume** | `useSessionAudio.ts` | It holds the microphone open so the engine is never restarted under a rendering receiver. If stepped in always means an open microphone, the restart it guards cannot happen. **Confirm on a device before deleting**: it was one of two fixes for a fault that took weeks to find. |
| `app/src/ui/AudioLabView.tsx`, and `configure` / `startInput` / `stopInput` in `AudioRouteModule.swift` | the bench | **Keep it until this ships**, then delete it with its answer. It never established whether any of this survives LiveKit — every reading was taken outside a channel with only iOS writing the session. |

**Two comments must change in the same commit as the behaviour**, both currently
asserting what the device refuted: the header on `channelHasAudio` in
`core/micNeeded.ts`, and the `SessionWant` comment in `app/src/audio/session.ts`
that says *there is no configuration that both holds the call route and lets
another app play*. `AUDIO-LAB-FINDINGS.md` § *What was falsified* is the record.

**And `GLOSSARY.md` § *Nearby / Stepped out* wants its first line widened**, so
that *Nearby* stops being only what happens to somebody.

## Open, and blocking nothing yet

- **Promotion is a media reconnect**, and that is the operation with the
  history — though keying it on the arrival rather than on the first word
  gives it a few seconds of headroom it would otherwise not have. Nearby holds
  no subscription, so promoting means connecting to the
  room and opening the microphone — the re-entry that froze playout for weeks
  and that `deferSubscribe` and `holdForPlayout` exist to survive. Under this
  design it stops being something a person does occasionally and becomes
  something that happens automatically, mid-conversation, the moment somebody
  speaks. **The riskiest operation in the stack becomes the most frequent.**
- **Whether a guest's `playback` session mixes.** See *Guests*.
- Nothing. The design is complete; what remains is building it.
