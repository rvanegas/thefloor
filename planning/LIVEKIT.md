# The room and the socket, and the gap between them

**Temporary.** This is an open question written down so it is not re-derived
from scratch next time, not a design and not a decision. It came out of a
screenshot on build 183: a roster card reading *Nearby* for somebody whose
LiveKit connection was, by every other sign, still alive. Delete this file when
the question below is answered — whatever survives goes to
`planning/decisions/` if anything is changed, and to STATES.md § *Audio
Connected* if the answer is that nothing should be.

---

## The two connections, which nothing names as a pair

- **The room** — LiveKit, WebRTC to the SFU. The app's reading of it is
  `SessionAudio.status` (`app/src/audio/useSessionAudio.ts`), which is what the
  *Audio session* card on the channel screen prints.
- **The socket** — the app's websocket to our own server. The server's reading
  of it is `ChannelState.disconnectedAt`, drawn on everybody's roster as
  *reconnecting* for a minute and then, once `DISCONNECT_EXPIRED` fires,
  as *Nearby*.

Either can be down with the other up and neither reading is wrong. STATES.md §
*Audio Connected* says so and records the 2026-08-18 case where it went the
other way — a Telegram VoIP call killed the room, the socket recovered on
foreground, the roster said *Present* and the audio was dead until a force
quit.

## Why *Nearby* does not mean the room let go

Three separate facts, and the answer to the screenshot is all three together.

**1. The room may falsify a presence and may never sustain one.**
`Channels.reconcilePresence` (`server/src/channels.ts:3470`) reads the SFU
roster on every `pollUsage`, but a grace is ended only by the plane that
started it. A socket close reports `DISCONNECTED` with origin `socket`
(`ws.ts`), the account goes into `Channels.socketDropped`, and the `inRoom` arm
then `continue`s instead of reporting `CONNECTED`. So the minute of
`DISCONNECT_GRACE_MS` runs to `DISCONNECT_EXPIRED` — `exit: 'dropped'`, which
is *Nearby* — **however long the SFU goes on listing that participant**. Only
an `ENTER` re-sent by the reconnecting client inside the minute takes the
presence back (`app/src/api/socket.ts`, the `enteredLostAt` arm).

That asymmetry is deliberate and is the whole of
`planning/decisions/2026-09-08-the-socket-is-what-holds-a-place.md`, which
narrowed `2026-09-08-present-is-the-media-connection.md`. Before it, a
suspended phone whose WebRTC connection lingered in the SFU was reported
`CONNECTED` on every poll, which cancelled the grace, which left somebody
*Present, deaf and unpingable* — a combination no state here is supposed to
have.

**2. Nothing ever evicts a member from the room.**
`media.removeParticipant` has exactly one caller, and it is a guest being
ejected (`channels.ts:1384`). A member whose presence expires is not touched on
the media plane at all: leaving the room is the client's own job, done from
`standingIn` going null. So *Nearby* is the server saying **this account no
longer holds a claim on the channel**, never **this device has no connection to
the SFU**.

**3. The client only notices on reconnect.** `standingIn` is cleared past the
grace in `socket.ts`'s `onopen`, which by definition cannot run while the
socket is down. So for as long as the socket stays down the device keeps
`standingIn`, keeps the room, and — if the process is alive enough to run
anything — keeps publishing.

## The gap, stated plainly

There is a window in which the server has stepped somebody out, everybody's
roster says *Nearby*, and that person's microphone is still in the room. It
opens at `DISCONNECT_GRACE_MS` after the socket dies and closes when either the
client reconnects and clears `standingIn`, or the SFU's own participant timeout
drops the connection — **neither of which we control or currently measure.**

The ordinary path to it is a suspended phone, where the process is doing
nothing and the lingering entry is inert. The interesting path is a network
where the websocket dies and the media path does not: a captive portal, a
proxy, a tunnel that blocks TCP 443 to our box while UDP to the SFU still
flows. There the person is audible, may still be heard speaking, and is drawn
to everybody as *Nearby*.

## What to go and find out

- **Is it reachable in practice, and for how long?** What is LiveKit's own
  participant timeout on our deployment, and does a held-open muted publication
  (the 2026-09-05 playout hold) extend it?
- **Does audio actually still flow in the gap**, or does the room go quiet for
  other reasons first? A dropped person is no longer in `present`, so
  `reconcileSilence`, the floor, and `channelHasAudio` are all reasoning about
  a roster they are not on.
- **Should `DISCONNECT_EXPIRED` eject from the room?** It would close the gap
  in one line and is the obvious move — which is why it deserves suspicion.
  `2026-09-08-the-socket-is-what-holds-a-place.md` says "there is deliberately
  no second way out of a room"; that sentence is about *presence*, and whether
  it extends to the media plane is exactly the question. Against it: a phone
  that reconnects inside the SFU's timeout would have to rebuild the room
  rather than resume it, and an ejection is visible to everybody as a
  `ParticipantDisconnected`.
- **Should the client tear the room down on its own timer?** It knows the
  socket has been gone longer than the grace without needing the socket back;
  `enteredLostAt` is already the clock. This keeps the authority where it is
  and costs nothing on the server, but a suspended process cannot run it, which
  is the case that produces the state most often.
- **Should the audio-session card say which of the two it is talking about?**
  The screenshot that started this read *Audio connected* beside a roster whose
  word came from the other plane entirely. Nothing on screen names the pair, and
  a session holding one of them is the one most likely to be confused by it.

## Where the pieces are

| Thing | Where |
| --- | --- |
| Presence reconciliation | `server/src/channels.ts:3470` `reconcilePresence` |
| Grace origin marker | `server/src/channels.ts:749` `socketDropped` |
| Socket close report | `server/src/ws.ts` (the only `origin: 'socket'` caller) |
| Guest ejection, the only one | `server/src/channels.ts:1384` |
| Client re-entry inside the grace | `app/src/api/socket.ts` `enteredLostAt` |
| The device's own claim | `app/src/state/live.ts` `liveChannelHere`, `AppProvider.standingIn` |
| Room status as the app sees it | `app/src/audio/useSessionAudio.ts` |
| `DISCONNECT_GRACE_MS` 60s, `WAITING_WINDOW_MS` 15m | `core/constants.ts` |
| `MEDIA_JOIN_GRACE_MS` 30s | `server/src/channels.ts:118` |

Read alongside: STATES.md § *Audio Connected* and § *Present-in-Channel*,
GLOSSARY.md § *Nearby / Stepped out*, and the two decisions of 2026-09-08.
