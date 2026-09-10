# One clock ends two states, but times only one

Corrects the display half of *Attention is one clock, and the server holds it*
(`2026-09-09-attention-is-one-clock.md`), the same day. The clock itself, the
server holding it, the report the client sends, and the tick that reads it are
all kept. What is wrong is the last paragraph of it — that the roster shows that
one number about anybody absent.

## What the reading was

Open a channel you have been invited to and have not yet entered, and your own
card said **away 4s**. Nothing had happened in four seconds. Attention had been
running since the app came forward; presence had never started. The card was
reporting the age of a stamp as though it were the length of an absence.

## Why one number could not do both lines

The two lines make different claims, and each has exactly one clock that
supports it.

*Nearby* is a claim about reach: a notification will find this person. Attention
is the evidence for it — that is the whole reason the clock was built, and that
line is right.

*Stepped out* is a claim about this room: when were they last in it. Attention
cannot answer that. For somebody who left an hour ago and picked their phone up
a second ago it says *one second*, which is a true sentence about a fact nobody
on that screen asked about.

The original change saw this and drew the wrong conclusion from it — it kept the
number and softened the word, *away* rather than *stepped out*, on the grounds
that *stepped out four minutes ago* is a claim the attention clock cannot make.
It cannot; but a vaguer word does not repair a wrong number, it only stops the
number saying which four seconds it means. The fix is to make each claim with
the clock that can make it.

## Why one clock looked sufficient

**They coincide whenever a rung was lost to a timeout**, which is the common
case: somebody stops attending, the tick ends their presence, and the moment
they stopped attending *is* the moment they were last present. Every case
anybody tried by hand was that one.

They come apart in two ways, and both are ordinary. Somebody leaves a room
deliberately and goes on using the app — presence ends an hour before attention
does. And somebody attends a channel they have never once entered, which is what
opening an invitation is; there presence has no stamp at all, and a duration
computed from attention is a duration since nothing.

## What it is now

- *Nearby* — attention, unchanged: `Nearby 20s`.
- *Stepped out* — `idleMs`, the presence clock, back where it was:
  `Stepped out 4 minutes ago`.
- Invited and never present — no clock. `Invited`, with nothing after it. The
  `Invited · away 4s` line is gone; an invitation is a standing fact and the
  attention stamp was standing in for a presence that has not happened.

The distinction to hold on to: **ending a state and timing it are separate
jobs.** One clock does the first — the tick retires both nearby and presence off
attention, and that is what stopped the states disagreeing. Nothing followed
from it about what a duration on a card measures.

## The suite went on passing

No roster test had ever supplied an `attentiveAt`, so the branch that changed
was the branch no fixture reached: the assertions still read *Stepped out 5
minutes ago* and were still true of the code they exercised. Two tests in
`channelRoster.test.tsx` now supply one — an absence timed from the room while
the phone is in hand, and an invitee with attention and no presence — and both
fail against the reverted display.
