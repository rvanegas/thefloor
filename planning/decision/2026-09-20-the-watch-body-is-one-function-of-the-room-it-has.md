# The watch body is one function of the room it has

2026-09-20

`watchShapeFor` in `app/src/ui/layout.ts` takes a pane's width and a body's
height and returns how many columns the *Watch* tab has and how big the
picture may be. `segmentRowsFor`, beside it, takes a count and a width and
returns how many rows a segmented control needs. Both are pure, both are
tested against a table of surfaces, and between them they are the whole of
three changes that were considered separately and are one thing.

## What was wrong

An iPad 10.2" in landscape, build 251, on *Watch*: the transport clipped
mid-button by the pinned footer. Three causes, stacked.

- **The tab strip took two rows it did not need.** `MAX_PER_ROW = 4` reads as
  a rule about how many segments a row holds and argues its case in points —
  "a fifth on a phone leaves each of them about forty points, which is not a
  word" — with a phone's width assumed throughout. On a 740-point pane six
  tabs fit in one row and got two.
- **Nothing capped the picture's height.** The hole was `width: 100%`, a
  `maxWidth: 620` and an `aspectRatio` — three style rules that between them
  answer *how wide* and say nothing about *how tall*. The picture is a sibling
  above the scroll rather than inside it, so every point of its height comes
  out of what the card has.
- **One column was the only arrangement.** A 16:9 picture in a landscape pane
  leaves width to spare and no height at all.

## Why the web is what settled the shape of the fix

The three options were first weighed against the iPad that reported them. What
that missed is the surface with the least height and no way to gain any: a
browser window is short and wide, cannot be rotated, and is resized live. A
rule expressed as a breakpoint on width is silent there; a rule expressed as a
reserve under the picture is not.

So **only the columns are a breakpoint.** The tab rows and the picture's box
are continuous functions of the room available, which is what makes them
correct on a surface nobody has opened yet.

## The numbers, and where each came from

- **`MIN_SEGMENT = 90`** is the old rule's own tolerance, read off the phone it
  was written for: four segments across a 393-point iPhone are 98 points each
  and were allowed, five are 78 and were not. Anything higher would have made
  this change quietly worse on phones — a set of four that has always been one
  row becoming two — so `segmented.test.tsx` pins every count from one to six
  against what the count rule did.
- **`TWO_COLUMN_AT` is a sum**: `PICTURE_MIN_WIDTH` (440, a phone's widest,
  on the same argument `SPLIT_AT` makes about the detail pane) plus
  `COLUMN_MIN` (300) plus the gap. Move either minimum and it follows. It
  lands near `SPLIT_AT` and is deliberately a separate constant: that one asks
  how wide the *window* is, this asks how wide the *pane* is, and a window at
  800 has a 460-point pane.
- **`RESERVE_UNDER_PICTURE = 150`** is the section label, the progress bar with
  its two times, and the transport row. It is a promise rather than a target:
  the card is some four hundred points and does not fit under a 16:9 picture at
  any size, and is not meant to. What was wrong on the iPad was not that the
  card was long but that the fold landed in the middle of a button.

## The rule that keeps it from oscillating

**Both inputs are given rather than produced.** *Two columns when the controls
would not otherwise fit* is the rule anybody writes first, and it flips for
ever: two columns shrink the picture, the picture then fits in one column, and
so on under a finger. The pane's width and the body's height are moved by the
window and by the chrome around the body and never by the answer.

The same reasoning decides who may measure themselves. `Segmented` reads its
own width, which is safe — a row count does not change how wide the control
is. `DockSlot` may not, and must not be given the scroll's height either,
since the scroll is what is left *after* the picture; it is handed the **body's**
height, published by `Screen` through `BodyHeightContext`. This is now rule 8
in STYLE.md § *The rules that are actually load-bearing*.

A happy consequence: the tab strip collapsing to one row on a wide pane makes
the body taller, and that arrives at the picture on its own, through the
measurement, with nothing coupling the two rules together.

## What it touched

`Screen` gained `asidePlace`, which puts the aside beside the scroll rather
than above it, and publishes the body's height. `DockSlot` sizes itself from
the shape instead of from a cap and an aspect. `ChannelView` reads the shape
above its early returns — it was below them for one run of the suite, and
React counts hooks.

Tested in `ui/__tests__/layout.test.ts` (the table, both rules, the reserve
asserted across a thousand body heights, and that the turnover is not
`SPLIT_AT`), `ui/__tests__/segmented.test.tsx` (the phone unchanged at every
count) and `ui/__tests__/channelSharing.test.tsx` (that the answer reaches
`Screen` as a prop, which a pure test cannot see).
