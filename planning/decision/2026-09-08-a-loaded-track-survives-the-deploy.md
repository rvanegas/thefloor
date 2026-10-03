# A loaded track survives the deploy — 2026-09-08

`planning/TASKS.md` § *Media Transience* asked why media loaded for playback did
not persist, and observed that it seemed to drop during a server deploy. It did,
every time, and the answer was three separate mechanisms all agreeing.

## What was happening

1. **It was never written down.** `durableOf` in `server/src/channels.ts` is the
   projection persisted to SQLite. It carried `clip` and `watch` and pointedly
   not `playback`, on the stated reasoning that *playback points at a temp file
   the dead process owned*.
2. **It was explicitly reset on the way back up.** `revive` set
   `playback: initialPlaybackState()` alongside `floor`, `recording` and
   `present` — the volatile group, everything describing the process rather
   than the channel.
3. **The file was deleted too.** Both routes that load a track — the upload at
   `POST /channels/:id/track`, and a recording played back into its own channel
   at `POST /recordings/:id/play` — wrote it to
   `mkdtemp(tmpdir()/thefloor-track-<pid>-…)`, and the boot sweep in `restore`
   removed every such directory whose owning pid was gone.

A deploy restarts the process, so it took the state, the in-memory `trackFiles`
map and the bytes, in that order. Nothing was broken; three defensible local
decisions composed into a channel quietly emptying its player.

## Why the stated reason did not hold

**A recording is durable in the bucket.** The premise — that a track is a handle
on something the dead process owned — was true only because the file had been
put somewhere that a boot swept. It was not a property of the track. For the
case this was actually reported about, playing a recording back into the channel
it was made in, the audio outlives any number of restarts in S3 and the row
carries a `recordingId` that could name it.

So the fix is not to re-fetch on demand but to stop throwing the file away.
**A track is now removed when somebody decides it should be, and at no other
time.** Three moments, and they are the whole list: replaced (`loadTrack`),
cleared (`discardClearedTrack`), channel ended (`closePlayback`). A restart is
not one of them.

## What changed

**A durable track root.** `TRACK_DIR`, defaulting to `./tracks` beside the
database, because it is the same kind of thing: state one box holds that nothing
else can reproduce. `ChannelRegistry.newTrackDir` mints every track directory
under it, so both routes go through one place and the sweep and the restore can
depend on every track being there.

**It is excluded from `bin/deploy`'s `--delete`, and that exclude is
load-bearing.** The rsync ships the working tree; a track root inside it and not
excluded would be emptied on every deploy, which is exactly the disappearance
this work removed, arriving back through the deploy script instead of through
the registry. `*.db` is excluded for the same reason and `*.p8` for a related
one — see AGENTS.md § *Credentials*.

**`playback` is durable**, carrying the track, the banked position and the
volume; `trackFile` rides beside it as the server-side half, because
`ChannelState` has no room for a path on this box and core is pure.

**It comes back paused**, which is `revivedWatch`'s rule and taken from it
deliberately. The clock ran on through the restart with nobody driving the pump,
so a position derived from `startedAt` is one no listener is at. Banking the
position rather than deriving it is also what keeps the row cheap: a position
that moved with the clock would change the projection on every commit and
rewrite the row with it, where a banked one changes only when somebody plays,
pauses or seeks — the same argument `quantise` makes for `lastPresentAt`.

**The revived track is checked against the disk.** `revivedPlayback` drops it
when the file it names is not there — a root wiped by hand, a boot with a
different root configured, a database restored beside a box that never held the
audio. An empty player is a state the interface already has; a track that cannot
be played and explains nothing is not.

## The sweep now asks a different question

It used to scan the whole of `tmpdir()` and ask, of each `thefloor-track-<pid>-`
directory, whether that pid was still alive — because every server on the
machine shared one directory, and deleting by prefix would take a live upload
out from under a peer. That had already failed once, as an unreadable-audio 415
from a route that should have said 403.

A root nobody else writes to cannot have that problem, so the sweep asks the
only question that was ever really being asked: **does any channel still refer
to this?** It runs after every channel has been revived, and that order is the
whole of its correctness — the restore loop is what fills `trackFiles`, so a
sweep placed before it would find nothing referenced and delete every track on
the box.

**The ephemeral fallback is per registry, not per pid**, and that is not
tidiness. Without a configured root — which is every test — tracks go to a
directory under the system temp belonging to one registry. A jest worker builds
many apps in one pid, and on a shared root each one's boot sweep would find the
others' tracks unreferenced, its own database having never heard of them, and
delete audio a live test was playing. Per-pid names were sufficient while the
sweep asked about pids; they are not now that it asks about the contents of one
database.

## What was not done

**No re-fetch from S3.** It was the obvious alternative for the recording case
and it is strictly more machinery: a lazy fetch on the next play, a re-probe of
the duration the scrubber depends on, and a second `playback-fetch` billed to
the account on every restart. Keeping the file costs disk bounded by one track
per channel and answers the upload case at the same time, which a re-fetch never
could — an uploaded file genuinely has nowhere to be fetched from.

**No change to the protocol or to `ChannelState`.** Nothing on the wire moved,
so there is no shim and nothing for `SHIMS.md`. What the app renders is the
snapshot it always rendered; there is simply a track in it after a deploy.
