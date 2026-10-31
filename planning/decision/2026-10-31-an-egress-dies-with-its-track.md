# An egress dies with its track, and the roster is how we notice

Built 2026-10-31. Rodrigo's report: the latest recording in *Artificial
Intelligence* (`rec_aHfqLipF1e-W`, 30 October, 107 minutes) "appears to have
failed to mix the two stems. I can hear Rodrigo, but not Golf."

**The mix was fine; there was nothing of Golf's to mix.** Golf's stem was
7.7 seconds of digital silence. Eight seconds into the run Golf's phone (the
web app, on iOS) lost its peer connection; LiveKit closed the participant and
the track egress ended itself — `End reason: Source closed`. Golf was back
nine seconds later with a new track and published for the rest of the
session. The server never asked for a second egress, so no stem existed for
the other 107 minutes and the audio cannot be recovered.

**Why nothing asked.** `ensureEgress` skips anybody in `run.requested`, and
the only thing that cleared that was leaving `present` — which a nine-second
drop never does, being well inside DISCONNECT_GRACE_MS. So any reconnect
inside the grace, or anything else that replaces a track (a republish after
an unpublishing mute, an audio-session promotion), silently ended that
person's part of the recording. The leaving path's own comment said as much:
"their egress dies with the unpublished track either way".

**The fix compares each egress's track with the roster `meterRoom` already
fetches.** `startRecording` now returns the track id it pointed the egress at
alongside the handle. Every usage poll (15 s), `restartEndedEgress` drops any
handle whose track is no longer in the room, and hands the person back to
`ensureEgress`, which starts the next segment (`-002`, at its offset) on the
following tick — or retries, as for a late joiner, if there is no track yet.
The loss shrinks from the rest of the run to the reconnect plus at most one
poll.

**Not taken:**

- **Asking LiveKit for egress status** (`listEgress`) each tick. A new call
  per recording channel per second, to learn something the roster already
  tells us; and it would answer *whether* the egress ran, not *why*, where
  the track is the cause.
- **LiveKit's `egress_ended` / `track_published` webhooks.** Faster, but a
  second, push-shaped source of truth beside the poll that already decides
  presence, and an endpoint to secure, for a gap of seconds.

**Two details that look like tidying and are not.** Nothing is stopped: the
egress has already ended, and stopping a finished one is an error LiveKit
reports. And a handle started after the roster was asked for is not judged,
since its track can be newer than the roster and it would be torn down the
moment it began — so each handle carries when its track was read.

Not covered: an egress that dies for its own reasons while the track lives
on. None has been seen, and catching it is the `listEgress` call above.
