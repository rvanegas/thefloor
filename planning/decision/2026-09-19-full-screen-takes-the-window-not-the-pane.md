# Full screen takes the window, not the pane

**The defect, in one line.** Pressing *Full screen* turned the phone sideways
and drew Home beside the film, leaving the picture in the right-hand pane —
narrower than the card it had expanded from, with the transport and the exit
button covering most of what was left.

Nothing about it was a drawing mistake. `FullScreen` fills whatever it is
given, and what it was given was the detail pane, because rotating a phone
crosses `SPLIT_AT`. Every current iPhone on its side is 852 to 956 points
wide, and the breakpoint is 800. So the gesture whose entire purpose is to
give the film the glass was itself the thing that took two-thirds of it away,
and it did so through a rule that is correct: a 900-point window *is* one a
list and a screen share happily. That is true of every screen in this
application except the one that exists to be the only thing on it.

**So the width rule keeps a second input.** `WholeWindowContext` in
`app/src/ui/layout.ts` carries a single boolean, `useLayout` answers `stack`
while it is set however wide the window is, and `FullScreen` claims it with
`useWholeWindow()` on the line below `useLandscapeWhile(true)`.

The two hooks are deliberately the same shape, because they fail the same way.
The release lives in the cleanup rather than beside the collapse, so it
survives the exits nobody presses — the party stopping, the film being
refused, the picture moving to another device. All of those arrive as an
unmount, and a window left with no list in it by a picture that is no longer
there would be a bug with as little visible cause as a phone left locked
sideways.

## What it is not

**Not a general override, and it must not become one.** A screen that wants a
little more room wants a narrower list or a better layout; this is for the one
component whose whole definition is that nothing else is on the glass. It has
exactly one caller and the docblock says so.

**Not a remount.** `Panes` keeps the detail slot at one fixed depth under one
fixed key in both arrangements, precisely so that crossing the breakpoint
preserves what is in it — which here means the claim does not reload the
`WebView` and restart the film. That property was written down for a window
being dragged; this is the second thing it pays for.

**Not a new gesture, either.** Below the breakpoint a channel can be swiped
out from under a finger, and switching the layout back to one screen would
have handed the expanded picture that gesture for the first time — one nobody
designed for it, and one the picture explicitly declines for itself, since its
own responder takes downward drags only. `App.tsx` therefore drops the swipes
while the claim is held, via `useWholeWindowClaimed()`.

## Where it is pinned

`layout.test.ts` gains the two phone-landscape widths, asserting they are
splits — the fact behind the bug, kept as a fact rather than corrected into
one. `wholeWindow.test.tsx` is the claim against a mocked 956-point window, in
both directions. `fullScreen.test.tsx` asserts the claim and the release across
an unmount, beside the orientation test it mirrors.
