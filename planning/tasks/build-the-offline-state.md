# Build the offline state

The app has no word for being offline. `useOfflineNotice` is opt-in and two of
about twenty views opt in; an action taken during an outage is queued, dropped
past `QUEUE_TTL_MS` and never mentioned; and the screens that dispatched it
record it as done. **The design is settled and written up in OFFLINE.md** —
read that, not this paragraph, which only says the work exists.

The shape, in one line each: `QUEUE_TTL_MS` is the definition of being offline
rather than a queue constant; inside it the client retries hard at ~1s with
jitter because there is something to save; at it the queue clears globally and
a full-screen wall goes up, which *is* the notification that the queue was
dropped; past it the existing backoff resumes unchanged. Two messages, one
screen, blocking in both, because the LiveKit room can be up while the socket
is down and still nothing is controllable. Plus `send` returning whether it
wrote, so `ChannelSettingsView` stops recording unconfirmed writes as saved.

One piece of work, no wire change. Supersedes most of
`backlog/a-channel-action-that-never-lands-says-nothing-and-the-screen-believes-it-anyway.md`,
which stays for the acknowledgement half.
