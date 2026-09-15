# The lead-in was a guess, so the lab sweeps it

*The chime was waking the speaker up* shipped 180ms of silence in front of every
chime on the strength of a mechanism nobody had measured, and it was reported as
changing nothing. This is what that cost and what replaced it.

**The reasoning was sound and the practice was not.** A cold output route really
does take time to power up, and a 180ms cue really could be swallowed by it — it
explains quiet-once, loud-twice and an unreadable peak sweep together, which is
why it was convincing. But it was fitted to three symptoms after the fact, the
ramp's length was a guess, and the guess was shipped as a constant rather than
offered to the lab as a dial. **In a repository that keeps a bench for exactly
this question, the fix went in without ever being put on it.** The audio work
here has been wrong five builds running once before, on the same move: a
mechanism read off the source, a change aimed at it, and no measurement in
between.

**So the lead is a chip row now, `0 · 0.18 · 0.35 · 0.6 · 1`, and zero is the
control.** The claim is falsifiable from the phone in four taps: at lead 0 a
cold tap should be the quiet one, at lead 0.6 the pair should match. If 0 and 1
sound alike, the ramp is not the mechanism and the lead-in comes back out
entirely. The row runs to a full second because a Bluetooth route comes up far
more slowly than a loudspeaker, and 0.18 was never chosen against either.

**The second half is `chimeInfo`, and it is the more embarrassing lesson.** When
the fix was reported as not working, the first question — is this binary even
the one with the fix in it? — could not be answered from the screen where the
symptom was. A Metro reload picks up every word of the lab and nothing of
`AudioRouteModule.swift`, so *the fix does not work* and *the fix is not in this
build* are the same symptom, and only one of them is worth a day. The renderer
now reports its own constants, and the lab prints them above the sweep. **Its
absence is the reading**: a binary without the function shows a stop sign rather
than a default, because a default would be the lab telling itself what it
assumed.

That is the rule this module was written for in the first place — `configure`
returns a snapshot rather than a success flag, because reading back the value
you asked for proves nothing. It had simply never been pointed at the chimes.
