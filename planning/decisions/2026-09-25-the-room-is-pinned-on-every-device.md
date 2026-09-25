# The room is pinned on every device

2026-09-25. Two screenshots of one account, taken a second apart — a laptop and
a phone, both signed in, both on Home. The laptop's pinned tier held five bars:
the room, at the top, and four channels the reader was nearby in. The phone's
held four. The room was missing, and there was nothing on the phone's screen
that said so.

## What was wrong

**Presence belongs to the account. Standing belongs to a device.** A channel's
`present` names accounts: it says somebody is in the room and nothing at all
about which of their devices is holding it. The server keeps the missing half
in `Connection.standing`, written by `ENTER` and cleared by every route out,
and it is the only thing that can see all of somebody's devices at once.

**Home's live bar can only speak for the device it is drawn on**, and rightly:
it is drawn from what `App.tsx` knows *this* process is connected to, which is
the honest answer to *is my microphone open here*. Asked *where am I*, it
answered by drawing nothing, on every device but one.

That is the whole defect, and it is a drawing decision rather than a wire
problem. Which device is holding a room is a real fact and a small one; the
tier was expressing it by omission, which cannot be read. Somebody picking up
their phone saw a Home that pinned four rooms they were *near* and said nothing
about the one they were *in*.

It also broke an invariant the left swipe depends on. That gesture opens "the
topmost bar hoisted onto the tier", computed in `App.tsx` from the same values
the bars are drawn from. With a bar missing on one device the two computations
were still consistent — both drew nothing — but the moment the bar exists, the
swipe has to know about it or a thumb goes somewhere the eye is not. Both moved
together; see `hoisted` in `App.tsx`.

## What was built

**`standingElsewhere`, a push shaped exactly like `screening`.** Each
connection is told which channels its *others* are standing in, and never about
itself — which is what makes the answer mean *another device of mine* on every
device at once, with no client having to subtract itself. Keyed by `deviceKey`,
so a device reconnecting does not report itself as standing elsewhere across
its own reconnection. Sent on every action that moves somebody, on every
close that takes a standing device away, and once to each new session
connection, so a phone picked up beside a laptop that is already in a room does
not wait for somebody to move.

**A third bar in Home's tier, in the live bar's shape and hue.** The whole
complaint is that two screens of one account did not match, so the bar that
stands in for the live bar has to look like it. What differs is a hollow dot
rather than a filled one, and *On another device · 2 present* in place of *tap
to go back* — there is nothing here to go back to.

**The tap opens the channel and does not step in.** That is the nearby bar's
rule with a sharper edge: an `ENTER` from here would take the room off the
device somebody is actually talking into. Moving a conversation from the laptop
to the phone is *In* under a thumb on the channel's own screen — one action,
which displaces the other device exactly as it always has, and which somebody
means when they take it.

## What was deliberately not built

**A `present` bit on `RejoinableView`.** It was the obvious move — `nearby` is
already an account-level bit on that snapshot, and a bit saying *you are in
this one* would sit beside it. It answers the wrong question. The snapshot is
the same on every device by construction, so a client reading it would still
have to ask *and am I the one holding it?*, and the only answer to that is the
socket's. Two sources for one bar is how a bar and the thing it names come to
disagree; the push is the whole answer and the snapshot needs no new field.

**A count of your own devices, or their names.** The bar says *another device*
and stops. Which one is the screen picker's question, it is already answered
there, and a pinned line on Home that named a piece of hardware would be a
sentence to keep right for no gain.

**Nothing about `inApp`.** A neighbouring complaint, noticed the same
afternoon, is that a contact shows as *In the app now* while a desktop client
sits open in a room nobody is in — `hasConnection` counts sockets, and an
attended app and an abandoned one hold the same one. That is a real defect and
a separate one: it is about what this account tells *other people*, where this
is about what it tells its own other devices. It needs an account-level
attention clock, which does not exist — `attentive` is room-scoped and sends
nothing at all from somebody standing on Home. Left in `planning/backlog/`.

## Shims

None. An older client ignores an unknown server message — `socket.ts` has no
`default` in its switch — so this reaches one and changes nothing. An older
server sends no such message and a new client reads absence as an empty list,
which is exactly the behaviour every build before this one had.
