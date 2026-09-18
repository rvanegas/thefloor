# 2026-09-18 — The motion belongs to the journey, not to the gesture

Reported alongside the reversal: tapping a channel card on Home, and tapping
Home in a channel header, should travel the way the swipe does. They should,
and the fact that they did not is a design error rather than a missing feature.

## What was wrong with owning it in the responder

The slide shipped the same day as the swipe and lived inside
`onPanResponderRelease`: set the arriving screen at an edge, call the handler,
animate home. Which made the motion **the gesture's property**. But a swipe
into a channel and a tap on that channel's card are the same journey to the
same place, and a screen that slides for one and simply appears for the other
is saying they are different things. Worse, it makes the animation a reward for
discovering the gesture — the people who most need to be shown which way they
just went are the ones who never swipe.

## What decides instead

`Panes` now takes `open`: whether the detail slot holds a screen of its own
rather than the tier it falls back to. The travel is `open` changing, whatever
changed it — a card, a header button, a swipe, a notification, or being closed
out of a room by something that happened elsewhere. The responder's release now
does nothing but call the handler.

**Two states rather than a depth.** Below the breakpoint there are two: the
list, and a screen over it. Moving between two screens is not an arrival, it is
the same slot with something else in it, and it does not move.

**Going in comes from the right, going out from the left**, which is the
direction of travel of the reversed swipe and of every back gesture on every
phone. The two now cannot disagree, because there is only one of them.

## The layout effect, which was arrived at the hard way

The offset has to be on the slot in the same frame that mounts what is
arriving, or the new screen is drawn in place and then jumps to an edge to
start — a flash exactly where the eye already is. The old code got this by
setting the value *before* calling the handler, which only worked because the
gesture knew what it was about to do.

Doing it during render, which is the obvious replacement, is wrong and React
says so out loud: an `Animated.Value` with a JS subscriber updates that
subscriber, so setting one mid-render is setting state in another component
while rendering. It is a layout effect, which runs inside the commit — the
`setValue` lands in the same batch of native operations as the mount.

## Where it does not happen

A split, as before: both screens are up, the slot is not a way in or out of
anything, and a window dragged across the breakpoint must not fling the pane
about.

**And the web**, which is new, and is the same line the gesture draws. There
the way back is the address bar and the browser's own history; a screen that
slides when the back button is pressed is this app animating something it does
not own. Nobody asked for motion on the web and it would have arrived as a side
effect of this. It is one condition if that is ever wanted.
