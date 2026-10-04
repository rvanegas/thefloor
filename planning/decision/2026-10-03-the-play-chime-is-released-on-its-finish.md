# The play chime is released on its finish

Two chime faults, found by reading the code against Rodrigo's question of
whether swallowed chimes come from interruption, and specifically from the
fixed delays made to leave room for them. In both places the answer was yes.

## The play chime was ended by a timer, not by its finish

On the device showing the film, a Play sounds the play chime and then gives up
the microphone, so the session can move to `Playback` for the film. The
release came `HANDOVER_MS` after the chime was **asked for**: the samples'
180ms plus `CHIME_TAIL_MS`, which
2026-10-02-the-play-chime-is-held-past-its-samples.md added on a theory. A
chime plays into the session the app holds, so a release while it is still
sounding cuts it off. A chime that **began** late, behind a slow first play or
a busy session, lost its end every time. It was a systematic interruption, set
by a constant.

The instrument that decision added, `chimePlayer`, reports the sound's finish
(`finishedAfterMs`, from `AVAudioPlayerDelegate`). **The release now waits for
that, then for `CHIME_TAIL_MS`**, which becomes what a tail is for: sound still
leaving the speaker after the player's last sample. That is
`waitForChime` in `app/src/audio/chimeFinish.ts`, which polls the reading every
20ms. It ends in one of four ways, and the reason is in the journal's
`watch start releasing (chimed, <end> after Nms)`:

- **`finished`** — the sound was heard whole.
- **`refused`** — the player would not play it or could not decode it. There
  is nothing to protect, so the microphone goes at once.
- **`no reading`** — nothing to ask: a binary before 2026-10-02, no module,
  the web, or a reading older than the hold (an earlier chime's). It falls
  back to `HANDOVER_MS` from the chime, exactly as before, landing on time
  rather than at the next poll.
- **`deadline`** — `CHIME_HOLD_MAX_MS`, the sound and its tail twice over,
  with no finish reported. A chime player that never says it finished must not
  hold a microphone open under a starting film.

Only `filmStart.ts` waits on the finish, since it covers both the press and
the room's play on the showing device. `useFilmHandover`'s hold stays a timer.
It only affects the microphone when no film start is under way, which is the
path where the play chime was not sounded by the start.

## A held pause chime was cancelled by any re-render

After a pause, the showing device's pause chime waits for the audio engine to
restart before sounding, because a chime fired while the session is moving is
lost (2026-09-29). That wait was the cleanup of the effect that started it.
Anything that re-ran the effect cancelled it: a press, the next snapshot, or
the app leaving the front (`screening` is one of its dependencies). The re-run
saw no new edge and returned, so the chime was gone. **And nothing was
logged**: neither `watch chime after engine start` nor `watch chime dropped
after …` was written. That is a chime that disappears from the journal as well
as from the room.

The wait now belongs to the hook (`heldPause`), not to one run of the effect.
Only leaving the channel or unmounting cancels it. Every wait ends in one of
three logged ways:

- **It sounds** once the engine restarts.
- **It is dropped** after `SETTLE_WAIT_MS`, as before.
- **It is dropped because the room played again** before it could sound. This
  is the one collapse: a pause and a play inside the wait leave the room quiet
  again, and a chime announcing that it has its voices back would be untrue.
  The journal says `watch chime dropped after engine start, Nms: the room
  played again`.

## What a run should show

Step 19 of the walk reads these. A play chime on the showing device that is
still lost with `finished` in its release line means the sound left the player
whole, and the question moves to the route or the phone. A `deadline` means
the delegate never fired. `watch chime held (engine)` with no line after it
should not happen any more.
