# Under debug, the player follows presses only

Extends *Under debug, drift is corrected by hand* the same day. That change held
back drift corrections. This one takes the room's clock away from a debug
account's player entirely, so the player can be felt the way an embedded
YouTube player feels in any other app: it starts at the press and nothing moves
it afterwards.

**The press reaches the player first.** A play or pause pressed on this device
is carried out on this device's player as it leaves, instead of a round trip
later when the snapshot comes back. The transport calls `announcePress` in
`drift.ts` for every press it sends, and the follower acts on it only under
`byHand`. The follower then holds off contradicting it for up to
`WATCH_OBEDIENCE_MS` while the room catches up. A press the room never takes up
(refused, or lost) is followed back after that window, since the room is still
what every other screen shows.

**Arrival is a state, not a place.** A playing player under a playing room has
arrived wherever it is. No seek for drift, for a recovered stall, for the stall
rescue, or for a resume after a pause that banked a position the player had not
reached.

**Two kinds of seek remain.** A seek somebody asked for: a scrub, ±15s or a
replay, each of which moves the room's position instead of letting it run. And
one seek to place a player that has never been placed, arriving at a party
under way or rebuilt, since otherwise rotating the phone would restart the
film. Each is one seek: a player counts as placed once its seek is sent, so a
landing slightly off is not followed by a second. Every seek held back still
lights *Correct drift* on the readout.

**What it costs a debug account:** the scrubber still shows the room's clock,
and the picture drifts away from it freely. ±15s is measured from the room's
position, not from the picture's.

The harness's player now lets a seek already in flight land before a pause that
follows it takes effect, as the IFrame API does. It used to drop the position,
which only mattered once a placement seek was no longer retried.
