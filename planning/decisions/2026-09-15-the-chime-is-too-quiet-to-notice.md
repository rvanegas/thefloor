# The chime is too quiet to notice, so the peak became an argument

The third chime landed the same day and was heard on a phone within hours, which
is the whole point of having built the lab buttons. The verdict was not *wrong
sound* and not *no sound*: it was **audible, and easy to miss**. A presence cue
that has to be listened for is a cue nobody uses.

**0.18 was chosen for *subtle*, which is in the request, and subtle is the easy
half to overshoot.** It was a guess made on a desk against no speaker at all —
the one room the sound never plays in. So it is no longer a constant to be
guessed again: `chime` takes a peak, `chimeNotes` renders at it, and the lab
sweeps five of them. When an ear has picked a number, `chimeAmplitude` in the
Swift is the single line that changes and the sweep goes with the `nearby-*`
candidates.

**The peak is the only volume control there is**, which is worth writing down
because it looks like an omission. `AudioServicesPlaySystemSound` takes no gain
and obeys no per-app volume — it plays the file at whatever level the route is
already at. That is the price of the delivery mechanism chosen on 2026-09-14,
and the reasoning for it has not changed: a system sound starts no engine and
writes no `AVAudioSession`, where every player available to JavaScript does
both, next to a live voice session this app has spent six builds defending.
Louder means louder samples. There is no other lever on this side of the
speaker.

Geometric steps — 0.18, 0.35, 0.5, 0.7, 1 — because loudness is. An even sweep
would spend three of five rows on a difference no ear can resolve. 1 is full
scale for a sine; if that is still faint, the fault is not the file, and the two
things it can be are below.

## The second lever was in the header, and it was set wrongly

`kAudioServicesPropertyIsUISound` defaults to 1, and AudioServices.h is explicit
about what that means: the sound "will respect the 'Play user interface sounds
effects' check box … and be silent when the user turns off UI sounds". Set to 0
and it "always be[s] heard … regardless of user's setting".

**A presence chime is not a keyboard click.** It is the app answering a question
somebody deliberately asked — who just came in — and a cue that vanishes because
of a preference nobody associates with this app is, from the inside,
indistinguishable from a broken one. This app has already paid for that exact
confusion once, in the build where haptics were allowed and then discarded by a
capturing session with no error anywhere. Every chime is now registered with the
property off.

It is a candidate for *quiet* as well as for *absent*: a UI-class sound is
levelled by the system rather than by the media volume.

## Where it goes is now read at the moment it plays

The other candidate explanation, and the one that no amount of peak would fix:
**`Receiver` is the earpiece**, and it is where `playAndRecord` sends output
when `defaultToSpeaker` is not set. Inches from an eardrum, quiet by design, and
a chime coming out of it is faint for a reason that has nothing to do with the
file.

So the lab reads the route back **at the tap** rather than rendering whatever
the last `configure` call returned — between those two the route can move, and a
reading not taken at the sound is not evidence about the sound. It names the
verdict in two words, `loudspeaker` or `earpiece`, and says so in red when it is
the second. The shipping session sets `defaultToSpeaker`, so the expected answer
in a channel is the loudspeaker; the lab is where that stops being an
expectation.

## And they are their own section

They were five buttons inside `Run`, under the same heading as `Apply` and
`Release`, which read as five more steps of the mixing sweep. They are a
separate experiment that merely wants a session underneath it. Now: their own
heading below the readout, their own dial, their own verdict panel, and their
own three-step instruction — idle, configured, capturing — which is the order
that makes a silence mean something.

`played` in that panel is the native return and is deliberately not called
*heard*. It says the file was handed to the system sound server; a phone with
the ringer down answers true and makes no noise. False is the narrow and useful
one: the binary is older than the bundle, which during development is a Metro
reload against an unbuilt native half — and every build up to and including 206
is that, the argument count having changed again.
