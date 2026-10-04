# A run that captured nothing looks like a recording

`recordings.failure` is written and never sent to the client. The row shape
`app.ts` returns carries `id`, `name`, `others`, `startedAt`, `endedAt`,
`durationMs`, `mixing`, publication and transcript — and not `failure`. So a
run that captured no audio at all produces a card indistinguishable from a real
recording: same name, same duration, same controls. Tapping export reaches
`recordingAudio`, which has nothing to fetch, and the route answers `500 Could
not prepare the recording.`

**The four rows this was found on were cleared by hand on 2026-09-24**, all
four `deleted_at` set to the same millisecond, 09:51:24 UTC — `rec_UoKE43IGJKBz`
(23ms), `rec_yRWOEI4sv_WB` (1.5s), `rec_tEq344dKzVGY` (4.2s, and the one that
was in the App Review demo channel `chan_o71PXlUhm7wq`) and `rec_ub4l1XLe6NCd`,
which was the separate defect below. `recordingsFor` and the export route both
filter `deleted_at IS NULL`, so none of them is reachable now. **Nothing in the
code changed**, so this entry is still open on its merits: the clearing bought
the next submission and nothing else.

**And the shape still occurs.** The app half of the 2026-09-06 fix — holding
`START_RECORDING` for `RECORD_PUBLISH_WAIT_MS` until `micPublished` — first
shipped in build 157, and `bin/health` reports `oldestBuild` 104 against a
floor of 80. Below 157 the ask can still beat the publish. Above it, the hold
expires after two seconds and the action is sent anyway, deliberately, because
a device with no microphone never publishes and a recording of the other party
is still worth having. Either way the server files the run correctly and the
card lies about it.

## Reproducing it

Server-side, deterministic, no devices, and the harness in
`server/__tests__/mixing.test.ts` already builds the row — `record({ uploaded:
false })` is a run whose stems never reach the bucket. Two accounts signed in
and befriended, a channel, the second `ENTER`, `START_RECORDING`, the clock
moved on, `STOP_RECORDING` with nothing written to the store, then
`await app.channels.mixesSettled()`. Checked 2026-09-26, with `mixWaitMs: 1`:

- the row is `stems: '{}'`, `s3_key: ''`, `mix_state: 'unmixed'`, `failure:
  'Nothing was captured — no audio was being published.'`
- `app.recordingsInChannel(channelId, alice.account.id)[0]` is
  `{id, channelId, name: 'Alice and Bob', others, startedAt, endedAt,
  durationMs: 6000, mixing: false}` — the failure is not in it
- `GET /recordings/<id>/export` answers `500 {"error":"Could not prepare the
  recording."}`

On a phone: be in a channel where nothing is published — microphone permission
refused, or a simulator with no input — and start a recording, then stop it. The
two-second hold expires, the run is filed, and the card appears with its name
and duration like any other. Sharing it gets the 500.

## Two ways to close it

They are not the same decision. **Surface the failure**: carry it on the wire
and let the card say the run captured nothing, which is honest and tells
somebody why their recording is empty. **Or do not keep the row**: a run that
captured nothing is arguably not a recording, and marking it deleted at stop
time would mean no card at all — which is what was done by hand to the four, so
it is the behaviour that has now been seen. The first is more informative and
the second is less to build; the second also silently loses the only evidence
that capture failed, which is worth something if it starts happening often.

`rec_ub4l1XLe6NCd` was a *different* defect and had its own entry in `task/`,
deleted on 2026-09-26 once both its questions were answered: the stem was never
uploaded rather than removed later, and `dropHollowStems` did not catch it
because it did not exist until two days after the run. Commit a9fc51ee is that
account, and `mixes.ts` § `dropHollowStems` and `mixing.test.ts` § *a stem key
with no object behind it* carry the rest. A stem lost *after* the mix is now
taken back too, by the repair a refused export starts; see
`decision/2026-10-03-a-refused-export-starts-a-repair-that-waits.md`.
