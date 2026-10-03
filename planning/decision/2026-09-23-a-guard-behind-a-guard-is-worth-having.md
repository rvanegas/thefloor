# A guard behind a guard is worth having

An audit of what the three media tabs let through — *Listen*, *Recordings* and
*Watch* — against four rules: members only, present in the room, only where it
affects the room, and only where the other two features are not in use. Most
of it was already right. Three things were not, and one of them was live.

## What was already right, so that nobody audits it twice

**Guests never reach a media surface at all.** The server projects a seat a
`GuestView` (`Channels.guestView`), which carries no playback, no watch and no
recordings list, and `SeatView` draws only the recording indicator. There is
no path where a guest is handed a control and refused it afterwards; there is
no control. In core, `holdsSharedControl` asks `isParticipant` and every
recording guard asks `isPresent`, which counts members. The HTTP side agrees —
`trackFileFor`, the recording export, delete, rename and play routes and the
transcript routes each check membership of the *channel*.

**Presence is asked everywhere it is owed.** `mayPutSomethingOn` is
`holdsSharedControl && isPresent` and feeds `canControlPlayback`,
`canLoadTrack` and `canStartWatch`; `canControlWatch` asks it directly; all
four recording guards ask it. `Channels.loadTrack` re-asks `canLoadTrack`, so
the upload route and the play-a-recording-into-the-channel route inherit it
rather than restating it.

## The one that was reachable

**`WATCH_READY` asked `isParticipant` while its own comment said *being in the
room and nothing more*.** It is on the client-sendable allow-list, so a member
sitting outside the room could send it and overwrite the film's title and its
length — the name under the progress bar and the number the scrubber runs on —
on the screen of everybody watching. Nothing the app does reaches it:
`Picture` mounts on `inRoom`, and is the only thing that sends it. The fix is
the line the comment had been promising, and the one `WATCH_HERE` draws ten
lines below.

A report is not a control, which is the reason the floor has no say here and
still has none. But it is a report *about what the room is looking at*, and
that is enough to make the room the place it has to come from.

## The two that were not, and why they went in anyway

`canControlWatch` carried no recording clause and `canResumeRecording` carried
no party clause. Neither was reachable. A run cannot begin while a party is
loaded (`canStartRecording`) and a party cannot begin unless the run is `idle`
(`canStartWatch`), so the pair fence each other off.

**Both fences are on a film being *loaded*.** That is the whole of the
exposure. 2026-09-20 moved the *audio* pair's exclusivity from the two things
loaded to the two transports — `watchIsPlaying` and `trackIsPlaying` — and
deliberately left the recording and the floor on `watchPartyIsOn`, the
argument being that those two are about the film being a mode the channel is
in rather than about sound. That argument still holds. But it means the
recording clause is the kind of rule that gets revisited, and the day somebody
relaxes it to `watchIsPlaying` the sequence is: load a film, pause it, start a
run, press play. Two things running at once, which is the state every one of
these guards exists to prevent, reached without touching either guard that was
supposed to stop it.

So `canPlayWatch` is `canControlWatch` plus no active run, and
`canResumeRecording` now carries `canStartRecording`'s party clause. Neither
changes anything that can be pressed today.

**`canPlayWatch` is play alone, and the *alone* is the decision.** The other
four actions on that transport — pause, seek, the room's mute, stop — are how
a channel gets *out* of a party, and a run can go for an hour. Holding all
five for the length of one would trap a channel inside a film it could not put
down. Refusing play refuses the thing the exclusivity is about and refuses
nothing else. It is asked per branch in the reducer the way `SET_WATCH_MUTE`'s
enforcement is, and the *Watch* card's existing `recordingLive` sentence —
*Stop the recording first — a watch party is not recorded* — is already the
right words under the greyed button, so no sentence was added.

## What was left alone, deliberately

**Recording is refused by a party that is merely loaded, not by one that is
playing.** That reads like the gap this audit was looking for and is not: it
is 2026-09-20's decision, on the grounds that a recording made beside a party
is missing the thing everybody is reacting to whether or not the film is
between scenes. The mirror — a *paused* run blocking `canStartWatch`, which
captures nothing — is the same argument in the same direction. Changing
either is a product decision rather than a fix, and the two guards above are
what make it a safe one to take later.

**`WATCH_HERE` accepts a guest**, `inRoom` rather than `isParticipant`, and so
does `WATCH_READY` now. A guest with no microphone cannot force the room's
mute through it — `anyScreenInTheRoom` asks `hasMicrophone` as well — and a
guest with one is a voice in the room like any other.

## Not a wire change

No action, field or name moved, and the guards live in `core/`, which both
ends import. An app build carrying the old core greys nothing differently: the
two new clauses refuse only states it cannot reach, and no client has ever
sent `WATCH_READY` from outside the room. Nothing for SHIMS.md.
