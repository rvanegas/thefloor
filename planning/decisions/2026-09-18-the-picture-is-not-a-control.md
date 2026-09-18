# 2026-09-18 — The picture is not a control

Four failures in four days, each fixed and each followed by another:

1. A press was obeyed for a quarter of a second and corrected away.
2. Play stuttered play-pause-play-pause and settled on pause.
3. A second press inside the quiet window was erased; every scrub reverted.
4. Play started the film and immediately stopped it.

And then, from the fix to (4): **every scrub reverted again.** That one is the
finding. `settling` waits for a player to stop transitioning before believing
it, which is right for a press and fatal for a scrub — both gestures announce
themselves as a transition, and waiting for transitions to end throws the
evidence away. **A fix for one gesture ate the evidence the other needed.**

## What was actually wrong, under all five

The video's own bar is an **input** surface on the same player the channel
drives as an **output** surface. When the channel says play, every screen is
told to play — and that command produces exactly the transition a thumb
produces. The IFrame API does not say which: `onStateChange` carries the new
state and nothing about its cause.

So a follower watching its own player is listening for a person through a
speaker it is talking into. It is the echo problem, and there are only two
answers to that: cancel the echo, or go half-duplex.

Every arrangement so far went half-duplex — a dwell, a quiet period, a settle
window, a pending press, four phases, seven constants — each one a window in
which the follower stopped listening in case what it heard was itself. Every
window is a press that can be swallowed, and every window closed is a misread
that can loop. That trade has no good setting, which is why it moved five
times and never settled.

## `controls: 0`

The bar is now off, and `disablekb: 1` with it. The picture is not a control.
The transport is the app's own row, which is unambiguous for the reason the
row was never the problem: **a button press is an action.** There is nothing
to infer, so nothing to swallow, so no windows.

This deletes, rather than rewrites: `actFrom`, `PlayerHistory`, `WatchIntent`,
`channelAnswered`, `scrubStands` before them, the four phases, `Drive`,
`mayControl`, `onIntent`, and the whole idea of a follower reading its player
as an instruction. `drive.ts` is a third of its size and has one decision left
— whether the player has done the last thing it was told, which is what stops
a correction being re-issued every tick while it is still on its way.

What is left is exactly the shape that was asked for at the start of the
conversation that produced this: **actions applied in the order they arrive,
fanned out to every player.** That was always how the channel worked. The
complication was never in applying actions; it was in manufacturing one from a
surface that emits none.

**It was blocked before and is not now.** The 2026-09-17 entry rejected
`controls: 0` because the parameter is fixed when the embed is built and the
*floor* moved mid-party, so hiding the bar would have reloaded everybody's
film. The floor left the transport earlier today: anybody in the room may
drive, and that does not change mid-party. The objection went with it.

## What it costs, and what replaces it

Dragging the bar was the only way to reach an arbitrary point in a film, and
±15s is no way to cross two hours of one. The progress readout — already
drawing where everybody is — takes a tap and seeks there.

A tap rather than a drag, deliberately: a drag wants a gesture handler and a
held position that does not follow the channel while a finger is down, and
neither is worth having before somebody has used the tap.

**The frame is inert for everybody now**, which costs nothing it did not
already cost. Whether a click on the picture toggles play with the controls
off is not documented either way; with no control being taken away, refusing
the click is free. A refused video is still interactive, because what is left
in the frame is YouTube's own explanation and the way out it offers.

## The general form

Three entries this week ended with a rule about attribution — know what you
told the device, don't write to it while deciding what you read, finish the
instruction so the player lands where it was sent. All three are true and all
three are consolation prizes for keeping a surface that could not be read.

The one worth keeping: **when a platform will not tell you what caused a
change, do not build a mechanism to guess — remove the second thing that can
cause it.** Four days went into telling two causes apart. Ten minutes went
into there being one.
