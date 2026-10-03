# A tap only ever looks

2026-09-21. *Tap a channel to look, not step in* stops being a setting and
becomes how the app behaves. The toggle goes, `accounts.tap_to_look` goes, and
the five branches that read it collapse to the looking side.

## What it was

A Home setting from 2026-08-31, stored on the account. Off — the default, and
what every build before it did — a tap on a channel row dispatched `ENTER`: the
app arrived, the others could hear you, and stepping out closed the screen
again. On, a tap only opened the channel screen, and stepping out left you
looking at it.

**The two doors were tied together on 2026-09-08**, which is the part worth
remembering. `stepOutClosesScreen` was `!tapToLook`, and the argument for it was
symmetry: if arriving at this screen did not put you in the room, then leaving
the room does not take you off this screen. Somebody who had said a tap is only
looking had said the screen and the room are two things, and should not have to
say it again at the other door.

## Why it goes

The setting was a choice between two applications, and only one of them is the
one this is. Stepping in is an act with consequences — a microphone opens, a
room is told you are there, a notification may go out — and a tap on a list is
as likely to be curiosity as intent. Making that the default and offering the
careful version as a preference had it backwards.

Removing a setting is also removing a shape: every screen that reads one has two
arrangements to be correct in, two sets of wording, and two accessibility
labels. Five sites read this one, and each had to say both things.

## What the behaviour is now

- A tap on a channel row — on Home, or on a profile's list of shared channels —
  opens the channel screen and dispatches nothing. Nobody is told you arrived
  and the microphone is never asked for.
- **Stepping in is the footer's *Step In***, on the screen the tap opened.
- Stepping out gives up the room and leaves the screen exactly where it was.
  The header's *Home* is the way off it.
- The rows no longer say *tap to join*, and the accessibility label is *Open*
  for every kind of row where it used to be *Join* or *Step in*.

`stepOutClosesScreen` is kept as a named constant set to `false` rather than
inlined away: the question it answers is real and could be answered differently
again, and a `false` threaded through `stepOutOfChannel` says which question is
being answered where an absent branch would say nothing.

## The one thing it is not

**The guest hand-over still enters a room.** `Handover.enter` is set by exactly
one caller — somebody who was audible in a channel as a guest a second ago and
has just been made a member of it — and landing outside would be the app
forgetting what it had watched them do. Its comment used to note that
`tapToLook` was not consulted, on the grounds that a list of rooms is different
from this. That distinction is now the difference between this caller and the
whole of the rest of the app.

## The column, and why nothing is lost by dropping it

`accounts.tap_to_look` held a choice between two behaviours and there is one
behaviour left, so an account that had set it and one that had not are in the
same place. There is nothing to migrate the 1s into.

**The migration runs after the 2026-09-07 rename block, deliberately.** On a
database old enough to still have `tap_to_step_in`, that block is what *creates*
`tap_to_look`; dropping first and renaming second would hand the column straight
back on the same boot. The migration test asserts the column is absent
afterwards, which is what would catch that ordering being reversed.

## What still goes out on the wire, and why

**`tapToLook` and `tapToStepIn` are still sent — as constants.** A build already
on a phone reads them, and a build that heard nothing would take the absent
boolean as false and go back to a tap that steps into the room: the exact
behaviour being removed, arriving silently the moment the server restarted. So
`settingsForWire` asserts `tapToLook: true` and `tapToStepIn: false` on every
settings payload until the floor passes 264. SHIMS.md carries it.

On the way in, both names are **read and dropped rather than refused**. An old
build still draws the toggle and will still send one; answering that with a 400
would turn a setting nobody can change into an error they cannot get past.
Ignoring it leaves the toggle inert, and the next settings push asserts the one
answer there now is.

## Two things this moved that were not about it

- **`labsButton` in the app's settings test is positional**, taking the *n*th
  On/Off pair on the screen. Labs went from second to first. Its own comment
  had already recorded three such moves and this is the fourth, which is the
  argument for the comment rather than against the helper.
- **`settings-wire.ts` is no longer deleted in one piece**, which its comment
  said it would be. The `controlCards` alias is a genuine rename retiring at
  gate 159; the tap constants are an assertion retiring at gate 264. Two clocks
  in one function now.
