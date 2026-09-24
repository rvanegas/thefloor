# The server may not delete recordings, and a person does it instead

`thefloor-server` holds `s3:GetObject` and nothing else, which
planning/CREDENTIALS.md has said since it was written and
`server/src/index.ts` repeats in the comment over the store. That turned out to
mean the sweep could never delete anything — see
`2026-09-23-the-sweep-now-knows-whether-it-deleted-anything.md` for the bug
that hid it. The obvious repair was to grant `s3:DeleteObject`. We did not.

**The privilege stays with a person.** Clearing objects is irreversible and
happens rarely; a credential that can do it unattended, on an hourly timer, is
a standing risk in exchange for saving somebody a command they run every few
months. `bin/orphans` does the deleting on whoever's CLI credential is to
hand, and the server keeps the smallest blast radius it can — the same
reasoning that kept `thefloor-egress` PutObject-only when mixing looked like it
needed more.

**This does not work on its own**, and that is the part worth writing down.
With the policy unchanged, every delete the sweep issues is refused, so it
would hold each row for ever and log hourly — and the audio would never be
deleted by anything either. A recording somebody asked to delete would be
merely unreachable, which is the shape of the bug it replaced rather than a
fix for it.

**What closes it: the server may read where it may not delete.** A refused
delete is now followed by asking whether the key is there at all. Absent counts
as emptied — including a key that was never written, which the mix and the
published episode usually are not — and only a key still present holds the row.
So `bin/orphans` clears the bucket, the next hourly sweep sees the keys have
gone, and the rows follow. The invariant is untouched: a row still outlives its
objects, because the row is the only record of which keys belong to it.

`exists()` returns `false` only on a 404. Anything else — a refused head, a
timeout — rethrows and the row is held. No answer is not an answer of no, and
reading it as one would drop a row on a network fault, which is the failure
this whole ordering exists to prevent.

Refusals are still reported, once per recording rather than per key, even when
everything was already absent. They are routine under this arrangement, but
silence about them is exactly what let the original bug run unnoticed, so they
are never entirely quiet.

**The cost, stated plainly.** Deletion is no longer autonomous. Between a
user deleting a recording and somebody running `bin/orphans`, the audio is
still in the bucket — unreachable, since a marked recording leaves the app and
the feed a week before the sweep looks at it, but present. If that interval
ever needs to be short, the answer is to widen the credential, and this entry
is the thing to argue with.

The 236.6MB of already-orphaned audio — 51 recordings, 232 objects, about 23%
of the bucket — was cleared with `bin/orphans --delete` the same day. The four
recording rows that have no objects at all are unrelated and remain
unexplained.
