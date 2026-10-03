# The film waits for its session, and the pause chime waits for the engine

Two faults from one run of resumes and pauses on build 312 (2026-09-29, the
audio panel open, three cycles), and one principle behind both. **An event that
needs a settled audio session has to wait for evidence the session has settled,
not for a reading that says it will.**

## A player that starts under a category change sticks

| Resume | Player starts buffering | Our switch to `Playback` lands | Playing |
| --- | --- | --- | --- |
| 1 | — | 2.19s | 2.48s |
| 2 | 2.25s, after | 2.17s | 2.45s |
| 3 | **1.06s, before** | 2.18s | **5.84s**, after the 4s nudge |

When the player waited for our `Playback` switch, it started 90 to 290ms after
it landed. When the switch landed under a player that had already begun, the
player stuck in `buffering` until the follower told it to play again. The run
before this one showed the same shape three resumes in four.

Both orders were possible because two different things triggered them. The
player was told to play at the press (under `debug`) or on the snapshot. The
microphone was released on the snapshot, 180ms later for the chime's hold, and
in practice about 1.2s after the press. The web view's own takeover seems to
block the main thread for about a second, and the hold's timer waited behind it.

**So a press of Play on the device that will show the film now does it in
order**, in `watch/filmStart.ts`: sound the play chime, hold the microphone for
its length, release it, wait for iOS's route notification to say `Playback`,
and only then let the follower play. `App.tsx` reads the phase ahead of
`microphoneNeeded`, which still says paused until the snapshot. The follower
waits on it under `debug` and without. The route notification is waited for,
not the category reading, which flips as soon as it is written. The wait is
bounded at two seconds and logged if that is what started the film.

It is for a press on the device showing the film only. A press elsewhere
reaches that device as a snapshot, as before, with `useFilmHandover` holding
the release there. Whether a remote press needs the same ordering is for the
next run to show.

## The pause chime fired into a session that was not back

The pause chime waited for the category to read `playAndRecord`, and fired
about 105ms later on pauses 1 and 3. The route notification came about 200ms
after that and the engine restarted about 480ms after it. Both chimes were
swallowed. On pause 2 it did not wait and fired before the retake began, and
was heard.

**It now waits for the engine to confirm it is restarting with recording**, as
the person who reported it asked. The engine's own `willStartEngine` callback is
the confirmation, and the chime sounds a macrotask after it, once the handler
has returned and the start has gone ahead. Reading the engine would be stronger
but is off-limits: one of the nine audio device module readers is known to stop
the sound, and nobody knows which
(`backlog/why-a-playout-only-engine-renders-nothing-is-not-known.md`). The wait
is bounded at two seconds and a chime past it is dropped and logged.

The engine's two callback slots hold one handler each, and the log already used
them. So `engineState.ts` now registers one handler per slot that fans out to
every subscriber, and a device showing a film subscribes at each pause.
Registering is still the SDK's own call, on the two slots the SDK's policy does
not use.

## What was not measured

None of this has run on a phone. The next run with the panel open should show,
for each resume: `watch start chiming`, `watch start releasing`, `watch start
ready (playback after Nms)`, and only then `watch tell play`, with the player
going to `playing` without a second `play`. For each pause:
`watch chime after engine start, Nms`, and a chime you can hear.
