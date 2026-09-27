# Whether releasing the microphone buys stereo on a headset is unmeasured

**Every reading in the three-week argument about the film's audio is
`route Speaker(Speaker)`**, and on the loudspeaker it is 48kHz either way — what
is lost under a voice mode there is only the voice processing. The whole benefit
the design is named for is on a route nobody has ever measured it on.

So the open question is the one that says whether the shipped arrangement earns
what it does: with a Bluetooth headset, does a screening device releasing its
microphone actually move the route from the mono hands-free profile to A2DP, and
what is the sample rate either side? `routeSnapshot` in
app/modules/audio-route reports both and `route` lines in the diagnostic log
carry them — `sr=16000` against `sr=48000` is the whole of the answer, and
`BluetoothHFP(…)` against `BluetoothA2DP(…)` is the same answer in the other
field.

**Needs two devices and a headset, and is the one item from that work that
cannot be run alone.** The rest of it was settled on one phone with a browser
standing in for the second member.

Not urgent, and what it is worth is knowing rather than fixing: the design ships
either way. But **it is the measurement that would have stopped three weeks of
work if it had come first** — if the release buys nothing audible on the route
people actually wear, then `microphoneNeeded` subtracting the film is a cost paid
for nothing, and the exception could go. See
decisions/2026-09-26-the-film-keeps-its-stereo.md for what that exception is, and
decisions/2026-09-27-the-teardown-was-never-on-the-critical-path.md for the
premise that has already fallen.
