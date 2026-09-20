# Watching is something you are in

Every control on the *Watch* card now asks presence. `canControlWatch` was
`state.status === 'active' && isParticipant && hasTheRoom`; it is
`… && isPresent` instead, and since the reducer guards all five watch actions
through it — play, pause, seek, the room's mute, stop — one edit moves the
greying and the refusal together.

**Reported as a defect rather than argued from the design**, and the design is
what made it one. `hasTheRoom` is true when nobody is present, so a member
merely *looking at* a channel — the channel screen is reachable without
stepping in — could scrub, pause and stop a film the moment the room happened
to be empty, and could hold the transport live while the card's own *Watch on*
switch beside it was refused for being out of the room. Two controls inches
apart, disagreeing about whether this person is in the conversation.

## What the old rule was for, and why it does not survive contact here

The seam adopted on 2026-08-24 was *starting is for whoever is in the room,
driving is for whoever the room belongs to*, on the reasoning that an absent
member stopping something left running on an empty channel is tidying up rather
than interrupting. That still describes the audio player, which this no longer
matches — a loaded track sits waiting and nobody is looking at it.

It does not describe a film. Driving a party is moving a picture other people
are watching in real time, on their own screens, mid-sentence. The act the
rule was written to permit is not one that exists here.

And the empty-channel case it was reachable through is empty of content too.
`settleEmpty` pauses the party as the last member steps out — *a film running
itself out for nobody is not shared watching* — so the film an absent member
would be tidying up after has already stopped itself. What is left to clear is
a paused party, and clearing it costs one tap on Step In, into a channel that
by hypothesis has nobody in it to interrupt. The exception bought no
reachability; it only left the transport live for somebody outside.

## What it costs

One sentence of prose, and the loss of a symmetry. The card's chain of reasons
now leads with presence for a party as well as for starting one — *Step in to
drive the film. What everybody is watching is for whoever is here.* — where it
used to have to explain a live Stop beside a greyed *Change video*, which is
the two-live-two-greyed arrangement STYLE.md calls a bug-shaped control.
`mayWatchHere` went with it, having had no control left to govern.

The symmetry is the real price: `canControlWatch` and `canControlPlayback` were
one rule written twice and are now two rules, which is a thing to get wrong
later. STATES.md § *Occupation* carries the divergence, and `core/__tests__/
watch.test.ts` asserts it from both sides in one describe block — the party
refusing an absent member both halves, playback still allowing the driving one.

## Not done

Nothing about the audio player. Its transport still asks `hasTheRoom`, on the
unchanged reasoning above, and a case for moving it would have to be made about
tracks rather than inherited from this.
