# A window is not landscape because somebody turned it

2026-09-20

Full screen on *Watch* has two ways in again. A *Full screen* button on the
watch card and an *Exit full screen* button on the scrim, on every platform;
and, on a **handheld** only, turning the device sideways — which also collapses
it when the device comes upright.

This reverses most of *Sideways is full screen* (2026-09-19) after a day, and
it is worth being precise about which part was wrong, because the part that was
right is still load-bearing.

## What was right

Turning a phone sideways to make a film fill the glass is the correct gesture,
it is what every other player on the phone does, and deriving the state from
the window rather than from a flag is what stopped the state and the glass
disagreeing. None of that changes.

## What was wrong

`useIsLandscape` is `width > height`, and that was read as *somebody turned
this device*. It is not. Three surfaces are landscape without anybody having
asked for anything:

- **Every desktop browser window.** The web app is a real target —
  `WatchPlayer.web.tsx` — so a web user who was the *screen* and opened *Watch*
  went full screen and stayed there. `useWholeWindow` also claimed the window,
  so the channel list went with it.
- **An iPad held the way iPads are held.** The plist has given the iPad all
  four orientations since 2026-09-01, so unlike the iPhone the iPad needed no
  fix on 2026-09-20 and had the behaviour from the moment it shipped.
- **A phone lying flat on a table**, near enough, where the accelerometer will
  not help.

And none of the three could get out. `returnToPortrait` was the only control on
the scrim, and it is a documented no-op on the web — there is no device to
turn. **The no-op was the tell.** A mechanism whose web implementation is an
empty function is not a mechanism that can carry the only exit from a state.

## The line, and why it is a measurement

`HANDHELD_UNDER = 500` in `ui/layout.ts`, against the window's **short side**.
Under it, turning is a gesture; over it, turning is rearranging furniture.

The short side rather than the width, so one number covers both orientations
and turning a device cannot turn it into a different kind of device — asserted
directly. The number has to clear the widest phone (an iPhone 16 Pro Max is
440 across) and stop short of the narrowest tablet (an iPad mini is 744), and
it sits near the bottom of that gap on purpose: a surface called handheld gets
the turn, and a surface that is not gets the buttons, which work everywhere and
cannot strand anybody.

**Not `Platform.isPad` and not `Device.deviceType`**, per that file's standing
argument, and here the measurement is also the more truthful answer: a Stage
Manager window is whatever size it has been dragged to.

**It is a second rule and not a change to `SPLIT_AT`.** They answer different
questions — how much room there is, versus whether the thing is held — and a
phone on its side is past the breakpoint and still a phone. If they ever shared
a number the turn would stop working on the one surface it exists for.

## Why the buttons came back everywhere rather than only where the turn is missing

Because a control that appears on some surfaces is worse than one that means
the same thing on all of them, and because a phone held **upright** that wants
the film big otherwise has no way to ask. The cost is one button on a card.

## Why the old exit bug does not come back with them

The 2026-09-19 note gives the bug as: the expanded state locked the phone
sideways, exiting released the lock, an unlocked phone returns to how it is
being held, so a pressed exit while sideways handed back "the channel screen
sideways, with nothing on it to say otherwise with".

**The fault was the last clause, not the sideways channel screen.** Landscape
is a supported shape for every screen in this app. What made it a trap was that
the control had removed itself. A sideways channel screen with *Full screen* on
the card is not a trap — and there is no lock left to release: `returnToPortrait`,
`PORTRAIT_HOLD_MS` and every call to `expo-screen-orientation` are deleted. The
dependency stays in `app/package.json` because dropping it is a prebuild; it
has no importer.

## The press is three states, not two

`null` is *nobody has said*, and it is what lets the two routes coexist on a
phone. A press overrules the window until the window changes shape, and then
the window has the floor again — **on a handheld only**. On a tablet a rotation
means nothing, and a picture that collapsed every time somebody turned the iPad
they were watching on would be the new bug in place of the old one.

## What the tests hold

`ui/__tests__/layout.test.ts` gets a second table, every window in both
orientations, plus the invariant that the answer cannot depend on which way up
it is asked. `channelSharing` gets both routes, the tablet that must be left
alone until asked, the tablet that must stay expanded when turned, and the
phone sequence end to end: turn in, press out, turn upright, turn back in.
`fullScreen` keeps naming the absent room controls one at a time.

Its probe for *am I expanded* stays the scrim's `testID` rather than going back
to a control's word, which is what it was before 2026-09-20.
