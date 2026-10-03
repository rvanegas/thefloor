# A configuration write does not stop the engine

Measured 2026-09-27 on build 302, three runs, and it contradicts
2026-09-26-the-film-keeps-its-stereo.md — which carries a correction banner
now. **`setAppleAudioConfiguration` while the engine is running does not stop
it.** Not the mode, not the options, not the exact `SCREENING` configuration
that shipped as build 296. What it does is remove the voice processing, which
is what it was for.

So the asymmetry table that closed the film's second — *a configuration change
stops the engine and leaves it stopped* — describes something that did not
happen. Nothing is being rebuilt on the strength of this yet; what changes is
that the door is not locked, and what stopped build 296's engine is an open
question rather than a settled one.

## What was run

`WRITE_PROBES` in app/src/audio/probe.ts, five writes with a log line either
side, pressed from the audio panel on a phone stepped into a channel. The
apparatus and its ordering are in that file's header. `probe.ts` had been named
as the apparatus for this since the task was written and was not quite: its ten
probes are the *readers* `engineSnapshot` makes, written in August for the
question of which one was destructive. Nothing in the tree could write the
session from inside a channel — `AudioLabView` can, and its header says to run
it outside one, which is the premise this question does not have.

**Three runs, because the first two each had a hole and the holes were
different.**

| Run | Condition | Result |
| --- | --- | --- |
| 11:08–11:10 | alone, nothing subscribed | no engine stop, any press |
| 11:34–11:37 | a second member publishing, `sub +` live before every press | no engine stop, any press |
| 12:40–12:43 | same, and 41 and 42 seconds held after each press | no engine stop, and the ear |

The first run's hole was raised from the other end of the prompt and was the
right objection: nothing was subscribed, so nothing was rendering, and this
stack's fragility has always lived there — `holdForPlayout` exists *so that the
engine is never restarted underneath a receiver that is rendering*, and it was
one of two fixes for a fault that took weeks to find. A null result from an
engine that is rendering nothing is a null result about the wrong engine.

The second run closed that and opened another: the presses were 5.4 to 7.3
seconds apart, and the freeze detector needs five seconds of stillness behind a
two-second poll, so a rebuild landed inside the detection window every time.

The third held for forty seconds and produced the reading.

## What the writes did

Presses **3** (`playAndRecord`/`default`, options unchanged) and **4**
(`SCREENING` exactly: `playAndRecord`/`default`/`allowBluetoothA2DP`) are the
only two that carry weight. Each wrote a route line at +227 to +273ms proving
the configuration was in force, and each held it — 7.1s, 7.0s and then 41s and
42s — with the engine up and `play=T rec=T` as the last engine line before the
press.

Presses **1**, **2** and **5** produced no route line at all in any run.
Writing the values already in force is short-circuited before it reaches
anything, and adding `allowBluetoothA2DP` on a `Speaker` route has nothing to
act on. They are not evidence of a harmless write; they are evidence of a write
that did not happen, which is a distinction the log makes and a press does not.

**And the ear is what turned the third run from an absence into a finding.**
With two devices close together, both presses made the volume jump and the
feedback between them intensify, and the voice never stopped. That is the
system echo canceller and the automatic gain going away — exactly what
`session.ts` says of `videoChat` and exactly what a non-voice mode costs. So
the write reached the audio path rather than only the reported category string,
and the engine and the playout both survived it.

## What stopped build 296's engine is not known

The question is now open and there is one suspect. From the log that closed
2026-09-26, with the press at 834800:

    834800  muted SCREENING
    834974  route … PlayAndRecord/ModeDefault why=routeConfigurationChange
    836228  engine stop play=T rec=T
    836544  watch playing after 1744ms

**The gap is the first thing.** Every write measured today landed in 6 to
273ms. A consequence 1,254ms later is not that write.

**The flags are the second, and they are the stronger half.** Twenty-two engine
stops were shipped to the journal across three hours of this work — leaves,
re-entries, backgroundings, eight room rebuilds — and every one of them reads
`play=T rec=F` or `play=F rec=F`. Not one reads `play=T rec=T`. Every stop this
app causes arrives *after* it has given up recording, or both: the flags walk
down, then the engine goes. Build 296's stop has both directions still enabled,
which is the signature of an engine stopped from outside rather than one this
app or the SDK decided to stop.

**Which points at the film.** The stop is 1,428ms after the press and 316ms
*before* `watch playing after 1744ms` — the window in which a `WKWebView`
acquires the audio session for video playback. Nobody has ever asked whether
that stops the engine, and it is the one thing in that log nothing has accounted
for.

The probe for it is a debug switch that keeps the microphone through the film,
so that the engine is up when the film's audio arrives — the configuration
being the thing today's reading removes from suspicion. It is in the panel
behind the `debug` column, off by default, and the reading needs a build.

## The freeze detector works, and answers a different question

It was reached for as the witness for *did the audio stop*, produced nothing,
and was written up here as possibly blind. **It is not blind.** Forty minutes
later, on the dead engine described below, it reported

    playout frozen 6s — acct_… subscribed, rendering nothing

within six seconds of the resubscription. So `totalSamplesDuration` is readable
and this instrument does the job it was built for.

**What it cannot see is a muted track**, which is why the calibration produced
nothing: a muted publisher's receiver goes on rendering silence, and silence is
samples. So it answers *is this receiver dead* and never *can somebody hear
this* — a muted speaker, a quiet room and a conversation all read alike. That
distinction is the whole of the mistake: its quiet was read as evidence that
audio was fine, when it was evidence of nothing, and the ear is what settled
that run.

Corrected the same day, which is the only reason this paragraph is not still
wrong.

## Three things that generalise

**A null result is about the conditions it was taken in, and the conditions are
the claim.** The first run's answer was correct and worthless, and the sentence
that made it worthless — *nobody else was in the channel* — was in the report
of it from the beginning.

**Calibrate against the fault you mean, not any fault.** The freeze detector was
trusted because it was there, then written off because a mute did not move it,
and both were wrong: it works, and a mute is not the thing it sees. Twenty
seconds of a deliberate fault is what a witness costs — and the fault has to be
the one the question is about, or the calibration says as little as the silence
it was meant to explain.

**The ear is a real instrument and memory is not.** Run three's finding is an
ear finding, taken while holding the phone, and run two's ear evidence was lost
by being recalled ten minutes later instead of written down. The rule is
AudioLabView's and it has now cost a run: *a trial whose result lives only in
somebody's memory is the failure mode the audio work in this repository has hit
more than once.*
