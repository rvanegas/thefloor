# Websocket Lost

**The websocket half is answered and acted on — 2026-08-27.** The timeline,
what was wrong with it and what was changed are in
`decisions/` § *Talking into a void, which had three causes and one
of them was politeness*; the states themselves are in STATES.md §
*Claimed Floor* and § *Audio Connected*. Worst case from a phone going quiet to
the room being told is now ~17s rather than ~47s, a claim is released as soon as
a drop is noticed rather than a minute later, and the roster warns from the
media plane before the websocket can know anything.

**What is left is the phone call**, which is the half this entry asks about
that nothing has measured. There is no `AVAudioSession.interruptionNotification`
observer anywhere in the app — only a route-change one, in
`AudioRouteModule.swift` — and no CallKit integration, so an incoming call is an
ordinary interruption handled entirely by `RTCAudioSession` inside the WebRTC
layer. Answering it backgrounds the app, which suspends it despite the `audio`
background mode because the interruption means it is no longer playing anything,
and the whole websocket timeline above then runs. The one recorded sighting is a
*Telegram* VoIP call on 2026-08-18 that left the room dead until a force-quit
(STATES.md § *Audio Connected*); the specific hole it found was fixed, and a
real cellular call has still never been tried. Measure before writing code, the
same order § *The Foreground Interruption* asks for and for the same reasons.

**The suspension half of that paragraph is now measured, and half-fixed —
2026-09-05.** It said the app suspends "because the interruption means it is no
longer playing anything". That mechanism is real and does not need a phone call
to fire: a phone locked for five minutes while standing *alone in an empty
channel* came back `drops 2 (recovered 0, expired 2)`. Nothing recovered, so
the process was gone rather than quiet. `modules/keep-alive` now plays silence
for as long as the session is `IDLE`, which removes that entrance.

**It does not close this entry, and the reason is the same sentence.** An
interruption stops an `AVAudioPlayer` and nothing restarts it, so a real
cellular call still suspends the app exactly as before — the keep-alive is one
of the things the call would interrupt. There is still no
`AVAudioSession.interruptionNotification` observer anywhere in the app, and an
observer that restarted the silence after an interruption ended is the obvious
next move but is unmeasured. **Measure the cellular call first**, which has
still never been tried.

**And the grace period is now measurable rather than argued.** `/healthz`
carries `drops`, `dropsRecovered` and `dropsExpired`, printed by `bin/health`.
`DISCONNECT_GRACE_MS` was deliberately left at a minute — read those counts off
a box that has been up a while before proposing a change to it, and read the
constant's own comment for what it is load-bearing for beyond a dot on a roster.
