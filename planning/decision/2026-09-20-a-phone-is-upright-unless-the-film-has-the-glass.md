# A phone is upright unless the film has the glass

2026-09-20

A **handheld** is locked to portrait everywhere in the application except
*full screen*, where **both** orientations are permitted. A tablet and a
browser window are never turned. `usePortraitUnlessFullScreen` in
`app/src/watch/orientation.ts`, called once from `Picture.tsx` so that it
covers every screen rather than the channel alone.

This is the third orientation decision in two days and the last of the run:
*Sideways is full screen* (2026-09-19), *A window is not landscape because
somebody turned it* (2026-09-20), and this. What it settles is a question the
first two never asked — not *what does a sideways phone mean* but *may a phone
be sideways at all*.

## Why

Every screen this application has apart from the expanded picture is a column
of rows read upright: the roster, the settings, a transcript, Home. A phone
turned sideways on one of them gets a short, wide version of a layout that
wanted height, and there is nothing on any of those screens that is better for
the turn. The film is the one thing that is, so it is the one thing the turn is
permitted for.

The two landscapes went into the phone's `UISupportedInterfaceOrientations` on
2026-09-20 for the turn-to-expand route — see *The plist decides which shapes
exist* — and what that bought along with the route was every other screen
sideways, which nobody had asked for and which no design in STYLE.md covers.

## Both ways up inside it, which is the half that is easy to get backwards

The obvious implementation of *the film is landscape* is a landscape lock, and
this project had one until 2026-09-20. What it costs is somebody watching a
phone flat on a table or propped upright in bed, who is not asking to be
rotated, and what it cost concretely was the exit bug: the lock was released on
exit, an unlocked phone goes back to how it is being held, and a pressed exit
while sideways handed back the channel screen sideways.

So full screen **releases** the lock rather than reversing it. Either way up is
a supported way to be full screen, the picture is fitted to whichever shape the
glass is, and exiting locks portrait — which is a rotation *towards* the shape
the screen underneath wants. The old bug is not merely laid, it is structurally
impossible: the release of this lock is an upright phone.

## What it removed

**The turn-into-full-screen route, which existed for two days.** A phone
outside full screen is never handed a landscape window now, so the rule that
read one is not merely unreachable, it is meaningless; `useIsLandscape` is
deleted from both orientation modules, and `pressedFullScreen` in `ChannelView`
goes from a tri-state (`null` for *nobody has said*, deferring to the window)
back to a boolean that only a button writes.

The tri-state would have been worse than dead under this lock. Inside full
screen, where the phone *may* turn, the effect that cleared a press on rotation
would have collapsed the picture the moment somebody held the phone upright —
which is exactly the behaviour this decision exists to permit.

**No control was lost.** *Full screen* on the watch card and *Exit full screen*
on the scrim are what every other platform already used and what a phone held
upright always needed. The turn was a shortcut on one surface in four.

## The line, and why it is the same line

`isHandheld` in `ui/layout.ts`, short side under 500. The constant was drawn
for the route that is gone — to tell a window somebody turned from a window
that is merely wide — and it answers this question unchanged: a tablet and a
browser window are landscape sitting still, so telling either which way up to
be would be moving somebody's furniture. They are unlocked, which is what they
would have had anyway.

On the web it is a no-op entirely. `screen.orientation.lock` throws on desktop
and refuses on a phone browser outside the platform's own full-screen element,
which this application never enters — the same conclusion the web reached about
the old landscape lock, whose `returnToPortrait` was a documented no-op there.

## The plist stays as it is

`lockAsync` narrows the set `ios.infoPlist.UISupportedInterfaceOrientations`
allows and cannot widen it, so both landscapes stay listed in `app.json` for
the phone. Taking them out would make full screen a bigger portrait picture
with nothing in the JavaScript to say why. No prebuild is needed for this
change: `expo-screen-orientation` was left in `app/package.json` on 2026-09-20
precisely because dropping it was one.

## Tested

`app/src/watch/__tests__/orientation.test.tsx` — the call made against each
window, the calls being the only thing this side of the bridge can see. The
full-screen block in `ui/__tests__/channelSharing.test.tsx` now presses rather
than turns, and asserts the two things that changed: a rotation moves nothing
outside full screen, and a rotation inside it keeps the film.
