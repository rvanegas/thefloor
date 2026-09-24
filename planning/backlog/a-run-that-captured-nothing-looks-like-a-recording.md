# A run that captured nothing looks like a recording

`recordings.failure` is written and never sent to the client. The row shape
`app.ts` returns carries `id`, `name`, `others`, `startedAt`, `endedAt`,
`durationMs`, `mixing`, publication and transcript — and not `failure`. So a
run that captured no audio at all produces a card indistinguishable from a real
recording: same name, same duration, same controls. Tapping export reaches
`recordingAudio`, which has nothing to fetch, and the route answers `500 Could
not prepare the recording.`

Four such rows exist as of 2026-09-23, all live and all visible to their
channel's members. Three carry `failure` = *Nothing was captured — no audio was
being published* with an empty `s3_key`, `[]` segments and `{}` stems:
`rec_UoKE43IGJKBz` (23ms), `rec_yRWOEI4sv_WB` (1.5s), `rec_tEq344dKzVGY`
(4.2s). They are recorded correctly and presented wrongly, which is the whole
of this entry.

**One of them is in the App Review demo channel** — `chan_o71PXlUhm7wq`, Johnny
Tahoe and Sam Rivera, the two accounts in DEMO-ACCOUNT.md. A reviewer signing
in sees a recording card and gets a server error on tapping it. That makes this
worth fixing, or at least worth clearing, before the next `bin/submit-ios`.

Two ways to close it and they are not the same decision. **Surface the
failure**: carry it on the wire and let the card say the run captured nothing,
which is honest and tells somebody why their recording is empty. **Or do not
keep the row**: a run that captured nothing is arguably not a recording, and
marking it deleted at stop time would mean no card at all. The first is more
informative and the second is less to build; the second also silently loses the
only evidence that capture failed, which is worth something if it starts
happening often.

Note `rec_ub4l1XLe6NCd` is a *different* defect and is in tasks/ — it has no
`failure`, claims a stem, and the object is missing. It reaches the same 500 by
another route.
