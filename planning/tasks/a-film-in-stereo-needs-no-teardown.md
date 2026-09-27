# A film in stereo needs no teardown

Pressing Play in a watch party costs about a second on the device showing the
film, and all of it is the microphone being torn down so the session can leave
`playAndRecord`. Build 277: the app is left in 40 to 120ms, `engine stop` lands
at 0.92 to 1.11 seconds, and the film starts 1.2 to 3.0 seconds after the press.
Pause is cheap, 0.27 to 0.41 seconds, because it takes a device rather than
releasing one.

**Two of the four things this asked for are answered, and the obstacle is not
where four attempts at it looked.** 2026-09-27, builds 302 and 303 —
decisions/2026-09-27-a-configuration-write-does-not-stop-the-engine.md and
decisions/2026-09-27-the-film-stops-the-engine.md are the accounts.

- **A configuration write stops nothing.** Not the mode, not the options, not
  the exact `SCREENING` configuration, held forty seconds with the engine
  capturing and a remote track rendering. What it does is remove the voice
  processing, audibly. So `SCREENING` was innocent and the mode and the option
  are available.
- **The film stops the engine.** A `WKWebView` starting video playback takes the
  audio session and the engine stops with `play=T rec=T` — both directions still
  wanted, the signature of an interruption from outside. Three reproductions,
  1,208 to 1,432ms after the press and 217 to 316ms before `watch playing`,
  including one with nothing subscribed. And nothing restarts it because holding
  the microphone is exactly what removes the release and retake of the category.

**So the question this task has always asked — how does the engine come back up —
is the whole of the remaining problem, and it has a sharper form now:** the film
will take the session whatever the configuration says, so the engine has to be
restarted *after* it does. The only mechanism ever seen doing that is a category
release and retake.

What is outstanding, in order:

- **Whether a release and retake works while the film is playing.** One tap and
  no build: with the film probe on and the engine stopped by the film, toggle the
  probe off — that drops `micNeeded`, which releases the category, and whether an
  `engine start` follows is the answer. **Yes means a design exists**: hold the
  microphone through the press, let the film take the session, then release and
  retake deliberately once it is up, which is a second paid in a place where
  nobody is waiting on it. No means the film holds the session against any
  repair, and the shipped arrangement is the only one there is.

- **Hiding the second, which is still the cheaper half and still untried.** The
  teardown is between the press and the picture; a spinner, or starting the
  transport optimistically and letting the follow tick correct it, costs nothing
  and makes one second feel like none. `Transport.tsx` has no pending state at
  all — a press records itself and then the screen says nothing until the room
  answers. **And the second may be smaller than the figure at the top of this
  file**: build 303 logged `watch playing after 853ms` and `1443ms` against build
  277's 1.2 to 3.0 seconds, so measure before designing around 277's number.

- **A reading with two phones and a Bluetooth headset**, which is what decides
  whether any of this is worth anything. Every measurement in this argument is
  `route Speaker(Speaker)`, and the whole benefit of the stereo is on a route
  none of them used — on the loudspeaker it is 48kHz either way and what is lost
  is only the voice processing. The one item here that cannot be run alone.

Two notes for whoever runs the next reading. **The playout freeze detector works
and answers *is this receiver dead*, never *can somebody hear this*** — a muted
track goes on advancing its counter, so calibrate it against the fault you
actually mean; see the note in `playout.ts`. And **the ear is a real instrument
where memory is not**: the finding that turned this around was an ear finding,
and one run's worth of ear evidence was lost by being recalled ten minutes later.
