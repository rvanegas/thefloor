# The call's unended interruption is ended by the app

Reported 2026-10-13: *after watching a video, sometimes people present cannot
hear each other; stepping out and back in fixes it.* Diagnosed the same
evening from a week of `bin/diagnostics`, and caused by the reported call
rather than by the film.

## What the log said

**iOS interrupts the session 480 seconds after the film takes it, while a
reported call is up, and never ends the interruption.** Every
`session began … Playback/SpokenAudio` since the call shipped, timed against
the `released LISTENING` before it, lands at 480.0 to 480.6s — fifteen in
fifteen, builds 346 to 358, and two phones within 21ms of each other when
they had started the film together (20:28:26 on 2026-10-13). No `session
ended` follows. Before build 341 nothing landed at that mark. Film position,
network and server do not enter into it; the app is usually in front.

**Then the pause cannot bring the engine back.** WebRTC stops its engine on
the `began` and does not start it until it hears the interruption is over. The
pause's `capturing CALL` writes the configuration and publishes the track —
the other phone subscribed to it — and nothing follows: no route line, no
`engine start`, both pause chimes `dropped after 2000ms, no engine start`, and
on the other phone `playout frozen 6s — … subscribed, rendering nothing`.
Of the week's pauses, every dead one followed an unended interruption, and
each film run shorter than eight minutes paused cleanly.

**A step-out cures it because the new call's `didActivate` is the end WebRTC
was waiting for** — the mechanism `resumeIfAlone` already relies on for a
held call (2026-10-12). Coming back to the foreground is not enough: build
351 did, inside one, and its next pause was still dead.

## What was built

`modules/reported-call` watches interruptions while the call is up and keeps
one flag: began and not yet ended. `applyFor` asks it to recover whenever the
session becomes a call. With the flag set, the call up and not held, it
activates the session and passes **`didDeactivate` then `didActivate`** to
`RTCAudioSession` — the pair CallKit sends across a hold, so WebRTC's
activation count ends where CallKit's own calls leave it. It logs
`reported call interruption ended by the app …`, or `… not recovered: …` when
`setActive` is refused. Otherwise it does nothing.

**Recovered rather than avoided.** The 480-second rule is not documented and
not understood; the guess is that CallKit treats a call whose session has left
voice mode as idle. The ways to not trigger it are to keep the microphone
through the film, which costs the stereo and which
`2026-09-27-the-film-stops-the-engine.md` showed stops the engine anyway, or to
end the call for the film, which costs Recents' and CarPlay's view of a call
somebody is still in. Ending the interruption costs neither.

## Not yet measured

Written and tested in jest only; it needs a build. **The walk is a film past
eight minutes on two phones, then a pause**: the pass is the
`interruption ended by the app` line, then `engine start`, then each phone
hearing the other, with no `playout frozen`. A held call through a film
deserves one look too, since the recovery stands down while held.
