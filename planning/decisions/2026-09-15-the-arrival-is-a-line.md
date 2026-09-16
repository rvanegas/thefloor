# The arrival is a line

2026-09-15. The card a nearby phone drew when somebody stepped in — a heading,
a sentence, *Step in*, *Stay nearby* and an explanation — is deleted. An
arrival is now one muted line under the roster, *Dana Chu just stepped in.*,
and the way in is the *In* rung like every other act on that screen.

## What was duplicated, item by item

The question that started it was narrow: is the heading *Somebody arrived*
redundant with the sentence beneath it? It is, and worse than redundant — it
is the same sentence with the name taken out, and it was the only
`SectionLabel` in the app that was a sentence rather than a category noun.
Every other one — *Recording*, *Invitations*, *Your channels*, *Audio* — names
a kind of thing that the content below never restates.

Widening the question to the rest of the card gave the same answer four more
times:

| On the card | Already on the screen, at that moment |
| --- | --- |
| *Somebody arrived* | the sentence directly beneath it, with the name |
| "Liliana stepped in." | her roster row, two inches up, reading *Present* |
| **Step in** | the `In` rung — the same `{ type: 'ENTER' }` |
| "You are nearby, so you cannot hear them yet." | your own roster row reading *Nearby*, and the lit bell |
| **Stay nearby** | nothing in the room; its only effect was to remove the card |

And the arrival had already announced itself before any of that was drawn:
`push.ts` sets `reachesInApp: true` on the presence notification precisely so a
nearby phone with the app open is *not* silenced — "exactly the person asking
to be told." So stepping in produced a banner, a roster change and a card
within the same second, all saying one thing.

## What was not duplicated, which is one word

**The roster carries a clock for you and for nobody else.** Your own row reads
*Nearby a few seconds*; every other row reads *Present* whether they walked in
a second ago or an hour ago. So the screen could say that Liliana is here and
could not say that she has *just* arrived — and the recency is the whole of
what the 2026-09-08 reversal is about, that being the moment the phone used to
step itself in.

One adverb is what survived, and it fits in a sentence. **A card whose only
irreducible part is an adverb is a sentence**, which is the general form of the
test and is now in STYLE.md.

## Where it went, and why there

Under the roster, beside the party-muted line and the other-device line, in
`type.muted`. Those two are there on a stated rule — they are claims about the
room you are looking at, made where you are looking — and an arrival is the
same kind of claim. The screen had converged on that shape twice already; this
is the third.

## What was given up

**The interruption.** The card was argued for in the code as "not a repeated
control but the answer to a question the app has just asked," and the pair of
buttons as "the question, not two shortcuts." That argument is real and it is
what is being overruled: with the banner already delivered and the roster
already changed, a third announcement that also blocks the tab is not carrying
the question, it is repeating the answer.

**And the explanation** — that stepping in opens your microphone and stops
whatever the phone is playing. True, and not said anywhere else, but it is an
explanation of a control, which is the thing
`2026-09-13-the-cards-a-footer-made-redundant.md` established is not a reason
for a card to exist. The other-device sentence survived that afternoon by *not*
being one.

## What went with it

`dismissNearbyArrival` on `AppProvider`, its only caller having been *Stay
nearby*. Nothing else dismisses the line: it is filtered against
`channel.present`, as the card always was, so it goes by itself when the person
who arrived leaves. A line that states a true thing is not a question and has
nothing to answer.

`nearbyArrival`, `state/useNearby.ts` and `state/nearby.ts` are untouched — the
detection was never the part in question, and neither was the foreground rule
that keeps an arrival from being consumed by the background.

## The tests it finally has

The card had none, in either direction, for the seven days it existed. The line
has two, in `app/src/ui/__tests__/channel.test.tsx`: that the line appears with
the name and that neither button does, and that it goes when the person who
arrived steps out.
