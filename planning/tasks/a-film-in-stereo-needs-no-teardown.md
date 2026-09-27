# A film in stereo needs no teardown

Pressing Play in a watch party costs about a second on the device showing the
film, and all of it is the microphone being torn down so the session can leave
`playAndRecord`. Build 277: the app is left in 40 to 120ms, `engine stop` lands
at 0.92 to 1.11 seconds, and the film starts 1.2 to 3.0 seconds after the press.
Pause is cheap, 0.27 to 0.41 seconds, because it takes a device rather than
releasing one.

**The obvious fix has been tried and shipped and broken the room**, so read
decisions/2026-09-26-the-film-keeps-its-stereo.md before designing anything.
Holding the device and changing only the *configuration* — `SCREENING`,
`playAndRecord` under `default` with A2DP — stops the audio engine just as
thoroughly and leaves nothing to restart it, so the pause put every microphone
back onto a dead engine. The asymmetry to hold on to:

| | device | engine |
| --- | --- | --- |
| category change (release/retake) | torn down | stopped **and started again** |
| configuration change (mode/options) | kept | stopped, and left stopped |

So the second is what the repair costs, and any design that avoids the teardown
has to answer **how the engine comes back up** before it is worth writing.

What a fourth attempt would need, in order:

- **Whether the engine stop is caused by the mode change specifically**, or by
  any `setAppleAudioConfiguration` while the engine runs. `app/src/audio/probe.ts`
  is the apparatus and has never been run to completion. This is the hour that
  would have saved 2026-09-23.
- **Whether the ADM can be restarted without releasing the category.** If it
  can, the configuration route is back on the table. If it cannot, the second is
  permanent and this task is about hiding it rather than removing it.
- **Hiding it is the cheaper half and nobody has tried it.** The teardown is
  between the press and the picture; a spinner, or starting the transport
  optimistically and letting the follow tick correct it, costs nothing and makes
  one second feel like none. `watch tell play` already goes out before the audio
  moves.
- **A reading with two phones and a Bluetooth headset.** Every measurement in
  this argument is `route Speaker(Speaker)`, and the whole benefit of the stereo
  is on a route none of them used — on the loudspeaker it is 48kHz either way and
  what is lost is only the voice processing.

Worth doing for the spinner alone. Not worth another configuration experiment
without the `probe.ts` reading first.
