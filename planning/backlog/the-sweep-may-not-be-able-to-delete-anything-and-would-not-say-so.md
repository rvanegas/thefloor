# The sweep may not be able to delete anything, and would not say so

`S3RecordingStore.delete` uses the server's own credential chain, and
planning/CREDENTIALS.md says `thefloor-server` holds `ses:SendEmail` and
`s3:GetObject` on the bucket, "nothing else" — so `DeleteObject` is denied. The
rejection is swallowed deliberately (a sweep must not become an unhandled
rejection), but nothing distinguishes swallowed-because-retryable from
swallowed-because-forbidden: `sweepDeleted` counts the objects as emptied and
deletes the row, which is the one order the code goes to lengths to avoid,
leaving audio in the bucket that no row can identify.

Unverified against production — the policy might have been widened without the
document following, and the retention window means little has been due for
sweeping. Establish which it is before changing anything: either the policy needs
`s3:DeleteObject`, or `delete` needs to report a permission failure rather than
absorb it.

Noted 2026-08-16 while adding the mix to the keys the sweep removes, which is a
third kind of object now depending on this working. Re-read against the tree on
2026-09-15 and still holds. `server/src/storage.ts`, `server/src/channels.ts`.
