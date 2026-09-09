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
change. The footer takes a fourth slot to carry it.

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

**The nearby slot is permanent, and its label flips.** The footer's standing
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
in the nearby slot in one state and in the door slot in another. The glyphs
differ — a bell and a door — and the two never appear at once.

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
