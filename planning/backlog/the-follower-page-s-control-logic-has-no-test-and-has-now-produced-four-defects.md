# The follower page's control logic has no test, and has now produced four defects

`server/src/watch-page.ts` is a template string, so nothing executes it. The
server tests assert that certain substrings are present, which catches a
deletion and nothing else — and the part that keeps being wrong is not the
markup but `follow()`, the twenty lines deciding what to do to the player given
what the channel says.

Four defects have come out of it, the first three in a single day, all found by
somebody watching a screen rather than by anything automated:

1. **A swapped-in video played itself**, because `loadVideoById` plays what it
   loads and every party starts paused.
2. **The duration was never reported** for a cued video, because the report
   fired on a state change and a cued player has no duration yet — which is the
   first defect's fix producing the second's symptom.
3. **An ended video restarted for ever**, because "not playing, so play it" is
   right for every player state except ENDED, and `correct()` then seeked back
   to the end, ending it again. Every 500ms.
4. **A rewind killed the picture and the sound**, six days later, because a
   correction assumed the last one had landed: a seek into an unbuffered
   stretch takes longer than the tolerance it was correcting, so the next tick
   seeked again and cancelled the fetch. decisions/ § *A rewind
   that ate itself*.

Each is a one-line fix and each was invisible to the suite. What would catch
the next one is running the script rather than reading it: extract the
`<script>` body, evaluate it against stubs for `document`, `WebSocket` and
`YT.Player`, and drive `follow()` through the states — ENDED with the transport
still playing, ENDED with a replay behind it, cued with no duration, a swap
mid-play. The stubs are the work; the assertions are three lines each.

Not done because each fix was small and the walk was about to happen anyway.
This said "worth doing before the fourth", and the fourth arrived on 2026-08-29
without it — with the same shape as the third, which is the argument for the
harness rather than against it. The states to drive it through now include
BUFFERING with the transport playing, and a seek issued while one is already
outstanding.
