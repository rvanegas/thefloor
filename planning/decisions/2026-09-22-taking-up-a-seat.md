# Taking up a seat

2026-09-22. The two halves that were missing from guest invitations: the offer
a member makes, and the answer the person offered it can give.

## What was wrong

`2026-09-21-asking-somebody-in-as-a-guest.md` built the whole of the server
side — `POST /channels/:id/guest-invites` and its two companions, the ceilings,
the push — and recorded that the app could not yet draw a seat. What it did not
say, because it was not true yet in any visible way, is that **nothing could
take an invitation up at all.**

`POST /channels/:id/seat/enter` had exactly one caller in the tree, and that
caller was a comment. The guest page reaches a seat only from a secret its own
tab stored when it knocked, or from a `?link` token; a pending invitation has
`link_token` null and has never put a secret anywhere. So an invitation was a
push notification and a Home card that opened the member channel screen — which
a non-participant may not be shown — and its ✕ sent `LEAVE_CHANNEL` for a
membership nobody had.

**And no member could make one**, the Invite tab's contact rows carrying one
button, `Invite`, which spends one of the six.

## The pair of buttons

`Guest` and `Member`, where there was `Invite`. Two controls rather than one
with a mode: a mode is a form to fill in before acting, which is what the
multi-select contact picker was before it was taken out, and the two offers
are genuinely different things rather than two spellings of one.

**`Member` is the trailing edge**, which is the thumb's position, because it
is the permanent one of the two. A seat ends with the room; a membership does
not end at all.

**A full membership no longer empties the list**, and that is the substantive
change under the rename. It used to be replaced entirely by *Channels hold up
to 6 people* — one sentence where the contacts had been, offering no way to ask
anybody anything. Six members and forty guests are two ceilings, and hitting
one says nothing about the other; the full room is exactly the room that wants
a guest.

**Three refusals arrive from the server rather than greying a button**, and
this is not the codebase's usual shape being bent. A dormant seat, an
invitation already outstanding and the fortieth guest are `guest_sessions`
rows, which no `ChannelState` carries — deliberately, that being the whole of
how a pending invitation stays out of the room. The client cannot draw a guard
against a fact it does not hold. So the sentence lands per contact, beside the
person it is about, rather than under a column of people where it would answer
about none of them. What *can* be drawn is drawn: `canInvite` on `Member`, the
room half on `Guest`, and a contact already seated says so instead of offering.

## Taking one up, which needed a credential

**The guest page authenticates with `guestId` and a secret and has no session
to offer.** `enterSeat` takes the account token — a seat with an `account_id`
has a better answer than a secret in a tab — so the app needs nothing else, and
the browser cannot work with anything less.

`invite` mints a secret and stores only its hash, so the one it made is gone
the moment that call returns. **So `enterSeat` mints a fresh one**, against an
account that has just proved it holds the seat, and hands it back.
`Guests.rotateSecret` is that, and rotation is the better shape rather than
merely the available one: the credential then exists from the walk-in rather
than from the invitation, so an offer sitting unanswered for six hours is not a
live secret waiting in a table. It ends any older tab holding the same seat,
which is correct — a seat is one visitor in one place.

The walk is then the one the app already makes to a seat it holds: leave the
credential and the channel in `sessionStorage`, assign `/g/seat`. Two keys,
because that page needs both — which of this tab's seats this is, and what to
open a socket with. `handover.leaveSeat` writes them, beside the three walks
that module already owns.

## A phone says where the seat opens

**This is the one place the invitation parts company with the dormant seat
beside it in the same list.** `ChannelsView` filters seats to
`Platform.OS === 'web'` on the judgement that a card which opens nothing is
worse than no card, and the first instinct here was to filter invitations the
same way.

That is wrong, and the difference is the notification. A dormant seat was never
announced. An invitation is — `notifications.invitedAsGuest` wakes the phone
with *Invited you to X as a guest*. A card that vanished would leave that alert
pointing at a Home screen with nothing on it, which reads as the invitation
having been withdrawn by the person who sent it.

So the card stands on a phone and the tap answers the only question it can:
this is a seat, a guest joins in a browser, and here is the address. The
in-app seat screen is still not built and still wants a LiveKit connection of
its own and an audio session configured for it — POSTMORTEM-echo.md and
STATES.md between them are why that is not a thing to write untested.

## What was deliberately not built

**Declining a guest invitation.** The ✕ is not drawn on one. Declining is
`LEAVE_CHANNEL`, which gives up a membership the invitee does not have, and the
revocation route beside it is a member's — an invitee is not a participant and
cannot call it. A seat expires on its own: six hours, or the moment the room
empties, `channelEmptied` pulling every expiry back. So the offer that is
ignored goes quiet by itself, which is exactly what a membership invitation
never does and is why that one needs a control.

**The `Invitations` group on the People tab still draws nothing.** It was named
on 2026-09-22 with the other three labels and waits on pending invitations
reaching `ChannelState`, which is the next piece.
