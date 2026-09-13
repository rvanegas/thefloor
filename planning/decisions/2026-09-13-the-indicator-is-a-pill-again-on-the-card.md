# The indicator is a pill again, on the card

2026-09-13. The running-recording indicator on the Recording card was a bare
row of two words — *Recording* and the clock — and is the pill it used to be
in the header: the disc, the word and the clock inside a hairline.

## What this reverses, and what it leaves alone

2026-09-12 split the indicator in two. It had been a second row of the channel
header, a pill carrying all three parts, and a whole row of every screenful of
every tab is a great deal to spend on a fact that a disc states — so the disc
stayed pinned at the top beside Settings and the word and the clock went down
to the Recording card, above the transport that acts on them.

**That split stands; only the styling of the half that moved is changed.** The
header still carries the disc and nothing else, and the duration is still in
one place. What was wrong was that the half which moved arrived as a caption.
A pill and two words are not the same object drawn twice — they are an
indicator and a label, and the one somebody recognises from the top of the
screen is the first.

The disc is duplicated on purpose. A state drawn one way where it is announced
and another way where it is acted on is a state a reader has to learn twice,
and the card is where somebody goes to pause or stop: the thing they press
*beside* should be the thing they saw *above*.

## Two things the old pill's style could not keep

**`alignSelf: 'flex-end'`** was about the header, where the pill was alone on
its row and the row belonged to the buttons at the trailing edge. Everything
in the card begins at the leading edge, so the pill does too. The property is
still needed at all: without it the pill stretches to the card's width and
stops being a pill.

**`backgroundColor: colors.surface`** is kept verbatim and now does no work,
the card behind it being `surface` as well, so the hairline draws the whole
shape. The token that would lift it off the card is `surfaceRaised` — which is
the default `Button` fill, and a pill wearing it directly above *Pause* and
*Stop* would read as a third button that does nothing when pressed. An outline
that is plainly not a control is the better of the two, and this is the reason
the pill is not simply re-tinted when somebody next notices the fill is inert.

## Testing a shape

The test finds the disc by colour, for the reason `dangerLines` gives in the
same file — the red and the word must not be able to drift apart — and a disc
is a `View` with no text in it, so there is nothing else to find it by.

**It searches inside the pill rather than the tree.** The header draws the same
disc in the same two colours and the header is part of that tree, so a bare
search for `colors.recording` passes on the header's alone: the half that never
changed. The pill is what is new, and its radius is the only thing shaped like
one on the screen. The paused colour is asserted rather than assumed, being a
second style laid over the first and so the one that can silently stop being
applied.
