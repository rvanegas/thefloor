# Plan — Apple Speakers Interaction

Making it possible to hang out in a channel and still send audio to a Bluetooth
speaker, **specifically for the case where nobody else is in the channel**.

From FEATURES.md, "Apple Speakers Interaction". Not one of the four standing
documents: this is scaffolding, to be deleted once the work lands and the
reasons have moved into DECISIONS.md.

---

## What is actually wrong

Joining a channel takes the AVAudioSession as a *call*. That drags a Bluetooth
speaker from A2DP — stereo, music-grade — down to HFP, the mono ~16 kHz
hands-free profile, and makes any other app's audio unusable for as long as you
are in the channel.

Two lines do it, both in `app/src/audio/useSessionAudio.ts`:

| | |
| --- | --- |
| `AudioSession.startAudioSession()` (:133) | a bare `RTCAudioSession.setActive(true)`, which activates with whatever category WebRTC defaults to — `playAndRecord` / `voiceChat` |
| `setMicrophoneEnabled(true)` (:140) | turns the recording engine on; the native policy `registerGlobals()` installs then applies `playAndRecord` + `allowBluetooth` + `videoChat` |

When you are the only one present, neither buys anything — there is nobody to
hear the microphone. The library's own playout-only policy, in
`@livekit/react-native`'s `getDefaultAppleAudioConfigurationForAudioState`, is
`playback` + `mixWithOthers` + `spokenAudio`: A2DP is left alone and other apps
keep playing.

So the fix is not to be a call until there is a conversation.

---

## The change

### 1. `app/App.tsx` decides what the microphone is for

```ts
const micNeeded =
  !!live &&
  (live.present.some((id) => id !== me) || isRecordingActive(live.recording));
```

Passed to `useSessionAudio` as a fourth argument, keeping the hook's existing
posture: it is told, it does not decide.

**Recording is the exception that matters.** `core/channel.ts:130` says one
person alone may record — a note to yourself is a use rather than a mistake —
so a solo recording has to hold the microphone open with nobody there. A rule
written only as "alone means closed" would silently record silence.

### 2. `useSessionAudio` opens the microphone only when it is needed

- Stays connected to the room throughout. Presence, arrival detection and the
  shared-playback track (the server's `media` participant) are untouched.
- Applies `setAppleAudioConfiguration({ audioCategory: 'playback',
  audioCategoryOptions: ['mixWithOthers'], audioMode: 'spokenAudio' })` before
  `startAudioSession()` when the microphone is not needed, and again whenever it
  closes the microphone.
- Publishes only when `micNeeded && !selfMuted`. On the way back up nothing has
  to be applied by hand: the native policy applies the recording configuration
  when the engine starts capturing.
- Reads `micNeeded` through a ref inside the connect effect, so a change to it
  does not tear down and rebuild the room.
- Guards the Apple-only call with `Platform.OS === 'ios'`.

**The explicit `startAudioSession()` stays**, rather than skipping activation
while alone. The comment at :126–132 records what leaving activation to the
automatic path cost last time: after a party left and rejoined, the other side's
playback never resumed — subscribed, reporting healthy, and silent. An active
session in the `playback` category is invisible to a Bluetooth speaker, so the
ordering that fixed that bug survives at no cost.

### 3. The interface tells the truth about a closed microphone

`SessionAudio` gains `micOpen`.

ChannelView's "Your microphone" card says "Open. Self-mute never affects floor
eligibility." whenever you are not muted, which becomes false while you are
alone — and a closed microphone nobody mentioned is exactly the kind of silent
state this codebase keeps writing comments about. It should say the microphone
is closed until somebody else is here, and that this is what leaves the speakers
to your other apps. `describeAudio`'s "waiting for anyone else to be audible"
line gets the same treatment.

### 4. Tests

`app/src/ui/__tests__/views.test.tsx` needs `micOpen` in its `AUDIO` fixture and
a case pinning the alone copy. The audio behaviour itself stays device-verified,
per the note already in that file — no test opens a microphone.

### 5. Documents

An entry in DECISIONS.md: why the microphone closes when you are alone, why
recording is the exception, and why the session is left active anyway. Remove
the item from FEATURES.md. Delete this file.

---

## What this does not do

- **Two people is still a call.** Once anyone else is present, the session is
  `playAndRecord` again and Bluetooth drops to HFP. That is unavoidable while
  capturing and playing at once.
- **It cannot be verified here.** Neither the simulator nor the suite shows a
  profile switch. It needs a phone and a real Bluetooth speaker: play something
  from another app, enter an empty channel, confirm the music neither stops nor
  degrades, then have somebody join and confirm the microphone opens.

---

## Open question

Home's live-channel row carries a `muted` flag. The proposal is to leave it
meaning self-mute alone — the row already says how many people are present — but
it could equally read as muted whenever the microphone is closed.
