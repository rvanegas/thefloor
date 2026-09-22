# The members tab is the people tab

2026-09-22. A tab renamed twice in eight days, and the reason the first rename
was decided on turning out to be written down nowhere.

## What was wrong

*Members* was narrower than its contents on purpose.
`2026-09-14-the-roster-is-the-members-tab.md` says so, and GLOSSARY.md said so
in both entries: the tab draws *guests* and whoever is *knocking* as well as
members, and the name was allowed to be narrower on the grounds that a guest is
a visitor to a membership rather than a second kind of it, and that the heading
over a list of people should say whose room it is.

**Guest invitations are what ended that.** An invitation is neither a member
nor anybody in the room — it is a `guest_sessions` row whose holder has not
walked in — and it is the first thing on that tab that is neither. The
objection *the name does not cover the contents* had a written answer while the
contents were people in the room; it does not survive a fourth kind of card
that is nobody in the room at all.

**And the groups were never labelled.** Members, knocks and guests ran as one
unlabelled stack — the first `SectionLabel` on that tab was *Audio*, below all
of them — so which group a card belonged to was legible only from what the card
itself said. That is where a fourth kind of card actually does damage, and it
is the half the rename does not fix.

## The reason the last rename was decided on, which nobody wrote down

*Roster* → *Members* was argued in three places — the decision file, GLOSSARY.md
and the commit message on `2f8f195` — and all three give the same two reasons:
*Roster* named its container rather than its contents, and it was a word the
app said in exactly one place a user could see.

**The reason it was actually chosen for was translation.** *Members* has an
easy equivalent in other languages and *roster* does not, and
`planning/tasks/internationalization.md` — "First replace all text with
functions. Then Spanish." — makes that a live constraint on naming rather than
a someday concern. None of the three write-ups mentions it, so a session
re-opening the question argues it from the two weaker reasons and reaches the
wrong answer confidently. It is recorded here because this is the file the next
one will find.

## What was decided

**The tab is *People*.** It clears both objections that killed *Roster* — it
names the people rather than the container, and it is not a word the app says
nowhere else — and it translates. What it gives up is the vocabulary lesson
*Members* was chosen to teach.

**The lesson moves one level in.** Each group on the tab now carries its own
label, drawn only when somebody is in that group:

    Members       Miembros
    At the door   En la puerta
    Guests        Invitados
    Invitations   Invitaciones

*Members* is the exception that is always drawn: there is always at least one,
and it is now said about exactly the people it is true of rather than over a
list that includes three other kinds. The word is taught more precisely than
the tab taught it.

**The Spanish is in the comment over the labels**, in ChannelView.tsx, and it
is not decoration. One of the four was chosen around it: *invitado* is both
*guest* and *invited*, so the pending-seat group is named with the noun rather
than the participle — *Invitations* rather than *Invited as guests*, which
renders as *invitados como invitados*. The strings are still literals, the
extraction into functions not having happened, so a comment is where a second
language can live without pretending to be infrastructure.

**Three collisions in Spanish, of which one is settled here.** *Guest* in the
room, *Invited* on a member who has never entered, and an invitation to a seat
are three English distinctions and one Spanish word. This file settles the
third. The second — `ChannelView.tsx`'s `Invited` status line — is
pre-existing, is not made worse by any of this, and belongs to whoever does the
extraction, when the whole vocabulary is read against one target language at
once. An entry is in the internationalization task.

## What was deliberately not done

**The *Invitations* group is named and not drawn.** Nothing populates it: a
pending guest invitation is a `guest_sessions` row and is in no `ChannelState`,
by `2026-09-21-asking-somebody-in-as-a-guest.md`. The label arrives with the
feature that gives it rows. It is written into the comment and this file now
because the four were chosen together, against each other and against Spanish,
and choosing the fourth later in isolation is how it ends up being *Invited as
guests*.

**The room-claim lines stay between the groups.** The party-muted line, the
other-device sentence and the arrival line sit between the member cards and the
door, and each has a comment arguing for exactly where it is — "a claim about
the room you are looking at, made where you are looking". They are not a group
and take no label; they read as lines under the member list, which is what they
already were.

**`styles.members` keeps its name**, and is more accurate than it was: it is
the container for the member cards specifically, which is now a labelled group
rather than the whole tab.

**`'members'` never left the process** — no wire field, no storage key, no deep
link, exactly as `'roster'` had not — so there is no shim. The lowercase common
noun *roster* in comments and in dated decision files is untouched, on the same
reasoning as last time.
