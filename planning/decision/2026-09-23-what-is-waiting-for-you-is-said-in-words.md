# What is waiting for you is said in words

The first hour of an invited account was a scavenger hunt, and every piece of
it was something this application already knew and declined to say.

## The walk that was wrong

Somebody is invited by email. The address has no account, so the request sits
in `pending_invites`; they sign up, and `Accounts.resolvePendingInvites` writes
the contact row as **pending** at that moment. So the very first snapshot the
new account ever receives already carries a contact request from the person who
brought them here.

Home opens on *Channels*. For this account that list holds one row — *Start a
channel* — and above it the introduction checklist, whose first rung is **get
somebody here**. The application's opening move is therefore to ask a brand new
arrival to go and recruit somebody, while the person who actually recruited
*them* is sitting unanswered one tab over, announced by a *dab*: a rose disc
with an `!`, which is deliberately a mark and never a sentence and never a
count.

They find it, or they do not. Say they find it and accept. The inviter then
asks them into a channel — which the server permits only now, an `INVITE`
naming somebody who is not an accepted contact being refused in `channels.ts`.
That card lands under *Invitations* on the **Channels** tab, which is the tab
they have just left, and Channels wears no mark at all. The comment on
`ListSwitch` said why: *Channels has nothing to mark that the rows below it do
not mark better*. True of somebody standing on Channels; false of somebody who
has just been sent to Contacts to answer a request, which is exactly where this
sequence leaves everybody.

Two things waiting, in a fixed order, each one behind a tab the reader is not
standing on. Neither said out loud.

## What was built

A **waiting bar** in the tier — `WaitingBar` in `ui/HomeView.tsx`. At most one
line for the answerable contact requests, at most one for the invitations,
nothing at all when there is neither. It names who is asking and what they
asked, and a tap switches to the list holding the row.

It reads its two questions from the places that already own them:
`answerableRequests` in `ContactsView`, which is what the Contacts dab is
counted from, and a new `waitingInvitations` in `ChannelsView`, built out of
`inviteCard` for the reason `nearbyChannels` is — what a channel is *called* is
a decided question, and a bar that answered it a second time is how a bar and
the row it points at come to name one channel two ways.

## The decisions inside it

**The sentence, not the controls.** Hoisting the rows themselves would put
*Accept* under a thumb one tap sooner, and would also draw every request and
every invitation twice — once in the tier and once in the list it belongs to.
That is the failure `liveChannelId` and `nearbyChannelIds` are passed down to
prevent for the channel rows, and STYLE.md rule 7's subject. So this makes the
live bar's bargain exactly: the bar says which room you are standing in, the
room keeps the microphone. **What was missing was never the button. It was
knowing there was one.**

**Two bars rather than one.** A single line counting unlike things — *2 things
waiting* — names neither, and points at one tab while meaning two. Both at once
is the rarer state anyway; the ordinary arrival meets them one after the other,
because the second cannot exist until the first is answered.

**One name or a count, never both.** *Ana and 2 others* reads as a group doing
one thing. These are people who each asked separately, and the list one tap away
is where they are enumerated.

**Under the presence bars, above the two notices.** That order is who each line
is about. An open microphone outranks everything and keeps the top — the whole
reason the tier exists. *Install this* and *allow notifications* are the
application asking for a favour, and a person waiting for an answer outranks
the application asking for a favour.

**Every invitation, not the ones filed under *Invitations*.** That section holds
the ones nobody is standing in; a live one is hoisted to the top of the list
instead. Right for a list with two sections, wrong for a bar whose whole job is
to say *you have been asked in*. Where a row is drawn is the list's question;
whether there is one to go and find is the tier's.

**The room goes unnamed when its name is the asker's.** `inviteCard` falls back
to the sender's display name for a channel nobody has named and whose roster the
server withheld — the ordinary shape of a guest invitation. *Dana Chu asked you
into Dana Chu* reads as a bug, so that case says *asked you into a channel* and
lets the channel introduce itself one tap later.

**A seat and a membership get different words**, `InviteView.guest`'s standing
rule: *kept you a seat in* against *asked you into*. One is a place in the room
while it lasts and the other is belonging to the channel, and a line that said
the same for both would be wrong about one of them every time.

**Rose on the edge, no fill.** `waiting` is the token whose meaning this
already is, spent on the dab and, since 2026-09-15, on the edge of an
invitation row. Same trade as that row: the fill is what makes the live bar the
loudest thing in the header and it should stay the only one, since the room you
are standing in is happening now and a request can be answered tomorrow. No
eighteenth token.

## What was rejected

**Opening Home on whichever tab has something waiting.** The obvious fix, and
it only covers the first half: the channel invitation arrives later, while the
app is already open and the reader is sitting on Contacts. It is also worse
mechanically. `list` is initialised in `App.tsx` before any snapshot exists, so
the rule would have to fire on the first snapshot — a moment after launch,
under a thumb already travelling — and would then have to decide, on every
launch after the first, whether this arrival is still the thing somebody came
for. A bar says so and waits to be pressed.

**A dab on the Channels tab.** Correct as far as it goes, and it would have
amended the `ListSwitch` comment honestly. But a dab is deliberately quiet and
deliberately wordless, and *cannot find the card* is not a complaint a quieter
signpost answers. The bar subsumes it; the Contacts dab stays, because a mark
on a tab and a sentence above the tabs are the *Support* pair's relationship
rather than a duplicate — the mark says *go and look*, the sentence says what
is there.

**Suppressing the introduction checklist while something is waiting.** There is
a real oddity in an application whose opening instruction to an invited arrival
is *get somebody here*, and the bar now sits above the checklist, which is most
of the remedy. Reversing a dated decision about the ladder is a separate
argument and was not made here. Left as an observation.

## What it cost elsewhere

Three existing tests asserted over `textOf(tree)` — the whole screen — while
meaning the list, and the bar is above the list:

- *renders the channels from a snapshot, and no contact of any kind* asserted
  that no pending contact's name appeared anywhere. The property it guards is
  that the **list** draws no contacts; the bar naming a request is the new,
  deliberate behaviour, so that assertion now checks the sentence, and the
  accepted contact — named nowhere on this screen at all — still carries the
  negative.
- *sections the channels into live, invited and the rest* read section order by
  `indexOf` from the top of the screen, and the bar mentions one of the channel
  names above every label. It now measures from the first label down.
- *says the tap opens rather than joins* found a pressable by label prefix
  `'Dana Chu'`, which the bar's sentence also starts with. It asks for
  `'Dana Chu.'` — the row's label opens with the channel name and a full stop.

None of the three was testing something the change broke; all three were
measuring a claim about the list against the whole window.
