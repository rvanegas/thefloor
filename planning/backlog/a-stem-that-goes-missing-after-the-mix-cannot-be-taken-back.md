# A stem that goes missing after the mix cannot be taken back

`dropHollowStems` is the one thing that rewrites a row to stop claiming audio
the bucket has no object for, and it is reachable from exactly one place:
`Mixer.startMix`'s catch, on the `pending` → `unmixed` transition
(`mixes.ts:68`). So it runs once, in the seconds after a run ends, and never
again. An already-`unmixed` row is not re-examined, and neither is a `ready`
one.

What that leaves is the shape `rec_ub4l1XLe6NCd` was in for twenty days: a row
naming a key, no `failure`, and a card offering Play. Reaching the audio goes
`recordingAudio` → `mix(…, { wait: false })`, and a `wait` of false is by
`dropHollowStems`'s own rule not evidence of anything — the doc comment is
explicit that a key is dropped only on a fetch that already had its wait — so
that path throws and rewrites nothing. The same 500, every time, for ever.

Two ways in, and only one of them is live. A row whose mix failed before
2026-09-06 never had the chance to be corrected, because the correction did not
exist; there was one such row and it has been cleared. What remains is a stem
that disappears *after* a successful mix. The `ready` branch of
`recordingAudio` remakes the mix when the mixed object is gone, which is the
right answer and the reason that branch exists — but if a stem has gone too
there is nothing to remake it from, and no wait behind which to conclude that
the stem is not coming back.

Nothing is known to have done that in production — `bin/orphans` deletes
objects whose rows are gone, not the other way round. This is the gap rather
than a sighting, which is why it is filed small.

Fixing it is probably one line of reach rather than new logic: let the
`wait: false` path conclude absence too, or give `dropHollowStems` a second
caller for a row that is already `unmixed`. The care needed is the one its
comment names — without `s3:ListBucket` the bucket answers a missing key with
`AccessDenied` rather than `NoSuchKey`, so an outage is indistinguishable from
absence, and a repair that runs on every export is a repair that runs during
outages. That is the argument for a wait, and it is the argument against
simply dropping the `wait` check.

See `a-run-that-captured-nothing-looks-like-a-recording.md`, which is what such
a row becomes once the keys *are* taken back, and is presented no better.
