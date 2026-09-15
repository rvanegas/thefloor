# The dab carries an `!`, and so may sit off the word

*2026-09-15.* The dab shipped earlier the same day as a 16 × 11 rose lozenge
laid over the trailing end of a Home tab's label, clipping the upper corner of
the last glyph or two. The argument for it is in
`2026-09-15-the-two-dabs-are-not-symmetrical.md` and in STYLE.md: a dot
*beside* a word is a status light — a thing reporting, which you read and move
on from — and a shape slightly *in the way* of the word is a thing asking. That
argument stands. What did not survive being looked at on a phone is the way it
made it.

## Two things were wrong with covering the word

**It covered the half of the word that carries the information.** Home's tabs
are *Contacts*, *Channels* and *Support*. Read at a glance, the first two are
told apart by their endings, which is exactly what the lozenge sat on. The mark
was drawn against the label's own box precisely so that it would follow the
word — and following the word means landing on the same letters every time.

**A blank shape says nothing on its own.** It has to be recognised as a mark
rather than a rendering fault, and then guessed at. The accessibility label
carried the words for a screen reader from the first commit, which is the
admission: the mark needed words, and sighted readers were the ones not given
any.

## The glyph buys it its way off the label

An `!` in the disc says *asking* outright, so the mark no longer has to say it
by obstruction — and once it need not obstruct, there is no reason to put it
anywhere the word will be missed. It moves to the leading edge and up: `left:
-19` on an 18pt disc clears the first glyph with a point in hand, `top: -9`
lifts it above the cap height. The eye now reaches the mark before the word
rather than after it, which is the reading order a tab wants anyway.

**An `!` and not a number**, which is the shape the reference came in. The
whole of `2026-09-15-the-two-dabs-are-not-symmetrical.md` § *Never a count* is
why: an outgoing contact request cannot be cleared by tapping through, and the
*Support* mark cannot be counted at all without the *Help* screen gaining unread
marks it does not have. A count that is wrong is worse than no count, and what a
tab owes is *go and look*.

The glyph is `surface` rather than white, on both sides of the theme. White on
light `waiting` is 3.6:1 and on the dark value 2.4:1; the card colour is 4.9:1
and 8:1, and reads as punched out of the disc rather than printed on it.

The disc is still `waiting` and is still not a count, so nothing in
`state/helpSeen.ts`, in `Segmented`'s `badge` contract, or in the debug override
that draws both marks changed — this is a shape, not a mechanism.
