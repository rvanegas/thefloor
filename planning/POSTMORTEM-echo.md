# The echo in build 17

Testers on build 17 heard themselves. This is what was wrong, how it was found,
and what was changed. The standing rationale for the code lives in
DECISIONS.md, under "The microphone stays closed while you are alone in a
channel"; this file is the incident.

---

## What was reported

> Some users are getting feedback. They hear themselves.

Then, an hour later, unprompted:

> Spontaneously, just now, Golf no longer hears feedback. At exactly the same
> time, my own audio transitioned from speakerphone to just phone audio, such
> that at maximum volume I can hear him only by putting the phone close to my
> ear.

The second report is the one that settled it. Held on to, rather than treated
as a separate annoyance, it named the mechanism outright — see
[The route was the tell](#the-route-was-the-tell).

---

## Reading the symptom backwards

"I hear myself" is never about the speaker's own device. Nobody is ever
subscribed to their own audio: `assertSilence` in `server/src/channels.ts`
skips `listener === speaker`, and LiveKit does not send a participant their own
publication in any case. The server was not the problem and could not have
been.

What you hear when you hear yourself is **the other person's loudspeaker
feeding their own microphone**. Your voice arrives at their phone, plays out,
is picked up again, and is sent back. The device at fault is the one that is
*not* complaining, and the thing that has failed on it is echo cancellation.

That reframing is the whole diagnosis. Everything after it is working out why
one particular phone stopped cancelling echo.

### Where echo cancellation comes from

On iOS it is not a WebRTC software feature you configure. It is the system
voice-processing unit, and it is switched on by the **AVAudioSession mode**:
`voiceChat` or `videoChat` gets it, and every other mode — including
`spokenAudio` — does not. Capture under a non-voice mode is a bare microphone
next to a loudspeaker.

So the question narrowed to: how did a phone end up capturing while its session
was in a non-voice mode?

---

## The change that caused it

Build 17 shipped commit `f2d5daf`, "Leave the speakers alone while you are
alone in a channel". The intent was good and the problem it solved is real:
joining a channel took the audio session as a *call* unconditionally, which
drags a Bluetooth speaker from A2DP down to the mono hands-free profile and
makes every other app's audio unusable for as long as you sit in an empty
channel waiting for somebody.

The implementation applied `playback` + `mixWithOthers` + `spokenAudio` when
the microphone was not needed, and applied **nothing** when it became needed
again — resting on this assumption, written into the code as a comment:

> Nothing to apply on the way up: the native policy installs the recording
> configuration when the engine starts capturing.

That assumption is false, for two independent reasons, and the two compound.

### 1. Closing the microphone does not stop capturing

`room.localParticipant.setMicrophoneEnabled(false)` mutes the track. It does
not release the device unless `stopMicTrackOnMute` is set, and that option
defaults to `false` (`livekit-client/src/room/defaults.ts:19`).

So the audio *engine* never left the recording state. Three consequences, only
one of which is the echo:

- the orange recording indicator stayed lit while "closed";
- a Bluetooth speaker stayed in HFP, so the feature the commit was named after
  did not work at all — except in the single case where no track had ever been
  published, which is why it looked like it did;
- and the session was being told `playback` while the hardware was still
  recording, which is not a state that means anything coherent.

### 2. The native policy reacts to transitions, and there were none

`registerGlobals()` installs an automatic policy that configures the session
when the audio engine changes state: `recording` config while recording,
`playout` config while playing out only. It is a good mechanism. It fires on
**transitions**.

With capture never stopping, there was no transition. Closing the microphone
forced `playback` + `spokenAudio` onto a live recording session, and opening it
again produced nothing for the policy to react to. The session simply stayed
where it had been put.

### The result

From the first time a user muted, or was briefly alone in a channel, their
phone captured under `spokenAudio` — no voice processing, no echo cancellation
— and stayed that way for the rest of the session, across arrivals and
departures.

That explains the shape of the report exactly:

- **why only some people.** Only the phones that had passed through a closed
  microphone were broken. A phone that joined a populated channel and never
  muted took the recording configuration normally and was fine.
- **why the complainer was not the broken one.** The person who mutes is the
  person whose partner hears the echo.
- **why it persisted.** Nothing in the ordinary run of a conversation puts the
  session back.

### One further trap, worth knowing beyond this bug

`AudioSession.setAppleAudioConfiguration` does not set a configuration for one
moment. It mutates `RTCAudioSessionConfiguration.webRTCConfiguration`
(`LiveKitReactNativeModule.swift:153`) — a **process-wide singleton** that
WebRTC re-applies on its own schedule. The native policy observer mutates the
same object (`AudioDeviceModuleObserver.m:535`).

There is no such thing as a temporary call to it. Leaving it saying `playback`
changes what the whole process does later.

---

## The route was the tell

Mid-investigation the tester reported the echo vanishing on its own, at the
same instant their audio dropped from the speaker to the earpiece.

That is one event, not two. The native policy observer finally fired on some
engine transition and applied *its* recording configuration:

```
playAndRecord + ['allowBluetooth', 'mixWithOthers'] + videoChat
```

- `videoChat` is a voice mode → voice processing on → **the echo stopped**.
- No `defaultToSpeaker` → `playAndRecord` routes to the receiver, which is
  where it goes unless told otherwise → **the earpiece**.

Two facts fell out of it, both of which changed the fix:

**There are three writers of this session, not one.** The app, the native
policy observer, and WebRTC re-applying its own defaults — all mutating the
same singleton, all with their own idea of what it should say. Whoever writes
last wins. The tester was watching them take turns. A fix that only makes the
*app's* writes correct is a fix that works until the next transition.

**`mixWithOthers` is not the culprit.** It was a live suspicion — it is
plausibly implicated in AEC failures, and it appears in both configurations.
But the echo stopped under a configuration that carries it. It stays, and other
apps keep playing.

> **2026-08-16: it no longer stays, and this paragraph's first half is still
> true.** `mixWithOthers` came off `CALL`, and off the new `LISTENING`, for the
> "Other Audio Output" work — so that a conversation pauses whatever else is
> playing, which is the whole point of that change. It did not leave because it
> was ever implicated in the echo; it was not, and the reasoning above is why
> that suspicion was dropped. It is still on `IDLE`, so an empty channel still
> leaves other apps alone. See `DECISIONS.md`.

---

## What was changed

Four changes, in `app/`. Nothing in `server/` or `core/`; no wire-protocol
change; the deployed server was already correct.

**1. `app/src/audio/session.ts` — one place that says what the session is.**
The two states, `PLAYBACK_ONLY` and `CALL`, as exported constants. Given the
three writers, the only survivable arrangement is that everything we control
writes identical values.

*`PLAYBACK_ONLY` is called `IDLE` since 2026-08-16, when a third state joined
it; the rest of this section reads as it was written. Everything below about
ordering and about `stopMicTrackOnMute` is unchanged and still load-bearing.*

**2. `CALL` is the SDK's own recording configuration.** Build 18 added
`defaultToSpeaker` to it, to stop the earpiece — see
[The tail](#the-tail-defaulttospeaker-cost-bluetooth-its-route), which is the
part of this story that did not go well.

**3. `index.ts` installs that policy natively.**
`setupIOSAudioManagement(true, { recording: CALL, playout: PLAYBACK_ONLY })`
replaces the SDK defaults that `registerGlobals()` installs. The observer now
writes the same values the app does, so a transition firing at an arbitrary
moment can no longer change what anyone hears.

**4. `useSessionAudio` applies both edges, in the right order, and really
closes the microphone.**

- Both directions are applied. Depending on a transition we do not control is
  what broke this.
- The ordering is opposite in the two directions, and that is the point: the
  session must already be a call **before** capture starts, and must stay one
  **until** capture has stopped. Configuring a `playback` session that is still
  recording is the original bug in one line.
- `new Room({ publishDefaults: { stopMicTrackOnMute: true } })`, so muting
  actually releases the device. This is what makes the engine transitions real,
  and it is what makes "leave the speakers alone" work for the first time.

---

## How to verify

None of this is visible from the test suite or the simulator: no automated
check here observes an audio route, a Bluetooth profile, or an echo canceller.
The suite passing means nothing was broken elsewhere, and no more than that.

On two phones:

1. Join a channel with somebody. Confirm the audio comes out of the **speaker**
   without holding the phone to your ear.
2. Mute, wait, unmute. Confirm the other person does not start hearing
   themselves. This is the case that was broken.
3. Have one person leave and rejoin. Same check.
4. Play music from another app, enter an **empty** channel, and confirm the
   music neither stops nor degrades — the original point of `f2d5daf`, which
   until now only appeared to work.
5. With a Bluetooth speaker: confirm it stays on A2DP in an empty channel and
   that the recording indicator goes out when the microphone closes.

---

## The tail: `defaultToSpeaker` cost Bluetooth its route

Build 18 shipped with `defaultToSpeaker` in the call configuration, added on
the strength of the earpiece observation above. Within minutes the tester
reported the next thing:

> when I connect to channel with bluetooth headphones, then self-mute, then
> un-self-mute, the audio remains on phone, no longer on bt headphones.

Caused by build 18, and by both halves of it at once: the option itself, which
is widely reported to beat Bluetooth HFP for output when set alongside
`allowBluetooth`, and `stopMicTrackOnMute`, which is what makes an unmute
renegotiate the route at all. Build 17 never reconfigured on unmute, so the
question never arose there.

Build 19 takes the option back out, returning `CALL` to the SDK's own recording
configuration — the only one observed working for Bluetooth, and the one the
echo was observed stopping under.

**That leaves the earpiece unfixed, and it is worth being plain about why.**
Two device reports, two static configurations, and each fixes one and breaks
the other:

| | no accessory | Bluetooth headphones |
| --- | --- | --- |
| without `defaultToSpeaker` | receiver — observed on 17 | works |
| with `defaultToSpeaker` | speaker | route lost — observed on 18 |

Neither is a configuration error. **The correct output depends on what is
connected, and nothing in this stack can see what is connected**:
`selectAudioOutput` is a blind `overrideOutputAudioPort` that overrides
headphones too, `enumerateDevices` returns the built-in microphone and no
outputs, and neither package surfaces `currentRoute` or a route-change
notification. A speaker button, or a small native module, is the way out. Both
are in BACKLOG.md.

The lesson is the same one as the original bug, arriving a second time in one
afternoon: a plausible sentence about iOS routing, shipped without a device to
check it on. `defaultToSpeaker` is documented to yield to connected accessories.
It did not.

## What this cost, and the general lesson

The bug shipped because a plausible sentence went unverified: *the native policy
installs the recording configuration when the engine starts capturing*. It is
true in isolation. It was false in context, because the engine never started
capturing — it had never stopped.

Two habits would have caught it:

- **Asymmetric state transitions deserve suspicion.** The code applied a
  configuration in one direction and relied on somebody else for the other. Any
  time the way down and the way up are handled by different mechanisms, the
  question to ask is what happens when the second one does not run.
- **Shared mutable global configuration has no "temporarily".** Once it was
  clear that three components write one singleton, "our call is correct" stops
  being a meaningful standard. The only stable arrangement is agreement.

Neither is specific to audio.
