# Being offline is one state

Built 2026-09-16, from reviewing
`backlog/a-channel-action-that-never-lands-says-nothing-and-the-screen-believes-it-anyway.md`
— which turned out to describe a symptom. This was `OFFLINE.md` while it was
being decided and built, and is retired here now that it is.

## What was wrong, and why it looked like three things

**Coverage.** `useOfflineNotice` worked and was used by two of about twenty
views. `ChannelSettingsView` is an early `return` inside `ChannelView`, so
opening settings *replaced* the only screen carrying the notice: during an
outage that screen said nothing at all.

**Silent loss.** Where the notice did show, the action was still dropped with
nothing said, and `ChannelSettingsView.persist` recorded
`saved.current.name` on the line after dispatching, unconditionally. Leave and
Delete called `onLeft()` regardless, so a confirmed destructive action
navigated you out having done nothing.

**Refusals, the same shape while fully online.** A reducer guard returns
`state` unchanged, so `dispatch` reports success and the client gets a
snapshot. Where the server *does* send an error frame it lands in `lastError`,
which was rendered only in `AuthView`.

They are one missing concept: the app had no word for being offline.

## The arithmetic error that was in the tree

`QUEUE_TTL_MS` justified ten seconds as "longer than any reconnect that is
going to succeed soon — the backoff caps at `RECONNECT_MAX_MS`". **The cap is
on the interval, not on elapsed time.** Doubling from 500ms puts cumulative
attempts at 0.5s, 1.5s, 3.5s, 7.5s and then 15.5s, so a server back at eight
seconds was met by a client that discarded the action at ten and did not knock
again until fifteen. The window did not cover the backoff it cited, and the
queue was sized against a misreading of it.

`reconnectNow` already named the failure — "dropped entirely if the reconnect
takes longer than the queue's ten-second life" — and patched it for the case
where somebody taps. Nothing patched the idle case, which is the one a user
watches happen.

## The decision

**`QUEUE_TTL_MS` is not a queue constant, it is the definition of being
offline.** It became `OFFLINE_AFTER_MS`, and everything falls onto one state
machine:

- **t=0**, no usable socket. Actions taken from here are queued.
- **0 → the window**, in which reconnecting still saves something, so the
  client retries hard: a fixed second, jittered ±25%. Nothing is said beyond
  the existing 2.5s "Reconnecting…", because most outages resolve inside it.
- **At the window**, still failing. The queue is cleared and the app is
  offline — one event, not two.
- **Past it**, the original backoff resumes untouched, still keeping a phone
  with no signal off a server it cannot reach.

**The wall is the notification that the queue was dropped**, which is why the
two had to coincide. Not "you are offline" but "the connection is gone and
what you just did did not happen". The aggressive retry is what makes that
sentence honest; without it the wall announces a loss that a fifth attempt was
about to make untrue.

**Threshold and expiry are one constant by necessity.** A wall later than
expiry recreates the original silent-loss gap; a wall earlier than expiry lies,
since the queue might still land. Expiry is global rather than per-action, so
they coincide exactly.

**Jitter was a new requirement.** Doubling spread clients out on its own; a
flat second does not, and a deploy has every phone seeing the same close at the
same moment.

## The wall

`UpdateRequiredView` was the template — rendered from `Root` instead of the app
rather than over it, nothing to dismiss back to. It differs in one way that
drove the rest: **that wall is terminal and this one is transient.**

**Two messages, one screen, blocking in both.** The LiveKit room and the
websocket are unrelated connections (STATES.md § *Audio Connected*), so the
conversation can be fine while everything that manages it is gone. That changes
what the wall says and not what it permits, because `SET_SELF_MUTE` is a
channel action like any other: with the socket down the microphone is as
unreachable as the settings. The in-room variant carries the last-known roster,
read-only, so nobody is listening to voices the screen cannot name.

**No actions on it.** With a one-second retry already running, a "Try now"
would be exactly the dead button `UpdateRequiredView`'s own comment warns
about. It shows that it is trying instead.

**It applies signed out**, which also ended `AuthView` being the only screen
that rendered `lastError`.

**Coming down, you return to wherever you were**, including a channel you are
no longer in — past `DISCONNECT_GRACE_MS` the server has stepped you out and
`enteredLostAt` already refuses dishonest re-entry, so the channel screen
truthfully offers *Step in*.

## Deliberately not built

**An itemised loss message.** Global expiry means the queue's contents are
known when it clears, so the wall *could* name what died. It needs a
human-readable label per action type, which is a table that rots, and `send`'s
return value already makes the case anybody hits retryable.

**An acknowledgement for `channel.action`.** The full fix the backlog entry
proposes, and the only thing that also catches an *online* refusal. It is a
wire change needing the two-step deploy, and the wall closes most of the window
it was protecting — so it stayed in the backlog rather than being folded in
here.

**A global banner instead of a wall.** Rejected on the reasoning already
written into `ChannelsView`: pinning "would give the most transient thing on
the screen the one position that never moves", and one banner can only say
something true of every screen, which is vaguer than what each says now.

**Splitting the threshold from the queue's life**, so the wall could be later
than expiry. Ruled out above — it is forced, not chosen.

## What could not have been decided in advance

**The clock cannot start on `onclose` alone.** A handshake that never completes
fires no close, and the first connection of a launch with no network is exactly
that — a client started that way would retry behind a spinner indefinitely,
never expiring the queue and never saying why. The existing test *does not
replay an action that has gone stale* set up precisely this shape and is what
caught it.

So the condition is **not having a socket** rather than losing one.
`beginOutage` is called from `open` as well as from `onclose` and stamps once
per gap; whichever arrives first owns the clock, and a reconnect attempt is
inside the same outage as the close that prompted it — which is why it is
idempotent rather than merely guarded.

## Where it lives

`OFFLINE_AFTER_MS`, `beginOutage`, `goOffline` and the phased
`scheduleReconnect` in `app/src/api/socket.ts`; `AppState.offline` in
`AppProvider`; `app/src/ui/OfflineView.tsx`; the gates in
`ChannelSettingsView`. `send` and `act` return whether the action reached the
socket — the premature `saved.current` was not an inaccurate note but the thing
that suppressed the retry, since Done then found nothing changed.

GLOSSARY.md § *Offline* is the one-line version.
