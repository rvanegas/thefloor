# Being offline is one state, and the app currently has no word for it

**A design, now built and not yet landed.** It goes when the work ships, with
whatever survives moving to `decisions/` — including § *One thing the design
did not anticipate*, which is the only part of this that could not have been
written in advance. Written 2026-09-16, from reviewing
`backlog/a-channel-action-that-never-lands-says-nothing-and-the-screen-believes-it-anyway.md`,
which turned out to be one symptom of this rather than a defect of its own.

## What is actually wrong

Three things that look separate and are not.

**Coverage.** `useOfflineNotice` works. It is used by two views — `ChannelsView`
and `ChannelView` — out of about twenty. `ChannelSettingsView` is an early
`return` inside `ChannelView`, so opening settings *replaces* the screen that
carries the notice: during an outage the settings screen says nothing at all.
Opt-in-per-screen is the defect, not the notice.

**Silent loss.** Where the notice does show, the action is still dropped with
nothing said. `send` queues a `channel.action` when the socket is down, and
`flushQueued` discards anything past `QUEUE_TTL_MS` with no signal to the
caller. `ChannelSettingsView.persist` records `saved.current.name` on the line
after dispatching, unconditionally, so the screen's own record says the write
happened. Leave and Delete both call `onLeft()` regardless, so a confirmed
destructive action navigates you out having done nothing.

**Refusals, which are the same shape while fully online.** A reducer guard
returns `state` unchanged — `SET_NAME` at `core/channel.ts:1854` — so `dispatch`
reports success and the client gets a snapshot. Where the server *does* send an
error frame (`ws.ts:1330`), it lands in `lastError`, which is rendered only in
`AuthView`. No channel action's refusal is visible on any channel screen.

## The mistake in the current code, which is arithmetic

`QUEUE_TTL_MS`'s comment justifies ten seconds as "longer than any reconnect
that is going to succeed soon — the backoff caps at `RECONNECT_MAX_MS`." The cap
is on the *interval*, not on elapsed time. `RECONNECT_BASE_MS * 2 ** n` puts
cumulative attempts at 0.5s, 1.5s, 3.5s, 7.5s, **15.5s**. A reconnect succeeding
on the fifth attempt is soon by any reading, and the queue discarded the action
five seconds earlier.

So the queue is sized against a misreading of the backoff it cites, and the gap
is not hypothetical: a server back at 8s is met by a client that does not try
again until 15.5s. `reconnectNow` already patches this for the case where
somebody taps — its comment names the failure exactly, "dropped entirely if the
reconnect takes longer than the queue's ten-second life" — and nothing patches
the idle case, which is the one a user watches happen.

## The unification

**`QUEUE_TTL_MS` is not a queue constant. It is the definition of being
offline.** Everything falls onto one state machine once it is read that way:

- **t=0.** There is no usable socket. Actions taken from here are queued.
- **0 → TTL.** The window in which reconnecting still saves something. Retry
  hard *because* there is something to save: a fixed short interval, ~1s, with
  jitter. Say nothing beyond the existing 2.5s "Reconnecting…", since most
  outages resolve inside it.
- **At TTL, still failing.** Ten attempts made and failed, so the client has
  earned the right to say so. The queue is cleared and the app is offline. These
  are the same event.
- **Past TTL.** The existing backoff, unchanged, from where it left off. Nothing
  is queued any more, so there is nothing to rescue, and the original reasoning
  — "keeps a phone with no signal from hammering a server it cannot reach" —
  takes over intact.

**The wall is the notification that the queue was dropped.** Not "you are
offline" but "the connection is gone and what you just did did not happen." The
aggressive retry is what makes that sentence honest; without it the wall
announces a loss that a fifth attempt was about to make untrue.

**The threshold and the TTL are one constant by necessity, not convenience.** A
wall later than expiry recreates the original silent-loss gap — actions already
discarded, nothing saying so. A wall earlier than expiry lies, since the queue
might still land. Expiry is global rather than per-action, so the two coincide
exactly.

**Jitter is a new requirement, not a nicety.** Today clients are spread out by
their own doubling. A flat one-second pace synchronises every phone onto the
same tick, so a restart brings them all back in lockstep against a server that
has just finished starting. Randomise each in-window interval by ±25%.

## One thing the design did not anticipate, found in the building

**The clock cannot start on `onclose` alone.** A handshake that never
completes fires no close, and the first connection of a launch with no network
is exactly that — so a client started that way would retry behind a spinner
indefinitely, never expiring the queue and never saying why. The existing test
*does not replay an action that has gone stale* turned out to set up precisely
this shape and was what caught it.

