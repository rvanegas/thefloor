# Nobody has heard the `IDLE` → `LISTENING` edge on a device

Shipped 2026-08-16 with the "Other Audio Output" work, and this is the one part
of it that reasoning cannot settle. The session becomes exclusive by dropping
`mixWithOthers`, which reliably interrupts another app *when the session is
activated*. That edge does not activate anything: it changes category options
on a session that is already active, because a track arrived. iOS does not
document whether that interrupts.

So the thing to listen for is music playing on through somebody starting to
talk — while an empty channel still leaves it alone, which is the half that is
certainly right. **The fallback is written down and deliberately not adopted
yet**: bracket that one edge with `stopAudioSession()` then
`startAudioSession()`, which costs a brief gap in playout and is safe there
because the microphone is closed. See `decisions/`, "The audio
session has three states".

Also unconfirmed on hardware, and cheap to check at the same time: that a
Bluetooth route survives the microphone opening and closing, which is the
ground `POSTMORTEM-echo.md` was fought on.

**Half answered on 2026-08-24, and the half that came back is the less
interesting one.** A build 87 reading taken across this exact edge — alone in a
channel, the shared track arriving — shows `asked` and `actual` in agreement at
`playback/spokenAudio`, so the write itself lands on an already-active session.
What it says nothing about is the question this entry asks, because *no other
app was playing*: `other playing F`. So whether dropping `mixWithOthers` here
interrupts anybody is still open, and still needs a podcast running.

What the same reading did find is the entry below: the engine was **stopped**
underneath that correctly-configured session. Build 88 was sent to find out
whether this edge was what stopped it. **It is not** — the write is followed by
an engine stop in none of the four places it occurs, which is the one thing this
entry can now be sure of. The fallback above stays a fallback, and stays
unadopted, and the question it was written for — whether dropping
`mixWithOthers` here interrupts another app — is still open and still needs a
podcast running.
