# A film in stereo needs no teardown

Pressing Play in a watch party costs about a second on the device showing the
film, and all of it is the microphone being torn down so the session can leave
`playAndRecord`. Build 277: the app is left in 40 to 120ms, `engine stop` lands
at 0.92 to 1.11 seconds, and the film starts 1.2 to 3.0 seconds after the press.
Pause is cheap, 0.27 to 0.41 seconds, because it takes a device rather than
releasing one.

**Two of the four things this asked for have been measured, and the answer was
not either of the two that were expected.** 2026-09-27, three runs on build 302
— decisions/2026-09-27-a-configuration-write-does-not-stop-the-engine.md is the
account. `setAppleAudioConfiguration` while the engine runs stops nothing:
neither the mode alone nor the exact `SCREENING` configuration, held forty
seconds with the engine capturing and a remote track rendering. What it does is
remove the voice processing, audibly. So the asymmetry table that closed
2026-09-26 is wrong in its second row, that entry carries a banner, and **the
configuration route is not the dead end it was written up as.**

What is outstanding, in order:

- **What stopped build 296's engine, which nobody knows.** This is the question
  the above replaced, and it is the one worth the next hour. Two things in that
  log point at the film rather than the write: the stop is 1,254ms after the
  write where every write since lands in under 280ms, and it reads
  `play=T rec=T` where all twenty-two stops this app was seen to cause read
  `rec=F` or both false — the flags walk down first, then the engine goes, so a
  stop with both still wanted is one imposed from outside. It arrives 316ms
  before `watch playing`. **The suspect is the film's own `WKWebView` taking the
  audio session**, and nobody has ever asked whether that stops the engine.

  The probe is built and is in the audio panel behind the `debug` column: a
  switch that keeps the microphone through the film, so the engine is up and
  capturing when the film's audio arrives. It needs an upload, and the reading
  is one press of Play.

- **Hiding the second is still the cheaper half and still nobody has tried it.**
  The teardown is between the press and the picture; a spinner, or starting the
  transport optimistically and letting the follow tick correct it, costs nothing
  and makes one second feel like none. `watch tell play` already goes out before
  the audio moves, and `Transport.tsx` has no pending state at all — a press
  records itself and then the screen says nothing until the room answers.
  **Worth doing whatever the answer above turns out to be**, since the second is
  the release and retake either way.

- **A reading with two phones and a Bluetooth headset.** Every measurement in
  this argument is `route Speaker(Speaker)`, and the whole benefit of the stereo
  is on a route none of them used — on the loudspeaker it is 48kHz either way and
  what is lost is only the voice processing. The one item here that cannot be
  run alone.

**And if the film turns out to be what stops the engine, this task becomes a
different one**: the configuration route is available, `SCREENING` was innocent,
and the question is whether the engine can be kept up across a film at all —
which is the same question decisions/ § *The phone holds a microphone in order
to hear* is about, from the other side. Do not restore `SCREENING` before that
is answered; a configuration that is safe to write is not the same as a design
that works.

Two notes for whoever runs the next reading. **The playout freeze detector
cannot see silence** — a deliberate twenty-second mute produced no line — so it
is not a witness for *did the audio stop*; see the note in `playout.ts`. And
**the ear is a real instrument where memory is not**: run three's finding is an
ear finding and run two's was lost by being recalled ten minutes later.
