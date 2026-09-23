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

So: either widen `thefloor-server` to `s3:DeleteObject` on the recordings
bucket, and amend both statements in the same commit; or decide the sweep
should delete through some third narrow credential and add it. Whichever,
`planning/decisions/2026-09-23-the-sweep-now-knows-whether-it-deleted-anything.md`
is what it follows from, and the orphaned audio already in the bucket is the
neighbouring entry.
