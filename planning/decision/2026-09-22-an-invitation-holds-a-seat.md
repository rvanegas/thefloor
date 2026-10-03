# An invitation holds a seat

2026-09-22. A ceiling that was enforced in one place and counted in another,
and the reversal of one paragraph written the day before.

## What was wrong

`2026-09-21-asking-somebody-in-as-a-guest.md` put the forty on `GUEST_ENTERED`
and explained why at length: admission is two steps, a reconnecting guest
re-enters with no knock, and a cap at the door would let a full room refill on
the next blip. All of that is right and none of it changed.

What it also decided is that **a pending invitation is a `guest_sessions` row
and nothing in any `ChannelState`** — which kept it out of `participants`, out
of the roster, and out of the room. The trouble is what else it kept it out of.
`guestCount` is `Object.keys(state.guests)`, so the reducer's ceiling could not
see an invitation at all. The only place that counted one was `inviteGuest`, at
the moment of asking, joining the room to `pendingIn`.

**So forty invitations and forty knocks admitted eighty claims on a forty-seat
room.** Thirty-nine of those people were then refused one at a time on arrival,
each having been told they were invited. The server comment shrugged at this —
"this only stops a member queueing a hundred people" — which is a fair
description of the behaviour and not a fair description of what it costs the
people at the other end.

Members were never wrong: `INVITE` appends to `participants`, `canInvite` caps
on `participants.length`, and the roster has always drawn the invitee with the
status line `Invited` and no clock. Guests were the asymmetry.

## What was decided

**`ChannelState.guestInvites`, a second field.** Keyed by the
`guest_sessions` id, which is the id the seat will carry if it is taken up.
`InvitedGuest` is deliberately smaller than `Guest`: no `maySpeak`, no
`request`, no `asks`, no `admittedAt` — none of those has happened.

**It is never folded into `guests`, and that is the load-bearing half.**
Everything that asks who is in the room reads `guests`: `roomOccupants`,
`statedIdentities`, `inRoom`, `selfMuted`, and through the last of those the
whole mute matrix and what the media plane is told. An invitation is nobody in
the room. Merging the two would announce a person who has never connected.

**`guestsPromised(state, now)` is what `MAX_CHANNEL_GUESTS` is checked
against**, everywhere — `canAnswerKnock`, the `GUEST_ENTERED` case, and
`inviteGuest`, which can now drop its own join and stop being a second place
the ceiling is written down. `guestCount` stays, and stays the room alone: that
is what its other readers want.

**`GUEST_ENTERED` converts rather than adds.** The offer and the seat are one
row, so walking in on one's own invitation deletes the entry in the same
breath. The capacity check does the deletion first and then counts, or the
fortieth invitee would be refused by their own invitation.

**Expiry is read, not swept.** An invitation past its `expiresAt` is not
counted, so a room gets its seats back with nothing having run. `core/` has no
clock, which is why `canAnswerKnock` and `canWithdrawGuestInvite` take a `now`
their neighbours do not. A timer raising a prune action was the alternative,
and it leaves the ceiling held by ghosts on the day it does not fire.

**The emptying is the one exception**, and it needs an event. `channelEmptied`
pulls every row's `expires_at` back to now, which the copies in the state
cannot see — they would go on claiming six more hours. So emptying raises
`GUEST_INVITE_WITHDRAWN` for each outstanding offer. It is the only event that
makes an invitation stale without touching it.

## The roster group, and one guard that could not be reused

*Invitations* was named on 2026-09-22 with the People tab's other three labels
and had nothing to draw until now. The row carries the name, who asked, and
**no clock** — the member invitation's precedent, argued out in
`ParticipantCard`: there is no visit to count from.

**`canWithdrawGuestInvite` is its own guard and not a case of
`canManageGuest`.** The 2026-09-21 entry recorded the trap from the other end —
that guard is shared by `SET_GUEST_SPEECH`, `EJECT_GUEST` and
`ASK_GUEST_CONTACT`, and a capacity term in it would leave a full room unable
to eject anybody. Taking an invitation back is the same kind of act: it is how
a full room makes space, so it must never be gated on space. And
`canManageGuest` would refuse every row in this group anyway — it asks
`isGuest`, and the whole point of the second field is that an invited seat is
not in `guests`.

## What needed no work, and is worth saying

**`durableOf` is an allowlist**, so `guestInvites` is volatile for free — it
describes who is expected rather than what the channel is, exactly as `guests`
does. The rows are the durable half, and `revive` replays one `GUEST_INVITED`
per outstanding row at boot. A restart that skipped that would hand the room
back forty seats it had already promised while the offers were still on
everybody's Home.

**`guestView` enumerates rather than spreads**, building `others` from
`present` and `guests` by name. So invitations stay out of a guest's roster
without anything having to withhold them — which is the shape that made this
safe to add at all. Who has been asked in is administration; a guest's roster
is who is here.
