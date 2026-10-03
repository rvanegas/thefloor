# The screen keeps its microphone

A device showing a watch party's film used to close its microphone while the
film played — `isScreening` in core/micNeeded.ts, since 2026-09-17 — so that
`sessionFor` could ask for `playback` and the film played in stereo instead of
the mono, ducked, voice-processed sound an open microphone forces. The comment
recording that named its price as *a profile handover at every pause, paid
knowingly*.

The price was something else, and it was measured rather than reasoned about.

**Build 277, instrumented.** A press of Play left the application in 40 to 120
milliseconds. `engine stop play=F rec=F` then landed at **0.92 to 1.11
seconds**, with the category change immediately behind it, and the film started
somewhere between 1.2 and 3.0 seconds after the press. A press of Pause — which
tears nothing down, because the device is being *taken* rather than released —
moved category in **0.27 to 0.41 seconds, every time**. One resume in the log
happened not to move the session at all and took a single follow tick.

So the second somebody waited for on every resume was the microphone being
torn down and taken back. Not `AVAudioSession` being slow, and not the
Bluetooth profile handover, which the same log shows happening on the speaker
as well.

**So the device is held for the length of the party and the configuration
changes instead.** `SCREENING` in `app/src/audio/session.ts`: `playAndRecord`
so nothing is released, `default` rather than a voice mode, and
`allowBluetoothA2DP` rather than `allowBluetooth`.

Each of those three is the same argument, which the nine configurations
measured on 2026-09-08 had already made and which this reuses: **the category
costs nothing and the mode costs everything.** `videoChat` is what asserts
`duckOthers` behind the caller's back and runs the voice processor over
whatever is playing; `allowBluetooth` is the hands-free profile, mono at 24kHz,
visible in the build 277 log as `BluetoothHFP sr=24000` against
`BluetoothA2DPOutput sr=48000` a few lines away. Take both away and a
`playAndRecord` session is a perfectly good way to play a film.

**Nothing is published from it.** `intentFor` answers `muted` while screening,
which holds the device open and sends nothing — and a run with a screen in the
room is enforced-muted for its length anyway, so there was never anything for
this device to contribute. What it gives up is the system echo canceller, which
a state that captures for nobody does not need.

**The observer had to learn about it, which is why `policyFor` stopped being a
constant.** The SDK's native policy observer re-applies a configuration on
every audio-engine transition, and this file's governing rule is that every
writer must write the same thing because whoever writes last wins. While the
film plays, what this app applies for a recording device is `SCREENING` — so
the observer is armed with that, or a transition nobody asked for would put the
film quietly back under a voice mode. That is the 2026-08-19 route loss
arriving by a third door, and it is now the thing `policyFor(true)` is tested
for.

## What was deliberately not done

**Holding `LISTENING` for the whole party, pauses included.** It would remove
the transition just as well and keep the stereo, at the cost of the microphone
staying shut while paused — which breaks *pause, and everybody has their voice
back*, the rule the party mute follows the transport for. Ruled out.

**Keeping `CALL` and accepting the voice mode.** Also removes the teardown, and
costs mono 24kHz over a headset for the whole film. That is the thing everybody
came for, so no.

**Sequencing the play behind the session settling.** It was the first idea and
the measurement killed it: the player does not start until the teardown is
finished either way, so ordering the two changes nothing about how long it
takes.

## Measured on the device, build 278

**iOS granted the combination**, which was the one thing this entry could not
predict:

```
route BluetoothA2DPOutput(wachowskis) sr=48000
      AVAudioSessionCategoryPlayAndRecord/AVAudioSessionModeDefault
```

`playAndRecord` with `Default` and stereo A2DP at 48kHz, with the microphone
held — so the film keeps the quality that closing the device used to buy.
`moviePlayback` was not needed. The `BluetoothHFP sr=24000` lines in the same
log are all `ModeVideoChat`, which is `CALL`: the paused state, where the
conversation wants the voice profile. That is the split this was designed for,
arriving intact.

| | build 277 | build 278 |
| --- | --- | --- |
| resume | 1237–2212ms, median ~1400 | 538, 552, 582, 612, 750 — median 597 |
| pause | median 282ms | median 217ms |
| `engine stop` on a resume | every time, 0.92–1.11s | none |
| `categoryChange` on a press | every time | none |

Nineteen presses across the speaker and a Bluetooth headset. **The remaining
597ms is at the measurement floor**: `FOLLOW_TICK_MS` is 500 and
`watch playing after` is measured to the tick that observes arrival, so 538 and
552 mean the player was already playing when the follower next looked. What it
actually costs is below half a second and this instrument cannot see it.

## What is not yet known

Whether the lit microphone indicator during a film — the device being held —
is something anybody minds. It is already true of any self-muted member, and
it is new for somebody watching a film.

**The microphone indicator is now lit while a film plays**, the device being
held. That is already true of any self-muted member, but it is new for
somebody watching a film and it is visible.

**It interacts with *A film is not a defunct room*, written earlier the same
day, and does not replace it.** That entry's premise — the screening device has
*no track at all* — has moved: it now has one, and it is muted. Rule A counts
*transmitting* microphones rather than existing ones, so the room still
publishes nothing while a film runs and still needs `watch.status` asked. The
fix stands; only the reason there is nothing to count has changed.
