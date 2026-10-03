# The watch transport answers the press

Reported 2026-09-22: *play/pause on the watch player is flaky; after repeated
use it gets stuck and will not resume from a pause, and rotating to full screen
unsticks it.*

**The clue was worth more than the complaint.** Rotating is the one gesture in
the application that builds a fresh player — a handheld may turn only at the
film, turning it mounts `FullScreen`, and that mounted a `WatchPlayer` of its
own. So the channel, the server and `core/watch.ts` were all innocent: they
survive a rotation unchanged, and whatever was stuck did not.

## What it actually was

Three faults, found in this order, and the first two were guessed at before
anything was measured.

**1. Expanding rebuilt the player.** `ChannelView` returned `FullScreen` with a
player inside it while `Picture` stood its own down, so a turn of the wrist
tore one `WebView` down and built another: 1.0 to 1.5 seconds of black, on the
most ordinary gesture anybody makes at a film. Full screen is a third `Place`
now and the player never moves; `FullScreen` is the scrim alone, drawn by
`Picture` because nothing below the picture in the tree can be painted above
it. The transport became a component for the same reason — an element cannot be
handed to an ancestor.

**2. The follower was serving patience to a player instead of to a person.**
This was the original complaint, and it is worth stating plainly because two
days were spent on the audio session before it surfaced. From the build 277
log:

```
-0.728  watch tell pause (player buffering at 1027s, want paused at 1028s)
+0.000  watch press play
+0.386  route ... Playback/SpokenAudio why=categoryChange   ← session done
+9.574  watch tell seek+play ...
```

The session finished moving in 386ms and the follower then said **nothing for
nine and a half seconds**. `WATCH_STALL_MS` is ten, and the last instruction
before the press was 0.728s earlier. Two rules were doing it: a buffering
player is left alone so a seek cannot discard the buffer it is filling, and an
instruction sent and not arrived is waited out for `WATCH_OBEDIENCE_MS` — and
that wait was being served even after the room had asked for the opposite.

And the clock was being restarted constantly by a third defect: a buffering
player under a paused transport was told to pause on **every fuse**, eighty
identical instructions 1.51s apart over two minutes with no end, because only
the playing branch consulted the stall window.

Fixed by `urgent`: patience is owed to the player, not to the person. A change
of want abandons the outstanding instruction rather than waiting out its fuse,
and the stall window bounds both directions.

**3. The audio session, which has its own entry** —
`2026-09-23-the-screen-keeps-its-microphone.md`.

## The watchdogs, added and removed the same day

**Two were built before the fault was found, and both were guesses.** A player
that ignored three instructions was rebuilt; a page that had gone quiet for six
seconds was rebuilt. They were reasonable while *rotating unsticks it* was the
only thing anybody knew, and the case for them was that the cure somebody had
found by accident should at least be automatic.

They are gone, and the reasons are different:

- **The deaf-player rebuild** was machinery standing over a fault that no
  longer happens. Nineteen presses across two routes, on build 278, produced
  no ignored instruction at all.
- **The silence watchdog had a false positive and it was firing.** A
  backgrounded `WKWebView` has its JavaScript suspended, so the page stops
  reporting; on return, the watchdog saw forty seconds of silence and rebuilt a
  perfectly healthy player. It is in the build 278 log, directly above
  `foreground rebuild (was reconnecting)` and a fresh `watch player ready` — a
  film reloaded for no reason, which is the exact cost this whole investigation
  existed to remove.

**What remains is `onContentProcessDidTerminate`**, which is iOS announcing a
death rather than this codebase guessing at one: no heuristic, no threshold and
no false positive. And the reading stamp, which is not a watchdog — it stops
the follower reasoning about a page that has stopped reporting, whatever the
reason, and a stale reading saying `paused` is a state a follower will happily
believe it has arrived at.

**The general lesson is the one the removal is filed under.** A recovery that
works hides the fault from the people who would otherwise notice it. Rotating
had been silently resetting the `WebView` for weeks and masking how often the
real fault fired; taking that away is what made the fault legible, and adding a
deliberate version of it back would have put the mask on again.

## What the log gained, and it is the reason any of this was findable

Every press, instruction, arrival and refusal now writes to `recordEvent` — the
same ring `audio/diagnostics.ts` keeps and ships to the journal for an account
with `debug`. The watch lines and the audio session's lines interleave in one
timeline, and that interleaving is what made every finding above a measurement
rather than an argument. `watch playing after Nms` is the number the whole
exercise turned on.

One trap, stated because it was hit: `startDiagnosticRecording` installs the
route observer when the audio panel first mounts and never before, so a session
where nobody opened that panel has no `route` lines and cannot say what iOS
granted.
