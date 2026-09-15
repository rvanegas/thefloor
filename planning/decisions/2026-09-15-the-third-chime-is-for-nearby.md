# The third chime is for nearby

`2026-09-14-the-room-says-who-came-and-went.md` built two sounds and said so
throughout — two notes rising, the same two falling, a `Bool` from JavaScript
down to `AudioServicesPlaySystemSound`. There were meant to be three. The task
file it closed asked only for "two inverse distinguishable subtle chimes", so
nothing in the repository was wrong about its own design; the third was in the
request and not in the writing, and a day later the person who made the request
said so.

**Nearby had been ringing the arrival chime.** That is the part worth recording,
because it is not the failure it looks like. It was a deliberate line in
`usePresenceChime` — a declaration from outside is an arrival, one from inside
is not — and with only two sounds available it was the better of the two
readings. With three it is simply wrong: **arriving at the edge of a room is not
arriving in it**, and the difference is the one that matters to everybody
listening, because one of those people can speak and the other cannot. A cue
that collapses them tells a room to expect a voice that is not coming, which is
worse than the silence the whole feature was built to end. The failure mode of
an inaudible cue is that nothing happens; the failure mode of a wrong one is
that everybody looks up.

**A single note, where the others are two.** Nearby is the rung between being in
the room and being out of it, so it sounds like neither direction rather than
like a third direction — no amount of rising or falling would have said *half
in*. Which single note is not settled: `chimeNotes` carries three candidates
(`nearby-a` one E5, `nearby-b` a flat A5 pair, `nearby-c` a flat pair a third
lower) and `nearby` is an alias for whichever wins. They are compared from the
audio lab, on a phone, because **a phone's speaker is the only room this sound
ever plays in** and a tone chosen on desk speakers is chosen in the wrong one.
When the ear picks, the losers are deleted along with their rows and their
buttons.

**The `Bool` became a `String` from `chime.ts` through to the Swift.** A third
direction cannot be added to a bit. The cost is that a bundle newer than its
binary now throws on the argument type instead of merely doing nothing — caught
into the same `false` an absent module returns, which is the right answer, since
build 205 and everything before it has no third sound to play. The scheduling
tests came through the change as a rename of two fixtures, which is the return
on their having been written against named constants rather than `true` and
`false`; the seventeenth is new, and asserts that a declaration rings once.

**Still nobody has heard any of this on a phone**, which is the same footing the
2026-09-14 entry closed on and it has now cost a second correction. The lab
buttons exist for exactly that, and the order they want tapping in is: idle
first, then under a configured session, then with the input capturing. **A
silence under `playAndRecord` proves nothing until a sound outside it has proved
the path works at all** — which is the mistake available here, since the
property that mutes system sounds during capture
(`setAllowHapticsDuringRecording`) and a native half that never linked produce
the identical symptom. The Swift moved, so none of it reaches a phone without a
new native build; a Metro reload will keep talking to build 205's boolean and
keep answering `false`.
