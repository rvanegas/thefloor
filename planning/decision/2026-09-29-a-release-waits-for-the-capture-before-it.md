# A release waits for the capture before it

Found on 2026-09-29 by reading the code against
`backlog/a-play-inside-the-pause-can-wedge-the-player.md`, not on a phone.

**Each microphone transition in `useSessionAudio` started at once, beside
whatever was still running.** A Pause on the device showing the film retakes
the microphone: `applyFor(CALL)`, then `setMicrophoneEnabled(true)`, which comes
back with the engine about 700ms later. A Play pressed inside that window goes
through `filmStart.ts`: chime, hold 180ms, release. The release is
`releaseMicrophone`, which reads the published track synchronously. The capture
had not published yet, so there was nothing to unpublish and it returned. It
then set the session to `LISTENING`, iOS reported `Playback`, and `filmStart`
let the follower tell the player to play.

Then the capture finished. The track was published and the engine restarted
with recording on, so the session went back to `PlayAndRecord` under a starting
film. That is the fault `2026-09-29-the-film-handover-released-before-it-held.md`
found from another cause. **Nothing took it back**: `appliedRef` already said
`released`, so the effect deduplicated every later pass. The microphone stayed
open for the run.

**Each transition now waits for the previous one to settle** before it writes
anything. A release after an unfinished capture unpublishes the track that
capture produced, and only then writes `LISTENING`. So the `Playback` that
`filmStart` waits for arrives after the release has really happened. The cost
is that a Play inside the window starts the film when the capture has finished
and been undone, rather than at once: about 700ms after the Pause, plus the
release.

The wait is bounded at two seconds, `TRANSITION_WAIT_MS`, so that one call that
never settles cannot hold every later transition. Reaching it is logged
(`released gave up waiting after 2000ms, going ahead`). Past it, the old fault
is possible again: a capture that finally lands after the release is not taken
back. **I chose a bounded wait over also reconciling afterwards**, because
reconciling alone happens after `Playback` has been reported. By then the player
has been told to play, and undoing the capture would be the second session
change under it.

Waiting at all is logged (`released waits for the transition before it`). The
next run shows whether a rapid Play still wedges, or wedges less often.
`app/src/audio/__tests__/lateCapture.test.tsx` is the bench. Its fake room
publishes only when the capture's promise resolves, which the fake in
`screening.test.tsx` does not model.
