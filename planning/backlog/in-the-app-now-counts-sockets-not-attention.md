# "In the app now" counts sockets, not attention

A contact reads as *In the app now* whenever they hold any session-scoped
socket — `hasConnection` in `server/src/ws.ts`, surfaced as `ContactView.inApp`
and rendered by `describeAvailability`. A desktop client left open on a machine
nobody is sitting at satisfies that for as long as the machine is awake, so the
row says *In the app now* about somebody who is not there and will not answer.
Observed 2026-09-25, on a contact who had the desktop app up and was
unresponsive for hours.

**The fix is not a shorter timeout.** `inApp` is deliberately a fact rather
than a subtracted timestamp, and `describeAvailability` reads it first for a
good reason: somebody sitting in a channel for an hour sends nothing, and
inferring idleness from the last message is exactly what the old contact row
got wrong. The socket is the right *kind* of evidence; it is the wrong
question.

**The evidence that exists is room-scoped, which is why this is not a
one-liner.** `ClientMessage.attentive` is touch-driven and account-scoped in
who it credits, but it names *channels*, and `SocketClient.attentive` drops the
message outright when the list is empty — "somebody on Home with no channel
open and standing nowhere is attending the application and no room in it, and
there is no clock that fact belongs to". So the one signal that distinguishes
an attended app from an abandoned one is never sent by the population this
complaint is about.

What it needs is an **account-level attention clock**: a stamp refreshed by the
same evidence `useAttention` already gathers, kept per account beside
`last_seen_at`, with `inApp` reading *a device of theirs has been attended
within the window* rather than *a socket is open*. Two consequences to think
about before building it:

- **It changes what everybody's contact list says about everybody**, which is
  the loudest line on Home's contact rows. A window too short makes people
  flicker; too long and nothing has changed.
- **It must not be a second judge of presence.** `core/channel.ts`'s
  `isWaiting` carries the scar from the last time two functions answered one
  question — see its comment. Whatever holds this clock should be the only
  thing that answers *are they about*, and the room-scoped attention window
  should keep answering only what it answers now.

Noticed alongside the tier defect fixed in
`decisions/2026-09-25-the-room-is-pinned-on-every-device.md`, and deliberately
left out of it: that one is about what an account tells its own other devices,
this is about what it tells other people.
