# bin/orphans clears deleted recordings and says so

The arrangement in `2026-09-23-the-server-may-not-delete-recordings-and-a-person-does-it-instead.md`
had two holes, and only one of them was written down.

**The written one:** the sweep confirms a refused key gone by asking the
bucket, and without `s3:ListBucket` the bucket will not say — a missing key
answers 403, not 404 — so every row was held. The backlog entry *The server
cannot tell whether an object is gone* proposed granting it.

**The unwritten one, found reviewing that entry:** `bin/orphans` deleted only
prefixes that *no row* names, and a recording marked deleted still has its
row, held by the sweep until the audio is gone. So the person never deleted
the audio and the server never dropped the row, each waiting on the other.
The decision's own sentence — "`bin/orphans` clears the bucket, the next
hourly sweep sees the keys have gone" — described a first step that never
happened. Granting `ListBucket` alone would have let the sweep say *still
there* correctly, for ever.

**What was built.** `bin/orphans` now also clears the prefix of every
recording marked deleted longer than `DELETED_RETENTION_MS`, mirrored as a
constant in the script and re-checked against the box's clock in SQL. After
deleting it lists the bucket again and sets `recordings.objects_cleared_at` on
each such recording with nothing left under its prefix. The sweep drops a row
carrying that mark without asking the bucket anything. Marking after a second
listing, not after the delete call, is what keeps a refused delete from being
claimed: its row stays unmarked and held, and the run says how many.

**`ListBucket` was not granted.** Beside `GetObject` it turns a leaked
`thefloor-server` key from one that can fetch what it can name — the names
being random ids that live in the database, not the key — into one that can
enumerate and take the whole bucket. A compromise of the box gains nothing
from it, since the database is there; a leak of the key alone, through
`bin/env-pull` or a backup, does. The confirmation is made instead by
whoever runs `bin/orphans`, on a credential that can list, which is the same
person who already deletes.

The sweep's own ask-the-bucket path is kept, as `objectsGone`: it is what the
arrangement looks like on a credential that can delete or list, and the tests
for it still describe real behaviour. In production it answers *no* every
time, and the mark is read first so that it is never reached for a confirmed
row.

**What remains is remembering to run it.** A deleted recording's audio and
row both outlive it until somebody runs `bin/orphans --delete`, which nothing
schedules — that is the cost the 2026-09-23 decision accepted. So `/healthz`
carries `awaitingOrphans`, the deleted recordings past their week with no
mark, and `bin/health` prints it with the command when it is above zero. A
marked row is the sweep's within the hour and is not counted.

**The order on the box matters once.** The column is added by the server at
startup, so `bin/orphans` refuses — before deleting anything — against a
database that does not have it yet. Deploy first, then run it.
