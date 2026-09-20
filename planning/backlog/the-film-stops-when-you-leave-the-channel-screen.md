# The film stops when you leave the channel screen

The picture stopped belonging to the *Watch* tab on 2026-09-19 — it is mounted
for as long as this device is the party's screen, docked on that tab and
floating in the corner of the other five. See
`decisions/2026-09-19-the-film-is-not-a-tab.md`.

It still belongs to the **channel screen**. `ChannelView` is where it is
mounted, so pressing back to Home unmounts the player and the film stops for
that person — silently, and while they are still stepped into the room, which
is exactly the state the new rule says means *watching*. The room goes on
believing they are: `watchingHere` is the account's presence and a closed
screen does not touch it, so their microphone can still be withheld by
`isScreening` under a film they can no longer see. That is a smaller version
of the defect that was just fixed, and it survives because the fix was made at
the wrong altitude to reach it.

**What it would take.** The player has to be mounted above the router — in
`App.tsx`, beside `Panes` — rather than inside the screen, and the floating
rectangle has to be able to sit over Home, over a profile and over the
transcript. That is a bigger change than the one that was made: the dock
currently measures the body it floats in, which above the router is the whole
window less the safe areas, and the rule about what to do when somebody opens
a *different* channel while a film is running in this one has no answer yet.

**Or the smaller answer**, which is to make it true rather than to make it
work: clear the screen role when the channel screen closes, so the film moves
off this device properly instead of merely going quiet, and the party's
`watchingHere` stops naming somebody who cannot see it. That is a few lines
and it is honest; what it is not is what somebody backing out of a channel for
ten seconds wants.
