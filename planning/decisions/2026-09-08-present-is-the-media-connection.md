# 2026-09-08 — Present is the media connection

**`present` now means what planning/GLOSSARY.md has always said it means.** The
definition did not change. The implementation caught up with it.

## The ghost

Found while reviewing 57b6c24, by walking a sequence rather than reading code:

1. Step into a room alone.
2. Force quit the app.
3. Open the app.
4. Go to the channel screen, and do not step in.

The roster says you are present. It goes on saying so indefinitely.

Each step is doing something. The force quit closes the socket, `ws.ts` reports
`DISCONNECTED`, and the 60-second grace starts — correctly, a lost socket is not
a departure. The reopened process is fresh, so `Realtime.enteredChannel` is null
and `onopen` re-asserts nothing. **Stopping at step 3 resolves properly**: the
grace runs out, `DISCONNECT_EXPIRED` fires, `stepOut(exit: 'dropped')` puts the
account in *Nearby*.

Step 4 is what breaks it. Opening the channel sends `watch.channel`, and
`watch.channel` reported `CONNECTED`, which deletes `disconnectedAt` and cancels
the grace. Every reconnection renewed it, so the presence was permanent.

**Nothing else could recover it.** `stillHere` is guarded on `isPresent`, so
every message the socket carried refreshed `lastPresentAt` — the account did not
even age to *Stepped out*. `useAttention` computes `live` through `standingIn`,
which is null in a process that entered nothing, so its clock was
`NOT_STANDING`. And there was no *Step out* to tap: the screen reads
`standingIn` too, so it correctly offered **Step in** while everybody else's
roster said the person was there. **The phone and the server disagreed, and both
were reporting their own state honestly.**

## The definition was not the problem

GLOSSARY.md § *Present* says **"In a channel, able to hear and be heard, right
now."** That is publishing or subscribing. The 2026-09-08 audio design says it
outright, under § *Occupancy*: **"An occupant publishes or subscribes, at least
one."**

What the server implemented instead was *an `ENTER` was dispatched, and a
control socket has been heard from recently*. Those are facts about two
different connections, and `core/guests.ts`'s `roomOccupants` — `present ++
guests` — **assumed** the one implied the other rather than testing it. The
ghost is that assumption failing.

Per AGENTS.md, where a name in the code and the dictionary disagree, one of them
is a bug. Here it was the code.

## The argument was already written down

The comment above `pollUsage` made this exact case a fortnight early, about
metering:

> the LiveKit room can be dead while the websocket is alive, and then presence
> asserts a stream that does not exist. The over-count is rare,
> one-directional, and unbounded in duration — the socket recovers on
> foreground and the room does not. Asking removes the whole class for every
> installed build, with no wire change and nothing for a client to have to send.

Every clause of that is about presence, and it was written about a meter
reading. A room that is dead while the socket is alive **is** somebody counted
as present who is not there. So the same poll that already asks became the
evidence.

## What was built

**The media roster sustains presence; `ENTER` still creates it.**

`Channels.reconcilePresence` runs inside `meterRoom`, on the roster that call
already fetches every `USAGE_POLL_INTERVAL_MS`, and reports what it finds to the
same `report` a socket reports to. So an absence starts the ordinary
`DISCONNECT_GRACE_MS` and leaves by the ordinary `DISCONNECT_EXPIRED` —
`exit: 'dropped'`, which is *Nearby*, then *Stepped out* at fifteen minutes.
**There is deliberately no second way out of a room.**

**The two directions are not symmetrical, and must not be made so.** The room
may only falsify a presence. Creating one stays with `ENTER`, because a step-in
has to move the interface without a round trip through LiveKit; making presence
wait for a webhook or a poll would put every tap behind the network.

**The keys of the roster, not the tracks.** A participant publishing nothing is
in the room and can hear it — that is the guest with no speech grant, which is
why the rule is *publishes **or** subscribes*. The muted person `meterRoom`
discounts as not-publishing is an occupant by anybody's reading.

### `MEDIA_JOIN_GRACE_MS`, which is not slack

Thirty seconds, two poll intervals, and it is load-bearing. A step-in dispatches
`ENTER` and only then fetches a token and connects, with `deferSubscribe` adding
its settle on top — so there is always a window in which somebody is
legitimately present and not yet in the roster.

Being early is not a private mistake: a `DISCONNECTED` report writes
`disconnectedAt`, which is on the snapshot, and `ChannelView` renders it as
**reconnecting**. A window shorter than a step-in would flash that under the
name of every person who walks into a room. One missed poll must not be enough.

`Channels.mediaSeen` is the clock it is measured from — when each occupant's
presence was asserted or last confirmed by the room. In memory, keyed by channel
and identity, members and guests alike. Not on `ChannelState`: nothing renders
it, no client is told it, and a restart drops presence anyway.

### What the socket keeps

- **`DISCONNECTED` on close stays.** It only *starts* a grace the roster can
  cancel, and it makes an ordinary departure resolve in a minute rather than a
  minute plus a poll. What a socket may no longer do is assert that somebody is
  **here**.
- **`stillHere` / `lastPresentAt` stay socket-driven.** That clock measures
  reachability, which is exactly what *Nearby* means.
- **`CONNECTED` is gone from both places it was sent** — `watch.channel`, and a
  guest page resuming. A guest is an occupant on the same terms as anybody else.

### One thing that had to change in `core/`

**`ENTER` from somebody already in `present` was a no-op, and is not any more.**
`reduce` returned the state untouched, so a client's reconnect — which re-sends
`ENTER` from `enteredChannel`, inside the grace, while still nominally present —
cancelled nothing. That never showed, because `watch.channel` had reported
`CONNECTED` a moment earlier and done the job.

Removing that line exposed it: two existing tests failed, both reconnecting with
a watch alone. The arm now clears `disconnectedAt` and returns the state
otherwise unchanged — still identical when there is no clock to cancel, since
identity is what tells the server there was no transition to commit. The comment
one line below had said it all along: *entering is itself proof of a live
connection.* It is proof whether or not you had been counted as present.

### An adjacent correction

`pollUsage` skipped a channel when `present.length === 0`, which skipped a room
holding guests and no members. Now that the poll carries presence, the test is
`roomOccupants(channel).length === 0`.

## What this cost, and what it did not

**No wire change, no client change, no `ChannelState` field, no infrastructure
change.** The server deploys alone. AGENTS.md § *Never ship a wire change to a
server before the client can speak it* does not apply.

**No installed build is evicted.** Checked rather than assumed:
`git show released:app/App.tsx` (build 127) gates the room connection on
`live ? live.mediaRoom : null`, the same expression as HEAD, and `live` requires
`present`. So `present ⇒ connected` holds for what is in people's hands as well
as for what is being built.

## What was considered and not built

**LiveKit webhooks.** `participant_joined` / `participant_left` through
`WebhookReceiver` — the SDK is already a dependency — would cut detection from
≤15s to near-instant. It costs an unauthenticated route, a content-type parser
for `application/webhook+json` to get the exact bytes its JWT claim needs, a
`webhook:` block in `livekit.yaml` on the box, and a delivery path that can stop
working silently, so it would need the poll as a backstop anyway. Since
departure already spends a 60-second grace, 15 seconds of detection latency buys
nothing. `reconcilePresence` is one entry point, so a webhook can drive it later
without rearranging anything.

**The narrow fix.** Deleting the `watch.channel` `CONNECTED` report alone does
fix the reported sequence. It leaves two sources of truth free to disagree
again, differently, next time. It is step one of this rather than an alternative
to it.
