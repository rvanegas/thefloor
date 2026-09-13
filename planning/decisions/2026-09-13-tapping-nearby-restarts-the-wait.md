# Tapping Nearby restarts the wait

2026-09-13.

Tapping the *Nearby* rung while already nearby now restarts the clock instead
of doing nothing, and the rung stays live while it is lit so that the tap is
available at all.

**Asked for from the screen it fails on**, which is the same screen that
produced the heartbeat rule four days earlier: nearby, the channel open, the
card reading *Nearby 14m*, the rung accented — and no way to reach the
fifteenth minute except stepping off the rung and back on.

## It was never a policy, and it said so at length

`DECLARE_NEARBY` returned the same state object when the person was already in
`waiting`. The comment above that early return had already argued itself out
of being a rule: *Step out* clears the stamp and *Be nearby* writes a fresh
one, so the two taps the ladder puts side by side in the footer restarted the
fifteen minutes and went on restarting them. What the early return bought was
a stable object for the watchers, and nothing else.

So what was actually shipped was a renewal that cost two taps and named
neither of them. The one-tap version is the same act with the detour removed.

**The tap is the evidence the window is timing.** The window exists to stop a
stale claim outliving somebody who wandered off, and a person touching their
phone is the one person that cannot be true of — the same reasoning that made
a declaration timed from itself rather than from whenever they were last in
the room. Nothing here needs guarding: a cooldown would be machinery to stop
somebody asserting something true.

## Two clocks, and both are restamped

- **`declaredNearbyAt`**, in the reducer, which is the number the roster card
  draws and what `nearbyMs` reads.
- **The server's attention stamp**, in `ChannelRegistry.apply`, because that is
  the clock that actually retires a wait — `expireInattentive` reads it every
  tick. Restarting only the visible number would have let the very next tick
  retire a declaration one second old. A phone with this screen open is
  reporting attention twice a minute anyway, so in practice this closes the
  window between coming forward and the next report; it costs nothing when
  there is none, `attentive` echoing at its own rate.

**It converts as well as renews.** A wait that began by running out of grace
carries no declaration stamp and is timed from the last thing anybody heard. A
tap from that rung makes it a declaration, which is what it now is.

Nothing else moves: the person is added to `waiting` once and stays out of
`present`, `lastActiveAt` is still left alone, and `capNearby` sees no change
in count — the refreshed stamp only makes the re-declared channel the newest
of the five, which is the order that eviction already wanted.

## The rung had to stop being inert

The footer's standing rule is that the rung you are standing on is accented
and inert: grey is that bar's word for *refused*, and being somewhere is not a
refusal, but there is nothing for a tap to do on a place you already occupy.

That holds for *In* and *Out*, which are places. It does not hold for
*Nearby*, which is a claim with a clock on it — the only one of the three that
expires while you stand on it. `FooterAction` gained `repeatable`, which takes
the slot out of `inert` without taking it off the bar.

**It looks no different while lit**, deliberately. What the tap does is
invisible until the number under it moves, and a fourth appearance for one
slot would be teaching the bar a word for something nobody is looking for. The
accessibility hint carries the difference instead — *You are nearby. Tap to
restart the wait* — since a screen reader is the one reader that cannot see
the number move.

## What it does not change

Tapping it is not an arrival being announced a second time. The announcement
lives on the way onto the rung, and the person is already on it; what is
renewed is a claim the room has already been told about.

And it is a renewal rather than an exemption. Silence after the tap ends the
wait on the ordinary schedule, a full window later.
