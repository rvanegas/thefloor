# How loud the chime is belongs to the listener

2026-09-15. The chime shipped at one peak, 0.18, chosen for *subtle* and then
reported from a phone as too quiet to notice. The audio lab was built to answer
that by ear: five peaks, geometric, `0.18 0.35 0.5 0.7 1`, swept on a phone
through both the alert path and the media path. **The sweep answered the
question it was asked and not the one underneath it** — the file's loudness does
span a real 15dB, and a phone heard all five as much the same, which is a
finding about `AudioServicesPlaySystemSound` and the alert level rather than
about the samples.

So the lab's row is now a setting: *Sounds → How loud the channel chimes are*
on Floor Settings, the same five values, quietest first, with words on the
buttons instead of peaks.

**The five are `CHIME_AMPLITUDES` in core/settings.ts, and that is the whole of
why they moved out of the lab.** A setting has an end that refuses things —
`POST /me/settings` takes one of the five and 400s anything else — and core is
where both ends read the same list. `PEAKS` in `AudioLabView` now reads it, so
the values somebody can choose from and the values that were listened to are
one list by construction. The words on the buttons are typed as a
`Record<(typeof CHIME_AMPLITUDES)[number], string>`, which fails to compile
when a rung is added without one.

**An account setting, not a phone one**, on the reasoning core/settings.ts
already carries for the tap and the scheme: how loud you want to be told
somebody arrived is a thing a person decided, not a property of the handset
they decided it on. A `REAL` column, `accounts.chime_amplitude`, null until
somebody chooses — the only settings column that is not a flag — read back
through `isChimeAmplitude` so a peak retired from the ladder reads as the
default rather than reaching a phone, which is `appearance`'s treatment of an
unknown scheme.

**The peak is passed, not read.** `usePresenceChime` takes it as an argument
and `App` passes `app.chimeAmplitude`; presence is above every screen and has
no business importing the provider. It both warms and plays at that number,
because the native renderer's cache is keyed on the peak — a chime warmed at
one and played at another is the cold first sound that
*the first play of a chime is not the chime* was about, arriving only for
somebody who has just moved the setting.

**Nothing new is needed on an old binary.** `chime`'s call already negotiates
its argument count down — `playFirstAccepted` — so a phone whose binary
predates the amplitude argument plays at its baked-in 0.18 instead of going
silent. That is the honest degradation: the setting appears to have no effect
there until the app updates, and no shim was added for it.

**What the card admits, because the lab measured it**: this is the loudness of
the file and not of the phone. The alert path takes no gain, so the ringer, the
silent switch and the output route can each make the distance between two rungs
smaller than the buttons suggest. A control that promised more than that would
be worse than no control — and if all five still sound the same on a phone, the
next move is the path or the ringer, which is what the lab's readout is for.

The default did not move: quietest is what every build before this played at,
and it is written down three times — core, `app/modules/audio-route/index.ts`,
and `AudioRouteModule.swift`. `app/src/audio/__tests__/chimeAmplitude.test.ts`
pins the two that jest can reach.

The web twin honours it too, where it is a real gain rather than rendered
samples, and gained the `warmChimes` no-op it had been missing — the hook calls
it on mount, and a browser was throwing at that call.

See GLOSSARY.md § *Chime*, STYLE.md § *Button* for why five rungs go down the
page rather than across it, and
`decisions/2026-09-14-the-room-says-who-came-and-went.md` for the cue itself.
