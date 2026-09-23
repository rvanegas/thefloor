# The server cannot delete from the recordings bucket

`thefloor-server` holds no `s3:DeleteObject`, established 2026-09-23 by a
`DeleteObject` against a non-existent key run on the box with the server's own
credential: `AccessDenied`, while `HeadObject` on a live key succeeded from the
same client. So the sweep cannot empty the bucket, and since the fix that day it
correctly refuses to drop a row it cannot back up with a deletion — meaning
every deleted recording's row is now held for ever and a refusal is logged each
hour until this is resolved. Nothing is user-visible: a marked recording leaves
the app and the feed a week before the sweep ever looks at it.

Granting it is the obvious move and is deliberately not a passing edit.
CREDENTIALS.md § *The nine* and the comment at `server/src/index.ts:100` both
state `s3:GetObject` and nothing else as a chosen property, and the same file
records that this credential was nearly widened for no reason on 2026-08-16
when the PutObject-only `thefloor-egress` key turned out to be the right one.
Check this against that one first — though note egress cannot be the answer
here, since a PutObject key cannot delete either and widening *it* trades away
the smaller blast radius that is its whole point.

There are two coherent answers and one that only looks like one.

**Widen it.** `s3:DeleteObject` on the recordings bucket, amending both
statements in the same commit. The sweep then works as it was always written
to, unattended, and nothing else changes.

**Keep it narrow and reap by hand.** Preferred on 2026-09-23: the irreversible
privilege lives with a person and their CLI credential — `bin/orphans` — rather
than with an hourly timer, and the server keeps the smallest blast radius it
can. **This needs one code change to be complete**, and without it the option
is not what it appears: the sweep now holds any row whose objects it could not
delete, so those rows are held *for ever* and log a refusal every hour, and the
audio is never deleted by anything either. The recording is not deleted, merely
unreachable — which is close to the bug this replaced.

The change that completes it: the server may **read**, so on a refused delete
it can ask whether the object is there at all, and drop the row when every key
is already absent. The invariant holds — a row still outlives its objects — and
the deleting is done by `bin/orphans`, with the next sweep noticing and
clearing the rows. That keeps `thefloor-server` on `s3:GetObject` and nothing
else while leaving nothing held for ever.

**What does not work** is leaving it as it stands and running `bin/orphans`
periodically: that script clears objects with no row, and these rows exist.
Something has to remove them, and only the server can.

`planning/decisions/2026-09-23-the-sweep-now-knows-whether-it-deleted-anything.md`
is what all of this follows from; the orphaned audio already in the bucket is
the neighbouring entry.
