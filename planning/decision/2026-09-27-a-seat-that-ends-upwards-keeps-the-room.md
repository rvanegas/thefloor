# A seat that ends upwards keeps the room

2026-09-27. A guest in the app who is asked into the channel they are sitting
in stayed in the room's audio as a guest the roster no longer had a row for,
while their own channel screen said *out*. Stepping in then cut the audio for
a moment, for a reason nothing on screen had given.

## What was wrong

`INVITE` closes the seat — `Channels.closeSeatFor`, the third rung, added
2026-09-16 — and adds the account to `participants`. `pushChannel` then answers
that same watch with a `channel` where it had been answering with a `seat`,
because `viewableBy` succeeds now that there is a membership.

**Nothing told the client the seat had ended.** `onChannelGone` is the only
thing that drops a `seatViews` entry, and no channel is gone: the id is still
there, still watched, still sending. So the app held both maps for one id, and
the two readers disagreed about which it was:

- `App.tsx`'s screen routing already guarded for it — `seated &&
  !app.channelViews[id]` — which is the clearest evidence that both maps
  holding one id was known to be possible.
- `App.tsx`'s **audio** wiring did not. It reads the seat whenever no
  membership is *live*, and a freshly-made member is present nowhere, so the
  phone went on holding the LiveKit connection it had taken on the seat's
  credential, with an identity of `guestId`.

The result is a voice in the room with nothing in `ChannelState` behind it:
`GUEST_GONE` has removed the guest, the member is not present, and the media
plane has heard about none of it. The channel screen was right — `steppedIn`
is `inTheRoom && standingIn === channelId` and neither held — which is why this
reads as the screen being wrong when it is the only honest thing on it.

Stepping in swapped the media identity from the guest to the account. An
identity cannot change on a live LiveKit connection, so that is a room torn
down and rebuilt: the "session restarting" is exactly what it sounded like.

## What was built

**`onChannel` drops the seat for that id**, which is the fix at the source: the
server answers a watch with one or the other and never both, so the client may
not hold both either. The screen guard in `App.tsx` is now redundant and is
kept as it is — it costs a map lookup and it is the reading that made this
findable.

**And the membership takes the standing the seat had**, by sending `ENTER`.
Somebody who was in the room stays in it, which is the whole of what the
complaint was. This is done on the client for the reason `AppProvider.enterSeat`
gives at the other end of the same walk: standing is a fact about *this device*
and the server has no way to know which of an account's sockets was sitting in
the seat. The walk in takes this device's standing; the walk up gives it back.

**Self-muted unless they were already holding the microphone.** Stepping in is
the claim, and `INVITE` clears `selfMuted` for the invitee — so without this,
being made a member opens a microphone the person did not open, in a room that
could not hear them a second earlier. A guest whose `mic` was `open` is entered
unmuted, because for them nothing changes. This is the one rule here that is
new rather than a repair, and it is the one to argue with first.

## What was deliberately not built

**Making the promotion seamless at the media plane.** It cannot be: the seat's
identity is `guestId` and a member's is the account, `livekit` admits one
identity per connection, and there is no rename. So the reconnect is moved
rather than removed — it now happens at the moment somebody is told they have
been added to the channel, rather than later at a tap that has no visible
reason to cost anything.

**Placing the new member present on the server.** It would fix the web guest
page too, and it is the wrong layer: presence is per device, and the server
would be guessing which socket the seat was being held on. The guest page's
own promotion path is `joined` over `/gws` and is untouched by this.

**A shim, and so no SHIMS.md entry.** Nothing on the wire changed.
