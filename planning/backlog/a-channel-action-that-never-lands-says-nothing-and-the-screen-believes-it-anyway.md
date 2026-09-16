# A channel action that never lands says nothing, and the screen believes it anyway

`app.act` is fire-and-forget: `socket.send` queues a `channel.action` taken while
the socket is down, but only for `QUEUE_TTL_MS` (10s) and 32 deep, and drops it
silently past either — and a *refused* action is answered with a snapshot and no
error, so there is nothing to catch even when the send succeeded.
`ChannelSettingsView.persist` then records `saved.current.name` immediately after
dispatching, unconditionally, so the screen's own record says the write happened
whether or not it did, and `done()` leaves regardless. The comment at
`app/src/api/socket.ts:170` names this shape as the worst a bug can take — the
queue narrows the window rather than closing it.

Compare `HomeSettingsView`, whose write is an awaited HTTP call: it reports the
failure and declines to close. Softened by the channel screen rendering the name
from the server snapshot, so a lost `SET_NAME` shows as the old name still being
there — visible, but unexplained, and indistinguishable from having mistyped.

The full fix is an acknowledgement for `channel.action`, which is a wire change
and needs the two-step deploy; stopping the premature `saved.current` is smaller
and independent.

Noted 2026-08-17, from asking why only one of the two settings screens has a
"Saving…" state. Re-read against the tree on 2026-09-15 and still holds.
`app/src/ui/ChannelSettingsView.tsx`, `app/src/api/socket.ts`.
