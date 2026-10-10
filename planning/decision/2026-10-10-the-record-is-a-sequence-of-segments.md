# The record is a sequence of segments

Rodrigo, 2026-10-10, in two steps on the same afternoon.

**First: batch and live transcription are one thing in the app.** Only a
recording made without a transcription is offered a batch transcript, and a
finished one is shown just as the live transcript is. Until then a recording's
transcript was a screen of its own, reached from the row's *Transcript*
button, while the live transcript ran in the *Record* log. That screen went,
by his choice of removing it over keeping it as a detail view, and with it:

- the search across a channel's transcripts, which only opened that screen;
- the filter within one transcript;
- tapping a line to move shared playback to it;
- sharing one as subtitles (WebVTT) or JSON. Its text is shared from its
  line in the log, and nothing covers the other two.

The row keeps *Transcribe*, *Transcribing…*, the failure with *Transcribe*
again, and *Delete transcript* with its warning that asking again costs again.
The server's search and export routes stay for the builds that read them.

**Then the rule that made it work: the record is a sequence of segments.**
The first version offered batch only where no live line fell inside a
recording, and placed the batch lines on the clock at the recording's start
plus their offset, early after a pause. Rodrigo's correction was that this was
not going to work: **where audio and text are both present they must be of
equal duration and synchronized, so every change of toggle settings must be a
clean break from the previous segment.** A room holds one segment or more, and
what is shared is a segment, so the share no longer says *room*.

**What a segment is.** A stretch of a room kept one way throughout: as audio,
as text, or both. *Audio* or *Text* switched, Pause and Resume each end one
and begin the next at the same instant. Asked whether Pause should break too,
or whether a segment should carry through a pause, he chose the break, so
every segment is one unbroken span and text and audio sync with no pause
bookkeeping.

**How it is enforced, in the parts not guessable from the code:**

- **Core.** A pause **ends** the audio's run, leaving the state `paused` with
  no run, and a resume begins a new one (`holdKeeping`, `resumeKeeping`).
  Either Pause or Resume action moves both forms, so the app sends one action
  and both end and begin together. Text changing while the audio records
  ends the run and begins another (`restartOnTextChange`), so a recording is
  exactly one segment's audio. Start, where it includes the text, is one
  request: `SET_LIVE_TRANSCRIPTION` with `startRecording`, which the route
  sets only after asking `canStartRecording`. Each of these needs a run id,
  which the server mints as it does for a start.
- **Continuation runs are `automatic`**, which is what keeps them silent. The
  chime announces somebody starting a recording, and a resume or a restart
  under a Text change is not that. It is the only reader of the bit, and
  setting it silences old builds as well, where a new field would not have.
- **The server files the old run before opening the new one** when a run id
  changes without a stop in between (`applyRecordingToMedia`). Both write
  into the same per-channel maps of stems, audience and floor windows, so
  the new capture must not begin until the old run has taken what is its.
- **Segments are written, not inferred**: a `segments` table written on every
  change of (running run, `isTranscribingLive`), as rooms are, at the
  reducer's own instant so a segment and its recording agree to the
  millisecond. One closed at the instant it opened is deleted. A boot closes
  whatever is open. Rooms from before today have theirs derived: each
  recording one, kept as text too if a live line fell inside it, and the live
  lines between recordings one text segment per gap.
- **Batch is offered where the recording's segment kept no text.** For a
  recording from before segments, any live line inside it still counts. The
  route refuses with a 409. The wire carries `transcript.live`, plus a
  `mayRequest` refusal with a sentence for builds that predate the field.
  Those builds explain the refusal beside a disabled *Transcribe* rather than
  offer a button that fails.

**How it is drawn.** Each room keeps its rule with date and hours, now
without a share. Each segment is a line: the record dot or a ring, its hours,
what it kept (*Audio*, *Text*, *Audio + Text*), and the share, with its text
under it. A recording's batch transcript makes its segment *Audio + Text*.
The line no longer shows the recording's name; the name moved into the
opened row, above the actions. The share's sheet is titled by the hours,
*Share 2:00–2:40 PM*, which Rodrigo chose over making *segment* a word people
meet.

**No shim, and the order matters.** Old builds keep working against the new
server. Their Pause and Resume now make two recordings where they made one,
which they draw as two cards. Their per-room share still reaches the room
export route, which stays. The new client needs the new server's `segments`
and the `audio` flag on the live-transcription route, so **the server deploys
first**, as always.

**Considered and not built:** a segment carrying through a pause, with pause
times stored so text could be mapped onto the joined audio; a flat log of
segments with no room rules; and *segment* as a word on screen.
