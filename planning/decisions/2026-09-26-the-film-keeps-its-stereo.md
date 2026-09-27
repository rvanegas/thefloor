# The film keeps its stereo, and the second on Play is paid

> **Corrected 2026-09-27: the mechanism below is wrong.** A configuration write
> does not stop the audio engine — not the mode, not the options, not the
> `SCREENING` configuration this entry retired, measured three times on build
> 302 with the engine capturing and rendering. So the asymmetry table in
> *Why A was left in the first place* is wrong in its second row, and the
> paragraph that calls the write the cause of the engine stop is wrong with it.
> What stopped build 296's engine is an open question, and the film's own
> `WKWebView` is the suspect. See
> 2026-09-27-a-configuration-write-does-not-stop-the-engine.md.
>
> **What is not corrected is the outcome.** The room did lose its conversation,
> the revert did fix it, and the second on Play is still what the release and
> retake cost — build 277 measured that and nothing since has touched it. This
> entry got the right answer for a reason that turns out not to hold.

Closed 2026-09-26, on the third fix for one report and the first that was
argued from a device. **`SCREENING` is deleted and `microphoneNeeded` subtracts
`isScreening` again.** A device showing the film releases its microphone, the
session falls to `LISTENING`, the film is stereo, and pressing Play costs about
a second.

This reverts 2026-09-23-the-screen-keeps-its-microphone.md in full — both
halves, the held device as well as the configuration. That entry's measurement
was right and its conclusion was wrong, and the difference is one sentence:
**the release is not the cost, it is the repair.**

## The report, and two wrong answers

*Two people watching a party, one pauses, and neither can hear the other
afterwards. Stepping out and back in restores it.*

**First answer: a missing dependency.** `screening` was not in the capture
effect's dependency array. Shipped as build 295; changed nothing, because a
party mute is a server-side unsubscription, so a pause brings every remote track
back, fires `TrackSubscribed`, and moves `othersAudible` — already a dependency.
Both directions were masked, not one. See 2026-09-26-the-film-is-a-dependency.md,
which carries a correction banner and is now a correct rule about a parameter
that no longer exists.

**Second answer: the session was never written.** The `muted` branch applied no
configuration, on a comment saying a hold "moves nothing" — true of the
self-mute it was written for, false once `muted` also meant a screening run.
Shipped as build 296. It fixed that defect: the write landed in 174ms instead of
the observer's 1.2 seconds, and `route` showed `ModeDefault`, so `SCREENING` was
in force for the first time. The symptom did not move. See
2026-09-26-a-hold-can-move-the-session.md.

## The answer

**Changing the configuration stops the audio engine, and nothing restarts it.**
Build 296, both phones, within 200ms of each other:

    834800  muted SCREENING
    834974  route … PlayAndRecord/ModeDefault why=routeConfigurationChange
    836228  engine stop play=T rec=T
    836544  watch playing after 1744ms
    844663  capturing CALL
            (no route change, no engine start)

`setAppleAudioConfiguration` writes process-wide shared state that the native
observer applies *at* an engine transition. With the engine stopped there are no
more transitions, so the `CALL` the pause asked for never landed — no
`categoryChange` follows it, where re-entry's does. Both microphones unmuted and
both subscriptions returned onto a dead engine.

**And it never bought what it was for.** `watch playing after 1689ms` and
`1744ms`: the first press of Play still cost the second that 2026-09-23 was
written to remove. The engine was being torn down either way; only the reason
changed, and the new reason had no repair behind it.

## Why A was left in the first place, which is the part worth keeping

2026-09-23 measured the cost of releasing the device and it is real: build 277,
a press of Play left the app in 40 to 120ms and the film started 1.2 to 3.0
seconds later, with `engine stop` at 0.92 to 1.11 seconds and the category
change immediately behind it. A press of Pause moved category in 0.27 to 0.41
seconds. **That reading stands and is why the second is a real cost rather than
an imagined one.**

What it got wrong was the inference. *Releasing the device costs a second* was
read as *therefore don't release the device*, and the alternative was never
measured before it shipped. The commit even flags the untested part — "the mode
and the option are unverified on a device" — but the thing it was worried about
was whether iOS would **grant** the configuration, not whether changing it would
stop the engine. Nobody asked the second question, and it is the one that
mattered.

**The asymmetry nothing in the code says out loud**, and the reason this took
three tries:

| | device | engine |
| --- | --- | --- |
| category change (release/retake) | torn down | stopped **and started again** |
| configuration change (mode/options) | kept | stopped, and left stopped |

A release looks like the expensive option and is the only one with a way back.
So the second on Play is not an inefficiency to be engineered away; it is what
the repair costs.

## What was built

`microphoneNeeded` subtracts `isScreening` again. `SCREENING` is gone from
`session.ts`, with a note where it was carrying the log above; `SessionWant`
loses `'screen'`, `sessionFor` and `nameOf` lose their branches, and `policyFor`,
`pushPolicy` and `wantFor` lose the `screening` parameter — `policyFor` is a
function of nothing again. `useSessionAudio` loses the parameter entirely, and
`intentFor` loses its `muted`-while-screening arm: the film reaches the hook
through `micNeeded` and nowhere else.

The one thing kept from the second fix is the `configMoved` guard in the `muted`
branch, which now fires only on a first pass. It states something true either
way, and the next second meaning of `muted` will arrive the same way.

`app/src/audio/__tests__/screening.test.tsx` pins the release and the retake, in
both directions, twice through — the engine stop that broke this was permanent
from the first run, so a fixture that plays once cannot tell a session that
recovers from one that is merely quiet. `core/__tests__/watchingHere.test.ts` §
*the screen gives its microphone up* is the predicate half, and
`session.test.ts` § *a film* is the module half.

## Three things that generalise

**A comment saying *this case moves nothing* is a claim about how many meanings
a variable has.** `muted` acquired a second on 2026-09-23 and the branch's
reasoning was never re-read against it.

**Measuring the cost of what you have is not measuring the cost of what you are
replacing it with.** Build 277 measured A thoroughly and B not at all, and B
shipped on the strength of A's number. The asymmetry table above is what an hour
with `probe.ts` would have produced.

**The fixture proves the fix, so a fixture built from a wrong diagnosis
inherits the error.** The first test passed, pinned both directions, and
described a state the app cannot be in — it moved the film with nothing else
moving, when a party mute always moves the subscriptions too. What settled all
three rounds was the log the phone ships.
