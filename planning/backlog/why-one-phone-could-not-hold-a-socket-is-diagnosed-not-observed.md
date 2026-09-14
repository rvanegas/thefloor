# Why one phone could not hold a socket is diagnosed, not observed

**Status:** the consequences are fixed; the cause is inferred. See
decisions/ § *A tap that waits ten seconds, and the socket that was
nobody's*.

On 2026-08-24 the box showed one session opening `/ws` 448 times in six hours
at a ten-second cadence — the reconnect backoff's cap, arriving over and over —
while the other active session opened it twenty times. The stale-socket fault
fixed that day explains a cadence of exactly that shape: an orphaned close
tears down the connection that replaced it, so the client reconnects on every
backoff while an open socket sits unreferenced. **That is a mechanism that fits,
not a reproduction.** Nothing was instrumented on the device, and Caddy's
access log is not enabled, so how long each of those sockets actually lived is
not known — a connection that opened and lived nine seconds and one that never
opened at all are indistinguishable in what was looked at.

What would settle it: the cadence going away. A phone in that state now either
holds its connection or, if something else is closing it, keeps reconnecting —
and the count per session over an hour is one query against the journal. If it
comes back, the next thing to add is a log line at the close, because the
question is which end is closing and nothing on the box answers it.

Worth knowing that the symptom of this is not a broken app. It is every control
taking up to ten seconds, or silently doing nothing at all, while the screen
says the app is connected — the queue's TTL and the backoff cap are the same
ten seconds, so an action either just makes it or is dropped without a word.
