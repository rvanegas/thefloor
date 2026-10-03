# The floor has no card

2026-09-13. The channel screen's *The floor* section — its label and its card —
is gone. What the screen says about the floor is now said by the roster and by
the footer's Claim icon.

## What it had left

The card was built as a readout of the one mechanic the application is named
after, and it has been emptied one piece at a time:

- **2026-08-31** it moved from fifth on the screen to first among the controls,
  directly under the roster, on the argument that it is *about* the roster.
- **2026-09-12** the countdown and the two-pixel accent left for the roster
  card of whoever the claim is about. A clock that ticks every second, a card's
  width from the picture of the room, was the wrong half of the screen to be
  watching: the question the number raises is *whose*.
- Today, what remained was one line of state — *You have the floor* /
  *`X` has the floor — your mic is cut* / *Nobody has the floor* — and one line
  of hint.

Every part of the state line is drawn elsewhere and better. Your own claim is
your own card, tinted, marked *· has the floor*, with the clock on it, and the
footer's Claim reading Release in the active tone. Somebody else's is their
card, the same way. *Nobody* is the absence of any marked card. That your mic
is cut is the footer's mic in the silenced tone — red — which is what a reader
of this screen actually looks at, and, with the control cards on, the
microphone card's own sentence naming the holder.

## What was given up, deliberately

The hint line was not redundant. It carried four distinct reasons a claim is
refused — you have not stepped in, you are silenced, you spoke recently, fewer
than two people are present — and the footer's icon greys identically for all
four. The last of those was the only statement anywhere that the floor needs
two people. The two rule statements went with it: *Speak uninterrupted for up
to a minute* and *Everyone else is muted until you release*, which were the
only place the app said what a minute of the floor is.

The judgement was that all of it is inferable from the roster and the footer,
and that a card kept for a sentence a reader sees once is a card on the screen
forever. **If a claim being refused for an unexplained reason turns up in a
walk, the fix is a line in the footer's own hint, not the card back.**

The cooldown is the one of the four with a replacement, from earlier the same
day: your own roster card reads *wait 10s*. What it does not carry is *or
sooner as others claim and release*, so the number now reads as firmer than it
is.

## What moved with it

- `hideControlCards` has no exception any more. The floor's card was the one
  the setting reached into rather than removed — it kept the card and took only
  the button — and Home settings said so in a paragraph that is now deleted.
  Three cards of the same kind, and the setting either draws them or does not.
- `styles.floorCard`, `floorStatus`, `floorHint` and the `atLeastTwoPresent`
  import are gone from `ChannelView`.
- The roster tab's sections are two: *Your microphone* and *Step out*.
