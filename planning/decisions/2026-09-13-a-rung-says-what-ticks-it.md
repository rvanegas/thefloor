# A rung says what ticks it, and nothing is born ticked

2026-09-13. Three reports from the prompt in one sitting, which turned out to
be one fault wearing three faces: **a rung of the introduction was named after
something other than the thing that ticks it.**

## What was reported

1. *I still have "You have not stepped in yet", after stepping in to and out of
   a channel.*
2. *After "Show the checklist again", "Get somebody here" is already marked
   done. It should be marked done only after inviting one more contact.*
3. *Invited contacts should not get a pass. They should have a clear list from
   the start.*

## What was true

**`stepIn` is ticked by `conversedAt`, which is stamped from `conversing` —
you, in a channel, with somebody else in it.** Stepping in alone does not
stamp it, and nothing about the row said so. The row was called *Step in* and
the card for the invited cohort said *You have not stepped in yet*, which is a
claim about an act the reader had performed. It now reads *Step in with
somebody*, and the card's sentence became *Nobody has heard you yet* before
the card itself went.

**A guest did not count, either.** `conversing` counted members present, so a
conversation held entirely with a guest left the rung hollow — on a ladder
whose third rung is *bring in a guest*. `guests` membership means present
(`core/types.ts`), so the room holding one is a room somebody can hear you in,
which is the whole of what that value is asked. It counts them now.

**`somebody` read `contacts.length > 0`, which is a standing fact rather than
an act.** Every account that reaches for *Show the checklist again* has a
contact, so the reset drew a ladder with its first rung already ticked. The
fix is a **starting line**: the contact count latched at the first Home
snapshot the install ever saw, and moved to the count of the moment on that
debug tap. The rung is done when the count has gone above it.

## What the starting line cost, which is the card

The invited cohort was shown a one-line card rather than a ladder, and the
argument for it was explicit: its first rungs were *born ticked*, and a list
congratulating somebody on what was done for them is theatre. That premise is
what the starting line removes. An invited account arrives holding a contact,
so its line is one, and *Get somebody here* asks it for somebody of its own.
Nothing is born ticked for anybody; there is no cohort with a different
problem; there is one ladder.

So the `show: 'invited'` variant is gone, and `Arrival` with it — the type,
`arrivalOf`, and the latch. What survived of the arrival is its second job,
saying that this install has seen a snapshot before, which the starting line
does instead. `thefloor.intro.arrival` is read once and deleted, so an install
already climbing keeps a line of nought rather than being measured from
today's count and having a rung it earned taken back — planning/SHIMS.md,
gate 198.

**What went with the card is the only control in this feature that opened a
channel.** Its *Step in* went straight into the waiting channel, which
`actionFor` rules out for every rung and says why: this card reaches as far as
a list and no further. The `stepIn` rung goes to Channels, where the channel
waiting for them is the first row.

## What was considered and not done

**Keeping the card for the pre-conversation moment**, on the strength of that
direct *Step in* button. Rejected at the prompt: the point of the report was
that the invited cohort should have a clear list from the start, and a card is
the absence of one.

**Ticking `stepIn` on stepping in at all**, which is the other way to make the
label true. Rejected because the rung is worth having: *the moment people can
hear you* is the thing the app is for, and a rung that ticked on entering an
empty room would be congratulating somebody for being alone in it.

## Where it lives

`app/src/state/introduction.ts` — `contactsBase`, the `Introduction` type, and
the rungs' copy. `app/src/state/useIntroduction.ts` — the latch, the legacy
read, and `forget`. `app/src/state/AppProvider.tsx` — `conversing`.
`app/src/ui/Introduction.tsx` — the card's removal.

It reverses part of `2026-09-13-the-checklist-outlives-the-first-conversation.md`,
which introduced the two shapes, and none of
`2026-09-13-the-checklist-has-a-second-exit.md`, whose per-rung dismissal is
untouched.
