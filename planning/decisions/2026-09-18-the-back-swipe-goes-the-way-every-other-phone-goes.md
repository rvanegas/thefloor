# 2026-09-18 — The back swipe goes the way every other phone goes

Reported backwards, hours after it shipped, which is the line
*A screen arrives from the side it was asked for* wrote down in advance as the
one to reread. The swipes are reversed: **right goes out to Home, left goes in
to the room you are standing in.**

## Why the first version was the other way round

Not a coin toss. The reasoning was the layout: above the breakpoint Home is the
column on the *left*, so going to Home is looking left, and the phone's gesture
should say the same thing the split says. Internally consistent, and the entry
argued the collision away honestly — this app has no navigation stack and no
system back gesture of its own, so nothing would actually break.

## Why that lost

**The consistency was with a screen nobody is looking at.** Somebody swiping on
a phone is not holding the tablet layout in their head; they are holding every
other app they have ever used. iOS's back is a swipe right, Android's is an
edge pull rightwards, and the direction is not a convention people know they
know — it is in the thumb. A back gesture that runs the other way does not read
as *different*, it reads as *broken*, and it costs the thing the gesture was
for: a second way to do something that already worked.

The entry that shipped it said the muscle memory was real and named this as the
reread. Taking that seriously on the first report is the whole value of having
written it down; arguing from the layout a second time would be arguing with
evidence.

## What actually changed

Two handlers, swapped in `App.tsx`. Everything else held:

`swipe.ts` answers a direction and has no opinion about what is in it.
`Panes` puts the arriving screen at the edge the thumb came from, which is a
statement about the gesture rather than about which screen is which, so the
animation was already right for both arrangements and its arithmetic is
untouched. The asymmetry survives too — out is offered only from a channel,
in only into `live` — so they are still not each other's undo.

That the reversal is a two-line change is not luck; it is what separating the
thresholds from the responder and the responder from the routing bought, and
this is the first time anything has been asked of that separation.

## The way back in lands where you left

Reported in the same breath, and it is the same complaint: swiping out of the
notepad and straight back in put you on the roster. The tab is `ChannelView`'s
own state, deliberately **local and unremembered** — a channel opened is a
channel somebody is about to stand in, and the roster is what that person came
for. That argument is about *opening* a channel and it still holds.

It does not reach the swipe pair. Nobody swipes away from the notepad in order
to arrive at the roster, and the trip is short enough that the tab you left is
still the one you meant. So `Root` keeps the last tab per channel in a ref,
fed by a new `onTab` report from the screen, and **only the swipe back in reads
it**. Tapping a channel still lands on the roster, unchanged.

A ref rather than state because no render reads it: holding it in state would
rerender the whole application on every tap of the tab bar. And keyed by
channel, so swiping out of one and into another is not a restoration of the
wrong screen's tab.

The screen still owns its tab. `onTab` is a report, not the other half of a
controlled pair — nothing above can *set* the tab except by asking for one at
mount through `tab`, which is the one-shot request the introduction checklist
has always made.
