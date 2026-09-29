# Under debug, drift is corrected by hand

A film played alone in a channel, on one phone, showed four seeks in one run on
the drift readout, with nobody else to be in step with. The seeks were the
follower correcting its player against the room's wall clock, which it does
whoever is watching. There is no way to tell from the count alone which of the
four were worth their stutter.

So an account with `debug` set no longer has drift corrected automatically.
`useFollow` takes `byHand`, which `Picture` sets from `app.debug`. With it on,
the follower still asks `followInstructions` the same question it always does
and removes only the seeks from the answer, publishing `withheld: true`. The
readout under the transport has a **Correct drift** button, enabled by
`withheld`, which lets the next correction through unchanged. What a press
releases is exactly what the follower would have done, so the switch changes
*when* a correction happens and never *what* it is.

**Positioning is not held back.** A screen arriving at a party, a rebuilt
player, a scrub and a replay all move the room's position, and a seek there is a
press being obeyed rather than a drift being corrected. The follower keeps which
player it has seen in step (`placed`) and clears that when the transport changes
in a way the clock running cannot explain. A player counts as placed only once
it has been *seen* in step, not just told to seek. A seek can be lost (the
harness loses one under the pause that follows it on a cued player), and a new
screen left at nought with its only correction held back would be worse than
the fault this is meant to show.

Play and pause instructions are never held back, and neither are the stall
rescue's `play` or the cold nudge. Only seeks are.
