# A new session claims its rooms, or loses them

A session that has been open for `REENTRY_MS` and has claimed nothing gives up
every room its account is present in with a grace running. `Channels.abandoned`
raises the ordinary `DISCONNECT_EXPIRED`, so the departure is *Nearby* and every
clock is stamped as a dropped connection stamps them. Decided in the socket
sweep, which already walks every connection on a clock.

## What was reported

Play and pause worked on a channel whose footer read *Out*, from the only
instance running. Not a permission bug: every guard is correct and refuses
somebody who is not present. The fact under them was wrong — the account *was*
present, and had been since before the app was force-quit.

`isPresent` is the account's. The screen's own rung is the account's **and**
this device's — `iAmPresent` in app/src/ui/ChannelView.tsx is
`isPresent(channel, me) && app.standingIn === channelId`. Force quit, reopen,
open the channel: the new process has no `enteredChannel` to re-assert, so it
shows *Out* correctly while the account stays in `present` for the rest of
`DISCONNECT_GRACE_MS` — and for that minute the transport, the floor, a
recording and a track are all live to somebody who is not in the room.

The window was already described in server/src/ws.ts, at `watch.channel`: the
2026-09-08 repair stopped a fresh socket from *renewing* a presence it knew
nothing about, and left it inheriting one for the length of the grace. What was
never asked is what that minute permits.

## Why the grace and not the guards

The alternative was to refuse actions from a socket that is not the one standing
in the channel — the server knows, `Connection.standing` being exactly that.
It was rejected because it puts the rule where `core/` cannot see it. Every
question of who may do what to a channel is a pure function of `ChannelState`,
read by the reducer and by the greyed button alike; a second authority that only
`ws.ts` can evaluate is one the client mirrors by hand, and the next guard
written in `core/` inherits the hole with nothing to notice. It stays available
as belt-and-braces and is not needed for this.

Ending the grace is not a policy change. The minute exists because a socket that
went quiet is *ambiguous*: the connection may be coming back, and the ordinary
reconnect re-asserts `ENTER` inside it and keeps the place — untouched by this.
A fresh session that has had its window and claimed nothing is not ambiguous. It
is the process the grace was waiting for, saying where it is standing, and the
answer is *not here*. That is better evidence than the timer it would otherwise
sit out: the same argument
decisions/archive — *the socket is what holds a place* — makes about the socket
that left, applied to the one that arrived.

## The window, and why it is not a timer

`REENTRY_MS` is five seconds. A client that is really in a channel says so in
the burst its socket opens with — `onopen` in app/src/api/socket.ts sends
`watch.home`, `watch.channel` and `ENTER` in one turn — so the window has to
outlast one round trip and nothing more. Being early is worse than being late by
the same amount: too short retires somebody who was coming straight back, and
their room watches it happen. Deliberately not derived from
`DISCONNECT_GRACE_MS`, which answers a different question.

Read once per connection, in the existing sweep rather than a `setTimeout` per
socket — a second schedule would have to be cancelled on close and would fire
for sockets that are gone. The judgement is per *account*: `standingConnectionFor`
asks whether any live session of theirs is standing there, so a laptop
connecting beside a phone that is genuinely in the room retires nobody.

## What it costs

Force-quit and reopen inside the minute, and the room now sees you drop to
*Nearby* and come back, where before it saw nothing. That is honest — the
microphone really was gone — and it lasts seconds. Nothing changes for a
network blip, which is the case the grace was written for.

Tests: server/__tests__/ws.test.ts § *a session that claims nothing* for the
socket, and server/__tests__/presence.test.ts § *a grace a new session did not
claim* for what ending it takes away.
