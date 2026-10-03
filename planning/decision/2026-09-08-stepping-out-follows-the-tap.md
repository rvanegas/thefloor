# Stepping out follows the tap — 2026-09-08

Step Out closed the channel screen from the first build, and until `tapToLook`
existed that was not a decision anybody had made. Every route into the screen
stepped in first, so the screen you were looking at was the room you were in;
once you had left the room there was nothing on the screen that was still
yours to look at, and closing it was the only thing left to do.

`tapToLook` broke the identity at one door and left it standing at the other.
Somebody who has turned *Tap a channel to look, not step in* on has said that
the screen and the room are two things: a tap opens one without entering the
other, and looking at a channel you are not in is an ordinary state the screen
already draws well — the footer offers Step In, the cards say what the room is
carrying, and none of it wants closing. But Step Out went on closing the
screen, so the same person had to deliberately walk in, step out a minute
later, and find the channel gone from under them.

**So the setting governs both doors.** `stepOutClosesScreen` in
`app/src/ui/ChannelView.tsx` is `!app.tapToLook`, and one `stepOut` helper
serves the footer and the card, which are the same control drawn twice and
exactly the pair that drifts once there is a condition in it. Unset — the
default — nothing changed for anybody: the tap arrives, and stepping out
closes. Set, stepping out gives up the room and leaves you looking, and the
header's *Close* is the way off the screen, which is where it already was for
that person on the way in.

**What it is not.** Not a second setting. The symmetry is the whole argument:
having said once that a tap is only looking should not have to be said again
at the other door, and a separate switch for the exit would be asking. And not
a change to what the verbs mean — see GLOSSARY.md § *Step in / Step out*, which
now says that neither is about navigation. `STEP_OUT` is the same action to the
reducer either way; what varies is only whether the app also drops the snapshot
and tells the caller.

**Nearby stays unconditional**, and it is worth saying why the two now differ.
Nearby never closed the screen and still never does — staying within reach is
the point of it, and promotion arrives over the websocket that this screen is
what watches. The setting only decides whether Step Out agrees with it.

The one thing to hold on to: `onClose` is not `onExit`. Closing is navigation
and leaves the channel watched; `onExit` is for having given up presence or
membership and drops the snapshot with `leaveChannelView`. Stepping out with
the setting on is neither — the room goes, the screen and its subscription
stay.
