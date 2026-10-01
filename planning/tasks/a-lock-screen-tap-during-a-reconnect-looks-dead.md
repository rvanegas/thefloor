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

**Whether locking started the reconnect is not yet read, but probably is
recorded.** `room reconnecting` preceded the tap, so the tap did not cause
it. The finding above said the transition to the background carries no
timestamp; **that was wrong** (corrected 2026-09-30). `AppState` changes are
logged permanently, not by the removed temporary lines — `app <state>` in
`audio/diagnostics.ts`, the source of the `app active` line in the excerpt —
and ship to the journal with everything else. The excerpt was trimmed. **The excerpt's times are UTC**: the run was 03:27 Pacific, on
`acct_sudUOdevBXfN`, and `bin/diagnostics`, which prints the phone's stamps
in local time, finds it there and not at 10:27. The same morning holds more
than the excerpt — two `room reconnecting` at 03:12 with no tap, a Mute and
Unmute at 03:28:17, and three taps at 03:47 with no reconnect near them,
which are the comparison: taps on a healthy connection. So
`bin/diagnostics --since "2026-09-30 03:26" --until "2026-09-30 03:30"
--account acct_sudUOdevBXfN` may answer it from the existing run: an `app
background` or `app inactive` line just before 03:27:44.364 says locking
started the reconnect.

**Read back 2026-09-30, and two things are settled.** **Locking did not start
the reconnect**: the lock is `app inactive` at 03:03:35, twenty-four minutes
earlier. **And the lock screen is not slow**: on a live connection a tap
reaches `muted CALL` and a moved card in about 60ms, both ways — 03:28:17 and
03:47:25. So the nine seconds is the reconnect and nothing else; the card
moved at 03:27:53.197 with the re-entry, 190ms before the unlock, so the unlock
did not move it either.

**What probably started it is the tap itself**, waking a suspended app. Nothing
logged `app background` after the 03:03 lock, though the tap at 03:27:44 found
the app in the background — a transition JavaScript was not running to
record. And the tap's native half runs first, so `room reconnecting` 47ms
before the JavaScript line is that wake, not evidence against it. Likely, not
proven: it was not alone in the room, having resubscribed to one track at
03:12:09, so the quiet-room suspension `bin/suspend-log` measured does not
explain it.

**If so, the tap was queued, and it was close.** A socket asleep for a quarter
of an hour is closed; the re-entry at 03:27:53.17 is 8.8s after the tap,
against `OFFLINE_AFTER_MS` of 10s. A slightly slower reconnect discards the
tap silently and the card never moves — the worse case above, nearly met.

**Instrumented 2026-09-30, awaiting a run.** Temporary lines, all marked
TEMPORARY and to go with the fix: `traceSocket` in `api/socket.ts` records the
control socket connecting, opening (with how many actions were queued),
closing, suspending, resuming and going offline (with how many were dropped),
and a `SET_SELF_MUTE` as `sent` or `queued` with the delay to the snapshot
that answers it; `useLockScreen.ts` records the tap and each card change again.

**Next:** on a debug account, in a channel, lock the phone and leave it long
enough to be suspended — a quarter of an hour did it — then tap Mute, and read
it back with `bin/diagnostics`. `socket connecting` straight after the `lock
tap`, then `socket queued SET_SELF_MUTE`, confirms the wake and the queue;
`socket sent` with a long `snapshot … after the send` would mean the server's
answer was what waited instead.
