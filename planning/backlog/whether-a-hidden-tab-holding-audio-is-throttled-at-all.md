# Whether a hidden tab holding audio is throttled at all

**What is left of
`a-web-client-cannot-promise-a-cadence-its-browser-will-not-keep`** once the
fix in `decisions/2026-09-16-a-hidden-tab-is-a-backgrounded-app.md` landed. A
hidden tab now closes its socket unless it is in a room; this entry is about
the tabs that are exempted, which go on holding a socket they have to keep
proving is alive.

**The measurements behind the diagnosis were all taken without audio** — a bare
page with a `setInterval(2000)` and nothing else on it, and an app that was not
standing anywhere. Chrome exempts pages using WebRTC or playing audio from
intensive throttling, so the expectation is that a tab in a room keeps its
cadence and needs nothing. That is an expectation, not a measurement.

**Measure it directly**, the way the bare page was measured: a tab stepped into
a channel, hidden for several minutes, logging the gaps between heartbeats;
then the same for a guest tab that only listens, which is the case with no
capture in it and the one most likely to differ. Safari and Firefox throttle on
their own rules and neither has been measured at all.

**If a tab in a room is parked**, the fix above does not reach it, and the
options are the ones that entry laid out: a silence budget for `client=web`
that clears a one-minute wake-up alignment — with the cost it named, a tab
reading as `inApp` and holding the floor for over a minute after the lid closes
— or something that keeps liveness without a page timer. A budget that moves is
a wire contract: see `HEARTBEAT_TIMEOUT_LEGACY_MS` and `FAST_HEARTBEAT_BUILD`,
which exist because narrowing one under an installed population was learned the
hard way.
