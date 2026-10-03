# A disclosure is not an act, and stops being drawn like one

`Button` has a fifth variant, `quiet`: no fill, the tightened padding, a 13pt
label. Its one caller is the introduction card's *See more*.

## What was wrong with it

The card draws one rung in full — an instruction, a note, and a button that
goes somewhere — and puts the rest behind *See more*. Since
`2026-09-24-the-ladder-waits-its-turn.md` that includes finished rungs, so the
control is on screen for most of a new account's life.

It was a `default` `Button`, which meant a 48pt filled pill sitting directly
under the rung's own 48pt filled pill. Two controls of identical weight, one
under the other, offering two things that are not the same kind of thing at
all: the upper one opens Channels, the lower one decides how much of the card
to draw. Stacked and matched, the second reads as a second instruction — as
though the card were asking for two things when the whole design of it is to
ask for one at a time.

## Why a variant, and why this is not `ghost` returning

`ghost` — a transparent fill — was retired on 2026-09-21 as the most-used
variant in the app, on the grounds that a variant forty-seven callers reach
for is the default wearing a name. STYLE.md came out of that saying quiet is a
matter of size and place, not of fill, and that reaching for a new transparent
fill is re-adding what was just removed. Taken at its word that forbids this
change.

The observation that unpicks it: **`ghost` was still a full-size pill.** It
removed the fill and kept the 48pt target and the 15/600 label, so a ghost
button occupied exactly as much of a screen as a filled one while looking like
it did not. It never bought the quiet it was reached for, which is why it was
reached for so often and never satisfied anybody. Size was the half nobody was
using, and the retirement's own conclusion says so.

So `quiet` is the geometry first: `spacing(0.5)` / `spacing(1)` and
`minHeight: 0`, the numbers STYLE.md already names for anything that has to be
less than a button — `cardPing`, `reachAction` — with the fill dropped as
well, because those two sit at the end of a row of text where a fill has
something to belong to, and this one is centred under a card where it has a
whole width to float in. The label goes to 13, `muted`'s size at the 600 every
button's label carries: a word on nothing has only size and weight left to say
it can be pressed, so it gives up the two points and keeps the weight.

A variant rather than a one-off `style` prop because the label size cannot be
reached from outside `Button`, and rather than a new component because a new
component is what STYLE.md tells the in-row case not to become. Five variants,
four of which differ only in fill and one of which differs only in shape.

## What keeps it from growing into what it replaced

It is scoped to **disclosure** — a control that expands or collapses the card
it is drawn in, commits nothing, and navigates nowhere. Written into both the
docblock and STYLE.md: a second caller wanting a quieter *action* is the
moment to ask whether this is becoming `ghost` again, and the answer for an
action is still the tightened `default`.

One consequence worth naming: `quiet` does not grey when disabled. Every other
variant swaps its fill to `disabled`, which on a control with no fill would
mean growing a grey body at the moment it stopped working. The word going
`textFaint` is the whole of it. Nothing disables this control today.
