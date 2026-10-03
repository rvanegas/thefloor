# The channel screen says how to be heard

A third sentence under the roster, drawn to somebody who is looking at a
channel they have not stepped into while the introduction is still asking them
for a first conversation: *Tap In, at the foot of the screen, to step in to the
conversation. Until you do, you cannot hear anybody here and nobody here can
hear you.*

**The gap it fills is what a tap stopped doing.** Until
`2026-09-21-a-tap-only-ever-looks.md` a tap could put you in the room, and the
screen could assume presence; it cannot now, so every arrival at a channel is
an arrival at a room that cannot hear you, and the only thing on screen that
says otherwise is the word *In* in a fifth of the footer. Somebody who has
never used this app has no reason to read that word as *this is how you are
heard*.

**It is the second of the two footer-cards rules being answered rather than
assumed.** STYLE.md § *The cards a footer made redundant* says a card
repeating a pinned control earns its place with a sentence or not at all, and
§ *And then ask the same question of the sentence* says a sentence earns its
place only while it is the only thing saying what it says. The `In` rung does
carry the words — `rungInHint` is *Step in to the conversation* — but a
`FooterAction`'s hint is its accessibility label and nothing draws it, so on
a screen being looked at rather than listened to, nothing says it at all.

**So it is a sentence and not a card**, in the place the other two sentences
about the room already are: there is no control here the footer does not have,
and a heading with a button under it is the footer at the wrong size. That is
the same test the arrival was put through on 2026-09-15, reaching the same
answer.

**And it retires, which is the whole of why it is not repetition.**
`learningToStepIn` in `app/src/state/introduction.ts` is true only while the
ladder's `stepIn` rung is drawn and unticked — so it is there for an account
in its first days, and it is gone the moment that account has been in a room
with another member. The rung is ticked by `conversedAt` rather than by the
tap, deliberately: help that vanished on the first press would vanish before it
had been taken up. A rung dismissed by hand is not in `steps` at all, so the
ladder's second exit silences this too; it would be a poor exit that left the
same instruction standing two screens away.

**The one place the ladder reaches off Home.** ONBOARDING.md settled that this
is an activation ladder and not a guided first-run walkthrough — no coach
marks, nothing pointing at a control — and that still holds: this points at
nothing, highlights nothing, and is a line of prose in the body of a screen.
What it concedes is narrower and was the actual failure: the ladder tells
somebody on Home to go and have a conversation, and the screen where that is
done said nothing about how. A checklist that can only be read on the screen
you are not on is a checklist with a hole in it.

**Not drawn while the room is held on another device.** The sentence directly
above it already says what stepping in here does, and this one would contradict
it — somebody in the channel on their other phone can hear perfectly well.

Rejected: a fourth rung on the ladder. It would have been ticked by the same
`conversedAt` the `stepIn` rung already reads, so it would have said the same
thing twice on Home and still nothing on the channel screen.

Rejected: showing it to everybody, for ever. That is the shape § *The cards a
footer made redundant* exists to prevent — the screen explaining its own
footer to people who have used it every day for a month.
