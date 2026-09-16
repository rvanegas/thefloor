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

**The refusal half is sharper than "no error".** A *registry* refusal does send
one: `ws.ts` answers `!result.ok` with an `error` frame. What is silent is a
*reducer* guard — `SET_NAME` returns `state` unchanged when `canEditChannel` is
false — so `dispatch` reports success and the client gets a snapshot. And the
error frames that are sent go to `lastError`, which is rendered only in
`AuthView`, so no channel action's refusal is visible on any channel screen
either way.

Compare `ProfileView`, whose write is an awaited HTTP call: it sets `saving`,
reports the failure, and updates its own `saved.current` only after the await
resolves. **Not `HomeSettingsView`**, which this entry used to name — the
awaited save and the "Saving…" label left with the name and bio fields on
2026-08-29, and `ChannelSettingsView`'s own comment still points at the wrong
screen. Softened by the channel screen rendering the name from the server
snapshot, so a lost `SET_NAME` shows as the old name still being there —
visible, but unexplained, and indistinguishable from having mistyped.

The full fix is an acknowledgement for `channel.action`, which is a wire change
and needs the two-step deploy. **The rest is now OFFLINE.md's**, which treats
this as one symptom of the app having no word for being offline and covers the
premature `saved.current` under `send` returning whether it wrote. What stays
here is the acknowledgement, which is the only part that also catches an online
refusal, and which that design leaves optional rather than urgent.

Noted 2026-08-17, from asking why only one of the two settings screens has a
"Saving…" state. Re-read against the tree on 2026-09-15 and still holds; re-read
again 2026-09-16, when the comparand turned out to be stale and the rest became
OFFLINE.md. `app/src/ui/ChannelSettingsView.tsx`, `app/src/api/socket.ts`.
