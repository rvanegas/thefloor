# A film and a recording end each other, the later winning

Until today the two refused each other outright. A film loaded, playing or
paused, greyed Record (`recordingRefusal` → `'film'`, *Something is loaded to
watch together. Stop it on the Watch tab to record.*), and a run in progress
greyed the film's play button and *Start a watch party* (*Switch Audio off on
the Record tab first*). Either way the person who wanted the other thing met
a dead button and had to go and put the first thing down by hand, on another
tab.

Rodrigo asked for the opposite: allow it, and resolve it. **Playing a film
over a recording stops the recording; recording over a playing film stops
the film.** The invariant is unchanged — a recording never runs beside a
running film, because the film's sound never reaches The Floor and the run
would be missing what everybody was reacting to — only who gives way.

What was chosen inside that:

- **The film is paused, not unloaded.** *Stop the video* read as *stop it
  playing*; unloading would throw away the place in the film and the
  history entry's moment for no gain.
- **The recording is stopped as Stop stops it** (`stopKeeping`): audio and
  text both end, the selection stays for the next Play. Ending the audio
  alone would have left the text running a new segment of a room the film
  had just muted.
- **A held run is left held.** It captures nothing, and resuming it pauses
  the film in its turn, so there is nothing to resolve until then.
- **A loaded, paused film refuses nothing.** Loading a film over a run ends
  nothing either — a film starts paused.
- **Record automatically never begins over a running film.** It is the one
  place the automatic start and the button now differ. A start nobody chose
  must not put the film down, and if it did, the next press of play would end
  the run and the automatic start would begin it again.

It is one rule after the reducer, `preemptFilmOrRecording` in
core/channel.ts, rather than a clause per branch: audio begins by five
actions and a branch that forgot would be the failure the rule exists for.
The guards ask `capturable` of the room as the pause will leave it
(`withFilmPaused`), since a running film's mute is otherwise what makes the
room look like it has nothing to capture. The server needed nothing new —
`applyRecordingToMedia` tears down and files a run that ends in state,
whatever ended it. The Watch card now says *Playing the film stops the
recording* while a run records, so the press is not a surprise.
