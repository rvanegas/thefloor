# The room's play waits for the session too

Found on 2026-10-01 in the first phone run against
`backlog/a-play-inside-the-pause-can-wedge-the-player.md`, on build 327.

**`filmStart.ts` held the player only for a Play pressed on the device showing the
film.** When the Play came from the other phone, this one learnt of the run from
the snapshot. The follower told its player to play on that snapshot, and the
microphone release (`useFilmHandover`'s hold, then `LISTENING`) came after it:
`watch tell play` at 19:09:03.210, `released LISTENING` at 03.468, `Playback` at
04.762. The player went to `buffering` at 04.150, while the session was still
moving, and stayed there for 23 seconds. That is the order build 312 showed to
wedge a player. `2026-09-29-the-film-waits-for-its-session.md` fixed it for a
press made on the phone and left this path as it was.

**The snapshot's edge into `playing` now starts the same three phases** (chime,
release, wait for `Playback`) when this device is screening, the film would take
its microphone (`useFilmTakesMicrophone`) and no start is already under way. It
runs in a **layout effect**, because the follower ticks on the same snapshot in
an ordinary effect, and every layout effect in a commit runs before any ordinary
one. So `startHolding()` already says yes when the follower asks. In an ordinary
effect the follower would win, because a child's effects run before its parent's.

The start sounds the play chime itself, as the press path does, and
`useWatchChime` stands aside because a start exists. Only the edge counts: the
first snapshot of a channel is taken as read, so a film already running on
arrival starts nothing and is not chimed. The run ends when the room says so, as
for a press.

**What it costs**: a play from the room now starts about 180ms (the chime) plus
the time iOS takes to report `Playback` later on the screening device. That is the
same as a press made on the phone, and it is the wait the player was going to
spend in `buffering` anyway, without the risk of never coming out.
