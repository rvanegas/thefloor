# The floor waits on the film, not on the party

`canClaimFloor` asked `watchPartyIsOn`. It asks `watchIsPlaying` now: a claim
is refused while a film is *running* and allowed while one sits paused.

## What it cost as written

A channel called *A Priori* reported that Claim had stopped working. It had —
permanently, and in that channel only. Its state:

```
party:      O4TE34kJHjo  "DISCURSO COMPLETO de JOSÉ MANUEL RESTREPO…"
status:     paused
positionMs: 1436000
durationMs: 1436000
```

The film had run to its end. `reduce`'s end-of-film clause brings a party that
reaches its length to rest **paused and loaded** rather than stopping it, so
that the evening survives being walked out of — which is right, and which
leaves `watch.party` non-null with nothing scheduled ever to clear it. Only an
explicit *Stop* or a swap does. `watchPartyIsOn` was therefore true from the
closing credits onwards, and every claim in that channel was refused from then
on.

It presented as a dead button rather than a refusal, because the floor is the
one control this codebase allows to grey without giving a reason — see the
footer's own note in `ChannelView`. So the symptom was a Claim button that did
nothing, next to a Mute button that worked.

## Why the wider rule was wrong, and not merely unlucky

The 2026-09-18 argument was that a claim is a demand that the room be quiet,
and a party already makes that demand through a control that belongs to the
film. That is true of `partyWithholds` — but `partyWithholds` is
`mutedAll && status === 'playing'`, keyed on the **run**, deliberately, so that
pausing to talk about what you are watching needs no second tap.

So over a paused film the party was withholding nobody's microphone *and* the
floor was refused. The room could be quieted neither by the film nor by anybody
in it, which is the one arrangement the exclusivity was never meant to produce.
The end-of-film case made that state permanent; it was reachable on any pause.

The predicate was doing duty for three rules that were never the same rule. The
track left on 2026-09-20 — two things loaded is somebody lining the next one
up, and only two things *playing* is the failure. The floor leaves now, on the
same seam. `watchPartyIsOn` keeps the one rule that really is about the mode:
no recording while a party is loaded, because a recording beside one is missing
what everybody is reacting to, between scenes as much as during.

## What this makes reachable, and why nothing else had to change

A claim over a paused film, and then somebody pressing Play under it. That is
allowed, and the answer was already written down: `isWithheld` puts the party
mute ahead of the floor, **holder included**, that being the point of muting a
room rather than taking the floor in it. The claim goes quiet while the film
runs and is audible again on the pause — the same bargain everybody else is on.
`canControlWatch` is untouched: whoever is in the room may drive.

## What did have to change

The watch card's explanation ladder had two branches for the floor which were
unreachable while no claim could be made over a film, and which said the
*Listen* card's sentence: "**X** has the floor, so they decide what plays."
That is false on this card. The floor governs `mayStartWatch` — *Change video*
— and not the transport, which `canControlWatch` leaves to the room. The live
Stop button beside that sentence was the tell, and the existing test asserting
the branch was unreachable is what caught it.

Two strings replace them, in both locales: the claim takes changing the film,
and anyone here can still drive it.

## What was considered and not done

**Stopping the party at the end of the film** instead — `stopParty` rather than
`watchPause` in the end-of-film clause. It fixes the reported channel and is
arguably right on its own terms, since every reason the pause exists is spent
by the last frame. It was not chosen because it treats the symptom: a claim was
refused over *any* paused film, and a film is paused far more often in the
middle than at the end. Worth revisiting on its own merits; it is not a fix for
this.

**Saying why the floor is refused**, rather than changing when. The floor's
silent grey is a documented bend in the rule that no control greys without a
reason. That remains open, and it would not have prevented this — it would only
have made it legible.
