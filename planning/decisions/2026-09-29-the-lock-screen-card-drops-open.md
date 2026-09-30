# The lock screen card drops Open

2026-09-29, by instruction, the same day Out was added. The card now reads:
**channel name, microphone, Out**, and a tap anywhere else opens the app at
the channel.

## What it undoes

`2026-09-17-the-lock-screen-card-shows-its-controls.md` added *Open* as a
`Link` beside the card-wide `widgetURL`, on the argument that *the whole card
is a button* is a convention somebody has to have been taught and the reader
who most needs a way back is the one who has used the app least. That argument
has not been answered; it has been outweighed.

**What outweighed it is room.** With Out added the card carried a word and two
discs beside the name, at `LockScreenCard.scale` 1.5, and *Open* was the widest
of the three — about as wide as both glyphs together. It was also the one
control that did nothing the card could not already do: the tap it spelled out
is still there, unchanged.

## What still holds

The tap still stands in for the sentence a grey microphone cannot carry — open
the app and every reason is in its own place — so STYLE.md's named exception to
*a disabled control is accompanied by a reason* survives with the tap as its
ground rather than the button.

**Below iOS 17 the card now has no control at all**, only the tap: the
microphone is a grey glyph there and Out is not drawn. That was already true of
what the card could *change*; *Open* was the only thing a 16.x reader could
see to press.

The Dynamic Island's expanded row lost it too, and its two discs now sit to the
right of a spacer, where the card has them.

## Not checked

The scale was judged with *Open* and the microphone as the pair. Two discs are
narrower, so 1.5 now leaves the name more room than it was judged with rather
than less — but nobody has looked at this shape on a phone.
