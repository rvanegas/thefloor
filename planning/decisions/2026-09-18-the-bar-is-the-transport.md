# 2026-09-18 — The bar is the transport, and a follower does one thing at a time

Three attempts on three consecutive days, each one shipping and each one
reported broken by the evening:

- **16th.** The video's own bar became a remote. A press bought a quarter of a
  second of obedience and then a correction.
- **17th, morning.** `commandedAt` and a dwell. Play produced
  play-pause-play-pause and settled on pause.
- **17th, night.** The quiet window became a silence and a scrub learned to
  prove itself by the gap it left. Still flipping, reported the next morning as
  *play/pause flipping*.

Each fix was correct about the case in front of it and each one moved the
failure somewhere else. That pattern is the finding, not the bug.

## What the three attempts had in common

**A follower that both commands its player and reads it cannot tell its own
unobeyed instruction from somebody's thumb.** At a single instant the two are
the same reading, and the IFrame API will not resolve it:
`onStateChange` carries the new state — -1, 0, 1, 2, 3, 5 — and says nothing
about what caused it. There is no user-versus-programmatic flag anywhere on
the supported surface.

So all three separated them by *time*: how long ago did I speak? By the third
attempt that was seven constants — `WATCH_DRIFT_MS`, `WATCH_SEEK_SETTLE_MS`,
`WATCH_COMMAND_SETTLE_MS`, `INTENT_SETTLE_MS`, `INTENT_DWELL_MS`,
`INTENT_QUIET_MS`, `READINGS_COMPARABLE_MS` — and every one of them traded the
same two failures against each other:

- a guard that stops a **misread** opens a window where a correction erases a
  real press;
- a guard that stops an **erasure** opens a window where the player drifts and
  is corrected.

They were not tuned wrong. There is no setting of seven timers that closes
both, because the information needed to choose is not in the signal.

## The shape that has it instead

**A disagreement is only ambiguous when "I told it to" is a live
possibility.** Remove that possibility and no timing question is left to
answer. So commanding and reading are made mutually exclusive by *state*, and
every transition out of a wait is an **observation** rather than an elapsed
window:

- **watching** — the player agrees with the channel. Nothing is ever said to a
  player in this state, so anything it does is its owner's doing. The only
  state a press is read in.
- **sending** — told the player something; deaf until it arrives
  (`hasArrived`). A correction therefore cannot be read back as an act, which
  is the loop all three attempts died in.
- **told** — told the channel something; silent until it answers
  (`channelAnswered`). A correction therefore cannot undo the press on its way
  out.
- **wondering** — a jump, looked at once more before the room is moved.

The property that matters is that no phase both listens and speaks. It holds
with any number of equal controllers: one bad embed costs one spurious
transition, because every other device's correction happens inside `sending`
and is unreadable. The old loop needed the correction to be re-read to
produce the next instruction, and now it cannot be.

**Why a jump gets a second look and a press does not.** A wrong play costs one
transition, bounded and self-correcting. A wrong *position* throws the whole
room somewhere nobody asked for. The asymmetry in the cost is worth a tick of
latency on scrubs and is not worth one on presses. This is not the dwell that
failed: that waited to see the same jump twice, which a jump can never do, and
corrected the player while it waited.

**An advert is measured, not waited out.** During a pre-roll `getCurrentTime`
and `getDuration` describe the advert, so a player reporting a length that is
not the film's is not showing the film — nothing is said to it and nothing
read from it. All three attempts list "an advert starting" among the lies they
were guessing around; the player says which video it is showing if it is asked
for a length.

Two timers survive, and both are fuses for an observation that never comes
rather than rules about how long things take. They are deliberately *not* one
constant: waiting on the player is deafness, so its fuse is short
(`WATCH_OBEDIENCE_MS`); waiting on the channel is only silence, so its fuse is
long (`WATCH_PATIENCE_MS`). Sharing one cost an afternoon — a press made while
a correction was in flight went unheard for four seconds, which is the
original complaint in a new dress.

## The product half, which is what made the choice

The bar cannot be hidden. It is inside the embed and comes off only with the
picture, so **every screen showing a film has YouTube's controls on it
whatever the app does**. Two conclusions follow, and they are the reason this
is a re-shaping rather than a fourth guard:

- **An inert bar is worse than no bar.** The obvious repair — stop reading the
  bar, keep the app's buttons — leaves a visible, pressable control that does
  nothing next to a row that works. People reach for the one on the picture.
- **So the app's own transport is the redundant half.** The Play and ±15s row
  is gone. The progress readout stays, because saying where everybody is is
  not a control.

**And a watch party is now a mode the channel is in rather than a thing it is
carrying.** No floor may be claimed, no recording begun and no track put on
while a film is loaded. Recording was already mutually exclusive both ways;
the other two were not, and the floor in particular was reaching into the
transport through `holdsSharedControl` and deciding whose finger the bar
answered. Since no claim can be made during a film there is nothing left for
`floorPermits` to say there, so `canControlWatch` is now presence alone.

This simplified two things that had been carrying the floor's weight for no
benefit: clearing the room's mute returns *everybody* to audible rather than
falling back to a claim underneath it, and loading a track no longer ends a
party — it is refused, so the mutual replacement that used to run both ways
now runs one. The audio button is dead during a film, deliberately and
visibly.

## What the trade actually costs

**Only a device showing the film can drive it.** The controls are on the
picture, so somebody in the party whose screen is not the one showing it has
no transport at all. That is inherent in "the bar is the only control" and is
accepted rather than overlooked.

**A press is acted on the first time it is seen.** No arrangement waits a tick
any more except for jumps. What made that unsafe before was reading a player
this same follower might have just commanded; in `watching` there is no such
command to confuse it with.

## How it is tested, and the trap in testing it

`app/src/watch/__tests__/follow.test.tsx` drives the phases a tick at a time.
`app/src/watch/__tests__/transport.test.tsx` is the one that matters: a player
that takes 600ms to obey and goes on reporting its old state meanwhile, a
channel 300ms away through the real reducer, and a clock that runs while both
of them think. **Every defect in this whole saga lived between two latencies**,
which is why `followInstructions` and the intent reader were each green alone
through all three attempts.

It found one in this design too, before any of it shipped: the shared fuse
above.

**The trap, which has now cost two sessions:** `jest`'s
`advanceTimersByTime` moves the fake clock as well as the timers, so a harness
that also calls `setSystemTime` runs the channel at twice the player's speed.
The drift that manufactures reads as a seek storm that is not there, and it
pushes the follower into correcting when the test meant it to be settled. Both
harnesses now carry a comment saying so.

## The general form

The 17th's entry ends: *a rule that reads a device's state and acts on it must
know what it has already told that device.* Its sibling that evening: *a rule
that reads a device's state must not write to that device while it is still
deciding what it read.*

Both are true and both are consolation prizes. The one worth keeping is
stronger: **when a platform will not tell you what caused something, stop
trying to infer the cause and arrange instead never to be a possible cause.**
Three days went into timing guards for a question the API had already refused
to answer.
