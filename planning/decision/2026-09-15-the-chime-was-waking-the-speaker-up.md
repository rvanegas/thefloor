# The chime was waking the speaker up

Reported from the audio lab: a single tap on a chime control was barely
audible, a double tap was normal volume, and the five peaks in the sweep were
hardly distinguishable from one another. Three symptoms, one mechanism.

`AudioServicesPlaySystemSound` on an idle route makes iOS power the output path
up before anything is heard, and that ramp runs on the order of a hundred
milliseconds. The chime was two 90ms notes — 180ms in total, at full amplitude
five milliseconds in. So a cold tap spent most of its length on an amplifier
coming up, and a second tap landed while the route was still live from the
first and played the file at the level it actually has. That is the whole of
*quiet once, loud twice*.

**It is also why the peak dial looked broken, which is the more expensive half.**
When the ramp shapes most of a short sound, an ear comparing two peaks is
comparing ramps. 0.18 and full scale arrive nearly identical, and a sweep run
over a cold route measures the route rather than the samples. The peak became an
argument that morning precisely so the quietness could be dialled out by ear;
the dial was working and the instrument was not.

**The fix is 180ms of silence in front of every chime**, rendered into the WAV
like everything else about these sounds. The route wakes up on the silence. It
is deliberately longer than the ramp rather than tuned to it — the ramp is not a
published number and varies by route, and being generous is free here where
being exact is not. The cost is that the cue arrives a sixth of a second later,
which is well under the time it takes to notice somebody has walked in.

**Nothing about the notes changed.** The evidence that 180ms of notes is loud
enough, once it is heard at all, is the double tap: that is the file played into
a live route, and it was described as normal. Whether 0.18 is the right peak is
now a question the lab can actually answer.

The lab gained a control step for it, ahead of the three it already had: tap
once, wait, tap again, and the two should match. If they ever do not, the sweep
below is measuring the ramp again and nothing it reports means anything.

**This was reported as changing nothing, the same day.** The mechanism above was
fitted to the symptoms rather than measured, and the length of the lead was a
guess shipped as a constant. See
*2026-09-15-the-lead-in-was-a-guess-so-the-lab-sweeps-it.md*, where it becomes a
dial with zero as its control, and where the question of whether the binary
under test even contained this is given a readout of its own.
