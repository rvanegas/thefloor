# 2026-09-17 — Nothing is corrected before it has been read

The dwell landed at eleven and was tested on a watch the same night. Two
things were still wrong, reported in one line each: *play results in
alternating play and pause, never settling into desired state*, and *video
seek is also reverted, as if seek within video is ignored by app*.

They are the same defect wearing two faces. **The follower goes on correcting
the player during the windows in which it has not yet read what the person
did to it**, so a press made in one of those windows is pushed back to
whatever the channel still says before anything can notice it was made.

## The window after a press was a deafness, not a silence

`INTENT_QUIET_MS` was belt and braces against two machines arguing: for two
seconds after speaking, a follower would not *read* another press. It went on
issuing corrections throughout.

Follow that through with a person in it. Somebody pauses on the bar; the
intent goes, the channel comes back paused, and a second later they press
Play — which is exactly how fast anybody presses when the first press looked
ignored. The follower may not read it, so it corrects it: pause. The player
stops. They press Play again, which starts the window again, which erases it
again. Play-pause-play-pause, settling nowhere, for as long as somebody keeps
pressing — and only *after some usage*, because the first press is what opens
the window that eats the second.

The dwell branch already knew this — *correcting inside the dwell would undo
the very press being waited on* — and the quiet window is the same clause
missed. It is now a silence: while a screen that may drive is inside its own
window it watches and says nothing. A player that genuinely is disobeying is
corrected two seconds later instead of straight away, which nobody can see.

## A scrub does not happen twice

The dwell asks a candidate to still be there a tick later. `contradictionFrom`
finds a scrub by comparing where the player is against where its own previous
reading said it would be — and the reading *after* a scrub is perfectly
continuous with the one before it, because the film is simply running from its
new place.

So a seek candidate asked to prove itself the way a play or a pause does could
never do it: the second look always agreed, the candidate was dropped, and the
ordinary correction then dragged the picture back. **Every scrub on the bar was
reverted, without exception** — which is not a flaky control, it is a control
that never worked once the dwell existed.

A scrub answers to what it leaves behind instead: a player standing somewhere
the channel is not, which is durable where the jump is not. `scrubStands` in
core asks that, and a held scrub answers to it **alone** — not to whichever
question says yes — because a lie that goes out and comes back is two jumps,
and the journey home is a fresh candidate of the same kind as the one being
waited on. Taking either would take the blip for the very press the dwell
exists to rule out.

## Why the tick-at-a-time tests were all green

`follow.test.tsx` drives the follower one tick at a time against a player the
test moves by hand and a channel it sets directly. Both defects are races
between two latencies — the player's half-second of obedience and the
channel's round trip — and neither exists in a world where both are
instantaneous.

`app/src/watch/__tests__/transport.test.tsx` is the other half: a player that
takes 600ms to do as it is told and goes on reporting its old state
meanwhile, a channel 300ms away through the real reducer, and a clock that
runs while both of them think. Four of its six tests fail against the code
that shipped tonight; the two that pass are the controls — a screen that may
not drive, and a party nobody touches.

One trap in writing it, which cost a wrong diagnosis first: `jest`'s
`advanceTimersByTime` moves the fake clock as well as the timers, so a harness
that *also* calls `setSystemTime` runs the channel at twice the player's speed.
That reads as drift, and the drift reads as a seek storm that is not there.

## The general form

The evening's other entry ends: *a rule that reads a device's state and acts
on it must know what it has already told that device*. This is its other half
— **a rule that reads a device's state must not write to that device while it
is still deciding what it read**. Every window this follower keeps for its own
benefit is a window somebody can press a button in.
