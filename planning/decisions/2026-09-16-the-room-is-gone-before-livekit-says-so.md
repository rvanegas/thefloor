# The room is gone before livekit-client says so

Built 2026-09-16, hours after `being-offline-is-one-state.md` shipped the screen
this is about. A user sent back a photograph of `OfflineView` with **"Fake"**
written across it in green and the headline circled in red. The phone was in
airplane mode. The screen said:

> **Partly connected.** You can still hear the room, and if you had the floor
> you can still be heard — the conversation travels on its own connection.

Nothing was travelling on any connection. The radio was off.

## The two numbers

`OfflineView` says *Partly connected* rather than *Not connected* when the media
room is still up, which `App.tsx` asks as `audio.status === 'connected'`. That
is the right question. The answer was stale.

The only thing that had ever cleared `'connected'` was `RoomEvent.Disconnected`,
and **livekit-client fires that only once its own retries are exhausted**. Its
default policy is ten attempts at `[0, 300, 1200, 2700, 4800, 7000 × 5]`ms —
about forty-five seconds, plus jitter and per-attempt connect timeouts. The
socket, by contrast, declares itself offline after `OFFLINE_AFTER_MS`, which is
ten seconds.

So `OfflineView` was reachable at ten seconds and told the truth at forty-five.
For the half-minute in between it stated, in the first person and with no
hedging, that a conversation was still audible. In airplane mode it had never
been audible for a moment.

**The status was not wrong about its own meaning.** `'reconnecting'` was already
documented as "connected once, dropped, and trying again", and STATES.md records
that it exists *because* a dead connection had been rendering with the same
words as something it wasn't. It was simply being entered at the moment the
trying stopped, rather than when it started.

## What changed

`RoomEvent.Reconnecting` now sets `status: 'reconnecting'` and clears `speaking`
and `failing`, and `RoomEvent.Reconnected` sets it back. That is all.

The listeners it joins carried a comment saying they were log-only because
acting on one "is a change to how this app reconnects, and that decision wants
the evidence these produce first." The evidence turned up as a user's
screenshot, and the comment was right to demand it — but **this is not that
change**. Nothing here schedules a retry, `Disconnected` is still where our own
backoff takes over, and the SDK's attempt is left to run. What moved is only
what the screen is permitted to claim while it does.

## Why `SignalReconnecting` was left alone

It is the same word in English and the opposite fact. livekit-client documents
it as the *signal* channel dropping while media keeps flowing — "isn't
noticeable to users most of the time" — and promises a further `Reconnecting`
if media fails as well.

Treating the two alike would have replaced this bug with its mirror image:
telling somebody the room was gone while they could hear it, and then taking it
back several seconds later. One lie per direction is not an improvement. The
whole fix lives in the gap between those two events, so the gap is the part to
not tidy away later.

## The interaction that was accepted rather than avoided

The foreground listener rebuilds a room from any status but `connected`,
`connecting` and `displaced`. `'reconnecting'` now covers livekit-client's
internal retries, so a trip through the app switcher can take the attempt off a
room that has not given up.

Deliberate, and the same trade that effect already makes: somebody returning to
the app may be on a different network, a fresh connect is never worse than the
tail of a backoff earned on the old one, and the teardown goes through the
ordinary cleanup. Noted here because it is the one behavioural change beyond
wording, and it is not visible from the diff.

## What stays true

The *Partly connected* state was not a mistake and has not been removed. The
socket and the room are genuinely unrelated connections — STATES.md § *Audio
Connected* — and the case the screen was written for is real: the server process
dying while the SFU keeps running leaves a phone that can hear everything and
change nothing. That screen still appears then. What it no longer does is appear
when the network itself is gone.

Guarded by two tests in `app/src/audio/__tests__/reconnect.test.tsx` that assert
on the status with **no clock advanced at all** between the event and the
assertion — the regression is a delay, so anything that lets time pass would
pass while broken.
