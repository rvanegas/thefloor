# Every query scans every channel ever created

Channels are permanent — `9761d72`, 2026-08-10 — and `restore` reads every row
with `ended_at IS NULL` into memory at boot, where nothing ever ages one out. So
`this.channels` is every channel that has ever existed and not been ended, and
**thirteen loops in `channels.ts` walk the whole of it**. There is no index from
an account to its channels.

**The tick is the cheapest of them, which is the opposite of how this entry read
until 2026-09-17.** It walks every channel twice per 500ms plus three smaller
loops, for a `reduce(TICK)` that returns the same object when nothing changed —
about 300 channel visits a second against the 76 live channels the box held that
day. The active set the original entry asked for — channels with a live floor
claim, playing playback, an active recording or a pending disconnect, and lazy
residency for the rest — is still the right end state, and is not what will bite
first.

**`homeFor` is.** `ws.ts` fires it per participant on every channel change, and
each call runs `invitesFor` *and* `rejoinableFor`, each a full scan. One change
in a five-person channel is ten full scans; the cost is changes × participants ×
every channel ever created, and it is undebounced. The only thing holding it
down is that `watchingHome` gates the push to connections actually sitting on
Home, so somebody inside a channel is not paying it.

**The cheap fix is an index, not an active set.** A `Map<userId, Set<channelId>>`
maintained alongside `this.channels` collapses `homeFor`, `channelsFor`,
`capNearby` and most of the other ten scans, is purely internal, and has no wire
surface — so it needs no shim and can deploy on its own. The active set is a
larger change for the loop that is currently free.

The other half of what used to be one entry here is
`home-grows-without-limit-and-a-channel-can-only-be-left-from-inside-it.md`,
which is the same permanence measured on the screen.
