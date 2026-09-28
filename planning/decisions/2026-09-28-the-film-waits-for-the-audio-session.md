# The film waits for the audio session, and it is not ours to give

Two runs on a phone, build 304, with the transition lines
2026-09-27-the-press-is-apportioned-in-the-harness.md added — the first time the
film has said in its own words and with a stamp when it moved. Twenty-seven
presses on the evening of the 27th, nineteen more just after midnight using the
film probe as the control. **It is not buffering; it is `AVAudioSession`; and no
part of it is this application's to shorten.**

## What a press is made of

| | cold start (8) | resume (10) |
| --- | --- | --- |
| press → `watch tell play` | 73ms | 69ms |
| press → `engine stop` | 146ms | **1,050ms** |
| press → the category change | 445ms | **1,211ms** |
| category → the player's first move | +260ms | **+9ms** |
| the buffering itself | **563ms** | **80ms** |
| press → the picture moves | **705ms** | **1,304ms** |
| a corrective seek within 4s | 0 of 8 | **4 of 10** |

Medians, shipped path. **A resume buffers for eighty milliseconds and spends its
second and a quarter waiting for the audio session.** The question the task asked
— *is it buffering* — is answered no: there is a buffering line and it is a
twelfth of the wait.

**The film reaches `playing` shortly after the session event lands, in every case.**
That is the rule the whole thing reduces to, and it holds cold or resumed, held or
released. What differs is when the session event arrives: early on a cold start
(445ms) and late on a resume (1,211ms). A cold start looks twice as fast because
its own fetch — which needs no session, an unstarted player being free to fill a
buffer — runs underneath the wait instead of after it. That is the whole asymmetry,
and it is why a block of cold starts feels fine and a block of resumes does not.

**The causation is tight rather than adjacent**, which is the failure mode three of
the day's decisions were about. Nine milliseconds, across ten resumes.

## Whose session it is, measured with the probe

The film probe is the one switch that presses Play **without releasing the
microphone** — the control this morning's comparison thought it was running.
Fourteen presses held against five released, one sitting, so caching could not
favour either.

| | microphone held (14) | released (5) |
| --- | --- | --- |
| press → a category change | 1,218ms | 1,225ms |
| that change is `Playback` | **0 of 14** | yes |
| press → the player's first move | **1,271ms** | **1,235ms** |
| category → the player's first move | +8ms | +9ms |
| press → `paused`, the other direction | **417ms** | **1,113ms** |

**Holding the microphone changes the play by nothing** — 1,271ms against 1,235ms.
And with it held the category never becomes `Playback` at all: our
`PlayAndRecord`/`VideoChat` is re-asserted instead, and the player waits the same
1.2 seconds for *that*. So the wait is not the category being changed, and it is
not our release. It is a renegotiation that happens whoever wins it — and the
`engine stop play=T rec=T` arriving with it, both directions still enabled, is the
signature the probe's own notes give for an interruption from outside. `WKWebView`
is taking the session; we are not giving it up.

**So there is nothing here to configure earlier**, which is the one idea this
measurement was expected to license. A session already in the wanted category was
measured fourteen times and cost the same second. The backlog entry proposing that
sampling change is deleted with its premise.

**The pause is the opposite, and that second is ours.** 417ms held against 1,113ms
released: about 700ms of every pause is the microphone being retaken. Nobody has
complained about it, and it is the ordering `micNeeded.ts` argues for — the price
is paid by whoever pressed, not by the conversation.

## What it retires

**This morning's teardown decision, in its conclusion.** *Giving the microphone up
for the film costs nothing measurable* came from a held-versus-released comparison
at +85ms, and it is right about the microphone for the wrong reason: the held arm
did not avoid the renegotiation, because the renegotiation is not ours. Both arms
paid the same 1.2 seconds, so the comparison had nothing left to vary. **A null
result from an experiment whose control does not control is not a null result** —
even when, as here, the conclusion survives being re-derived.

**Build 277's reading was right.** *Pressing Play costs about a second and the
engine stop lands 0.92 to 1.11s after the press* is what the first table says. What
277 got wrong was only whose teardown it is: ours is released in 70ms.

## What is left

**The follower and the drawing, and nothing in the audio stack.** The jump half a
second after the picture starts is fixable and costs nobody a second —
backlog/a-player-slower-than-the-drift-never-arrives.md, where four of ten resumes
crossed `WATCH_DRIFT_MS` at 1,304ms against a tolerance of 1,500, exactly as the
harness predicted that afternoon. And the spinner
tasks/the-transport-says-nothing-while-the-film-starts.md asked for is now the
whole of the answer to the waiting, the waiting having turned out to be nobody's to
remove.

**One new fault, found by pressing too fast**:
backlog/a-play-inside-the-pause-can-wedge-the-player.md.

## What generalises, and it is the same lesson from both ends

The morning's entry ended *the cheap test against the null is the one that gets
skipped* — and it had run one, with a control that did not hold. So: **an adjacency
is not a cause, and two null results agreeing is not a measurement either.** What
settled a fortnight of this was not a better argument but the one instrument nobody
had built, and it was four lines.
