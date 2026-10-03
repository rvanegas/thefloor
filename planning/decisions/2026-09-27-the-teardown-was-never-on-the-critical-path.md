# The teardown was never on the critical path

> **Corrected 2026-09-28: right conclusion, no control.** The held arm of this
> comparison did not hold the audio *session* — with the microphone held the
> category is re-asserted rather than changed, and `WKWebView` renegotiates it
> anyway — so both arms paid the same 1.2 seconds and the +85ms varied nothing.
> Measured directly on build 304 with the film's own transitions: a resume is
> 1,304ms, of which 80ms is buffering and about 1,150 is the session. The title
> survives and so does the microphone's innocence; what is on the critical path is
> a renegotiation nobody here owns.
> See 2026-09-28-the-film-waits-for-the-audio-session.md.

Measured 2026-09-27 on build 303, nineteen presses of Play, and it closes
task/ § *A film in stereo needs no teardown* by removing its premise. **Giving
the microphone up for the film costs nothing measurable.** The task is deleted;
the spinner and the headset reading survive it as entries of their own.

| microphone | n | mean | sd | median | range |
| --- | --- | --- | --- | --- | --- |
| released — what ships | 9 | 1518ms | 164 | 1463ms | 1271–1721 |
| held — the film probe | 10 | 1602ms | 176 | 1662ms | 1316–1793 |

Held minus released: **+85ms, t = 1.08.** No difference, and the sign is the
wrong way round — taking the teardown out entirely made the press marginally
*slower*. The held block ran second, so YouTube's caching favoured it, and it
still did not win.

So `watch playing after Nms` is the round trip for `watch tell play` plus the
`WKWebView` starting playback, and the audio session is concurrent with it rather
than in front of it.

## What this retires

Build 277's reading was *pressing Play costs about a second, and all of it is the
microphone being torn down so the session can leave `playAndRecord`*. The first
half is right and the second half is wrong. It was arrived at by watching
`engine stop` land 0.92 to 1.11 seconds after a press and reading a coincidence
as a cause — **the same error, in the same subsystem, that
2026-09-27-a-configuration-write-does-not-stop-the-engine.md is about**, one
level up: something adjacent to the delay was named as the delay.

**And it was never tested against a press that did not release the microphone**,
which is four minutes with the switch that now exists. Three weeks of design —
`SCREENING`, two shipped fixes, a revert, three wrong mechanisms and four
sessions — rest on that untested half.

## What survives, and it is not much

**The spinner**, which is now the only thing on that note with value. A second and
a half of a screen saying nothing is a second and a half whatever is spending it,
and `Transport.tsx` still has no pending state at all. It never depended on any
of this. task/the-transport-says-nothing-while-the-film-starts.md.

**The headset reading**, which is the one measurement that says whether the
*shipped* design earns what it does. Every reading in this whole argument is
`route Speaker(Speaker)`, where it is 48kHz either way and all that is lost is
the voice processing. backlog/whether-releasing-the-microphone-buys-stereo-on-a-headset-is-unmeasured.md.

## What generalises, and it is the fourth time today

**An adjacency is not a cause, and a stopwatch on one component does not
apportion a delay between two.** Today produced three instances of the same
mistake, all in this subsystem: the write blamed for an engine stop 1,254ms
later; the unsubscription blamed for one 1,086ms later; and now a teardown
blamed for a delay it runs alongside. Each was settled the same way — by removing
the suspect and measuring again — and in each case the apparatus for doing so was
an hour's work that had not been done.

**The cheap test against the null is the one that gets skipped.** Every reading
in this history measured the thing that was believed to be expensive. None
measured the same press without it, which is the only measurement that can
apportion anything, and which was available from the first day.
