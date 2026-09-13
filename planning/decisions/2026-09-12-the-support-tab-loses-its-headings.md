# 2026-09-12 The Support tab loses its headings

The tab shipped this morning with two sections — *Help* above, *Support*
below — and four cards under them holding nothing but a button each. Both
headings are gone. Every card now carries a line of ordinary prose saying what
the button does.

This reverses § *Both senses of the word, still two sections* of
2026-09-12-home-grows-a-support-tab.md, which is hours old. That section is
right about the hazard and was wrong about the remedy, so it is worth saying
which half survives.

## The hazard was real

*Support* on this tab means support the project — money. *Help* means get
support. One heading over both senses is how somebody taps *Chip in* looking
for an answer, and that has not stopped being true.

## A heading could not fix it

Two things went wrong with fixing it by splitting the group.

**The tab is already called Support.** A *Support* heading inside it labels the
screen with its own name, which tells a reader nothing they did not get from
the segmented control a line above. The heading was drawn to disambiguate a
word and repeated it instead.

**A heading is a word where a sentence was needed.** What actually keeps
somebody from tapping *Chip in* with a question is knowing what *Chip in* does,
and no single word over a group conveys that — least of all the word already
under contention. A line under the button does it outright: *Chip in* under a
sentence about what the box, the audio and the storage cost each month is not
mistakable for the way to ask a question.

So the cards are one group in source order — Help, then the ones about the
project — and the order carries everything the two headings were saying about
the grouping. Help is still first and still the only unconditional card, which
is still what stops the tab coming up empty.

## What the Chip in card does not say

One sentence, about what the money is for. The rest of the argument — that
giving unlocks nothing, that nobody is told who has and who has not, which
address to pay with — is the case for giving rather than a description of the
button, and it stays one tap away in `SupportView`, where somebody has chosen
to read it. A test in `settings.test.tsx` holds it there: the tab must contain
`cost money every month` and must not contain `unlocks nothing`. That is the
older decision's *as loud as it was, and no louder*, unchanged.

The same test now asserts the tab draws no `SectionLabel` at all, and that each
of the four cards' lines is present when all four are granted. The case that
used to check for "a heading over nothing" when the server has nowhere to give
checks that the card and its sentence leave together instead.
