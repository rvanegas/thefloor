# The film chimes wait for the session they are played into

Reported as *the chime indicating pause and play/resume of video should be
heard only when the audio session is `playAndRecord`: before resume, and after
pause.* Which is a description of the mechanism as well as the fix, and the
mechanism turns out to be one this collection had already written down twice
without anybody putting the two halves together.

## Why a chime is lost at all

**A chime is an `AVAudioPlayer`, and it plays into the session this app
holds.** `CHIME_PATH` has been `player` since 2026-09-17 — see
*2026-09-17-the-chime-is-not-an-alert.md* — and `playThroughPlayer` in
`AudioRouteModule.swift` is explicit that the player configures nothing of its
own: no category, no activation, it reads `channelAssignments` off the session
and that is the whole of its contact with it. So a chime is audible exactly
while this app holds a settled session, and inaudible when it does not.

**On the device showing the film, both edges of a run move that session.**
`isScreening` in core/micNeeded.ts drops `microphoneNeeded` for anybody in
`watchingHere`, which is what buys the film its stereo —
*2026-09-26-the-film-keeps-its-stereo.md*. So:

- **Play** — `CALL` (`playAndRecord`) falls to `LISTENING` (`playback`), and
  then the `WKWebView` takes the session outright:
  *2026-09-27-the-film-stops-the-engine.md*, about 1,150ms of it,
  *2026-09-28-the-film-waits-for-the-audio-session.md*.
- **Pause** — the microphone is retaken, and that is about 700ms of the pause:
  417ms measured with the device held against 1,113ms with it released, same
  entry.

`useWatchChime` fires on the `watch.status` edge off the snapshot, which puts
both chimes squarely inside those windows. Nothing was wrong with the sound,
the queue or the renderer; the chime was being played into a session that had
been handed to somebody else.

## The two halves are not symmetrical

They look like one rule and they are not, because only one of the two things
can afford to be late.

**On play, the session waits for the chime.** `useFilmHandover` holds the
microphone open for exactly `spanMs('play')` — 180ms — so the release, and
therefore the category change, happens after the sound rather than under it. A
play chime *cannot* be deferred: arriving late it announces a film that is
already running, which is the same thing the hooks refuse to do when you walk
into a room with a film already playing.

**On pause, the chime waits for the session.** There is nothing to hold — the
retake is the thing being waited for — so the chime is held until the observed
category reads `playAndRecord` again, and then fired.

The hold on play costs about 180ms on a press. A resume is already around
1,304ms from press to picture and about 1,150 of that is `AVAudioSession`
renegotiating, which is not ours to shorten; this is a seventh of that wait
spent on the one thing in it the room can hear.

## Three decisions taken at the prompt

**The gate is *did this device hand its session over*, not *what category is it
in*.** A literal reading of the report would silence two people permanently. A
phone in a pocket is present without watching here, never leaves `CALL`, and is
the ear this hook was built for in the first place. A guest with no speech grant
is on `playback` for as long as they are in the room — `LISTENING` is their
ordinary state, not a transitional one — so a `playAndRecord` gate would wait
two seconds and give them nothing, every time, for ever. Both keep chiming
immediately. Only a device that was `screening` during the run defers.

**A held pause chime is dropped at a deadline, not played late.** Two seconds,
against the measured ~700ms retake, and inside `CHIME_STALE_MS` so the queue
does not then discard what the wait was for. This is the rule `chime` already
applies to anything further behind than that: a notice that the room has its
voices back, arriving seconds after they came back, sends somebody looking for a
change that has been on screen the whole time.

**Unreadable counts as settled.** `observedCategory` answers null on Android,
under jest, in a browser and in any build where the local module did not link —
the standing contract of `app/modules/audio-route`, which degrades to null
rather than throwing. A cue withheld because a *diagnostic* could not be read
would be indistinguishable from the fault this was written to fix.

## What was not done

**The hooks were not reordered in `App.tsx`.** The obvious alternative to the
handover is declaring `useWatchChime` above `useSessionAudio`, so its effect
runs first in the commit and the chime is issued before the session write. That
is a race rather than an ordering — the release is awaited, so how much of the
180ms lands before the category moves is not something the declaration order
decides — and it would put the reason for a reshuffle of `App.tsx` somewhere no
reader of either hook would find it.

**A poll rather than `onRouteChange`.** The listener fires on *route* changes,
and a category change reaches it only by moving the route; `reasonName`'s
`.categoryChange` case in `AudioRouteModule.swift` is what one looks like when
it does. Going `playback` → `playAndRecord` very probably moves the route every
time, and *very probably* is not a thing to hang a cue on. The poll runs only
while a chime is held, at most two seconds, at 100ms, and `routeSnapshot` is
cheap enough that `probe.ts` uses it as the control in a timing harness.

**`SessionAudio.asked` was not read.** It is the *asked* half of an
asked-versus-actual comparison and says of itself that nothing may decide
anything from it. What the chime needs is the session as it **is**, which is the
route snapshot.

## What is instrumented

Three lines in the journal, in the idiom `WatchPlayer.tsx` already uses, so a
phone run can be read the next day rather than off a screen:
`watch chime held (<category>)`, `watch chime after Nms`, and
`watch chime dropped after Nms`. The middle one should sit under the measured
~700ms retake; the last should not appear on an ordinary pause at all.
