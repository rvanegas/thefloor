# Removing a member takes two

A channel's members can now remove one of their own, and it takes two of them
agreeing: one moves, a second confirms. The person removed is left a card on
their channels list saying it happened, and that card names nobody.

## Why two, and not one, and not a majority

**Nobody owns a channel here, and that is what shaped this.** The roster is flat
by design — every member may name the channel, write its notepad, invite into it,
record in it and give it a public page — so there was no owner, host or admin to
hang a removal on. The alternatives were to invent one, which would have changed
what a channel *is* in order to add one feature, or to find a rule a flat roster
can express. *Two of you* is that rule, and it is the only majority a flat roster
has.

**Not a majority of the roster**, which was the first instinct and is wrong twice
over. Two out of six is not most of anybody, so the word *majority* would be
doing no work; and a threshold that rose with the roster would make the fifth
member harder to remove than the third for no reason anybody in the room could
state. What the second agreement buys is that the act was considered twice by two
people, and that is worth having. A third and a fourth buy nothing more.

**So a channel of two cannot remove anybody**, since the only two people in it
are the mover and the person moved against. This is not a gap: the way out of a
channel of two is to *leave* it, which is exactly as effective and is nobody
else's decision to make. The server refuses the move out loud and the sentence
says why — a control that quietly did nothing would be the worse answer, and the
control is not drawn there at all.

## One action, counted twice

`MOVE_TO_REMOVE` is both halves. There is no `CONFIRM_REMOVAL`, and the reason
is not brevity: a confirmation would have to be sent against a motion the sender
believes is open, and a client cannot know that. It holds a snapshot; the motion
may have been withdrawn a second ago; and the refusal would be silent. With one
action the reducer counts distinct movers and the answer is always truthful — a
"confirmation" arriving after a withdrawal simply opens a fresh motion in that
member's own name, which is what they meant.

The screen tells *move* from *confirm* by whether the reader is already on the
motion, and that is the only thing distinguishing what a press does.

## A day, measured from the first move

A motion stands for `REMOVAL_MOTION_WINDOW_MS` — twenty-four hours — and both
ends of that were argued.

It is long because **the two members who have to agree are not required to be in
the room together**, and usually will not be. A channel is asynchronous, most of
them are empty most of the time, and a rule that needed both people online within
the hour would be one nobody could use. Requiring presence would have been worse
still: it would mean the two agreeing had to be in the channel *with the person
they were removing*, listening, which is the one arrangement the whole mechanism
exists to avoid. So neither guard asks about presence, unlike almost everything
else a member does to a room.

It is not longer because a motion is a loaded thing to leave lying about. The
question a second member is answering is *do you agree*, and agreeing a week
later to something the mover has forgotten proposing is not that question.

**Dated from the first move and never rewritten**, so a roster cannot walk the
window forward by taking turns. A lapsed motion is not swept — core has no clock,
so nothing runs a day later to delete it — and is instead invisible to every
reader: `removalMotion` is the only way anything reads `state.removals`, and it
refuses an entry past its window. That is also why the next move replaces a stale
motion rather than joining it.

**It is durable**, which is why the motions live on `ChannelState` rather than in
the registry's memory. A day is far longer than the server process lives; a
deploy that dropped every open motion would be a rule that only worked between
restarts, and nobody in the room would know why their agreement had stopped
counting.

## Withheld from the person it is about

The state ships whole to every member, so the server strips the entry keyed by
the reader on the way out — `withoutRemovalsAgainst`, applied in `pushChannel`.
It is the one piece of withholding done to `ChannelState` itself; everything else
per-viewer on that snapshot is composed rather than removed.

There is no version of that screen worth drawing. A motion the target can watch
is one they can lobby against, which is the opposite of what asking two people
independently was for, and telling somebody they are being voted on and then
possibly *not* removing them is a cruelty with no upside. Motions they have
*made* stay on their own screen, since a mover who could not see theirs could not
withdraw it.

## Withdrawable, and only by the mover

`WITHDRAW_REMOVAL` takes one member's agreement off; the last one to go takes the
motion with it, so an entry in the map is an open motion by construction. One
member cannot clear another's — that would be a veto, not a withdrawal.

It exists because the window is a day and the case is ordinary: something is said
in the room, the reason evaporates, and the proposal is still sitting there for
somebody else to happen upon and agree to. A mover who could not stand down would
have no way out but hoping nobody looked. The control is *Stand down* and it
confirms nothing, being the one direction that only ever puts things back.

## The card, and why it names nobody

A removal ends with the channel simply not being in that person's list any more,
which is indistinguishable from a channel somebody deleted and from a bug. That
absence, unexplained, is the failure this feature could most easily have shipped
with, and nothing else in the app would have revealed it. So there is a card, at
the top of the channels list, above every section and above *Start a channel*.

**It names no member, and that is the decision.** Two people agreed. Naming one
makes the other's agreement invisible and points a grievance at whoever happened
to move first; naming both hands somebody a list of people to take it up with.
What the card can truthfully say is which channel and that it was the members'
decision, so that is all it says.

**It carries the channel's name frozen at the moment of removal**, not joined to
the live one: the reader cannot ask what that channel is called any more, and by
then it may have been renamed by people they can no longer see. An unnamed
channel is *a channel you were part of* — deliberately **not** described by its
roster, which is how every other row in that list describes an unnamed channel,
because who was in that room is not something a removed member gets to keep
reading. The server does not send the roster either, so there is nothing there to
be tempted by.

**No push.** A removal is somebody else's decision about this person, and waking
a phone to deliver it would make the app the messenger for an act it has
deliberately kept anonymous. There is no fifth notification kind.

**The row *is* the notice**, so *Close* deletes it — where a *public notice* is a
record of an answer to a recurring question and has to outlive being read. A
removal happens once; there is no second time to be silent about, and a kept row
would be a standing list of who has been removed from what. It also has no
foreign key to `channels`, which is the one interesting thing in the schema: the
card has to survive the channel being deleted by its last member afterwards, or
the removal goes back to being unexplained.

## What was deliberately not built

- **No ban, and no record.** Nothing outlives the act. Somebody removed may be
  invited back in by anybody, which is the same tap it always was. A list of
  people who may not return would be a second kind of standing in a system whose
  whole point is that there is one.
- **No reason field.** A sentence written by one member, delivered anonymously to
  the person it is about, read by them for ever and answerable nowhere, is a worse
  thing than the silence.
- **No notification to the movers when it carries.** They pressed the button; the
  roster is the answer.
- **No removal of a guest by this route.** A seat already has `EJECT_GUEST`,
  which one member may do alone and which revokes the link. The asymmetry is
  right: a seat is temporary and carries no standing, and ejecting one takes away
  nothing that was promised to last.

## Where it is

`REMOVAL_MOVES_REQUIRED`, `MIN_PARTICIPANTS_TO_REMOVE` and
`REMOVAL_MOTION_WINDOW_MS` in `core/constants.ts`. `canMoveToRemove`,
`canWithdrawRemoval`, `removalMotion`, `removalMovesWanted` and
`withoutRemovalsAgainst` in `core/channel.ts` — where `dropParticipant` was
factored out of `LEAVE_CHANNEL` so that a removal and a departure unwind the same
maps by the same route. `removal_notices` in `server/src/db.ts`, the dispatch
branch and `noteRemoval` in `server/src/channels.ts`, `/removals/:id/read` in
`server/src/app.ts`. The control is on `ProfileView`, the card on `ChannelsView`.
GLOSSARY.md § *Motion to remove* and § *Removal notice*; SHIMS.md for the two
optional fields, gated at 298.
