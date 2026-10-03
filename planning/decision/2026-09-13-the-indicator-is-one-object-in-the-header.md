# The recording indicator is one object, and it is in the header

2026-09-13. Supersedes the split made earlier the same day
(`2026-09-13-the-indicator-is-a-pill-again-on-the-card.md`, and the split
itself, from the six-tabs work of 2026-09-12).

## What changed

There is one recording indicator. It is the pill — the disc, the word and the
clock inside a hairline — and it lives in the channel header, in the row that
holds Settings and Home. The bare disc that stood to the left of Settings is
gone, and so is the pill on the Recording card.

## Why

The split drew one state twice. The header carried a disc; the Recording card
on the *Recordings* tab carried a disc with a word and a clock beside it. The
previous entry already conceded half of this — it restored the card's version
to the full pill precisely so that a reader would recognise the same object in
both places — which is an argument that there should be one object, not that
there should be two drawings of it.

Everything the split was for is satisfied by putting the whole pill in the
header instead:

- **The fact you need at every moment is pinned.** It was, as a disc; it still
  is, and now it says what is running and for how long without a tap.
- **The duration is in one place.** It is, and that place is on screen from
  every tab rather than behind one of six.
- **A whole row of every screenful is not spent on it.** It is not: the pill
  is on the row that already exists, beside the two buttons.

The card keeps what only it can say — the failure line and the transport. A
reader who has come there to press Pause or Stop is looking at the indicator
while they do it, at the top of the same screen.

## What it costs

The channel name's width, and only when a recording is running. The header row
is the name and the controls; the pill takes what it needs, the name takes the
rest and truncates.

That is the arrangement rather than a defect in it. The name is the one thing
on the row that degrades gracefully: a truncated name still identifies the
channel, and the full one is behind the button immediately beside it — the
same reasoning that put the name back on this row on 2026-09-12. Whether the
name has more room or less, what does not fit ends in an ellipsis. `headerMain`
carries the `flex: 1` that takes the slack, `headerActions` an explicit
`flexShrink: 0` so the row of controls is never what gives, and the two name
`Text`s their `numberOfLines={1}`.

## Two details at the style

`alignSelf` changes from `flex-start` to `center`: the pill's neighbours are
44pt glyph buttons and the pill is shorter than they are, so it wants the row's
centre line. Removing the property entirely is not the alternative — the pill
would stretch to the row's height and stop being a pill.

`marginRight: spacing(0.5)` is the pill's own gap. Its two neighbours space
themselves with the padding inside their touch targets, which a pill does not
have.

The `surface` fill and hairline border are unchanged from the card, and for the
unchanged reason: the token that would lift the pill off a surface is
`surfaceRaised`, which is the default `Button` fill, and a pill wearing it reads
as a control that does nothing when pressed.
