# 2026-09-08 — The socket is what holds a place

**A phone keeps its claim on a channel for as long as it holds the audio, and
the websocket is what says whether it still does.** Losing the socket is losing
the claim: the ordinary minute runs and the account goes to *Nearby*, whatever
the SFU still lists.

This narrows `2026-09-08-present-is-the-media-connection.md` by one clause. That
decision is otherwise unchanged and its central move — the media roster may
falsify a presence — stands.

## What was seen

Backgrounding the app used to carry you to *Nearby*. It now leaves you
**Present** while the audio closes until you foreground again — present, deaf,
and unpingable, which is a combination no state in this app is supposed to have.

The device log has the mechanism, repeating at every backgrounding:

```
app inactive
app background
engine stop play=T rec=T
room signal reconnecting
app active
engine start play=T rec=T
```

The engine stops when the app backgrounds; `deactivateOnStop` — stated
deliberately in `session.ts` — releases the session at that stop; the app is
then not doing audio, so `UIBackgroundModes: ["audio"]` stops protecting it and
iOS suspends the process. **What caused the engine to stop is not settled here**
and is a device question rather than a code one; it is the walk's to answer.

## Why the presence survived it

`reconcilePresence` reported `CONNECTED` for everybody the room listed, which
**cancelled the grace period the closing socket had started** — and did it again
on every poll. A suspended process whose WebRTC connection lingers in the SFU is
listed for as long as the SFU keeps it, so the presence was sustained by the one
plane that could not tell whether anybody was listening.

That is the failure of the decision it came from, arriving from the other
direction. That decision said:

> **The two directions are not symmetrical, and must not be made so.** The room
> may only falsify a presence.

The implementation did not honour it. A `CONNECTED` report is not a
falsification; it is the room sustaining a presence, which is exactly the power
the sentence withholds.

## The rule

**A grace is ended by the plane that started it.**

- **Socket-origin** — the transport closed. Only the transport may take it back,
  which it does by the `ENTER` a reconnecting client re-sends from
  `enteredChannel` inside the minute (`app/src/api/socket.ts`); that arm clears
  `disconnectedAt` on its own. Past the minute the client deliberately stops
  asserting. **The room may not cancel it at all.**
- **Room-origin** — the media roster stopped listing somebody whose socket is
  fine. Nobody has lost a claim, so a blip that comes back inside the minute is
  spared exactly as before.

`Channels.socketDropped` is the distinction, in memory beside `mediaSeen` and
for the same reasons: nothing renders it, no client is told it, and a restart
drops presence anyway. `report` takes an `origin`, and the only caller passing
`socket` is the close handler in `ws.ts`.

It is self-healing rather than unwound at each of the several places a grace can
end: a marker with no grace running is dropped at the next poll, since there is
then nothing for it to be the origin of.

## Why *Nearby* and not *Stepped out*

Unchanged, and worth restating because this is the transition that now happens
more often. A suspended phone is precisely the case *Nearby* was built for:
within reach, one notification away. APNs reaches a phone whose process is gone
where nothing else does, and *Stepped out* would tell whoever is there to give
up on somebody a ping would reach. There remains deliberately no second way out
of a room.

## What is tested

`server/__tests__/presence.test.ts` § *a place the socket stopped holding*:

- a socket-origin grace runs to *Nearby* through polls that each see the account
  still in the room — this fails against the code as it was, and is the bug;
- and the client re-entering inside the minute restores the presence, which is
  what makes the first safe rather than merely strict.

The media blip that was already covered — room-origin, socket healthy, back
inside the minute — passes unchanged, and it is the case that shows the rule is
about origin rather than about distrusting the room.

## What this does not fix

**The audio still closes when the app backgrounds**, and this decision does not
touch it. What changes is that presence now tells the truth about it: a phone
that has lost its claim reads *Nearby*, which is both accurate and pingable.
Whether the claim should survive backgrounding at all is the open question, and
it belongs to `STEPPING-IN-WALK.md` — the engine stop is a device reading that
no test in this repository can take.
