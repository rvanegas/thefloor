# 2026-09-09 — Presence is a ladder, and the controls say so

Three states — **stepped in, nearby, stepped out** — one axis between them, and
every control that offers any of them offers **the two moves off the rung you
are on**, in that order:

| Where you are | What is offered |
| --- | --- |
| Stepped out | *Step in*, *Be nearby* |
| Nearby | *Step in*, *Step out* |
| Stepped in | *Be nearby*, *Step out* |

Asked for by Rodrigo in exactly that shape, and out of Labs in the same
change.

**The footer draws one slot per rung, all three, and lights the one you are
on** — revised the same evening, from the two flipping slots described below.
The cards still offer the two moves, in acts, as the table says.

## What it replaced

Nearby shipped on 2026-09-08 as a pair of Labs buttons hung off the two
existing cards, and the interface still described presence as a switch:

- **The footer's third slot was a toggle.** *Step in* when you were not
  present, *Step out* when you were — which can only ever offer one of the two
  moves off a rung, and had no word at all for the third state.
- **One action wore two names.** `DECLARE_NEARBY` is one case in the reducer
  whose internal branch is the whole of the difference between declaring from
  outside a channel and declaring from inside one; the screen called the first
  *Step in nearby* and the second *Nearby*, so a reader met two mechanics where
  the code has one.
- **Nearby had no exit.** `stepOut` in `core/channel.ts` returned the state
  untouched for anybody who was not present, so `STEP_OUT` from *Nearby* did
  nothing. The only ways off that rung were stepping in, or waiting out the
  fifteen-minute window — which is not something a person can choose.

## The three decisions inside it

**The nearby slot is permanent, and its label flips.** *Superseded within the
day by the three-slot bar below; kept because the rule it argues from is what
the revision is built on.* The footer's standing
rule is that position never changes with state — items appearing and
disappearing move the other two under a finger already on its way, and the mute
you meant becomes the floor you did not. So the pair is *two fixed slots*, one
meaning *nearby* and one meaning *the door*, each flipping its word the way the
floor's slot has always flipped between Claim and Release. What the ladder
demands falls out of that without any slot ever changing identity: the two
words shown are always the two moves, and never the same word twice.

**"Step out" is the word for leaving nearby**, chosen over *Not nearby*. It is
the name of the rung you land on, and a control here names the act rather than
the state it is leaving. The cost is real and was accepted: *Step out* appears
in the nearby slot in one state and in the door slot in another. The two never
appear at once, so the words alone stay unambiguous.

**The glyphs no longer differ there, corrected later the same day.** This said
"a bell and a door", which was the accepted cost read one way too generously:
it left a bell standing over the word *Step out*, the one control in the bar
whose picture and word named different acts. The bell means *nearby* and
nothing else, so the nearby slot draws the rung it is offering — a bell for
"Be nearby", the departure's glyph for "Step out". In the nearby state both
slots then carry a door pointing opposite ways, which is a weaker collision
than a glyph contradicting its own label.

**The cards stay in two positions.** Merging them into one card was the obvious
reading of "one design", and it would have undone the split made a week
earlier: one position cannot serve both a control somebody wants at the top of
a screen they have not entered and a control that belongs at the foot of one
they have. So the card above the floor is the pair for somebody who is not in
the room, and the card under the microphone is the pair for somebody who is —
each carrying the full pair for its own state, in the ladder's order.

## What it cost outside the interface

**A reducer change.** `stepOut` now drops a **chosen** departure from
`waiting`. Only chosen: `dropped` and `inattentive` arrive from clocks, and a
clock has nothing to say about a declaration somebody made deliberately.
Nothing is stamped on the way — not `lastPresentAt`, which would claim they
were here until this moment, and not `lastActiveAt`, since withdrawing a claim
on a notification is not the room going quiet.

**A displacement bug, which the Labs gate had been hiding.** `ws.ts` sent
`displaced` to every other device of the account on `STEP_OUT` and
`DECLARE_NEARBY` unconditionally. Displacement corrects one belief — that this
account is standing in a room — and both of those actions can now be sent by
somebody who is not standing anywhere: a phone making itself reachable in a
channel it is not in, or stepping back out of that. A laptop present in a
*different* channel would drop the room and go quiet because of a tap somewhere
else entirely. Both are now conditioned on the actor having been present in
that channel before the dispatch, which is what the comment beside them already
claimed in prose.

**No wire change and no shim.** `STEP_OUT` and `DECLARE_NEARBY` are actions
both ends already speak; what changed is what the reducer does with one of them
in a state no client used to send it from. The ordering that follows is the
ordinary one and is worth saying anyway: **deploy the server before the build
ships**, or a phone on the new client taps *Step out* while nearby and an old
server does nothing at all with it.

## The revision, the same evening: three slots, not two

Rodrigo, on seeing the bar: the bell was sitting over the word *Step out*, and
"maybe it would be better to have all three in the footer — then colour can
indicate the current state."

**Which the footer's own rule wanted all along.** The standing rule is that
position never changes with state; two slots honoured it and paid for it by
flipping their words. Three honour it completely: **no word and no glyph in
this bar changes in any state**, and the only thing that moves is the accent.

**So these three name rungs where every other control names an act** — *In*,
*Nearby*, *Out*. That is what makes the colour mean here what it means on the
microphone and the floor, *this is true of you now*: an accent on "Step in"
while you are already in would have been the same fault as the bell over "Step
out", a control lit for a state while lettered for an act. Read the trio as a
three-position switch — the lit one is where you are, the other two are where a
tap takes you.

**Short forms, chosen over the roster's own words.** *Present / Nearby /
Stepped out* would have put one vocabulary on the cards and the bar; at 11pt in
a fifth of a phone "Stepped out" truncates on the narrowest screen supported,
and a truncated rung name is worse than a short one. The cards keep the acts in
full.

**The rung you are on is inert, and accented rather than greyed.** Grey is this
bar's word for *refused* — the floor with nobody else here, the microphone on a
device without one. Being somewhere is not a refusal. `FooterAction` grew a
`selected` prop for it, which outranks both `tone` and `disabled`, and sets
`accessibilityState.selected` so a screen reader says which rung you are on
rather than that two thirds of the bar is unavailable.

**The bar is five controls now**, and that is the cost: mute, the floor, and
three rungs. It was accepted because presence *is* three quarters of what this
screen does, and because a fifth slot costs width where a flipping word cost
comprehension.
