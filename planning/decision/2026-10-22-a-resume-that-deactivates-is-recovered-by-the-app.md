# A resume that deactivates is recovered by the app

Reported 2026-10-22, the day 3c74ebe8 stopped *On another call* outliving
the call it was about: *the display now says Present after returning from a
call, but the audio does not restore; stepping out and back in fixes it.*

## What the log said

acct_r3z2, build 384. *Hold & Accept* at 14:06:37: `held true`,
`deactivated`, `session began`, `engine stop`, and `playout frozen` for both
people in the room — all as designed for a held call. At 14:08:05
`resuming, no other call is up`, `held false`, and 230ms later **another
`deactivated`**. No `activated` followed, and no `engine start`, until the
step-out at 14:08:28.

`resumeIfAlone` (2026-10-12) rested on CallKit answering the resume with
`didActivate`, which WebRTC takes as the end of the hold's interruption. This
was the only resume it has made in a week of `bin/diagnostics`, and the
premise did not hold. The one other resume that week — 2026-10-20, build
383, fifteen seconds after the hold, with no `resuming` line — did get its
`activated`. The guess is that asking the instant `CXCallObserver` reports
the other call ended is too soon for its audio to have gone, and CallKit,
unable to activate, deactivates. It is a guess; one occurrence does not
separate it from anything else.

3c74ebe8 was not wrong. It made the roster tell the truth about the hold.
This was hidden behind it.

## What was built

`modules/reported-call` keeps a `resuming` flag from the off-hold action
until CallKit's next `didActivate` or `didDeactivate`. A deactivation inside
that stretch, with the call still up and not held, is the resume failing;
`recoverResume` then ends the interruption with `recoverInterruption`, the
deactivate-and-activate pair from
`2026-10-13-the-call-s-unended-interruption-is-ended-by-the-app.md`. If
`setActive` is refused, it tries once more a second later, in case the other
call's audio was still going away. Refused twice, `interrupted` stays set and
the next time the session becomes a call JavaScript asks again, as it already
did.

**The pair, not `didActivate` alone, for the 2026-10-13 reason**: the pair
leaves WebRTC's activation count where CallKit's own deactivations left it.

**Not done: delaying `resumeIfAlone`.** It would test the guess, but a delay
is a number with nothing behind it, and recovering costs nothing when the
resume works.

## Not yet measured

Written, parse-checked, and in no build. The walk: in a channel on one phone,
take a phone call or FaceTime with *Hold & Accept*, hang it up, and stay put.
The pass is `resuming`, `held false`, then either `activated` or
`deactivated` followed by `interruption ended by the app` and `engine start`,
with both sides heard and no step-out. `interruption not recovered` twice
means the retry was not enough, and that the guess about timing was right.
