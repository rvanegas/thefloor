# The lock is the film's rather than the application's

2026-09-20

**Turning a handheld sideways expands the picture again, and turning it
upright collapses it.** The *portrait lock* is narrowed from *everywhere but
full screen* to *everywhere but the film* — the watch card with a film this
device can expand, and the expanded picture — which is what makes a landscape
window on a phone mean something again. `usePortraitUnlessAtTheFilm` in
`app/src/watch/orientation.ts`, `isTurned` in `app/src/ui/layout.ts`,
and the derivation in `ChannelView`.

This is the fourth orientation decision in two days and it reverses one
paragraph of the third. *A phone is upright unless the film has the glass*
(2026-09-20) is otherwise intact and is still the rule; what it got wrong was
the scope of its own exception.

## What was wrong with it

That decision locked the phone upright on **every** screen but full screen,
and observed — correctly — that this makes the turn-into-full-screen route
unreachable: iOS never hands a portrait-locked application a landscape window,
so there is nothing for `useIsLandscape` to read. It then concluded that the
route was therefore meaningless and deleted it.

The conclusion does not follow. The route was unreachable *because of where
the lock was drawn*, and the lock was drawn there for a reason that does not
reach the watch card. The reason is worth restating exactly, because it is
still right: every screen in this application apart from the film's is a
column of rows read upright, and a phone turned sideways on one of them gets a
short, wide version of a layout that wanted height. The roster. The settings.
A transcript. Home.

The watch card is not one of those. It is the screen with the film on it, it
was rebuilt on 2026-09-20 as a continuous function of the room it has — see
*The watch body is one function of the room it has* — and a phone turned on
it is a phone asking for the picture. So the exception is two screens rather
than one, and the turn comes back with nothing else changing.

## Why the window is honest now

`isTurned` is `isHandheld(size) && width > height`, and both halves carry a
failure this project has already had.

*A window is not landscape because somebody turned it* (2026-09-20) is the
first: a desktop browser window, an iPad held the way iPads are held, and a
phone lying flat are all landscape without anybody having asked, and all three
entered full screen on *Watch* and could not leave. `isHandheld` is the line
that excludes the first two, and 500 is where it is drawn.

The second is new and is what this decision adds: **a handheld is landscape
only where it is allowed to be.** Under a lock that covers the film's screens
and nothing else, a landscape window on a phone cannot be some other screen
that happened to be wide. It is the watch card or the picture, and it got
there because a wrist moved. The reading is not an inference about shape any
more; it is a consequence of the lock.

That is the general shape of it, and it is why the two decisions are not in
tension: the 2026-09-20 lock *made* the window reading true, and then deleted
the thing that was true.

## A press expires on the turn

`pressedFullScreen` stays a boolean and still means one thing: somebody asked
for the picture **without turning anything**. It is what a laptop asks with,
what an iPad asks with, and what a phone held upright or lying flat asks with
— iOS holds the interface orientation it had when the gravity vector stops
saying anything, so a flat phone never turns and never turns back, which is
the case the button exists for on a phone and is why **portrait remains a
supported way to be full screen.**

**And it is cleared the moment `turned` goes true.** Without that, somebody
who pressed *Full screen* upright and then turned the phone holds a press and
a turn at once, and turning back leaves the press standing: the picture
refuses to collapse for a gesture that visibly should collapse it. The turn is
the stronger statement and takes the flag with it.

This is not the tri-state the previous decision rejected, and the objection it
raised does not apply. That one was `null` for *nobody has said*, with an
effect that cleared a press on **any** rotation — which inside full screen
would have collapsed the picture the moment somebody held the phone upright.
This clears on one edge only, into `turned`, and the collapse on turning
upright is now the intended behaviour rather than the bug.

## The exit button is not drawn on a turned phone

This is the one thing lost, it is deliberate, and it is rule 9 in STYLE.md.

While the phone is sideways the state is the window. A press of *Exit full
screen* there would set a flag the window immediately overrules — the window
does not change because somebody pressed something — so the button would be
visibly dead. **A dead control is worse than an absent one**, because the
person presses it, nothing happens, and there is nothing on the screen to say
why. Turning the phone upright is the way out, and it is the gesture every
other film on that phone answers to.

Everywhere else the button is the whole of the control, and that is most
surfaces: a laptop, an iPad, and a phone held upright or lying flat, none of
which has a turn that would get them out.

**The alternative was considered and loops.** Make the exit press lock
portrait, so the phone rights itself: the window then becomes portrait, the
press has served its purpose and is cleared, the lock is released because the
card is still a turnable screen — and the phone, still physically sideways, is
rotated straight back into landscape and into full screen. Every variant of
*let the button right the phone* ends there, because the only signal available
is the interface orientation and the interface orientation is the thing being
overridden. Distinguishing *the person turned the phone* from *we turned the
phone* needs the accelerometer, which is `expo-sensors`, which is a native
dependency and a prebuild for a button that has a working alternative one
wrist-flick away.

## What the lock still buys

Nothing is ever pinned to landscape, which is what made the original exit bug
a bug. Leaving the film — a tab away from *Watch*, a party that stopped, a
film refused, the picture moving to another device, a settings screen — locks
portrait, which is a rotation **towards** the shape the screen underneath
wanted. Whatever comes next arrives upright however the phone is being held.

`atTheFilm` is deliberately the same expression full screen itself is guarded
by, so there is no state in which the window is landscape and the turn is
ignored, and none in which the phone is unlocked on a screen with nothing to
turn onto. `ChannelView` computes it and writes it into the picture's context,
which is where the lock is applied — the rule is the whole application's and
the picture is the one thing that outlives the channel screen.

Reading `slot !== null` instead was the near miss and is written up in
`Picture.tsx`. A hole is left by the *Watch* tab and by nothing else, which is
the right condition, but it is a layout measurement: null for a frame before
`onLayout` lands, and null once already for the bug in *The hole outlives a
refusal*. A lock that flickers rotates a phone.

## The web

`usePortraitUnlessAtTheFilm` is a no-op there, as its predecessor was:
`screen.orientation.lock` throws on desktop and refuses on a phone browser
outside the platform's own full-screen element, which this application never
enters.

**The turn works there anyway**, which is new and is a consequence of the lock
having been the half that was missing rather than the half that was doing the
work. A phone browser turned sideways is handed a landscape window by the
platform without being asked, which is exactly what `isTurned` reads. What is
missing on the web is only the righting of the phone on the way out, and a
phone browser has no way to be righted by anybody.

## Tested

- `app/src/ui/__tests__/layout.test.ts` — `isTurned` against the same table of
  surfaces `isHandheld` uses, plus the three properties the feature rests on:
  never true of a window nobody can turn, exactly one of the two orientations
  of a handheld, and portrait on a tie.
- `app/src/watch/__tests__/orientation.test.tsx` — which call is made against
  which window, the calls being the only thing this side of the bridge can
  see.
- `app/src/ui/__tests__/channelSharing.test.tsx` § *Full screen* — the turn in
  and the turn back out, the absent exit on a turned phone, the press expiring
  on the turn, and the press surviving every rotation of everything that is
  not a handheld.
