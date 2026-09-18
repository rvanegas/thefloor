# 2026-09-18 — A screen arrives from the side it was asked for

**The two directions below are reversed by
`2026-09-18-the-back-swipe-goes-the-way-every-other-phone-goes.md`**, written
hours later on the first report that the gesture felt backwards — which the
closing paragraph of *The direction is the task's* predicted. Everything else
here stands: the thresholds, the gates, the commit-on-release, and the motion
argument. Read *left* as out and *right* as in below, and the other way round
in the code.

Swiping, from `tasks/swiping.md`: left from a channel goes to Home, right from
Home goes back into the channel you are standing in. Both were already one tap
— the channel header names Home, and the tier's live bar has been a permanent
statement of which room you are in since 2026-09-08. **The gesture is a second
way to do two things that already work**, and was taken on that basis rather
than in spite of it: the tap stays, nothing is moved or removed, and somebody
who never discovers the swipe loses nothing.

## What the thumb does, and what it does not

**The screen does not follow the finger.** A swipe past a threshold commits on
release, and the arriving screen crosses from the edge in 220ms. Dragging out
and back is a cancel, for free — `dx` is net displacement, so a thumb that
changed its mind arrives at the release with nothing to show.

True finger-tracking was priced and declined. It needs the destination mounted
before the drag starts, which for a right swipe means mounting `ChannelView`
speculatively — and its mount sends `watchChannel` and deliberately never
unwatches, so an abandoned drag would leave a watch behind for a room nobody
entered. It also needs the gesture off the JS thread to stay smooth while a
room is live, which is `react-native-gesture-handler` and Reanimated: three
native packages, a `babel.config.js` this app does not have, a prebuild, a
`.web` split and two more jest mocks, to make one gesture reversible mid-drag.
`Animated` from React Native core with `useNativeDriver` costs none of it.

**That door is not closed.** The pan lives in one component, so tracking is a
change to `Panes` and nothing else — and by then there would be evidence that
anybody uses the gesture, which is the same argument *The picture is not a
control* made against a drag six hours earlier.

## Where it is allowed, and why each gate is there

**Below the breakpoint only.** In a split both screens are on the screen at
once and going to Home is looking left. Handing a split no handlers is also
what keeps the detail pane still while a window is being dragged across the
breakpoint, which is the one case where this could have moved something nobody
touched.

**Not on the web**, where a horizontal drag is a text selection, two fingers on
a trackpad are the browser's own history, and there is an address bar — a way
back that a phone does not have.

**Left is out, right is in, and they are not each other's undo.** Left is
offered from a channel screen and nowhere else: settings, help and a profile
have unambiguous back buttons and no return gesture to pair with, so a swipe
off them would be a way out with no way back. Right is offered only into
`live` — the room this device is *standing in*, not the last one somebody
looked at. So looking at a channel without stepping into it and swiping away is
a one-way trip, by the tap it always was. **A direction with nowhere to go is
inert**: the gesture is not taken at all, so there is no movement, no bounce
and nothing to explain.

**The direction is the task's, and it is not iOS's.** Swipe left to go to Home
means Home is the page to the right of the channel; iOS's system back gesture
is a swipe *right*. This app has no navigation stack and no system back gesture
to collide with, so there is nothing to break — but the muscle memory is real,
and if the gesture is reported as backwards this is the line to reread. *It
was, and this is the line that was reread.*

## Motion, which was a standing commitment until today

`STYLE.md` § *Feedback and motion* opened with **there is no animation** and
had been true since the beginning. A swipe is the case that breaks it: a screen
that replaced another with no travel between them does not say which way the
gesture went, and a gesture whose direction is invisible is one nobody learns.

The rule that replaces it is narrower than *no animation* and much narrower
than *animation is fine now*: **motion that carries information, and nothing
else.** A fade on a card, a spring on a button and a shimmer on a list cannot
make the argument this made, and the entry exists partly so that the next one
has to make it again.

## What is not proven

The thresholds — 12 points to take the gesture, 60 to commit, a flick at 0.5
points per millisecond, and twice as wide as tall to count as sideways — are
tested exhaustively as a table and have never been felt by a thumb. Every
screen under this gesture scrolls vertically, and how cleanly a capture-phase
responder gives way to a native `ScrollView` mid-scroll is the thing a device
tells you and a test cannot. Expect the table to move once; it is one file.
