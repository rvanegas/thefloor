# The Foreground Interruption

OPEN, reproducible, and the measurement comes before any code

**Seen once on build 65 and withdrawn within the hour when a retry missed it;
reproduced on build 72 on 2026-08-21 with a recipe.** Everybody present
self-muted, background the app, start another app's audio, foreground this one
— and the other app's audio is suspended.

**It is a fault, and the first reading of it was that it is not.** The reading
was that self-mute keeps the session a call, so an exclusive session is what a
muted channel should have. `anyMicrophoneOpen` in `core/micNeeded.ts` says the
opposite, in exactly the case it was written for: it excludes self-muted people
by construction, so *everybody* muted means `anyMicOpen` is false, and
`sessionFor(false, 0)` is `IDLE` — `playback` with `mixWithOthers`. The music
is supposed to keep playing. What one person's self-mute keeps a call is 
everybody else's session while somebody else's microphone is still open; when
no microphone is open there is nothing to be exclusive for, and `IDLE` exists
precisely so that a quiet channel costs another app's audio nothing.

Alone in a channel is the same case as far as the session goes — also
`sessionFor(false, 0)`, also `IDLE`, also supposed to mix — which is why the
build 65 sighting and this one are one bug.

**The leading candidate, and a comment that is now known false.**
`app/src/audio/session.ts` hands the native observer `recording: CALL`
unconditionally, justified like this: *the observer reads it only while this
device is capturing, and our capturing implies `anyMicOpen`*. Self-mute
falsifies the implication. `intentFor` returns `muted`, which holds the device
open on purpose — `applyFor`'s own header says the engine never leaves the
recording state — while `anyMicrophoneOpen` excludes the self-muted. So the
engine can report recording while `anyMicOpen` is false, which is precisely the
input on which the observer would apply `CALL` over the `IDLE` we asked for.
That is not a stale comment on the side; it is the argument licensing the
unconditional value. STATES.md carries it as disagreement 11.

**Two other candidates survive the same evidence**, and the foreground is where
they part. A backgrounded app loses presence in about sixty seconds — it was a
hundred until 2026-08-27, when the sweep stopped waiting out a close frame,
the silence budget came down and the grace period began running from the last
ping rather than from noticing — so
depending on how long the other app played, foregrounding may be rebuilding the
room rather than resuming one — and a rebuild calls `startAudioSession`. Either
WebRTC re-applying its own defaults, the third writer of the process-wide
configuration, or the activation itself could be what interrupts, with the
observer innocent. **Activation is not configuration**, and this symptom
appears at an activation.

**Measure before touching code, which is the whole of what this entry asks.**
Set `accounts.debug`, open the diagnostic panel, run the recipe, and read the
`asked` and `actual` lines at the moment the app foregrounds — the log stamps
it `app active`. `actual` reading `playAndRecord` against an `asked` of `IDLE`
settles it outright, and *when* the two part settles which of the three
candidates it is. Note whether the connection actually dropped while
backgrounded, since that is what separates a rebuild from a resume. The
self-mute investigation spent four fixes and six builds reasoning from source
before one measurement; this subsystem has earned the opposite order.

**And do not "fix" it by pinning the session.** `core/micNeeded.ts` names both
of the cleanups that will suggest themselves — pin `CALL` on, or debounce the
transition — and says both delete the audible mono/stereo cue, which is
designed behaviour and is STATES.md disagreement 4. The bug is between what is
asked and what the system ends up in, not in what is asked.

**One thing to settle on the way past.** `SessionAudio.mutedByServer` is
written from `RoomEvent.TrackMuted` and read by nothing, and since the floor
withholds subscriptions rather than muting the publication, it is not clear it
can ever be true. STATES.md disagreement 1 is where the answer belongs.
