# Patience with a buffering player is bounded

A follower that has been buffering for `WATCH_STALL_MS` — ten seconds — stops
being treated as *on its way* and is seeked to where the room is and told to
play. Reported from a real party: one member watching happily, another looking
at a frozen frame and a spinner, and the only cures a human pausing and playing
or toggling full screen.

## Why it was unreachable

**A buffering player is told nothing at all**, which is right and is staying.
The rule came in on 2026-09-18 with the seek storm it was written against: a
seek does not merely fail to help a player that is refilling, it throws away
what it has collected and starts fetching somewhere else. A player that cannot
keep up therefore never gets to finish — it stalls, the transport is a wall
clock and runs on without it, the drift passes `WATCH_DRIFT_MS`, the follower
seeks, the seek discards the part-filled buffer and stalls it again.

What that rule assumed is that a stall ends. Almost all do. **The ones that do
not had no exit whatever**: `hasArrived` says a buffering player has not
arrived, so the follower never falls silent for it; `followInstructions`
returned nothing for it in the playing branch, so the follower never spoke to
it either. Every other state a player can be in is either corrected or leaves
by itself. This was the one state the application would not revisit.

The two cures people found say the same thing. Pausing and playing is exactly
the pair of instructions the playing branch had stopped issuing — the *paused*
branch does address a buffering player, which is why a pause gets through at
all — and leaving full screen rebuilds the frame around the player. Both are a
person doing by hand what nothing was doing on its own.

## The shape of the bound

**Ten seconds**, which is far past an ordinary refill on a bad connection and
far short of anything somebody would sit through twice. A buffer that has not
filled in ten seconds is not filling, and the seek that throws it away is
throwing away nothing.

**Once per window, not once per tick**, and this is the property that keeps the
2026-09-18 fix intact. The stall clock restarts whenever a stalled player is
told something, so a player that genuinely cannot play is prodded every ten
seconds rather than twice a second. Without that the nudge would be the storm
under a new name.

**The clock is `drive.ts`'s and the meaning is `core/`'s**, which is the
division that file already keeps: it owns the tick and how long a state has
held, and `followInstructions` decides what a number that large means. The
clock is kept before every early return in the tick, so a player buffering
while the follower is deaf — waiting out an instruction, or holding off an
advert — still accumulates the time it has been stuck.

## What this does and does not claim

It is a **recovery path rather than a diagnosis**. Nothing here knows why a
given embed stopped: a lost connection, a decoder that gave up, an iOS WebView
that was backgrounded at the wrong moment. What it restores is the property the
party should have had all along — that a screen out of step comes back into
step without anybody pressing anything — and it does that whatever the cause.

Two things it will not reach, both of them different symptoms:

- **A player that never started** shows a poster rather than a frozen frame,
  and on the web that can be the browser's autoplay policy refusing a `play`
  nobody gestured for. It is not this.
- **A party that learned an advert's length** blocks `showingTheFilm` for every
  screen showing the real film, and the follower then says nothing regardless
  of state. Pausing and playing would not clear that, which is one of the
  reasons it is not what was reported.

The end-to-end test is in `transport.test.tsx`, against a player that stalls
with nothing on the far side and answers nothing it is told — the harness's
existing stall recovers by itself, which is the case that was already covered.
