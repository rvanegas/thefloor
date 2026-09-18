# 2026-09-17 — A press is not one reading

The video's own controls became the party's controls this morning. On a phone
the same evening they became a fight: Play produced play-pause-play-pause and
settled on pause, and the volume indicator flickered up and down throughout.

## What was actually happening

Both symptoms are one loop.

`intentFrom` asked whether the player was out of step with the channel and
whether it had *changed* since the last tick. A player that has just been
told to play has also changed — it reports the state it was in for a moment
and then buffers — so the follower read its own unobeyed command as somebody
pressing something, sent that to the channel, and the room obeyed. The
channel now disagreed with the player in the other direction, the correction
went out, and the next reading of *that* was the next instruction.

**The volume indicator was the same loop seen from the audio session.** Each
`WATCH_PLAY` re-samples whether the room can be unmuted and each
`WATCH_PAUSE` releases it, so a transport oscillating at two transitions a
second opened and closed every microphone in the room at the same rate — and
the device's own session flipped between playback and play-and-record with
it, which is what puts the system volume overlay on screen.

## A press is durable and a blip is not

The repair is not a better single-instant test; there isn't one. At one
instant a thumb and a player halfway through obeying are the *same reading*.
What tells them apart is time: a press stays pressed, and the embed's small
lies — a state reported late, an advert starting, a stall that resolves
itself — do not survive half a second.

So the question is asked in two parts.

**`contradictionFrom` in core** says whether a disagreement is unexplained:
the channel did not move, this follower did not just speak, the player is not
between states. It returns a *candidate*, and it is deliberately no longer
named for intent — it cannot know intent.

**`useFollow` decides whether it was meant**, by seeing whether the same
candidate is still standing a tick later, and **leaving the player alone
while it waits**. That last clause is not a detail: correcting inside the
dwell would undo the very press being waited on, which is the original defect
arriving half a second late. The cost is that a genuine correction is
delayed one tick on a device that may drive, which nobody can see.

## Three more holes the same evening closed

- **`commandedAt`.** `seekedAt` existed because a seek does not land at once;
  play and pause do not either, and nothing remembered having issued them.
  This is the guard that would have prevented the whole thing on its own, and
  its absence is the actual bug.
- **Readings a tick apart, or not compared at all.** A stalled player falls
  behind by exactly the gap between two readings, so at a tick apart the
  error is bounded under `WATCH_DRIFT_MS` and a stall can never read as a
  scrub. Let the gap grow — the app goes behind something else and the timer
  throttles to minutes — and the reading that comes back describes a player
  stopped the whole time against a transport that never was: a phone coming
  out of a pocket dragging the party back to where it went in.
- **The tick the app comes back on.** The foreground guard covered being
  away and not returning, which is the dangerous half.

And a quiet period after any press, which is belt and braces rather than a
rule about people: if a player and a channel do manage to argue, the worst
they can now do is one transition every two seconds instead of one per tick.

## What this cost, and the general form

A day's work shipped in the morning and was unusable by the evening, on the
one path no test covered: `followInstructions` and `intentFrom` were each
tested alone, and the loop lived between them. The follower's own dwell now
has tests of its own in `app/src/watch/__tests__/follow.test.tsx`, driven by
a fake player and a fake clock, and the first of them fails against the code
that shipped.

The general form is worth keeping: **a rule that reads a device's state and
acts on it must know what it has already told that device**, or it reads its
own instructions back as somebody else's.
