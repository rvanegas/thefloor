# A film sent to a device floats on it

Reverses half of `2026-09-20-a-film-sent-to-a-device-opens-the-channel-on-it.md`
and the corner rule in `2026-09-20-declining-to-be-the-second-device.md`.

The case that prompted it: one account on two devices. The first is in channel
A on *Watch* with a film playing; the second has channel B open. *Watch on
another device* on the first sent the film to the second, which was meant to
open channel A on its *Watch* tab. Rodrigo reported that the second device did
not visibly respond. Why the navigation failed to show from B was not
established. It did not need to be, because the navigation is what went.

**The film now plays minimized over whatever the second device is showing.**
The ask still subscribes the device to the channel and gives it the screen
role, and `Picture` draws a running film with no slot to dock in as the corner
rectangle, which is what it already did on the first device. A tap on the
corner opens the channel, where the second device is the television as before.

What was removed:

- **`screenAsked` and `takeScreenAsked`**, the one-shot arrival beside
  `screenFor`, and the `App.tsx` effect that spent it by navigating. It existed
  only to tell the server's ask from a local *This device*, so that the first
  could navigate and the second not. With nothing navigating, the role alone
  is enough.
- **The layout effect that gave the role up on leaving the television.**
  Leaving now keeps the film in the corner, as leaving the channel does on the
  first device. The way to give it back stays the television's *Watch on
  another device*, or a rung.
- **The effect that cleared the profile, settings and transcript when this
  device became the television.** A device sitting in a channel's settings,
  handed that channel's film, keeps the settings with the film above them.

**What was not changed.** A device that already has the film's channel open on
an ordinary tab becomes the television as soon as the role arrives, since
`secondDevice` is a reading of `screenIsHere && !steppedIn` at render. That is
the view of the channel a second device draws, not a navigation, so it was
left alone. A paused film still has no corner, so a film handed over paused
is invisible until somebody presses play.

Tests: the two cases in `channelSharing.test.tsx` § *the second device* that
asserted the old rule are inverted, and the two `screenRole` cases about the
arrival are replaced by one asserting the role is all the ask sets. What none
of them reach is the sequence across two real instances, which remains the
outstanding watch-party walk.
