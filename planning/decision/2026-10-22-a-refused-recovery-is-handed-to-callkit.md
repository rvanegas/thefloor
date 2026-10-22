# A refused recovery is handed to CallKit

Reported 2026-10-22: *returning from a watch party still requires stepping out
and back in to restore the audio.* The 2026-10-13 recovery was meant to end
exactly that, and the log says it has worked once.

## What the log said

`bin/diagnostics` from 2026-10-14 to 2026-10-22 has six runs of
`recoverInterruption`, each one a pause after the 480-second interruption.
One reads `interruption ended by the app` (2026-10-20 15:11, build 384). The
other five read **`interruption not recovered: Session activation failed`**:
2026-10-15 b363, 2026-10-18 b373, 2026-10-20 b383, and both phones at
2026-10-22 16:03:41 (b384 and b385). Every one of those five then has
`watch chime dropped after 2000ms, no engine start`, and the one on 10-22 was
cured by a step-out ten seconds later. That step-out's new call got CallKit's
`activated` at once, with the app in front.

The 10-22 pair is typical. `session began … Playback/SpokenAudio` at 15:58:13
on both phones, 480 seconds after the `released LISTENING` at 15:50:13. Then
the pause at 16:03:40: `capturing CALL`, **no `route … categoryChange`**, the
refusal 600ms later, the chime dropped.

**The one success is not like the rest.** The app had been in the background
and come back seconds before, and the pause's `CALL` write produced a
`categoryChange` before the recovery ran. In all five failures the app stayed
in front through the interruption and the write produced no route line. The
likeliest reading is that WebRTC ends its interruption itself when the app
becomes active, and that a session iOS has interrupted under a reported call
cannot be activated by the app while it stays in front. That is a guess. The
refusal's error code was not logged, so what kind of refusal it is (priority
or something else) is not known.

**The 10-22 resume decision assumed something the code did not do.** It says
that after two refusals `interrupted` stays set. In fact `recoverInterruption`
cleared it before trying, so the next becoming-a-call found nothing to recover.

## What was built

**`cycleHold`**: when JavaScript's recovery is refused, the module holds the
reported call and takes it straight off hold again. CallKit then sends
`didDeactivate` and `didActivate` itself. Those go to `LKRTCAudioSession` as
they already did, and are the end of the interruption WebRTC is waiting for,
the same thing a step-out buys. Unlike a step-out, it leaves the call standing:
no second Recents entry, and CarPlay or the Watch see only a moment's hold.
Its line is `holding and resuming, the app's activation was refused`, and its
hold actions log as `held true by the app` and `held false by the app`.

- **The room is not told.** `setHeld` is skipped while `cycling`, so the roster
  does not say *On another call* for a hold nobody took.
- **The resume waits for the hold's `didDeactivate`.** If it did not, that
  deactivation could land after the resume had set `resuming`, and
  `recoverResume` would read it as the resume failing. When CallKit holds no
  session it resumes at once. A deactivation that never comes gets one second,
  logged as `no deactivation for the app's hold`, so the call is never left
  held.
- **It cannot loop.** A resume answered with `didDeactivate` goes to
  `recoverResume` as any resume does. That path retries `setActive` and does
  not come back to `cycleHold`. `cycling` clears on `activated`, at the end of
  a resume, and on start, end and reset.
- **A refusal now keeps `interrupted` set**, so the 10-22 decision's statement
  is now true, and the refusal logs its `NSError` code.

**Still recovered rather than avoided**, for the 2026-10-13 reasons: the ways
to avoid the 480-second interruption are holding the microphone through the
film, which costs the stereo and stops the engine anyway, or ending the call
for the film, which costs Recents' and CarPlay's view of it. Neither has
changed. This is the net, and it is the second net. **If a hold cycle also
fails to bring `activated`, the trade is back on the table**, and ending the
call for the film and starting it again at the pause is the one left to try.

## Not yet measured

Parse-checked, in no build. The walk is the 2026-10-13 one: two phones, a film
past eight minutes, then a pause, with the app in front throughout. The pass
is `interruption not recovered … (<code>)`, `holding and resuming`, `held true
by the app`, `held false by the app`, `activated`, `engine start`, and the
pause chime and each phone hearing the other, with no step-out. The code is
worth writing down whichever way it goes.
