# The first play of a chime is not the chime

The candidate that survives the ringer result, and the one that was in plain
sight from the first report.

`chime` rendered lazily: on the first call for a given kind, amplitude and lead
it wrote a WAV to the temporary directory, called
`AudioServicesCreateSystemSoundID` on it, and played the id **in the same
breath**. That function returns a status, not a loaded sound, and the cue is
180ms long. There is no margin in it for a server still picking the file up.

**It is the only account so far that reaches all three symptoms at once.**

- *Quiet once.* The first tap is the cold one — render, write, create, play.
- *Normal twice.* The second tap finds the id cached and loaded, and plays the
  file as it is. That is the sound the samples describe, which is why it sounds
  right.
- *Five peaks that sound alike.* **The cache key includes the amplitude.** Every
  chip on the peak row is a fresh key, so sweeping the five one tap each is
  five cold first plays rather than five amplitudes. The dial was never being
  heard. This is the part the route-ramp theory could not explain and the reason
  it should not have been shipped.

**And it survives the measurements that killed the others.** The renderer was
compiled and run standalone: the file is correct and spans a real 15dB. This
says nothing about the file. The ringer was raised from its minimum to its
maximum with no change. This says nothing about the alert level.

**So rendering and loading come off the path of the tap.** `prepareChime`
renders and loads without playing; `warmChimes` calls it for the three kinds on
`usePresenceChime`'s mount, and the lab warms every kind whenever a chip moves,
which is the case that matters most there and is least visible.

**The discriminator, which costs nothing and needs no rebuild:** tap a peak
twice, move the chip away and back, then tap once. If that single tap is loud,
the key was warm and this is the mechanism. If it is quiet, it is not, and
`prepareChime` is dead weight to be removed.

**This is still a candidate.** Three have been shipped today on reasoning that
sounded complete, and two are already disproved. What distinguishes this one is
that it explains the flat sweep, which neither of the others could, and that it
has a test which does not require believing it first.

## The cost of a native signature that keeps moving

`chime` went from `(Bool)` to `(String)` to `(String, Double)` to
`(String, Double, Double)` to `(String, Double, Double, String)` in one day. An
Expo `Function` throws on argument count, the JavaScript catches it and returns
false, and **a bundle newer than the binary therefore produces exact silence** —
which is a *fourth* distinct symptom, arriving in the middle of debugging the
first three, and indistinguishable from the bug at a glance.

`chimeInfo` exists to tell those apart and is the right shape: its absence is
printed as a stop sign rather than filled in with a default. The lesson is not
to stop changing the signature but that **the readout has to be built before the
signature moves, not after the confusion it causes.**
