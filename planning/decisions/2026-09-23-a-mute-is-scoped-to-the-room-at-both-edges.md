# A mute is scoped to the room at both edges

The roster could say *Stepped out · muted*, which is two states that cannot
both hold. The status word is read from presence and the ` · muted` suffix from
`selfMuted`, and the suffix has no presence guard — deliberately, because the
pair was supposed to be unreachable. `stepOut` clears the mute on every
departure, on the argument that a mute is an act inside a conversation and
carried across one it becomes a setting you come back inaudible under, with
nothing on the way in to say why.

Two faults let it through, and they compound. `canSetSelfMute` asked only
whether the actor held the floor, where its sibling `canMuteOther` had always
required its target to be `inRoom` — so a self-mute arriving after a departure
was accepted and written onto somebody who had gone. And `ENTER` wrote nothing
to `selfMuted`, so the key sat there until somebody unmuted. The comment in
`canMuteOther` claiming that such a write is harmless because "their next
step-in discards" it had never been true.

So the suffix was not a display bug. It was correctly announcing a real mute
lying in wait for the person's return — exactly the outcome the clearing on the
way out exists to prevent.

**No client could have avoided it.** The footer's mute control is already
disabled the moment you are not present. What reaches the reducer is a mute and
a departure in flight together, applied in that order, and the departure is
most often this end's own doing: the `dropped` and `inattentive` exits fire
while the app is alive and still sending.

**Fixed at the write, and cleared at both edges.** `canSetSelfMute` now carries
the same `inRoom` clause `canMuteOther` has, for the mute direction only — an
unmute from out there is a no-op against a cleared key, and refusing it would
be refusing the remedy, which is the one direction that function exists to keep
always available. `ENTER` clears the mute for a fresh arrival, which is
redundant against the guard and kept anyway: the promise is about what a person
hears themselves do on the way in, and leaving it to hold only because no other
clause happens to write the key is leaving it to hold by accident. The
already-present arm of `ENTER` is untouched, since that is what a client
re-asserts on reconnection and inside the grace period nobody has left — a mute
set a second before a flap survives it, as it already did.

**The roster was not changed.** Guarding the suffix with presence was the
obvious move and is the wrong one: it would have hidden the sentence while
leaving the mute to take effect on the next step-in. The line was telling the
truth about a state that should not exist, and the state is what went.

Tests are in `core/__tests__/floor.test.ts` § *muting yourself while out of the
room*, including the invariant stated as the roster reads it — nobody is ever
both absent and muted — and the stale write cleared on re-entry, which has to
be built by hand now that the reducer refuses to produce it.
