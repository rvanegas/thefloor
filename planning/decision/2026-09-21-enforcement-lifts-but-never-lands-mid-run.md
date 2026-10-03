# Enforcement lifts but never lands mid-run

`WatchState.enforced` is still sampled at `WATCH_PLAY` and is now also dropped,
mid-run, the moment nobody is watching on the device they are in the room on.
It is never raised mid-run. `liftSpentEnforcement` in core/channel.ts is the
whole of it, and `reduce` is now a wrapper over the old body — renamed
`reduceAction` — so the rule runs after every action rather than being written
into the six that can take the last screen out of a room.

Reported the day after the enforced mute shipped: with the film playing on a
second device, the first device had no control to unmute the party. It had
nothing to do with second devices as such. `canUnmuteRoom` is `!enforced`, and
the *Unmute the room* button is removed rather than greyed — see
2026-09-20-an-enforced-mute-has-no-button.md — so a stale sample is a room with
no way out of silence and a sentence underneath explaining why, naming a
condition that had stopped being true.

## The sequence, which the 2026-09-18 default makes ordinary

The film comes up on the device you are looking at. So a party started from the
phone you are standing in the room on declares that phone the screen, puts you
in `watchingHere`, and `WATCH_PLAY` samples `enforced` true — correctly, at
that instant. Handing the picture to a television then empties `watchingHere`
and does **not** end the run: `handOver` only calls `screens.use`, unlike the
television's own *Other device* button, which pauses first. The run continues
with a sample that no longer describes anything, for the length of the film.

The audio-session reason had gone with it. Enforcement exists because a device
serving a film in stereo cannot hold a microphone open; the phone in the room
was no longer serving anything.

## Why lifting is not a retreat from sampling

Every argument in `WatchState.enforced` for asking once is an argument about
*imposing*: a voice cut off mid-sentence when somebody switches to their only
device, a button vanishing under a finger because a person in another country
closed a laptop. None of it is about a room getting its speech back. Lifting
interrupts nobody and removes no control, so the two directions are not the
same decision and do not need the same answer.

That leaves the field one-way within a run — true only at a `WATCH_PLAY`, false
at any point after — which is what keeps the flicker argument intact. A button
that appears and then stays is not the failure mode anyone was guarding
against.

**`mutedAll` is untouched.** The room stays quiet; what comes back is somebody's
ability to say otherwise. Lifting the mute itself would be the reducer deciding
the room wants to talk, which is the button's business.

## The wrapper, and what was considered instead

**Deriving `canUnmuteRoom` as `enforced && anyScreenInTheRoom`** was the smaller
edit and was rejected: it re-imposes as readily as it lifts, so the button
would disappear again the moment somebody else put the film on the device they
were in the room on. That is the flicker the sampling exists to prevent, and it
would have arrived by the back door.

**A line in `WATCH_HERE`** would have fixed the reported case and missed the
others. The premise goes away down at least six paths — the handover, stepping
out, being displaced, a lost socket, the room emptying under `TICK`, a guest's
speech grant changing — and several of them do not touch `watchingHere` at all
but knock a name out of `present`, which `anyScreenInTheRoom` filters on. A
rule that has to be remembered in six places is one that gets missed in a
seventh.

The wrapper preserves the reducer's identity contract: `liftSpentEnforcement`
returns the state it was handed unless there is enforcement to drop, and an
action that changed nothing cannot have taken the last screen out of a room.
