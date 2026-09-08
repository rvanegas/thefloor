# What the audio lab measured, 2026-09-08

**Temporary. The evidence half of unbuilt work.** Written the night the bench
in `app/src/ui/AudioLabView.tsx` was run for the first time. Delete it when the
redesign ships; whatever survives moves to `decisions/`.

Everything here is a **reading from a device**, not an argument. Where it
contradicts a comment in the code, the comment is what is wrong — and two of
them are.

The raw lines are in the server journal under `audio diagnostics`, from a debug
account, 2026-09-08 00:02–01:18. `journalctl -u thefloor | grep 'lab '`.
They rotate; this file is why the readings outlive them.

---

## The one sentence

**A capturing session can let another app go on playing, at full rate. The
category was never what cost that — the mode was.** And on a Bluetooth headset
a capturing session can keep A2DP stereo by taking its input from the phone,
but only outside a voice mode.

---

## What was falsified

`planning/decisions/` and two source files state that a `playAndRecord` session
is exclusive. The commit that established it, `0fd88c7`, concluded: *"the
option bought nothing and the category cost everything."*

**The category costs nothing.** `playAndRecord` + `mixWithOthers` + `default`
let a podcast play at 48 kHz with an input tap running, four phases, twice.

That experiment held `audioMode: 'videoChat'` fixed while varying
`mixWithOthers`, so it could not separate the two. Apple's own header for
`AVAudioSessionCategoryOptionMixWithOthers` documents the combination as valid
— *"allowing other applications to play in the background while your app has
both audio input and output enabled"* — and the voice-chat modes are documented
as asserting `duckOthers` behind the caller's back.

**Two places to correct when the redesign lands**, both currently asserting the
refuted version: the header of `channelHasAudio` in `core/micNeeded.ts`, and
the `SessionWant` comment in `app/src/audio/session.ts` that says *"there is no
configuration that both holds the call route and lets another app play"*.

---

## Speaker pass, four rows, four phases each

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
  1 and 2 mean anything.
- **Row 3's readback still contained `mixWithOthers`.** The option was asked
  for and granted, and the mode ducked anyway — so `videoChat` does not win by
  clearing the bit. **`categoryOptions` cannot see this**, which is why no
  diagnostic panel in this repository could ever have caught it. Only the ear
  did.
- **Row 4: iOS edits the request.** Asked `[duckOthers, defaultToSpeaker]`, got
  `[mixWithOthers, duckOthers, defaultToSpeaker]`. Apple's header says it will.

### Two things the speaker pass settled incidentally

- **Capture is not what interrupts.** `input on` and `input off` changed
  nothing in any row. The ducking in rows 3 and 4 was already present at
  `@applied` — **activation is the event, not the microphone.**
- **Nothing ever stopped.** Row 3 ducked. Build 150's *"podcast played for a
  fraction of a second and stopped"* did not reproduce. One partial run read
  `silent` at 00:18:47 and did not repeat in the clean run; **unexplained
  rather than dismissed.**

---

## Headset pass, five rows — device `wachowskis`

| row | mode | Bluetooth option | output | input | rate | other app |
| --- | --- | --- | --- | --- | --- | --- |
| 5 | `default` | `allowBluetooth` | HFP | HFP | 24000 | mono |
| 6 | `default` | `allowBluetoothA2DP` | **A2DP** | **built-in** | 48000 | normal |
| 7 | `videoChat` | `allowBluetooth` | HFP | HFP | 24000 | mono |
| 8 | `default` | `allowBluetoothA2DP` | **A2DP** | **built-in** | 48000 | normal |
| 9 | `videoChat` | `allowBluetoothA2DP` | **Speaker** | built-in | 48000 | off the headphones |

**Row 7 is what ships.** `CALL` in `session.ts` is `playAndRecord` /
`videoChat` / `[allowBluetooth, allowAirPlay, defaultToSpeaker]`, and row 7
differs only by adding `mixWithOthers` — inert under a voice mode, as row 3
established — and by omitting `allowAirPlay`, which does nothing while a
Bluetooth headset is connected. **So the first line of this table's baseline is
a measurement of the shipping app: on a headset it is hands-free in both
directions, mono, 24 kHz.** Row 8 is what that costs.

