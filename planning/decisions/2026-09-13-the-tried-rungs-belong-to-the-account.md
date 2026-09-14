# The tried rungs belong to the account, and the card asks one thing at a time

2026-09-13. The getting-started checklist's four *try* rungs — claim the floor,
say you are nearby, bring in a guest, play something together — were kept on
the phone, in four keychain keys, because the day they were built that was the
only way to have them without a wire change. They are on the account now. And
the card that draws them stopped drawing all seven rungs at once.

Two changes, in one commit, because they were asked for together and because
each is about the same thing: what the card is actually for.

## The four facts were in the wrong place, and the module said so

`app/src/state/tried.ts` argued the per-install decision honestly and named its
own cost: *a second device starts these four unticked on an account that has
done all of them*. It defended that on the grounds that the rungs say **you
have tried this**, which is a fact about somebody having been shown a control,
and a control lives on a device.

The defence does not survive contact with what the rungs are for. The card
retires when the last rung is done — that was decided the same day, see
*the checklist outlives the first conversation* — so the four are not a note
about a device, they are the thing standing between somebody and being finished
with the introduction. Signing in on an iPad and being handed a checklist of
four things you did last week is not a slightly stale device note; it is the
whole card coming back.

A reinstall did the same thing, and that one is worse: the keys were
deliberately not in `REINSTALL_FORGETS`, on the reasoning that deleting the app
does not undo having had a conversation — which is right, and which is exactly
the argument for these four being about the person too.

### What it costs, which is the reason it was not done first

A wire change. `HomeView` gained `tried`, four columns went onto `accounts`,
and `POST /me/tried` records one — or several, which only the migration
sends. The rule in AGENTS.md applies unchanged: the field is optional, the
server ships first, and SHIMS.md carries the gate.

**The stamps are timestamps, not flags.** Only their nullness is ever read and
the wire will always carry booleans. They cost the same four columns, they are
written exactly once each, and the moment somebody first claims a floor is not
recoverable later — `free_transcript_at` made the same trade.

**`markTried` is sent on every claim of the floor, for ever.** The client
cannot know whether another device got there first, and asking would cost a
round trip to save a write the server already declines: the `UPDATE` carries
`WHERE tried_floor IS NULL` and reports whether it changed anything, and only a
change pushes Home. So the hot path is one statement that matches no rows.

### The one thing a migration cannot do

For every account that existed before this, the answer is on a phone and
nowhere else. Nothing on the server records that a floor was *ever* claimed —
only who holds one now — so there is nothing to backfill from, and inferring it
from what an account happens to have done recently would tick rungs for people
who have not done them and miss the people who have.

So the client hands its own answers up: the four keys are read once per
sign-in, offered in a single request, and deleted only when that request
succeeds. A dropped connection is not a fact lost — the keys stay and the next
launch tries again. Nothing writes those keys any more, so an install that has
handed them up cannot disagree with the account afterwards.

## Seven rungs is a wall, so the card draws one

The other half. The ladder was two rungs when every rung was given a button,
and `actionFor` said so at the time: *with two rungs there is no wall to
build*. It is seven now — two, sometimes an install rung, and the four — and
each one carries a label, an instruction, a note and a button. Stacked above
Home's two lists that is most of a screen, at the moment somebody has least
idea what any of it means.

So there are three ways to draw a rung, and which one is about what the rung
is rather than where it sits:

- **Done** — its title, in the muted colour, and nothing else. The instruction
  explains how to do something already done and the note argues for doing it;
  neither is any use afterwards, and the title still is. Dropping the row
  entirely was rejected: a card that shrinks as somebody gets further is one
  that hides the evidence they are getting somewhere.
- **The first one not done** — everything, exactly as before. This is the ask.
- **Everything after it** — nothing, until *See more*.

**The disclosure is shut on every mount**, not remembered. The card is read on
the way past and what it is trying to say is *the next one is this*; a
disclosure that stayed open would put the wall back a day later, on a screen
somebody opened to do something else. It is *See less* while open, which is the
same control admitting what it did.

The rungs keep their order throughout — a card that reshuffled itself as things
were ticked would be a different card every time somebody read it.

## What was considered and not done

**Grouping the done rungs at the bottom.** It makes the next thing to do the
first line of the card, which is tempting. It also means a rung moves when it
is ticked, so the card somebody learns is not the card they come back to.
Order won.

**Retiring the keychain keys in this commit.** They are the only copy of the
answer for every account that existed before today. SHIMS.md has the gate; they
go when the floor passes the build that ships the hand-up, and not before.

**A `GET /me/tried`.** The snapshot already goes to every device on every
change, and a second way to ask would be a second thing to keep agreeing.
