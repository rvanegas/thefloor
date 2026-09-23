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

**`bin/orphans` is this entry, executable.** It reports by default and deletes
only on `--delete`, recomputes the set on every run rather than caching it,
takes whole prefixes rather than the key shapes a row would have named — the
`EG_*.json` egress manifests are collected by nothing in `objectKeysOf` — and
excludes the pre-rename `sess_` objects, which are dev-era leftovers from
before 2026-08-10 and a separate question. It refuses to do anything at all if
the database names no recordings, since a failed query would otherwise nominate
the entire bucket.

It runs on whoever's CLI credential is to hand rather than the server's, which
is the point: `thefloor-server` stays `s3:GetObject` and nothing else, and the
irreversible privilege lives with a person instead of a timer.

Still to decide: what the sweep does in the meantime. It now correctly refuses
to drop a row whose objects it could not delete, so with the policy unchanged
those rows are held for ever and a refusal is logged hourly. The neighbouring
entry has the fork, including the option that makes this path coherent — the
server can *read*, so it could confirm an object is absent and drop the row on
that, leaving the deleting to this script.
