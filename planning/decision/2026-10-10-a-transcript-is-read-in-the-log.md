# A transcript is read in the log

Rodrigo, 2026-10-10: **batch and live transcription are one thing in the
app.** Only a recording made without a transcription is offered a batch
transcript, and once one is finished it is shown just as the live transcript
is. Until then a recording's transcript was a screen of its own, reached from
the row's *Transcript* button, while the live transcript ran in the *Record*
log.

**Which recordings are offered one.** A recording any of which ran while the
live transcript was on (a line of `live_lines` between its start and its end)
is not. `Transcripts.transcribedLive` is the test. The route refuses with a 409
that says so, and the wire carries `transcript.live`. Rodrigo chose *any line*
over *the whole run*: a recording with Text switched on partway would otherwise
show the overlap twice in the log, once from each source.

**No shim.** For builds that predate `live`, the same recording also comes
with `mayRequest: false` and a `requestLimit` sentence. Those builds already
show that sentence beside a disabled *Transcribe*, so they explain the refusal
rather than offer a button that fails.

**How it is shown.** The lines are drawn under the recording's line in the
log, in the live transcript's blocks, with the live transcript's clock time
beside each speaker's run. That time is the recording's start plus the line's
offset. **It is approximate after a pause**: a run's pauses are not stored,
only the recorded time in its segments, so a line after a pause reads early
by however long the run was held. Its order is right. Persisting the segments'
wall-clock starts would fix it, and was left until somebody minds.
A room holding a recording with a finished transcript is `transcribed` on the
wire, so *Share › Text* offers it and includes those lines. A stand-in room can
now be transcribed that way, so the client keeps live lines out of stand-ins by
name rather than by `transcribed`.

**What went with the screen**, at Rodrigo's choice of removing it over keeping
it as a detail view:

- the search across a channel's transcripts, which only opened that screen;
- the filter within one transcript;
- tapping a line to move shared playback to it;
- sharing one as text, subtitles (WebVTT) or JSON. The room's *Share › Text*
  covers the first, and nothing covers the other two.

What stayed is on the recording's row: *Transcribe*, *Transcribing…*, the
failure with *Transcribe* again, and *Delete transcript* with its warning
that asking again costs again. The server's search and export routes stay
for the builds in people's hands that still read them.
