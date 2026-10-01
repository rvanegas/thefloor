# A Lock Screen Tap During A Reconnect Looks Dead

A Mute tap from the lock screen reaches JavaScript at once, but when the room
is reconnecting the card does not change until the room is back — nine seconds
on build 320, 2026-09-30. From the diagnostics:

    10:27:44.364 room reconnecting
    10:27:44.411 lock tap muted=true card=canToggle=true input=true app=background
    10:27:46.876 lock tap muted=true card=canToggle=true input=true app=background
    10:27:53.197 lock card muted=true …
    10:27:53.385 app active

A button that does nothing visible gets tapped again, and then the phone gets
unlocked to go and look — which is plausibly how this was first reported as
"unmuting asks for a passcode". That task was closed once a locked phone was
seen unmuting without one. Find out why the card waits for the reconnect —
whether the tap is queued behind the socket and the card only follows a
snapshot — and whether it can show what was asked for in the meantime without
claiming a microphone state the room does not have yet. Also worth knowing
whether locking the phone is what started the reconnect, since the tap and
`room reconnecting` landed 47ms apart.

## Findings, 2026-09-30, from reading the code

The `lock tap`, `lock card` and `app active` lines were temporary logging that
`8f345118` removed; only `room reconnecting` is still recorded.

**The card follows the snapshot, and nothing local records the tap.**
`lockScreenStateFor` derives `muted` from `channel.selfMuted[me]`, and the tap
becomes `app.act(SET_SELF_MUTE)` with no state written first, so the card
moves only when the server's echo does. **So does the microphone**:
`App.tsx` hands the audio layer `live.selfMuted[me]`, so a Mute from the lock
screen does not close the mic until the round trip completes either.

**Queued or merely unanswered is undecidable from this log.** If the control
socket was down, `Realtime.send` queued the action and `flushQueued` sent it
on reopen; if it was up, the send went out at once and only the reply waited.
Nine seconds fits both. The diagnostics record nothing about the control
socket — `room reconnecting` is the media room — which is the missing fact.
`act` calls `reconnectNow()`, so the second tap should have hurried a stalled
socket along.

**A worse case than the reported one:** the queue is discarded at
`OFFLINE_AFTER_MS` (10s). A tap during a longer outage is lost silently and the
card never moves at all.

**Showing the request without claiming a state is possible.** The payload
already separates `micLabel` from `micState`: keep `micState` on the
snapshot's answer and change the button to an asked wording ("Muting…"), or
just grey `canToggle` while one is outstanding, which also stops the second
tap. Either needs a local pending mark in the shape of `recordingAsked`, cleared
by the next snapshot or by `goOffline` discarding the queue, so a lost tap
does not leave "Muting…" up for ever. Worth deciding alongside it whether a
Mute should close the local track at once — the one direction that can never
claim a microphone is open when it is not. Read STATES.md first; it treats the
duplicated mute as load-bearing.

**Whether locking started the reconnect is undecidable too.** `room
reconnecting` preceded the tap, so the tap did not cause it; but the phone
was already `app=background`, and the log carries no timestamp for the
transition, the logging that printed it having been removed.

**Next:** temporary logging of the control socket's open and close and of
`AppState` changes, then a reproduction. That answers both open questions
before anything is built.
