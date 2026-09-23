# There is 236MB of orphaned audio in the bucket

Measured 2026-09-23: 51 recording prefixes, 232 objects, 236.6MB — about 23% of
the bucket's 1022MB — with no row in the production database naming them. The
cause is the sweep bug fixed that day, so the set is closed and will not grow:
rows are no longer dropped without their objects. See
`planning/decisions/2026-09-23-the-sweep-now-knows-whether-it-deleted-anything.md`.

These are conversations. They are unreachable — no row names them, so nothing
serves them and nobody can be shown them — but they are somebody's audio sitting
in a bucket after they asked for it to be deleted, which is the reason to clear
them rather than the storage cost.

The method that measured it: list the bucket, keep keys matching
`chan_<id>/rec_<id>/`, and subtract `select channel_id || '/' || id from
recordings` via `bin/db`. **Recompute at the moment of deleting rather than
reusing the list above** — a prefix that gains a row in between must not be
touched, and the ordering argument that governs the sweep governs this too.
Exclude the 40 objects under pre-rename `sess_` prefixes, which are dev-era
leftovers from before 2026-08-10 and a separate question; one of them is in the
local development database.

Take the whole prefix, not the keys a row would have named: the `EG_*.json`
egress manifests are collected by nothing in `objectKeysOf`, so a cleanup
limited to known key shapes would leave 187 of them behind.

Blocked on the neighbouring entry — the credential that would do the deleting
cannot delete. Whoever holds an admin key can do it directly instead, and
should, since that avoids widening anything.
