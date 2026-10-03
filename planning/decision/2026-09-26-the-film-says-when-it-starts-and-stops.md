# The film says when it starts and stops

Two chimes, the fifth and sixth kinds: a falling octave (A5 A4) when a watch
party's film starts playing, a rising one (A4 A5) when it stops.

## What they announce is the room's voice, not the film

This is the whole of the design and every other choice follows from it. A
running film shuts every microphone in the channel — the run is enforced-muted
for its length, `isScreening` in core/micNeeded.ts — so what a person not
looking at a screen experiences when somebody presses Play is the conversation
stopping. Nothing said why.

**The pocket case is ordinary rather than an edge**, which is what makes this
worth a sound rather than a label. A stepped-in phone goes on running while the
app is backgrounded, because the call keeps it alive; the room falls silent in
somebody's hand and no notification is sent when a party begins. That gap was
named in 2026-09-26-a-blank-suffix-was-two-answers.md § *What was not done*, and
this is the installment on it that does not require inventing a notification.

So *play* falls and *pause* rises, which is **the direction `out` and `in`
already mean**: the room's voice leaves when the film starts and arrives when it
stops. Somebody reading the table will want to correct this to rising-for-play,
because that is the direction a transport suggests. The transport is not what is
being announced.

## A4 is what makes them distinguishable, and it is a new note

Every kind before these lived between C#5 and A5. A fifth sound in that band is
heard as a variation on the four already there — which is not a theory but the
thing that happened once already: `nearby` rang the arrival chime and *stepped
in* and *stepped to nearby* were the same event to every ear in the room, per
2026-09-15.

A note an octave under the lot of them is not a variation. A5-against-A4 is also
the widest interval the table draws, against the fourth `in` and `out` span, so
the two pairs stay apart through a phone's speaker at the far end of a room.

**Not yet judged by ear on a phone**, which is the honest state of it: the
interval is reasoned, and this file's own history says reasoning about these
sounds is worth less than one listen. `AudioLabView` has a button for each, and
the thing to listen for is whether the octave holds them off `in` and `out`.

## Two sounds over three states

A film is `idle`, `paused` or `playing`, and only the third takes anything from
anybody. So every edge into `playing` rings the first sound and every edge out
of it rings the second. A link merely pasted is silent, a party being loaded
paused; so is a paused party being stopped.

**A stop and a film reaching its end therefore sound like a pause**, and that is
a decision rather than an omission. What the sound says is *the room has its
voices back*, which is equally true of all three ways out of a run. A listener
who cannot see the screen has no use for the difference between a film that was
stopped and one that ran out, and would have to be taught a third cue to learn
something they did not ask.

## Everybody hears them, and what that costs

`useRecordingChime`'s rule rather than the presence chimes': the sound is not
feedback for whoever pressed the button but the moment at which the room was
told, and a notice one party is exempt from is a weaker thing to have given.

**It costs a chime over the first moment of the film for whoever is watching
it**, and unlike a recording — which begins once — a party is played and paused
repeatedly, because pausing is how the room talks about what it is watching. So
this is the real price and it is accepted rather than unnoticed.

The obvious mitigation is to withhold the cue from a device that can see the
picture. **It does not work, and the reason is worth writing down**: the one
device that answers *can you see the picture* wrongly is the backgrounded phone.
It holds the screen role — `screenFor` survives the trip, deliberately — while
iOS has suspended its WebView, so gating on the role would silence the cue for
precisely the person it exists for. Gating on the role *and* the app being in
front would work and is a second reader of the state that
2026-09-26-a-blank-suffix-was-two-answers.md has just finished making one
reconciler for. Left alone until an ear says the noise is real.

## An older install plays nothing, and that is the designed behaviour

The notes are a native table. `chimeNotes` in `AudioRouteModule.swift` returns
false for a kind it does not know, so a bundle newer than its binary asks for
`play` and gets silence rather than a wrong sound — the rule that has governed
`ChimeKind` since it existed. No shim and no register entry: there is nothing to
retire, only a build to wait for.

The web twin carries the same two rows, with A4 at the same frequency, on the
standing rule that the same event must not sound like a different one depending
on which screen somebody is at.