**Row 9 is not what ships and is close to its inverse**: it permits A2DP and
forbids HFP where `CALL` permits HFP and forbids A2DP. It is in the table
because it answers whether the split survives a voice mode, not because
anything has ever been configured that way.

**Rows 6 and 8 are the same configuration asked for two ways**, once with
`defaultToSpeaker` and once without, and they agree. The split is real: A2DP
stereo out at 48 kHz, the phone's own microphone in, another app playing
normally, an input tap running.

**Rows 5 and 7 are indistinguishable in every reading**, which says the
handover is not the mode's doing: `playAndRecord` plus `allowBluetooth` needs
input from the headset, only the hands-free profile carries a microphone, and
the whole route goes. **Leaving the voice family buys nothing on a headset.**
The saving in row 8 comes from A2DP alone.

**Row 9 is the price.** Under `videoChat`, `allowBluetoothA2DP` does not keep
the split — the route leaves the headset altogether and lands on the phone.
A2DP carries no microphone, so a voice mode will not hold a Bluetooth output it
cannot also capture from; with no HFP permitted it abandons Bluetooth rather
than splitting.

**So the promotion is a route change, not merely a mode change.** Arriving in a
channel costs either mono at 24 kHz (rows 5 and 7) or the headphones entirely
(row 9).

### The design question this hands over

The rule it breaks is `session.ts` dropping `allowBluetoothA2DP`, and that rule
comes from 2026-08-21: a far end playing out of a **mic-less Bluetooth speaker**
into an open microphone in the same room. That is an argument about
loudspeakers. **Headphones in somebody's ears are not loudspeakers**, and the
echo path the voice mode exists to cancel is weak or absent when the far end is
in an ear canal.

Which suggests conditioning the mode on **the output route** rather than on
whether a call is happening: `default` while output is A2DP headphones,
`videoChat` when output is a loudspeaker. **Not decided. Not measured either**
— rows 8 and 9 show the route, and whether the split actually echoes needs a
far end and a second person, which this bench cannot produce.

---

## Measurement notes, for whoever runs it next

- **HFP is 24 kHz on this device, not 16.** Wideband mSBC. `session.ts` and the
  lab's own footnote both say 16 or 8, which is narrower than at least one real
  headset. The `<= 24000` threshold in the panel is what caught it.
- **The rate reported at `apply` is not trustworthy.** At 01:15:53 the same
  configuration read 48000 at apply and 24000 after `input on`. The route
  settles asynchronously; **read the rate after the input is running.**
- **Ducking cannot be judged on a Bluetooth headset, and this is structural.**
  Rows 5 and 7 differ only in mode and produced identical readings — same
  ports, same 24 kHz, same `went mono`. The speaker pass had shown `videoChat`
  ducking and `default` not, so a difference was expected here and none was
  recorded. That is not a mis-tap. **Applying either row hands the profile over
  in the same instant**, and mono at a third of the bandwidth is itself an
  apparent drop in loudness, so a level change arrives inseparable from two
  others.

  **And the pair cannot be fixed**: `videoChat` will not hold A2DP at all (row
  9), so on Bluetooth there is no configuration pair that varies the mode and
  holds the route. The comparison is unavailable on this hardware rather than
  merely difficult.

  It is also not needed. Rows 1 and 3 answered it on the speaker with the route
  constant, and the configuration this work is heading for — row 8 — is
  `default`, where nothing ducks on either route. **Wired headphones are the
  rig that would isolate it**, having no profile to negotiate, if the question
  is ever worth a trip.
- **Release recovered cleanly every time** — A2DP, 48000, empty input, other
  app playing normally. `setActive(false, .notifyOthersOnDeactivation)` is what
  does that, and a row run without it would measure the previous row's leftover.

---

## What is still unasked

- **Does any of this survive LiveKit?** Every reading here was taken outside a
  channel, deliberately. Three writers mutate this session — this app, the
  SDK's policy observer, WebRTC reapplying its defaults — and the bench
  measured iOS alone. That was the right first question and it is not the last
  one.
- **Does the split echo?** Needs a far end. See above.
- **Where does `otherAudioPlaying` fit now?** The predicate this whole review
  started from was a fork between *take the audio system* and *let the other
  app have it*. If a capturing session can mix, the fork may not exist — which
  is a question about the design rather than about the phone.
