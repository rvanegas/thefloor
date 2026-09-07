# 2026-09-07 — Anybody in the room may mute anybody else

Asked for in one sentence: *it should be possible to toggle the self-mute
control of other occupants in the channel — we are all friends, and sometimes
need a little help; put the control in the profile view.* What follows is what
that turned into and the three or four places it could have gone wrong.

## What was built

`SET_SELF_MUTE` gained an optional `target`, on both the reducer's action and
the wire's. Absent means the sender, which is what the footer sends and what
every build before this one sends, so the change is additive at both ends.
`canSetSelfMute` gained a fourth parameter defaulting to the actor, so every
caller that predates it asks exactly what it used to ask.

The control is a card on `ProfileView`, above Ping, drawn only when the caller
supplies a `mic`. `ChannelView` supplies one for somebody who is not you, who
is present, while you are present too. That is the same shape `onPing` already
had, and for the same reason: an affordance that is present and refuses reads
worse than one that is honestly absent.

## The three clauses, and why each is there

- **Both ends in the room, and the actor present.** Not a rule about
  permission but about there being anything to do: `selfMuted` is cleared on
  the way out, so muting somebody who has stepped out writes a key their next
  step-in discards. `inRoom` at the target end rather than `isPresent`, so a
  guest can be the object of the favour — they are in the room and they are
  audible, which is the whole of what qualifies anybody.
- **A guest may not do it to anybody else.** `GUEST_ACTIONS` names
  `SET_SELF_MUTE`, and that entry was written when the action could only ever
  be about the sender. This is the failure mode of an exception list: widening
  an action silently widens every permission that named it. Stated explicitly
  in the guard rather than left to be inferred from a set that no longer says
  which sense it meant.
- **The floor clause is about the target.** It exists so the one voice the room
  is listening to is not a muted one, and who is doing the muting has no
  bearing on that. So you cannot mute the holder on their behalf either, and
  the answer they get is the answer you get: release the floor.

## What was decided against

**Asking permission.** Opening somebody else's microphone opens it — no prompt
on their phone, nothing to accept. That is a real cost and it was taken
knowingly. A channel here is people who invited each other; the alternative is
an ask, an answer and a wait, which is slower than saying "you're muted" out
loud, which is what everybody does today and what this is meant to replace.
The person muted sees it in the same footer that shows their own mute and
undoes it in one tap.

**Putting it on the roster card.** One tap from a list of faces is a tap that
gets made by accident and made casually, and this is a favour rather than a
moderation tool. A profile is a screen you went to about a person, and the
extra tap is the whole of the ceremony this needs. It was also what was asked
for.

**Renaming `selfMuted`.** *Self* stopped being accurate the moment a second
hand could reach it, and the field kept its name anyway: it is part of
`ChannelState`, which goes over the wire in every channel snapshot, so a rename
is a wire change owed the ordinary two-step — for a word rather than a
behaviour. The disagreement is written down instead, in GLOSSARY.md §
*Self-mute*, which now says to read it as "muted by hand".

## The order this has to ship in

The usual two-step, read the usual way round. A server that predates `target`
drops the field and mutes **the sender** — the wrong person, silently, which is
worse than a refusal. So the server learns the field first and a build that
sends it ships after. Nothing enforces that and nothing can: the app cannot ask
a server what it understands.
