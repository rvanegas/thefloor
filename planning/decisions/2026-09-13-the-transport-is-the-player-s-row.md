# The recording transport is the player's row, with glyphs on the buttons

2026-09-13. Supersedes `2026-09-13-the-transport-is-three-glyphs.md`, which
shipped earlier the same day and lasted hours.

## What changed

The record / pause / stop row on *Recordings* is three `Button`s in
`styles.buttonRow`, each `flex: 1`, filled and 48pt — which is exactly the row
that drives the shared track on *Player*. The glyphs did not change and the
words are still not drawn: `Button` now takes an optional `icon`, a callback
handed the variant's foreground colour, and draws it where the label would go.

Record — which is also Resume, for a paused run — takes `primary`. Pause and
stop are `default`. The order is unchanged, all three are still always present,
and there is still no card and no `RECORDING` label around them.

`TransportAction` is deleted, along with `styles.transportAction`; `transport`
survives as the margin under the row and nothing else.

## Why

The bare-glyph row was arguing about transports in general and had stopped
looking at the screen it was on. One tab away, the thing that starts, holds and
moves the shared audio is three filled buttons spread across the width. This is
the same gesture, on the same channel, one tab over — and it was drawn in a
construction used nowhere else in the application.

So the cost was two vocabularies for one act. Somebody who has learnt the
player's transport has learnt nothing transferable about the recorder's, and a
row of unfilled glyphs at the left margin reads as decoration next to a screen
where every other control is a rectangle you press.

The half of the earlier pass that was right is kept whole: no card, no label,
nothing that appears or disappears, and the irreversible control last. What
that pass actually wanted was a glyph on a button, which is an affordance
`Button` did not have. It has it now, and the third control type is gone.

## What this costs, and what was considered

**Three filled buttons are three targets of equal weight**, where the glyph row
made them one object. `primary` on record is what re-weights them: it is the
one of the three somebody came to press, and it is the same variant *Play*
carries one tab over, so the fill means the same thing in both rows.

**Stop is not `danger`.** That fill is spent on deletion. Ending a run keeps
what it captured, and colouring it as destruction would be the only place in
the application where red did not mean something is about to be lost. Its
position — last, where a thumb moving in a hurry is least likely to land — is
what guards it, as before.

**`Button`'s `icon` names the button for a screen reader and its `sublabel`
does not disappear.** The `accessibilityLabel` is set only when a glyph is
drawn: a button showing its own word reads that word and the sublabel under it,
and naming it would have silenced the second line — which on *Play something
together* is the half that says what happens next.

**Not a shared component with the player's row.** Considered and refused. The
two rows share `Button`, `buttonRow` and `flexButton`, which is the whole of
what they have in common; the guards, the actions and the number of states
differ, and a `Transport` component parameterised over both would be an
abstraction over a coincidence of shape.
