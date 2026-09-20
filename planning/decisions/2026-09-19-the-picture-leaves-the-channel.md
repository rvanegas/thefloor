# The picture leaves the channel

**The same defect as *The film is not a tab*, one level out, found the same
afternoon.** That entry moved the player off the *Watch* tab's card, because a
tab bar was tearing the film down. It left the player on the channel screen —
and the channel screen is itself a route. Going Home unmounted it, and with it
the `WebView`, the loaded page and the place in the film. Somebody reaching
Home to look something up came back to a party that had lost its screen.

So the rule the first entry half-stated is now stated in full: **wherever the
player is mounted is the furthest anybody can walk without losing the film.**
Mounted on a tab, a tab bar was far enough. Mounted on a screen, Home was.
Mounted above the route table, nothing in the application is — and that is
where it now lives, in `watch/Picture.tsx`, a sibling of `Panes` inside `Root`.
Home, the settings, a profile, a transcript, the contact list: every one of
them is drawn underneath the film rather than instead of it.

It needs nothing from the screen it came from. `app.screenFor` is the single
slot saying which party this device is the screen for, `app.channelViews` holds
that channel's snapshot whether or not anything is looking at it, and
`app.act(channelId, …)` takes the one action the player raises. The picture
reads all three off the provider directly, so there is no channel screen in the
chain at any point.

## The hole, which is what made it possible

Docked, the picture was a row *in flow* in `Screen`'s `aside`: it took its own
height out of the body, exactly as the two pinned bars do, so nothing was ever
hidden beneath it — STYLE.md § *The shape of a screen*, and the rule that slot
exists to keep. A row in flow inside a screen cannot also be a rectangle over
Home.

The way out is not to give the rule up. **The thing in the flow is now a hole**
— `DockSlot`, an empty black 16:9 rectangle of the right width — and the *Watch*
tab renders it exactly where the picture used to be. It measures itself in
window coordinates, the host measures its own origin the same way, and the
picture is positioned over the difference. The body still has its height taken
out of it; what takes it is no longer the thing being drawn.

**And the absence of a hole is the instruction to float.** No screen in the
application has to be told about the picture, ask which tab is showing, or pass
a flag down: a screen that wants the film docked leaves room for it, and every
other screen in the app leaves none. One measurement is the whole protocol.

The hole is keyed on its own identity, and `undock` takes that key. Two screens
overlap for a frame when one replaces another, and an unconditional clear on
unmount let the outgoing screen undo the incoming one's measurement — a frame
of the picture in the corner of a screen that had just made room for it.

## Four corners, and why a quadrant rather than a distance

Floating was anchored to the bottom-right corner of the *body* and dragged from
there, clamped so it could not leave. The corners are the **application's** now:
the picture sits over the pinned header and the pinned footer as readily as over
a body, which is what makes it reachable on Home and in the settings, neither of
which has the same bars. It starts bottom-right — the corner a thumb covers
least of on the way to the footer, and the one furthest from the notepad's and
the invite box's fields — and it snaps to a corner when it is let go, rather
than staying wherever the finger stopped.

The snap is by **quadrant**, not by which corner is nearest in a straight line.
A phone's box is more than four times as tall as the picture is high, so a
rectangle let go halfway up the left edge is genuinely *closer* to the corner it
came from than to either corner on the left — and a snap measuring distance
would put it back where it started, which reads as the drag having failed.
`nearestCorner` is pure and tested for exactly that case.

It rests *against* a corner rather than at a remembered offset, which is what
makes a rotation free: every corner moves, the picture is still in one of them,
and there is nothing to recompute and nothing to clamp. What the rotation does
have to do is drop a half-applied drag, a translation measured against the old
box meaning nothing against the new one.

**The cost, which is real and was accepted:** the picture is the one thing in
this application drawn above the pinned footer. Left in the bottom-right corner
it covers part of it. That is the price of a corner a screen without a footer
can also use, and the answer to it is a drag — three other corners, any of which
it will stay in for the life of the party.

## What was deliberately not done

**Full screen still mounts a player of its own, and still costs a reload both
ways.** It could have been folded in — the picture is already positioned
absolutely over everything, and taking the whole window is one more style — and
the reason it was not is z-order: the transport that is drawn over an expanded
picture belongs to the channel screen, which is underneath the picture's layer.
Hoisting the chrome as well is a larger change than this one, and it collides
with `planning/tasks/real-full-screen.md`, which is open and unwritten. So the
picture simply stands down for as long as `FullScreen` is up — two players on
one party would be two sets of audio — and the flag saying which of the two is
showing moved into the picture's own context, since it now outlives the screen
that sets it.

`ChannelView` keeps a local copy of that flag for a harness that renders it with
no picture above it, and clears the shared one when it unmounts: the screen that
expanded the film can be closed, and a flag left set with nobody to answer for
it would leave the corner player torn down for good.
