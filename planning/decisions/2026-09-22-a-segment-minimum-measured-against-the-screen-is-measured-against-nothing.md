# 2026-09-22 — A segment minimum measured against the screen is measured against nothing

Home's tab strip grew its fourth tab this morning — *Podcasts*, alongside
Contacts, Channels and Support — and came out two rows deep on the phone it was
built on and one row deep on the phone beside it. Both were correct according to
the rule. The rule was wrong.

`segmentRowsFor` gives one row when `width >= count * MIN_SEGMENT`, and
`MIN_SEGMENT` was 90. Four tabs therefore asked for 360 points. What a strip
actually gets is not a screen: Home's sits inside `headerInner`, which spends
`spacing(2.5)` a side, so a 393-point iPhone hands the control **353** and four
tabs missed by seven points. A 402-point 16 Pro hands it 362 and they did not
miss. One strip, drawn two ways, across phones in the same pocket.

**The seven points were never real.** 90 came across from `MAX_PER_ROW` when
that count became a width on 2026-09-20, and was read off the old rule's own
arithmetic — "four segments across a 393-point iPhone are 98 points each and
were allowed". That sum is against the screen, and the constant it produced was
then applied to a control that is forty points narrower. The error is one
subtraction, and it survived because the test asserting it made the same one.

**The second premise had moved too.** 90 was sized for the 14pt word a segment
carried when a segment was a word alone. Since 2026-09-12 a segment with a glyph
captions it at 11pt, where *Contacts* spells about 50 points. Four across the
narrowest iPhone still in support is `(335 - 6 - 9) / 4` = 80 points, which is
that caption and thirty points of air.

**So 80, chosen to move exactly one thing.** On a phone-width strip five still
ask 400 and six still ask 480 of the 353 they get, so every set but four is
drawn precisely where it was. The whole of the change elsewhere is that six tabs
unwrap from 480 rather than 540, which puts a narrow iPad window (507) and a
dragged browser (520) on one row at 81 and 83 points a segment — against the 61
that *Recordings*, the longest of the six, spells at 11pt. That margin is the
floor under the number: lower would start clipping the word the rule was written
for.

**The other half of this was the test.** `segmented.test.tsx` held
`const PHONE = 393` and asserted four on one row, which passed while the
application wrapped, because 393 is a surface no segmented control is ever
given. It is now `393 - 2 * 20` — the strip rather than the screen — and its
table of counts comes through 90 → 80 unchanged, which is what says the floor
was lowered for four and for nothing else.

The general shape, twice now in three days: **a layout constant is a claim about
a box, and the box is not the window.** 2026-09-20 took the phone out of a rule
that had assumed it; this takes the screen out of a rule that had assumed the
control was one. Both were found by a set of tabs coming out a row taller than
anybody expected, which appears to be the only symptom this class of error has.
