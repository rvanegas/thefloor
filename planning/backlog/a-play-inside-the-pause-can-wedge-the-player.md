# A play inside the pause can wedge the player

Pressing Play while the pause before it is still landing leaves the player in
`buffering` and it does not come out. Seen twice out of two on build 304, against
none of the seventeen ordinary presses in the same two runs, so the rate is
suggestive rather than established — but one of the two is the worst single press
anybody has logged.

**The bad one, in full.** Pause pressed at 00:02:43.736; the player reported
`paused` at 00:02:44.165; **Play was pressed in that same millisecond**, 429ms after
the pause press. Three `PlayAndRecord` category changes followed in two seconds —
the session being fought over rather than moved — and the player entered
`buffering` at +2,172ms, which is already twice the ordinary 1,220. Then it sat
there. **For ten and a half seconds**, until `WATCH_STALL_MS` expired and the
follower issued the `seek+play` that is written for a stall with no end, which
restarted it at 111s against the 98s it had been paused at. The film played on the
other device in the room the whole time; on this one it showed nothing, and then
skipped thirteen seconds.

The other rapid press, 399ms after its pause, did not wedge but took 2,180ms
against a median of 1,271 — so both rapid presses were anomalous and neither was
ordinary.

**What it says about the machinery is good news.** The stall nudge is the only
reason that press ever recovered, and it is the rule added on 2026-09-20 for
exactly this — a buffering player with nothing on the far side of it. Without it
the picture would have stayed dark until somebody pressed something.

**Ten seconds of it has since gone.** `WATCH_COLD_NUDGE_MS` now tells a player
that never started to play again after four — see
decisions/2026-09-28-a-correction-aims-where-the-room-will-be.md — and a repeated
`play` cannot discard a buffer, so it needs none of the caution the long window is
built from. **It does not unstick a wedged embed, and it made the wedge longer.**
The 2026-10-01 run below told a wedged player `play` five times, four seconds
apart, and it never moved. And because `drive.ts` restarts the stall clock
whenever it says anything to a buffering player, every cold nudge set the clock
back to zero, so `WATCH_STALL_MS` was never reached and the `seek+play` backstop
never went out. Before the cold nudge, this wedge lasted ten seconds. Now it lasts
until somebody presses something.

**One mechanism was found in the code on 2026-09-29, and it fits this timing.**
The two fixes that day,
decisions/2026-09-29-the-film-handover-released-before-it-held.md and
decisions/2026-09-29-the-film-waits-for-its-session.md, cover a Play after the
pause has finished. They did not cover this one. The Play's release ran beside
the pause's unfinished capture, found no published track, and returned. iOS
reported `Playback`, the player was told to play, and then the capture landed:
the session went back to `PlayAndRecord` under it, and the microphone stayed
open, because nothing took it back. A release now waits for the capture before
it. See decisions/2026-09-29-a-release-waits-for-the-capture-before-it.md.
**On a phone, the fix held for a press made on that phone.** See the run below.

**The mechanism is a guess and the cheap test is not.** A pause restores
`PlayAndRecord` and starts the engine (about 700ms, and it is ours — see
decisions/2026-09-28-the-film-waits-for-the-audio-session.md), and a Play landing
inside that window asks `WKWebView` to take a session that is mid-move. Whether the
resume request is then dropped, or the media element left in a state no command
reaches, is not knowable from these lines: what is missing is what the *page* was
doing, and the transitions only say what it reported.

Two things to try, in order. **Reproduce it deliberately** — ten presses of Play
issued as fast as possible after a pause, which is a minute and settles the rate.
Then, if it holds, **consider whether the transport should refuse a press it cannot
serve**, which is the question the whole of `drive.ts` § *urgent* is about and which
was answered *never make somebody wait for a fuse* on 2026-09-20. A refusal is not
obviously better than a wedge that recovers in ten seconds; a shorter stall window
for a player that has never started might be.

## The run of 2026-10-01, build 327, one debug phone

The phone was `acct_sudUOdevBXfN`, and its log is from `bin/diagnostics` covering
19:06–19:09 local time. The other phone sent nothing, because only a debug
account's phone sends its log.

- **No press on this phone wedged.** There were about a dozen pause-then-play
  pairs, many under 400ms apart, plus bursts of Play presses 40ms apart.
  `released waits for the transition before it` appeared thirteen times. Every
  run of presses ended with the film playing; the slowest took about 4.5s from
  the first Play. Four times, the release and the capture queued behind it both
  logged `gave up waiting after 2000ms` in the same millisecond. A burst of
  presses therefore waits up to 2s for each queued transition. That is slow, but
  it is not a wedge.
- **The wedge happened on a play that came from the room.** The other phone
  pressed Play, and this phone logged `watch tell play` at 19:09:03.210 with the
  session still `PlayAndRecord` and the engine recording. `released LISTENING`
  came 258ms *after* that instruction, and `Playback` came at 04.762. The player
  went to `buffering` at 04.150, while the session was still changing, and stayed
  there for 23s. It got the five cold nudges described above and no backstop, and
  it came out only when somebody pressed Pause at 19:09:27. `startHolding()` in
  `filmStart.ts` is set only by a press made on this phone, so a play arriving
  from the room is never held back while the session changes. This is the build
  312 mechanism (a player started before `Playback` landed) coming in by the one
  path the hold does not cover. It is not the mechanism this entry was filed
  under. That pause had finished, and the phone's own release did not wait for
  anything.
- **Unexplained:** 19:07:15–19:07:24, seventeen presses with no player reading
  and no instruction, then the player was rebuilt at 19:07:36. It looks like a
  screen with no player mounted. Nobody has checked.

**What the run leaves to do, in order.** First, stop the cold nudge from
restarting the stall clock (`drive.ts`, where `buffering.current = now`). Without
that, the backstop is starved and a wedge lasts until somebody presses something.
Second, hold a play that comes from the room until the session has settled, just
as a press made on the phone is held.
