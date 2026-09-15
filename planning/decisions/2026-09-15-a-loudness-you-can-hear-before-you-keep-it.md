# 2026-09-15 — A loudness you can hear before you keep it

Tapping a rung of *How loud the channel chimes are* now sounds the arrival
chime at that peak. Before this, Floor Settings offered five words —
*Quietest*, *Quiet*, *Middle*, *Loud*, *Loudest* — and no way to find out what
any of them meant except to pick one and wait for somebody else to walk into a
channel. The words are a ladder, and a ladder nobody can hear is five synonyms.

**The arrival chime rather than a sound made for the screen.** An example that
is not the thing it is an example of teaches the wrong loudness, and the app
already has exactly the sound in question. Arrival rather than departure or
nearby because it is the one every listener meets first, and the three are the
same file at the same peak in any case.

**Warmed at the chosen peak before it plays**, which is the one part of this
that is not obvious. The native renderer caches a sound per peak, so the first
play at a rung nobody has chosen before renders as it plays — the *quiet once,
normal twice* shape `warmChimes` exists for, landing on exactly the tap whose
whole job is to be listened to. `usePresenceChime` warms at the new peak too,
but its effect runs after the render this tap causes, and so after the sound.
See `warmChimes` in `app/src/audio/chime.ts`.

**It plays at the peak just tapped, not at `app.chimeAmplitude`.** The provider
write is behind the tap and the state has not moved yet; reading it would play
the previous rung, which is the failure that would look like the feature
working.

The muted copy says what the tap does, on the ordinary grounds that a control
which makes a noise should say it will. The phone still has the last word — the
ringer, the silent switch and the route are all above this — and the paragraph
that already said so is unchanged.
