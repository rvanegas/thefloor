# 2026-09-18 — Full screen is ours, so the way out is the design

`controls: 0` this morning took YouTube's bar off the picture and with it the
only full-screen button the app had. The question that followed was whether one
could be given back.

## Nothing gives it back from inside the player

Three routes, all closed:

- **The IFrame API has no method for it.** `fs` governs a button on the bar we
  removed; there is no `enterFullscreen`.
- **`iframe.requestFullscreen()` inside the page needs
  `WKPreferences.isElementFullscreenEnabled`**, and
  `react-native-webview@13.15.0` never sets it — `apple/RNCWebViewImpl.m` has no
  such line. Its `allowsFullscreenVideo` prop is Android only, which reads like
  the answer and is not.
- **`playsinline: 1` is deliberate** and is what stops iOS taking the film to
  its own full-screen player the moment it plays. That player is not driveable
  by the channel, so the one native full-screen path available is the one we
  already refused.

So expanding the picture is something the app does to **its own layout**, and
nothing about it is asked of the player. `app.json` already carries
`orientation: "default"`, so landscape costs no Info.plist change —
`expo-screen-orientation` is a new dependency and therefore a rebuild.

## Which makes the exit the whole design

A system full-screen has an exit whether or not anybody drew one: `esc`, a
pinch, a system chrome that reappears. An app-drawn one has exactly what we
drew, and a phone has no `esc` at all. A control somebody cannot find is not a
control that looks bad, it is a person holding a black rectangle with a film
playing in it.

So there are four ways out, and the redundancy is the point:

1. **A `Button` saying *Exit full screen*.** Not a glyph. § *Icons* licenses a
   wordless shape where the shape is the vocabulary; the only exit from a state
   somebody may not know they can leave is not where they learn one.
2. **A swipe down over the picture**, which is what the gesture means
   everywhere else on the phone. `PanResponder`, claiming on the move and only
   downwards — this app carries no gesture handler and one gesture does not
   justify adding one.
3. **Chrome that never hides.** Every other player fades its bar after a few
   seconds; here that would hide the only way out behind a gesture nobody was
   told about, and the same row is how a floor-holder pauses.
4. **Three collapses nobody presses** — the party stopping, the picture moving
   to another device, the film being refused. Each empties the state out from
   under somebody who did nothing, and each lands them back on the card, which
   has the Stop, the switch and the refusal in words around it.

Some of these will look like too many with a month's use, and removing one then
is cheap. A missing one is not: it costs somebody the app while a film is
playing over the top of them.

## What it costs, and why that is affordable

Expanding is an early return, so the `WebView` is reparented and the page is
rebuilt — the film reloads on the way in and again on the way out. The channel
holds the position and the play state and `useFollow` drives a fresh player
back to where everybody is, so the price is a few seconds of black for the one
person who pressed it, not a lost place and nothing at all for anybody else.

The alternative is hoisting the player out of `Screen`'s scroll and floating it
over a measured placeholder, which is real machinery and scroll-sync for a
second of black. That is the thing to build if the flash is what people
complain about, and not before.

An early return rather than a `Modal`, because this codebase contains no
`Modal` at all: the profile, the settings screen and the transcript all replace
the channel screen the same way, and `Introduction` argues the general case.

## What is not shared

Full screen is one device's state and is not in `core`, in a snapshot, or
remembered across the screen closing. How big the film is on somebody's phone
is not a fact about the party, and it is ungated by the *floor* for the same
reason *Watch on* is. It is offered only on the device showing the film: a
phone that handed the picture to the laptop still drives the transport, but has
nothing to expand.

The one departure from § *The shape of a screen* — the transport on a scrim
over the picture rather than a sibling below it — is in STYLE.md § *The
expanded picture*, with the arithmetic that forced it: stacked chrome leaves a
sideways phone about 200pt of film where portrait gives 219, and a control
whose purpose is a bigger picture cannot be built on a layout that shrinks it.