So the condition is **not having a socket** rather than losing one, and
`beginOutage` is called from `open` as well as from `onclose`, stamping once
per gap. Whichever of the two arrives first owns the clock; a reconnect
attempt is inside the same outage as the close that prompted it, which is why
it has to be idempotent rather than merely guarded.

## What the wall is

`UpdateRequiredView` is the precedent and the template: rendered from `Root`
*instead of* the app rather than over it, nothing to dismiss back to, and
exactly one action — with the button **absent** when it would be dead, because
"a dead link is worse than a sentence."

Ours differs in one way that drives the rest: **that wall is terminal and this
one is transient.** It comes down by itself, and there is a screen behind it.

**Two messages, one screen, blocking in both.** The app's websocket and the
LiveKit room are unrelated connections — STATES.md § *Audio Connected*, "either
can be down with the other up, and both readings are correct" — so the socket
can be gone while the conversation is fine. That changes what the wall *says*
and not what it *permits*, because every control goes through the socket:
`SET_SELF_MUTE` is a channel action like any other, so with the socket down you
cannot mute, unmute, claim or release. There is nothing to control without the
websocket even when you can still talk.

- **Out of a room.** Plain wall. Home, contacts, profiles, settings,
  transcripts, leaderboard all need the server and none of them work.
- **In a room.** Full cover as well, carrying the **last-known roster,
  read-only**. Without it you hear voices you cannot see. It is stale and the
  wall says so.

**No actions.** A "Try now" button does nothing the client is not already doing
at 1s intervals, which makes it precisely the dead button the precedent warns
against; show that it is retrying instead. Sign-out and support need the server
too. This is the deliberate departure from `UpdateRequiredView` having a button,
and it is justified by ours coming down on its own.

**It applies signed out.** Auth needs the server as much as anything else, and
extending the wall there incidentally removes the oddity of `AuthView` being the
only surface that renders `lastError`.

**Coming down, you return to wherever you were**, including a channel you are no
longer in. Past `DISCONNECT_GRACE_MS` (60s) the server has stepped you out and
`enteredLostAt` already refuses dishonest re-entry, so the channel screen will
truthfully offer *Step in*. It stays the most relevant screen, and dropping to
Home would discard context to no purpose — but the wall should say the
conversation was left, rather than let it be discovered.

**The loss message is generic.** Global expiry means the queue's contents are
known at the moment it clears, so the wall *could* name what died. Itemising
needs a human-readable label per action type, which is a table that rots, and
the `send` change below already makes the common case retryable. Deferred
deliberately rather than unconsidered.

## The part that is not the wall

**`send` should return whether it wrote or queued.** One boolean, and it is the
same fact the queue and the wall are both built on rather than a separate
concern. With it:

- `persist` records `saved.current.name` only on a real write, so a
  queued-then-dropped rename leaves the ref stale and the next blur or Done
  retries it. Today the premature write is what *suppresses* the retry: the
  field still shows what you typed, `name === saved.current.name`, and Done
  dispatches nothing.
- Leave and Delete stop calling `onLeft()` on an unconfirmed action.

## What this costs on a deploy, which is a real case

`bin/deploy:197` runs `npm install` while the old process is still serving, so
the outage is the `systemctl restart thefloor` alone — and LiveKit is a separate
unit on the same box, untouched. A deploy is therefore exactly websocket-down,
room-up, for a few seconds.

Whether that trips the wall today is bimodal on the backoff: server back at 3s
means client back at 3.5s, server back at 8s means client back at 15.5s. **The
retry change removes the bimodality** — a server back at 8s is met at ~8s,
queued actions survive, and the wall does not appear. Without the retry change,
a wall at 10s would show on roughly every deploy despite a short outage.

The restart-to-healthy time has not been measured. It is one `systemctl restart`
and a stopwatch against `/healthz`, and it is worth knowing, but the design no
longer turns on it.

## Scope

One piece of work, not three: the phased retry with jitter, the wall and its two
messages, and `send`'s return value — sharing one constant and one notion of
offline. No wire change, so no two-step deploy and no SHIMS.md entry.

Reading STYLE.md before building is not optional here; the wall is a new screen.

An acknowledgement for `channel.action` — the full fix the backlog entry
proposes, and the only thing that also catches online refusals — becomes
optional rather than urgent once this lands, since the wall closes most of the
window it was protecting. It stays in the backlog.
