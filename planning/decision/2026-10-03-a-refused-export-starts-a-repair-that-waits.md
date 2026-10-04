# A refused export starts a repair that waits

`dropHollowStems` takes back stem keys the bucket has no object for, and it
had one caller: `startMix`'s catch, in the seconds after a run. A stem that
went missing **after** a successful mix was never looked at again. The `ready`
branch of `recordingAudio` remade a lost mix, but with a stem gone too it had
nothing to remake it from. Every export got the same 500, for ever. Nothing is
known to have done that in production: the server holds no
`s3:DeleteObject`, the sweep only touches rows already marked deleted, and
`bin/orphans` only clears objects whose rows are gone. It was a gap, not a
sighting.

## What it does now

When `recordingAudio`'s fallback mix fails, it still refuses the request, and
it also starts `repairInBackground`. That is the same tracked mix `startMix`
runs, with the full wait (`getWhenReady`, ten minutes), failing through the
same catch into `dropHollowStems`. A failed repair moves `'ready'` to
`'unmixed'`, because `'ready'` promises a stored mix and the request has just
found there is none. A repair already running is not started twice.
`startMix` and the repair now share `mixInBackground`, differing only in which
state a failure moves out of.

## Why the request does not decide

The obvious one-line fix was to call `dropHollowStems` from the request path.
The backlog entry suggested it, and implied `dropHollowStems`'s guard would
keep that safe. It would not. That guard is `mixWaitMs === 0`, a test
setting, and it never looks at whether this particular fetch waited. Without
`s3:ListBucket` the bucket answers a missing key with `AccessDenied`, so a
fetch with no wait cannot tell an outage from absence. On the request path,
every export during an outage would have dropped keys. **So every caller of
`dropHollowStems` is now a mix that waited**, and the doc comment says so.

The cost is the one `startMix` already pays: an outage lasting longer than the
wait is read as absence. That is bounded the same way, since the row keeps its
duration, roster and name. What is new is that a request can trigger it, not
only a run ending. Holding the repair to a full wait is what keeps that
acceptable.

`__tests__/mixing.test.ts` § *a stem that goes missing after the mix* covers
both directions. A stem that is gone is taken back. A stem that comes back
while the repair is still waiting keeps its key and gets its mix remade. Both
tests fail without the repair.

Once its keys are taken back, such a row becomes
`a-run-that-captured-nothing-looks-like-a-recording.md`, which is still open.
