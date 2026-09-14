# The recording transport is three glyphs, and there is no card around them

**Superseded the same day by
`2026-09-13-the-transport-is-the-player-s-row.md`.** The row is three filled
`Button`s carrying these glyphs now, built like the player's transport, and
`TransportAction` is gone. What still stands is everything this file says about
what is *not* drawn — no card, no section label, nothing that appears or
disappears, the words surviving as accessibility labels — and why Record and
Resume are one control. Read that file for the part about how it is drawn.

2026-09-13. Follows `2026-09-13-the-indicator-is-one-object-in-the-header.md`,
which took the state off the card and left the card holding only the transport
and the lines around it.

## What changed

The *Recordings* tab opens with three icon controls — record, pause, stop — in
a row, and nothing drawn around them. The `RECORDING` section label is gone and
so is the card.

All three are always present. A control you may press is drawn in the text
colour; one you may not is `textFaint` and inert. Nothing appears, disappears
or moves between states.

The record glyph is the record dot (`lucide/circle-dot`, the same glyph the
*Recordings* tab carries), and it starts a run or resumes a paused one. Pause
is `lucide/pause`, stop is `lucide/square`; both are new to `icons.tsx`.

The lines that were inside the card — the failure, what the last run captured,
the `autoRecord` sentences, and the reason a control is refused — are still
there, directly under the row and unboxed.

## Why

The card was drawing three things that were no longer its to draw.

- **The label repeated the tab.** A `RECORDING` heading directly under a tab
  bar whose selected tab reads *Recordings* announces what the reader has just
  pressed.
- **The card was an empty box.** Once the pill went to the header, what it
  enclosed was a button and some prose. The border was saying *these belong
  together*, which the tab already says.
- **The control moved.** Idle drew a full-width *Record*; a running run
  replaced it with a *Pause* and a *Stop* side by side, and a paused one turned
  the first of those into *Resume*. So the control somebody reaches for while a
  conversation is going on was never twice in the same place, was drawn at the
  size of a primary action, and changed its word under the thumb.

Three fixed positions, greyed when unavailable, is what a transport has always
been, and it is the arrangement where muscle memory works: the square is where
the square was, whether or not it can be pressed.

## What this costs, and what was considered

**The words are gone from the screen.** They survive as `accessibilityLabel` —
"Record", "Pause recording", "Stop recording", "Resume recording" — which is
what a screen reader is told and what the tests assert. The three transport
shapes are the one piece of this application's vocabulary nobody has to be
taught, which is why this row takes the bare-glyph trade and the footer, whose
controls name states rather than verbs, does not. `TransportAction` is
therefore its own component rather than a call into `FooterAction`: the footer
has an accent for the rung you are standing on, and this row deliberately has
no third appearance — the state of the run is the header's job now.

**Record and Resume are one control.** A paused run is the only state where
*start capturing* means resume, and a fourth glyph appearing there would
undo the whole point of positions that do not move.

**The prose stayed.** Dropping it with the card was considered and refused: a
capture that failed, a run that was saved, and the reason a grey glyph is grey
are the three things somebody standing in front of an inert transport needs,
and none of them is drawable.
