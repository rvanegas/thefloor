# A hidden tab is a backgrounded app

The fix for the backlog entry *A web client cannot promise a cadence its
browser will not keep*, which deliberately left it as a choice rather than a
repair and is deleted with this. The diagnosis is
2026-09-15-twenty-seconds-is-chrome-parking-a-timer-not-a-socket-dying.md: a
hidden Chrome tab's `setInterval(2000)` runs about seven times and is then
parked until the next one-minute boundary, so the client is last heard at 12.9
seconds and the server's sweep terminates it at 19.3, every twenty seconds for
as long as the tab is open.

**The rule adopted is one sentence: a hidden tab does what a backgrounded phone
does.** It closes its socket when the tab goes hidden and opens it again when
the tab comes back — unless audio is live, in either direction, in which case
it holds the socket exactly as a phone does.

## Why that settles a question that had three answers

The entry offered three: widen the silence budget for `client=web`, separate
liveness from attention with protocol-level ping frames, or let a hidden tab
step out. **Only the third reproduces a backgrounded app; the other two make a
hidden tab *more* alive than a phone**, which is the opposite of the thing
being asked for. A budget past seventy seconds — what it takes to clear a
one-minute wake-up alignment — is a tab that reads as `inApp` and holds the
floor for over a minute after the lid closes.

The phone has exactly two behaviours and the rule sorts a tab into one of them.
Stepped in, `UIBackgroundModes: ["audio"]` keeps the process alive, so it goes
on pinging and stays present, and `useAttention` stops reporting, so
`ChannelRegistry.expireInattentive` retires it at fifteen minutes. Not stepped
in, iOS suspends it: timers stop, the socket dies, the sweep notices,
`DISCONNECT_GRACE_MS` runs, `resume()` repairs it on return. A hidden Chrome tab
matched neither — it parks the timers and leaves the socket open, which is
alive on the wire and dead in every loop that proves it.

**Attention needed nothing.** `useAttention.web` already asks for a hand rather
than for visibility, so a hidden tab stops reporting on its own. Liveness was
the whole of the question, which is what made the rule this short.

## The predicate is being in the room, not capturing

`channelHasAudio` in `core/micNeeded.ts`, which is `inRoom` — **not
`microphoneNeeded`**, the same rule minus the guest clause. STATES.md §
*Where the sources disagree* says those two must not be collapsed, and this is
one of the places it means. Capture alone is wrong twice: a member stepped in
and self-muted still holds the device open, because `intentFor` returns
`muted`, and a phone in that state is kept alive; and a guest with no speech
grant subscribes and hears the room without ever capturing, so reading the
predicate as capture would cut a listener off mid-sentence. *Present without
capturing* is the one shape the phone has no analogue for, which is why the
predicate had to be stated rather than inferred.

## What it took, which was two clients and no server

Nothing on the server changed. No silence budget moved, so there is no wire
contract in this and **no SHIMS.md entry**: a budget keyed on `client=web`
would have been a standing rule with nothing to retire it, rather than a shim.

`Realtime.suspend` is the mechanism, beside `resume`, which was already wired
to the return leg — react-native-web maps `AppState` onto `visibilitychange`,
and `AppProvider` already reconnected on `active`. It is distinct from
`disconnect`, which is signing out and forgets the watches, the standing and
the queue; a suspension keeps all of it, because the same person is coming back
to the same tab. A deliberate close is also not an outage, so the offline wall
is cleared rather than left to go up behind a tab nobody is looking at.

**Stopping the heartbeat is the load-bearing half, not tidying.** The client's
own watchdog at `app/src/api/socket.ts` lives on the same parked interval and
the same five-second budget, so a tab left running would have killed its own
socket on the first fire after the park. **A fix on the server alone would have
retuned this loop to a minute rather than removed it** — which is also why
protocol ping frames were not the durable answer they looked like: a browser's
pong comes from the network stack and is invisible to page JS, so it would have
kept the server happy and told the watchdog nothing.

## The guest page, which is the same rule and two exceptions

`server/web/guest.ts` has no watchdog — it only sends — so it is the listener
and nothing else. It holds its socket in the room, as above, and **also while
knocking**: the server's guest close handler calls `withdrawKnock`, so
suspending at the door would cancel the very wait somebody switched tabs to sit
through, and the member inside would watch the knock vanish. A knock is a claim
held on the server rather than a cadence, which is the one way this page is not
just a smaller copy of the app.

## What is not settled

Whether a hidden tab holding audio is throttled at all — Chrome exempts pages
using WebRTC or playing audio from intensive throttling, and every measurement
behind the diagnosis was taken on a bare page with no audio. If the exemption
holds, this is the whole fix. If it does not, the in-room case needs a silence
budget it can meet and the argument against widening one comes back. See
backlog/whether-a-hidden-tab-holding-audio-is-throttled-at-all.md.
