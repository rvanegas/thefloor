# Watch Leaves Labs

Take watch parties out of *Show experimental features*, so the tab is there
for everybody. **The submission notes have to change in the same release, and
this is the half that gets forgotten**, since nothing in the code points at
them. `planning/submissions/review-notes-<version>.txt` says two things that
become false the moment this ships: section 6 opens *"A watch party is behind
Labs and carries no video"*, which offers the whole no-video argument — never
fetches, decodes, stores or shows a frame; YouTube's own IFrame player,
unmodified and unobscured — about a feature that is off by default; and
section 3 tells the reviewer to turn Labs on to reach the Watch tab, which is
then an instruction to a setting that does not gate it. The argument has to
stand on its own merits rather than on the setting. Every submission since
1.2.0 has been approved with that clause in place, so this is a rewrite rather
than a new claim, but it is a claim to Apple about a default-on feature and is
not a wording tidy.

Two things worth settling in the same breath. **1.5.0's store screenshots
already show the Watch tab** — Labs was on when they were taken, and they
carry forward on the version record, so this release makes them accurate
rather than needing them reshot. And **Labs would then gate only Transcribe**,
which may not be worth a setting on its own.
