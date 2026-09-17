# The chime follows the room

The presence chime is now two clauses, and they replaced three loops that each
decided for themselves what counted as an event.

- **The rung somebody lands on picks the chime.** Present rings `in`, nearby
  rings `nearby`, stepped out rings `out`. Where they came from does not enter
  into it.
- **A move sounds only if it crosses `present`** — only if they were present,
  or are now.

Four moves sound: `in→out`, `in→nearby`, `out→in`, `nearby→in`. Two do not:
`out→nearby` and `nearby→out`.

**The principle is that the chime is about this room, not about a person.**
Everything a listener hears is a change to who is in the conversation they are
in. Somebody moving between *nearby* and *stepped out* has not changed that,
however much it changes their own situation, and a conversation interrupted by
news about somebody who is not in it is a conversation interrupted for nothing.

## What this gives up

**`out→nearby` is silent, and it was the case the third chime was built for.**
`2026-09-15-the-third-chime-is-for-nearby.md` was about exactly this move: a
declaration from outside had been ringing the arrival chime, and the fix was a
sound of its own. That fix was right and is not being undone — the sound still
exists and `in→nearby` rings it. What has changed is the judgement about
whether the *outside* case is worth a sound at all. Being reachable is a real
thing to learn about somebody; it is not a change to the room, and it stays on
the roster for anybody who looks.

This is a loss to be honest about rather than a tidy-up. If it turns out that
knowing somebody has come within reach is worth interrupting a conversation
for, the line to change is the one list this now iterates.

## What it dissolves

**`nearby→out` cannot be told from a snapshot, and the rule never asks.**
`stepOut` for somebody who is not present clears the declaration and drops them
from `waiting` identically whether a tap or the attention clock ended it — and
stamps nothing either way, deliberately, so that the roster card goes on ageing
from the last time they were actually in the room. So a chime for that move
would have had to choose between staying silent and announcing a decision
nobody made, and there was no third option short of adding state to the
reducer. Because the move does not cross `present`, the question no longer
arises. That was luck rather than design, and is worth recording as such.

**The special case added earlier the same day went with it.** `in→nearby` had
needed the departure loop to stand aside for anybody who had landed in
`declaredNearbyAt`, so that one move did not ring twice. Under a rule that asks
where somebody landed, one move has one destination and therefore one sound, by
construction. A `continue` that had to be explained is now nothing at all.

## What is unchanged, and is the one thing not derivable from the rule

**Only a departure somebody chose rings `out`.** A dropped connection and an
expired attention window both move somebody `in→out`, so the destination rule
alone would announce them. It does not, because
`2026-09-14-the-room-says-who-came-and-went.md` is still right that a phone
which died in a pocket did not leave the room. The `lastPresentAt` stamp is
what separates a tap from a clock, and that test survives intact as the one
filter sitting on top of the two clauses.

It is worth naming as a filter rather than folding it into the rule: the rule
says *what a move sounds like*, and this says *whether a move happened at all*.

## Shape

One loop over everybody in either roster of `present`, which is the second
clause expressed as the thing iterated rather than as a test — somebody in
either roster has `in` at one end of their move by construction, and somebody
in neither has it at neither end. The rung function returns a `ChimeKind`
directly, because the rung landed on *is* the chime and a lookup table between
them would be a place for the two to disagree.

**The metaphor is gone from the code and the vocabulary.** *The edge*, *the
door*, *standing at the door* — all of it meant **nearby**, none of it was a
defined term, and it was actively misleading: it suggests somebody in a
doorway who can half-hear you, where a nearby person holds no media connection
and can hear nothing at all. That is the very confusion the third chime was
added to remove, smuggled back in as prose. The two 2026-09-15 entries keep
their wording, being dated history.
