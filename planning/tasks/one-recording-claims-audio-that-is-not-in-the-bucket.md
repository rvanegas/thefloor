# One recording claims audio that is not in the bucket

`rec_ub4l1XLe6NCd`, in `chan_Epzc7ewjSBD4`, started 2026-09-04 23:25 UTC,
6,314ms long, no `failure`, `mix_state` unmixed. Its `s3_key`, `segment_keys`
and `stems` all name
`chan_Epzc7ewjSBD4/rec_ub4l1XLe6NCd/acct__M6l3ujj9aSP-001.ogg`, and that object
is not in the bucket. The single stem has `startMs: 5200` against a 6.3s
recording, so it claims about a second of audio.

**Not caused by the cleanup on 2026-09-23.** The key is absent from the bucket
listing taken before anything was deleted, and its prefix was never in the set
`bin/orphans` nominated — that channel had a *different* orphaned recording,
`rec_wYPWMUVpgu39`, which is what went. Checked both ways before writing this.

So either the stem was never uploaded while the row recorded it anyway, or
something removed it earlier by hand. Worth establishing which, because the
first is a bug that will recur and the second is history.

What a listener gets is the open question. The row is live and unmarked, so it
appears in the channel like any other recording, and the fetch of a key that is
not there will fail — see `mixes.ts` § `dropHollowStems`, which exists to strip
exactly this and runs only when `mixWaitMs` is non-zero. Check whether that
should have caught it and why it did not.

**The other three rows with no objects are not a defect and need nothing.**
`rec_UoKE43IGJKBz`, `rec_tEq344dKzVGY` and `rec_yRWOEI4sv_WB` each carry
`failure` = *Nothing was captured — no audio was being published*, with an empty
`s3_key`, `segment_keys` of `[]` and `stems` of `{}`. They name no objects
because there are none to name, which is recorded correctly. Two of them ran
for 1.5s and 23ms. They are noted here only so the next audit does not spend
the afternoon this one nearly did.
