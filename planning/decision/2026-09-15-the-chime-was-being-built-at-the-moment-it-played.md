# The chime was being built at the moment it played

Confirmed on a phone. The cue works at the shipping peak of 0.18 **with no
lead-in at all**, once the sound is rendered and loaded before the tap instead
of during it.

`chime` used to render a WAV, write it to the temporary directory, call
`AudioServicesCreateSystemSoundID` and play the id in one breath. That function
returns a status, not a loaded sound, and the cue is 180ms long. `prepareChime`
does the render and the load with no play; `warmChimes` runs it for the three
kinds on `usePresenceChime`'s mount, and the lab warms whatever its chips are
set to whenever they move.

**The cache key is why the peak sweep looked broken**, which is the detail that
identified the fault. It includes the amplitude, so every chip on the peak row
was a fresh key and therefore a cold first play. Somebody sweeping five peaks at
one tap each heard five cold sounds and no amplitudes — and that is exactly what
was reported, three theories ago, as *hardly a perceptible difference between
the five settings*.

## What it cost to find, which is the part worth keeping

Four explanations were shipped in one day before this one. Two were disproved by
measurements that should have been taken first:

- **The output route powering up.** 180ms of silence went in front of every
  chime on the strength of it. The renderer was later compiled and run
  standalone — the file is well formed and the peak sweep spans a real 15dB —
  which said the samples were never the problem. The lead-in is back to zero
  here, having earned nothing.
- **The alert path having no gain.** True of the API and irrelevant: the ringer
  was raised from its minimum to its maximum with no change whatsoever.

The third was not a theory but self-inflicted. **`chime`'s native signature
moved four times that day**, and an Expo `Function` throws on
`received > argumentsCount` — so each move silenced any bundle running ahead of
its binary, which is the normal state of a session, since a JavaScript reload
does not rebuild native code. That produced *total silence* twice, in the middle
of debugging a fault whose symptom was *quiet*, and it was indistinguishable
from progress in the wrong direction. `chime` negotiates its argument count now
and `chimeArity` reports which form was taken; SHIMS.md carries it.

**The rule this leaves:** a repository with a bench for the question should not
ship a fix that has never been on it. The first three changes were all reasoning
about a mechanism read off the source, which is the same failure the five
Bluetooth builds of 2026-08-20 were, and `AudioRouteModule.swift` exists because
of that one. `chimeInfo` — the renderer reporting its own constants, so *the fix
did not work* and *the fix is not in this binary* stop being the same symptom —
should have been the first commit rather than the fourth.

## Nearby is E5 twice

Chosen by ear on a phone, against a single E5 (`nearby-a`), a flat pair at A5
(`nearby-b`) and one at C#5 (`nearby-c`). It is a pair that does not move: the
same two beats as `in` and `out`, going in neither direction, which is the shape
that says *neither of those* without anybody being taught it. A single note was
the original guess and reads as half a chime rather than as its own thing.

**The losing candidates are still in the table**, as `nearby-d` sits beside the
sound it now is. They go, with `ChimeCandidate` and the lab's rows, when the
choice is confirmed rather than merely made — one afternoon's listening has
already been overturned twice today.

`chime.web.ts` mirrors it, as it mirrors every row.
