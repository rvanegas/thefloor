# A seat rides the member socket

The app can sit in a seat now. A contact who is asked in as a guest, and who
has an account here, stays in the application they were already holding rather
than being sent to a web address to sign in again.

**This is GUEST-LADDER.md § *The app holds seats too*, executed, with its first
bullet reversed.** That section decided the app may be a guest and only for an
account, and that a seat takes this device's standing — both of which are built
exactly as written. What it also called for was *a second protocol client*: the
app speaking `GuestClientMessage` against `/gws`, with a room screen of its own.
The first half of that is not what was built.

## What was built instead

- **`watch.channel` answers a seat with a seat.** `pushChannel` asks
  `viewableBy` first and, where there is no membership, `Channels.seatView`. A
  new `ServerMessage.seat` carries the same `GuestView` the guest page gets.
- **`seat.action` is the guest's half of `channel.action`**, dispatched through
  `Channels.dispatchSeat`, which resolves the seat from the account and then
  calls `dispatchGuest` unchanged.
- **`POST /channels/:id/media-token` serves the seat's grant** when the caller
  is not a member but holds a seat, so the app's audio hook asks the route it
  has always asked and gets an identity of `guestId` with `canPublish`
  following `maySpeak`.
- **`SeatView` is the screen**, built against `GuestView` alone.
- **One acceptance needed a route of its own**: a contact ask answered from the
  app has no secret to present, so `POST /channels/:id/seat/contact-ask/accept`
  proves the seat by its account binding instead. `acceptGuestAsk` and it now
  share `answerContactAsk`.

## Why not the second client

The guest protocol authenticates with a guest id and a secret. **That pair
exists because a browser has nothing better** — `guest_sessions.secret_hash` is
all that stands between a seat and whoever guesses its id, for a visitor with
no account. An app holding a seat always has an account: that is the decision's
own first line, and anonymous seats stay in the browser.

So a second client would have presented **the weaker of the two credentials it
holds**, over a second socket, with a second heartbeat and a second reconnect
loop, to reach a room whose standing is tracked on the first one. `enterSeat`
already says as much in its own header — *the account token is the whole
credential here* — and the server comment beside the minted secret already read
*the app ignores it*. The route was built for this shape before anything used
it.

Three further things fall out of it and are the reason to prefer it rather than
merely to tolerate it:

- **One fan-out.** Every push in `ws.ts` goes through `pushChannel`, so a seat
  learns about the room on exactly the same terms and in the same moment a
  member does. A second broadcast is a second thing that can come to disagree.
- **The wire does not become versioned twice over.** The bullet that says an
  installed app speaking `/gws` ends that protocol's lockstep-with-the-server
  policy is simply void: nothing installed speaks it. The member protocol is
  already versioned and already has SHIMS.md entries; these two messages join
  it.
- **One standing.** A seat taking this device's standing is one `STEP_OUT` on
  the socket that holds it, in `AppProvider.enterSeat`, rather than two sockets
  negotiating which of them is in a room.

## The deploy order, and why SHIMS.md gets no entry

**Server first, and the ordinary two-step needs no alias for once.** Both
additions are new message types rather than changed ones, so there is nothing
older to keep answering: a client that predates them never sends `seat.action`
and simply ignores a `seat` it does not know — the app's message switch has no
default and falls through. What is *not* safe is the other order: a build
sending `seat.action` to a server that predates it gets *Unknown message type*
and a seat screen that cannot act. So this ships to the box before it ships to
a phone, which is the order AGENTS.md § *Never ship a wire change to a server
before the client can speak it* always asks for.

**No shim was written, so SHIMS.md has no new entry.** That register's rule is
that whatever is added at step one — the aliases that keep an old client
working — is entered in the same commit. There are none here, and an entry for
a shim that does not exist sends somebody looking for code that is not there.
The one behaviour an old client could notice is a web build below this one
watching a channel it holds a seat in, which used to be answered `channel.gone`
and is now answered `seat`; no such build ever watches one, the seat row
navigating to the guest page instead.

## What is still separate, and must stay so

**The projection.** `GuestView` is not a narrowed `ChannelView` and `SeatView`
is not `ChannelView` with things hidden. A seat is sent names and no ids, no
recordings, no roster, no floor — sending the lot and hiding half is the same
mistake as a greyed-out button the server does not enforce, and the information
has already left the building. The two views are separate types, arrive as
separate messages, and land in separate maps on the client (`channelViews` and
`seatViews`), so no screen ever asks which kind it is holding.

**The allowlists.** `dispatch` refuses anybody who is not a participant, which
is the property the guest design rests on; `dispatchGuest` has the short list.
`seat.action` is its own case beside `channel.action` rather than a flag on it,
because one case that picked a dispatcher by looking the sender up is one edit
away from letting a seat send a member's action. There is a test for exactly
that.

## What this lifts

`ChannelsView` filtered every seat row out of Home on anything but the web,
under a comment naming precisely what was missing — a screen, and an audio
session configured for it. Both exist, so the filter is gone rather than
softened, and a phone tapping a guest invitation takes the seat and opens it.

`GUEST-CONTACT.md`'s sentence that a seat row is "web only, on the client …
a phone rendering this row would offer a place it cannot open" is now false,
which GUEST-LADDER.md predicted and gated on this work.

## What was not built

**Anonymous seats in the app**, which stays decided as it was: the app boots
into a sign-in and a seat with nobody behind it has nothing to sign in as.

**The publish-consent control.** It is drawn on the guest page for a seat with
no account and hidden for one with an account — and every seat in the app has
one, so there is nothing to draw. A seat-holder with an account is asked per
recording, like a member.

**The *Open in the app* button on the guest page**, and universal links with
it. Both are GUEST-LADDER.md § *Getting into the app* and are untouched; this
work is about a seat somebody reaches from Home, which needs no link at all.
