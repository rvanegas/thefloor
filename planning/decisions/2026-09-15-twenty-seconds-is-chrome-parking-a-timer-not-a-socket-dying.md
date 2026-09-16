# Twenty seconds is Chrome parking a timer, not a socket dying

The web half of
backlog/why-one-phone-could-not-hold-a-socket-is-diagnosed-not-observed.md,
settled on 2026-09-15 with the `socket closed` line that entry asked for —
2026-09-15-a-cadence-that-was-inferred-and-the-line-that-will-not-need-inferring.md
is the phone half, and the line itself. **The remaining fault is real, is not
fixed, and is now specified rather than suspected**; the work is
backlog/a-web-client-cannot-promise-a-cadence-its-browser-will-not-keep.md.

## What the entry inferred, and which half of it was wrong

It reasoned from a uniform twenty-second gap between opens that the socket
*opens, lives about nineteen and a half seconds, and dies* — and named the
tightened heartbeat as the leading suspect, while saying plainly that neither
end of it obviously produces nineteen and a half seconds.

The mechanism was right. **The arithmetic was not, and the residue it left is
the whole of the answer.** A socket does not live 19.5s; it lives 19.3s, of
which the last 6.4s is silence. The client is last heard at **12.93 seconds**,
every time, to within twenty milliseconds across nine consecutive reproductions:

| `ageMs` | `sinceLastSeenMs` | `endedBy` | code | last heard |
| --- | --- | --- | --- | --- |
| 19288 | 6357 | `silence` | 1006 | 12.931 |
| 19308 | 6362 | `silence` | 1006 | 12.946 |
| 19310 | 6375 | `silence` | 1006 | 12.935 |
| 19312 | 6379 | `silence` | 1006 | 12.933 |
| 19323 | 6383 | `silence` | 1006 | 12.940 |
| 19326 | 6388 | `silence` | 1006 | 12.938 |
| 19330 | 6399 | `silence` | 1006 | 12.931 |
| 19339 | 6409 | `silence` | 1006 | 12.930 |
| 19350 | 6412 | `silence` | 1006 | 12.938 |

`endedBy: "silence"` with `sinceLastSeenMs` past five seconds is the first of
the three branches that entry laid out, and it is the one that fired. **This
server's sweep did it.** The twenty seconds is 19.3s of socket plus a 0.7s
reconnect — `RECONNECT_BASE_MS` is 500ms and the handshake is the rest — and it
is uniform because the backoff is reset by every successful open, so every
cycle starts from 500ms again.

## Why the client goes quiet at thirteen seconds

Not throttling of the kind that was suspected, and not a starved ping in the
sense of one arriving late. **Chrome stops running the interval altogether**,
and does it within seconds rather than after the five minutes the behaviour is
usually described with.

Measured directly, in a hidden tab on the same origin, with a bare
`setInterval(() => {...}, 2000)` and nothing else on the page — no credential
and no app involved, which is why it is quotable as a property of the browser
rather than of this code:

    fires (ms):  2536  4536  6535  8537  10536  12536  14536  62536  122536
    gaps:              2000  1999  2002   1999   2000   2000  48000   60000

Seven fires on time, about 14.5 seconds of them, and then the timer is parked
and wakes only on **one-minute-aligned** boundaries — both late fires landed at
`:33.907` past the minute. Event handlers are not affected: `onclose` still
runs, and the `setTimeout` it schedules still runs, which is why the reconnect
is punctual while the heartbeat is not.

Against a two-second ping and a five-second budget, that is decisive. The
client gets six or seven pings out, Chrome parks the timer, the sweep sees five
seconds of silence within two more sweep ticks, and terminates. **The client's
own watchdog never gets a word in**, because it lives on the same parked
interval — which is why every close in the table is the server's and none is
the client's.

## What it costs, which is not journal noise

`client=web` accounted for essentially all high-volume devices since the August
fix — 2,000 opens on 2026-09-08, 1,512 on 09-05, 1,351 on 09-03, 858 on 09-13 —
and the runs begin within a minute of a server restart, because a deploy drops
the socket a parked tab was holding and the tab reconnects into the loop.
**Being loud is the least of it.** A dropped socket is a leave: the floor is
force-released and re-entered on each cycle, `heard` flaps `inApp` twenty
seconds at a time, and every control is taking seconds or silently doing
nothing while the screen says the app is connected — which is the symptom that
entry was opened about.

That it has only ever been seen on test accounts is an accident of who leaves a
web tab open, not a property of the fault.

## Two things this settles that were open

**Caddy was innocent, and so was the client's watchdog.** The entry had ruled
Caddy out from configuration; the close code and `endedBy` now rule it out from
evidence. The watchdog at `app/src/api/socket.ts` was the entry's second
suspect and is not implicated in a single one of the nine closes.

**A foreground tab is healthy.** The same tab held one socket for 264 seconds
and lost it at the moment it was backgrounded — `ageMs` 264551 on the first
close, against 19.3s for every one after. Nothing needs fixing about the
connected case.

## And the budget is keyed on the wrong thing for a browser

`heartbeatTimeoutFor` in `server/src/release.ts` keys the silence budget on the
declared build, on the stated grounds that *the cadence is a property of the
binary rather than of the network*. **For a browser it is a property of
neither.** It belongs to the tab's visibility and the browser's scheduler, and
no build number can express it — the same page in the same build keeps its
promise when visible and cannot when hidden.

**The guest page is in the same position and is not covered by the reasoning
that exempts it.** Guests are swept at a flat `HEARTBEAT_TIMEOUT_MS` at
`ws.ts:476`, and the comment says they are not asked their cadence because
their page is served by this deploy and so cannot be older than it. That is
true and beside the point: being current does not make a tab visible. A guest
watching in a background tab is dropped on the same cycle, and `pushGuest`'s
*you are no longer in this channel* path is reached on the same evidence.

Neither is fixed here. What the choice is between —
and why the obvious one has a real cost — is the backlog entry.
