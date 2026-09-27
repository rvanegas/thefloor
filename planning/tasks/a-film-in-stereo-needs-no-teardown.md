# A film in stereo needs no teardown

**The mechanism is settled and the design is known. What gates the work now is a
measurement, not a decision.** 2026-09-27, builds 302 and 303 —
decisions/2026-09-27-a-configuration-write-does-not-stop-the-engine.md and
decisions/2026-09-27-the-film-stops-the-engine.md are the accounts, and the
second is the one to read.

What was found, in the order it stopped being a guess:

- **A configuration write stops nothing.** Not the mode, not the options, not the
  exact `SCREENING` configuration, held forty seconds with the engine capturing
  and a remote track rendering. It removes the voice processing, audibly, and
  that is all it does.
- **The film stops the engine.** A `WKWebView` starting video playback takes the
  audio session and the engine stops with `play=T rec=T` — both directions still
  wanted, the signature of an interruption from outside. Five reproductions,
  1,101 to 1,432ms after the press, 217 to 316ms before `watch playing`, one of
  them with nothing subscribed at all.
- **That does not matter, and this is the part that reframes everything.** The
  room is enforced-muted for the length of a run, so nothing is publishing and
  the engine has nothing to render. It does not need to be up during the film.
  It needs to be up at the **pause**, and `SCREENING`'s bug was that a held
  microphone leaves the pause with no retake to perform.
- **So releasing late works, and costs nothing.** Measured: hold the microphone
  through the press, release it while the film plays, and the pause's retake
  brings the engine up in 713ms with the subscription returning onto a live
  engine and no freeze behind it. The control in the same session — the shipped
  path, which releases at the press — retakes in 735ms. **The pause already pays
  that beat today**, so deferring the release adds nothing to it.
- **And `SCREENING` is not needed for any of it.** `LISTENING` is `playback`
  under `spokenAudio`: already a non-voice mode, already 48kHz. The stereo this
  task is named for comes from there and always did. The whole change is *when*
  the microphone is released — after the picture rather than before it — and it
  adds no session state.

What is outstanding, in order:

- **Measure what a press of Play actually costs, before building anything.** The
  figure this task was written on is build 277: the film starting 1.2 to 3.0
  seconds after the press, with `engine stop` at 0.92 to 1.11 seconds. Build 303
  logged `watch playing` at 853ms, 1443ms, 1605ms and 1793ms — and the slowest of
  those was the run where the microphone was never released at all. **If the
  release is no longer in the picture's way, this task is a finding with no work
  behind it** and the item below is moot as well. Ten presses on a quiet channel
  settles it.

- **Then, if it is worth it: defer the release until the film is up.** Keep the
  microphone across the press, release when the player reports playing. No new
  configuration, no `SCREENING`, and the pause is unchanged. The film probe in
  the audio panel is the hand-operated version of exactly this and is how the
  measurement above was taken.

- **Hiding the second is the other half and is independent of all of it.**
  `Transport.tsx` has no pending state: a press records itself and the screen
  says nothing until the room answers. A spinner, or an optimistic transport
  corrected by the follow tick, makes whatever the second turns out to be feel
  like none. Worth doing if the measurement says there is still a second.

- **A reading with two phones and a Bluetooth headset**, which is what decides
  whether the stereo is worth anything at all. Every measurement in this
  argument is `route Speaker(Speaker)`, and on the loudspeaker it is 48kHz
  either way — what is lost there is only the voice processing. The one item
  that cannot be run alone.

Two notes for whoever runs the next reading. **The playout freeze detector works
and answers *is this receiver dead*, never *can somebody hear this*** — a muted
track goes on advancing its counter, so calibrate against the fault you actually
mean; see the note in `playout.ts`. And **the ear is a real instrument where
memory is not**: the finding that turned this around was an ear finding, and one
run's worth of ear evidence was lost by being recalled ten minutes later.
