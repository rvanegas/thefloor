# The floor is drawn on the roster, and the clocks are in the cards

2026-09-12. Reverses the visual half of 2026-08-31, which moved the floor's
card to the top of the controls and gave it a two-pixel accent and a 34-point
countdown.

## The indicator was in the wrong place, not too small

That card did two things at once. It was the *control* — claim, release, and the
sentence saying why a claim is refused — and it was the *indicator*: an accent
border while somebody held the floor, an orange one while you were cut off, and
the clock.

Everything in the second list is about a person. Whose minute is running, and
whether yours has been taken. The screen's picture of the people is the roster,
and it sat directly above saying none of it — a line of text reading `· has the
floor` and nothing else. So the one number on the screen that changes every
second lived a card's width away from the only thing that answers the question
it raises, which is *whose*.

It moved. The holder's card now carries the claim's clock and a `floorDim` fill;
your own card carries the cooldown, muted. The floor's card keeps the sentences
and the button and has no colour and no clock of its own.

## The fill, not the border

The roster already spends `colors.floor` as a border, and on the one thing the
floor must not be confused with: `participantCardLive` means **audible**, driven
by the room's active-speaker report. Holding the floor means **permitted**,
driven by the reducer. They disagree routinely — a holder sitting silent, a
self-muted person whose claim is running — and a card that shared an edge for
both would be two facts on one mark.

So the fill says whose minute it is, the border says whether they are spending
it, and the speaking dot on the right of the row is untouched. A card that is
both reads as both. The test that pinned the old distinction —
*asks the room who is talking rather than the floor* — still asserts the border
is not lit for a silent holder, and now also asserts the fill is.

## What stayed behind, and why the card is still there

Two things a roster card cannot say:

- **Nobody has the floor.** An absence has no card to sit on.
- **Why a claim is refused** — you are silenced, you spoke recently, there is
  nobody here to be quiet. Six sentences that belong to a control, not to a
  person.

Which is also the answer for `hideControlCards`: the floor's card survives that
setting and loses only its button, and the reason given in 2026-08-31 was the
clock *nobody can reach any other way*. The clock is now on the roster, which
the setting does not touch, so the card survives on the sentences alone — and
the screen with the cards off still counts the minute down, in the one place
that is now counting it.

## The guest card was left alone

`GuestCard` takes a `holdsFloor` and says *Has the floor*, so the obvious move
was to give it the clock too. It would be unreachable: `canClaimFloor` has
refused guests since 2026-08-30 — a claim is a demand that the room be silent,
and a stranger a member is answering for does not get to make it. The test
written for it failed with *Nobody has the floor*, which is the reducer being
right. The clock is a member's card's furniture.

## The seconds are not in the accessibility label

The label gained `Has the floor.` and not the number. A label carrying the clock
would have a screen reader announce the whole card once a second. What is worth
saying is whose the floor is, and that does not change while the number does.
