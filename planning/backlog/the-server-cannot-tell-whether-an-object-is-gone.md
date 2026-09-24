# The server cannot tell whether an object is gone

`thefloor-server` needs **`s3:ListBucket`** on the recordings bucket. Without
it the sweep's absence check cannot answer, so every row marked deleted is held
indefinitely and nothing is ever swept — the safe failure, and an inert one.

A bucket will not confirm or deny an object's existence to a caller who cannot
list it, so a missing key answers `403 AccessDenied` rather than `404`.
Measured against production on 2026-09-23: the same credential returned 200 for
an object that was there and 403 for three that were not, including one deleted
an hour before. `exists()` treats only a 404 as absence and rethrows everything
else, deliberately — unknown is not absent, and reading it as one would drop a
row on a timeout, which is the failure the whole ordering exists to prevent.
So the behaviour is correct and useless at the same time.

This is a **read** permission and does not reopen the question settled in
`planning/decisions/2026-09-23-the-server-may-not-delete-recordings-and-a-person-does-it-instead.md`,
which declined `s3:DeleteObject`. Reading is already this credential's
privilege; listing is the part of it the bucket was never given. Granting it
lets the server confirm what `bin/orphans` has cleared and drop the rows,
which is the whole of the arrangement.

Amend `planning/CREDENTIALS.md` § *The nine* and the comment over the store in
`server/src/index.ts` in the same commit — both currently say `s3:GetObject`
and nothing else, and both would be wrong.

`mixes.ts` § `dropHollowStems` documents this same 403-for-missing behaviour
and chooses to read every failure as absence, on the grounds that the cost
there is bounded: a row loses a claim to audio it could not fetch. Worth
re-reading once the grant lands, since that compromise may no longer be needed.
