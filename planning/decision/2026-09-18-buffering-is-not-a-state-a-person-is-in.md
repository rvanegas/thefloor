# 2026-09-18 — Buffering is not a state a person is in

Reported after the handover fixes landed: pressing Play on the video's own bar
sometimes starts the film and immediately stops it again.

## What it was

**A press goes `paused` → `buffering` → `playing`, and a tick is half a
second, so the reading a follower most often catches is the middle one.**

`buffering` is not a state a person can be *in*, so `actFrom` does not read it
as anything — rightly, since it is also what a stall and a seek look like. The
tick then fell through to `followInstructions`, whose paused branch stops a
buffering player on the reasoning that it is one on its way to playing. That
reasoning is correct for a player this follower started and wrong for a thumb,
and the difference is invisible in the reading.

So the press was not merely missed. It was actively undone, half a second
after it was made, by the same device it was made on.

## The rule that was already there, applied to one more case

The whole shape of this follower is that **it never commands a player whose
state it might itself have caused**. `watching` is the phase in which nothing
has been said, which is exactly why a press can be believed there — and a
transition seen in `watching` is, by the same argument, nobody's but the
player's owner.

So it waits: a **`settling`** phase that says nothing to anybody until the
player lands on a state that says what it was. Then `playing` reads as a
press, `paused` reads as nothing having happened, and neither is guessed at.

**Only `buffering`.** A `cued` player is not on its way anywhere and never
leaves that state by itself — it is how a screen arrives, and waiting for it
to settle would be waiting for ever.

The cost is that a correction genuinely owed to a buffering player is a tick
later than it used to be, which nobody can see.

## The fuse has to burn through

A player can buffer and never land. The wait is a silence, so nothing corrects
it and the channel loses the screen.

`WATCH_OBEDIENCE_MS` ends the wait — but the tick that ends it **must go on to
correct the player in the same breath**. Returning to `watching` and stopping
there meets the buffering test again and starts a fresh wait with a fresh
timestamp: a fuse that re-lights itself every time it reaches the end, which
is no fuse at all. That was the first version of this, and it passed every
test in the file, because every test had a player that eventually landed.

It has one of its own now — a player that buffers for ever, asserting the
pause does arrive.

## On the testing

The reproduction only fails at some buffer durations: whether a tick lands
inside the buffering at all depends on where the press falls between two of
them. The first attempt used 400ms, which ends before the next tick, and
passed against the broken code.

**One duration proves one alignment**, so the regression is a sweep — either
side of a tick and either side of the fuse — plus the case where the press is
not an instruction at all, which must still be corrected away.
