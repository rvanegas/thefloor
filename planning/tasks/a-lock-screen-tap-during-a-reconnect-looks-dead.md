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
