# The getting-started checklist is two rungs, and both of them point somewhere

2026-09-13.

## What it was

The *introduction* shipped on 2026-09-10 as a four-rung ladder for an `alone`
arrival — say who you are, choose a username, get somebody here, step in — of
which only the next unfinished rung carried a control, and *step in* carried
none at all.

## What changed underneath it

`core/derivedNames.ts`, two days earlier: an account is named from its sign-in
address and given a username derived from that name **at the moment it is
created**. The decision that shipped it said the username rung *stays, because
accounts predating this still need it, and a ticked rung is honest*.

That was the wrong call, and the reason is which accounts can see this list at
all. The ladder is drawn only for an account that has never had a conversation
— which, for every account created from now on, means an account created after
the derivation. The cohort that predates it and is still on the ladder is
empty in practice and closed for good. So both rows were born ticked for
everybody who would ever see them, and a ladder that opens by congratulating
you on two things you did not do is exactly the theatre the `invited` card
exists to avoid.

## What it is

Two rungs: **get somebody here**, and **step in**. Each carries three things
rather than two — the imperative, an `instruction` naming the list it is done
on and what is waiting there, and the note saying why it is worth doing — and
**each carries a button**, to Contacts and to Channels respectively.

## Why every rung has a control now, having deliberately not had one

The four-rung ladder gave the control to the next unfinished rung alone, on the
grounds that four calls to action stacked above a list somebody opened to read
is a wall rather than a ladder, and that saying which rung is next is most of
what a ladder is for. Both arguments were about there being four. With two,
there is no wall to build and no ordering worth announcing, and the argument
the other way is the stronger one: both of these are done on a screen that is
not this one, and a row that names a place without going there makes somebody
hunt for a tab whose name they have not learned yet.

*Step in* gains one for the same reason, reversing the note that there was
nowhere to send it. That was true when the card sat above the channel list; it
is false half the time, because the card stays put while somebody flips between
the two lists, and from Contacts the row that starts a channel is not on
screen at all.

**A tap while that list is already showing is a no-op.** That is the honest
cost, and it is cheaper than a button that appears and disappears as the list
underneath is switched, which is a control that cannot be described in one
sentence to the person using it.

The buttons go to a list and no further. Starting a channel or sending an
invite is a decision with a screen of its own; this card's job is to put that
screen in front of somebody, not to press it for them.

## What left with the rungs

- **The one request this feature made.** `useIntroduction` fetched the
  account's username for the `alone` cohort, a username being on `ProfileView`
  and on nothing else. The ladder was withheld entirely while that answer was
  outstanding — drawn a beat late rather than gaining a rung a beat after
  appearing. Both the fetch and the withholding are gone.
- **`displayName` as an input**, and `Introduction`'s `onOpenProfile` prop with
  it. The card reaches nothing but the two lists now.

## What is deliberately not done

**Nothing was added to replace them.** The list of things left out on
2026-09-10 — notifications, chip in, recordings, the microphone — is unchanged
and the reasoning is unchanged; a two-item list is a feature of the app having
two things worth doing first, not a gap to be filled.

**The `invited` card is untouched.** It was already the one-line rendering for
the cohort whose rungs are born ticked, which is what this change makes the
`alone` ladder honest about too.
