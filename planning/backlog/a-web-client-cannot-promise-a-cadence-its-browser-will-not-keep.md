# A web client cannot promise a cadence its browser will not keep

Every web tab that is not the frontmost tab loses its socket every twenty
seconds, for as long as it is open, and reconnects into the same loop. The
diagnosis is complete and reproduced — see
decisions/2026-09-15-twenty-seconds-is-chrome-parking-a-timer-not-a-socket-dying.md
for the nine measurements and the browser behaviour behind them. **This entry
is only the fix, which is a choice rather than a repair.**

In one line: Chrome runs a hidden tab's `setInterval(2000)` about seven times
and then parks it until the next one-minute boundary, so the client stops
pinging at ~12.9s, and the sweep at `ws.ts:481` terminates it on a five-second
silence budget at ~19.3s.

## Why the obvious fix is not obviously right

`heartbeatTimeoutFor` already varies the budget by client, so widening it for
`client=web` is a few lines. **It has to clear a one-minute wake-up alignment,
not a two-second ping** — so the budget for web would be something past seventy
seconds, fourteen times the native one. What that buys is a browser tab that
goes on being *present* for over a minute after the laptop lid closes: holding
the floor, and reading as `inApp` to everyone else, when nobody is there.
`DISCONNECT_GRACE_MS` bounds the damage but does not remove it, and the
five-second budget was chosen deliberately — see
`core/constants.ts` on `HEARTBEAT_TIMEOUT_MS`, and *If you are going to claim
the floor, be sure you can hold it*.

## The other direction, which is a design question

**Liveness and attention are two questions that this heartbeat currently
answers with one message.** `ws.ts`'s `socket.on('message')` updates
`connection.lastSeen` — *is this socket still there* — and in the same breath
calls `heard()` — *is a person in the app*. For a native build those coincide.
For a hidden tab they come apart exactly: the socket is perfectly alive and
nobody is looking at it.

Separating them is the durable answer, and there is a mechanism that costs no
page JavaScript at all: **WebSocket protocol-level ping frames**. A browser
answers a server `ping` with a `pong` from its network stack, with no timer and
no callback, so liveness would survive any amount of throttling; `ws` exposes
`socket.ping()` and a `'pong'` event. Attention then stays what it already is —
`useAttention` reporting a frontmost app, `heard` writing it down — and the
answer to *is a hidden tab present* becomes a decision somebody makes rather
than a side effect of how the browser schedules timers. **This has not been
prototyped.** It needs checking against STATES.md, which carries the pairs that
look duplicated and are not.

A third option, cheaper and blunter: a hidden tab is not present, so let a web
client step out and close its own socket on `visibilitychange`, and reconnect
when it comes back. That is a behaviour change users would feel, and it is a
product decision, not a bug fix.

## Do not forget the guest page

It is swept at a flat `HEARTBEAT_TIMEOUT_MS` at `ws.ts:476` and is a browser
tab like any other, so it has the same fault for the same reason. The comment
on `heartbeatTimeoutFor` explains why guests are not asked their cadence — their
page is served by this deploy — and that reasoning does not reach throttling.
Whatever is done above has to be done for both, and `web/guest.ts` reads the
same constant.

## If the budget moves, SHIMS.md gets an entry

A silence budget is a wire contract: the server applies it to whatever is
connected, and installed builds go on pinging at the cadence they shipped with.
`HEARTBEAT_TIMEOUT_LEGACY_MS` and `FAST_HEARTBEAT_BUILD` exist because that was
learned the hard way once.
