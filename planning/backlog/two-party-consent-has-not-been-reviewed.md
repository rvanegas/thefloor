# Two-party consent has not been reviewed

**Status:** unanswered. A gate on letting anyone outside this machine record.

The spec raises it and defers it (§Recording, Consent indicator):

> a visual indicator provides notice but may not by itself satisfy legal
> consent requirements in all jurisdictions with two-party consent laws for
> recorded calls — this should be reviewed against applicable law before
> shipping, independent of the in-app UI.

That review has not happened. It is a legal question rather than a code one, so
no amount of implementation settles it — but it constrains what may ship, and
it is cheaper to answer before there are recordings of other people than after.

### What exists today

- A persistent red dot and "Recording" label in the Channel view, visible to
  both parties whenever capture is running.
- **An audible chime on every present device when a run somebody started
  begins**, since 2026-09-17 — three notes rising, heard by the starter too.
  This is the one thing on this list that reaches somebody who is not looking
  at a screen, which a conversation app is full of. Two limits belong in the
  review rather than in a footnote: a run the channel started by itself
  (`autoRecord`) makes no sound, so the runs with no audible notice are exactly
  the ones nobody initiated; and the chime is local to each device rather than
  published into the media room, so it is **not** in the stem or the exported
  file and the artifact carries no evidence that notice was given. See
  `decisions/2026-09-17-a-recording-somebody-started-says-so-out-loud.md`.
- Either party may stop the recording at any time, except the silenced party
  during an active claim.
- A silenced speaker is told explicitly that they are still being captured.
- Recording is never automatic; someone has to start it.

So notice is given, and since 2026-09-17 some of it is audible. Whether notice
is *consent* is the open question, and in several US states it is not — nothing
above moves that, and the chime in particular should not be mistaken for an
answer to it. What it changed is the modality, not the standing.

### What makes it sharper than the spec anticipated

Capture is complete and continuous. A silenced speaker's audio is recorded in
full and stored as a stem; the floor is applied only when a recording is
encoded for export. That was a deliberate decision — the bucket is server-only
and stems never reach a client — but it means the system holds audio of someone
at a moment they were being prevented from being heard. Worth putting in front
of whoever reviews this, because it is not what "you are being recorded"
ordinarily implies.

### Likely shapes of an answer

- **Explicit consent at channel start**, from both parties, before recording is
  offered at all.
- **Consent per recording**, with the other party able to refuse.
- **Restrict by jurisdiction**, which requires knowing where users are.
- **Do not record at all** in the first release.

Each has a real product cost, which is why this wants deciding before it is
built around rather than after.
