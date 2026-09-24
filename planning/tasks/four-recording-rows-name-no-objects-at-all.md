# Four recording rows name no objects at all

Found 2026-09-23 while auditing the bucket against the database, and left
alone because it is the opposite direction from the bug being fixed and shares
nothing with it. Four rows — `chan_9lBftbDyDGLl/rec_yRWOEI4sv_WB`,
`chan_Epzc7ewjSBD4/rec_ub4l1XLe6NCd`, `chan_o71PXlUhm7wq/rec_tEq344dKzVGY`,
`chan_TBqCVPe-dZPg/rec_UoKE43IGJKBz` — have no object under their prefix at
all, before or after the cleanup that day, so nothing was destroyed to make
this true.

The likely explanation is a run that failed before egress wrote anything, which
would make these harmless and the question only whether the app shows a
recording that cannot be played. Worth establishing rather than assuming: check
what `state`, `s3_key`, `segment_keys` and `stems` hold on those rows, and what
the channel screen and the export route do with one.

Reproduce the audit with `bin/orphans`, which reports the set it knows about;
this is its mirror image and the script does not look for it.
