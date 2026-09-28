# The room's clock starts when a player does

The transport was a wall clock that started at the press, and no player can. A
resume's picture comes back 1,304ms later — almost all of it `AVAudioSession`
renegotiating, which is nobody's to shorten — so every player began that far
behind the room and was either corrected, which is a jump half a second after the
picture, or left behind for the length of the film, which on two phones in one
room is two phones disagreeing audibly. Measured on build 305: five of ten
resumes corrected, alternating with five that were not, because a corrected
resume ends exactly in step and leaves the next one on the boundary.

**So `watchPlay` banks a start two seconds in the future, and the first player to
report that it is running pulls that start to the truth.** Nothing is skipped and
nothing needs correcting: a player that takes a second to come back is in step
when it comes back.

| the player's cost | before | after |
| --- | --- | --- |
| 600ms | in step, sometimes corrected | **one instruction: the play** |
| 1,150ms — the phone's | corrected half the time, a second behind the rest | **one instruction** |
| 1,800ms | corrected, or a second behind | **one instruction** |

## The two decisions this rested on

**Who starts the clock: the first player to report.** The alternatives were the
last (which hands the room to its slowest screen, and to a wedged one for ever),
the presser's own device (which seeks everybody else backwards when theirs is the
slow one), and nobody at all — a fixed grace. First-to-report keeps the room
honest while one working player is enough for it.

**And nobody, after two seconds**, which is the fixed grace kept as the deadline
rather than discarded. It is what bounds the wedge, the backgrounded app, the
refused video and the build that predates the report. It needs no flag to make
*first* mean first: a report arriving after the clock has started is a report
about a run already under way, and the window closing is what makes it one.

**Two seconds is chosen from both ends.** Long enough to be past the 1,304ms
measured, so a real report almost always wins; short enough that a room where
nothing reported does not leave its players far ahead of the clock when it
finally runs — at four seconds a player that started at 700ms would be over
`WATCH_DRIFT_MS` and would be seeked *backwards*, which is the failure the grace
exists to prevent, reintroduced by making it generous.

## What it cost elsewhere

**Eighteen core tests, and they were right to fail.** Every one of them encoded
*the clock starts at the press*, which is the sentence this changes. They now
press and report, which is what a room with a working screen does; the handful
that are about the deadline say so.

**The lead at the start is gone**, having lasted about an hour: with the clock
not running during startup, the banked position *is* where the room is, and a
lead would skip a second of film to correct a drift that no longer exists. What
survives is the lead on a mid-film correction, where the drift is real.

**`WATCH_REPORT_SLACK_MS`, which is five seconds and not the drift tolerance.**
The report's guard has to clear the *pause's* own error as well as the start's —
see below — and a guard tight enough to refuse that difference refuses the repair
along with it.

## What it exposed

**The pause has the mirror bug**, and the two used to partly cancel:
`watchPause` banks what the clock said, and a player stops its own latency later.
At the phone's 350 to 1,100ms this is inside the tolerance and the play-side
report repairs it anyway. At a latency past the grace it is not repaired at all,
and the resume seeks the player backwards into a re-buffer — nine instructions in
the harness at 2,300ms. Pinned by a test rather than left to be discovered, and
written up in backlog/a-pause-banks-a-position-the-player-has-not-reached.md.

**A residue of one round trip.** The report crosses the wire, so the clock starts
a trip after the picture did and every screen is that far ahead of the room's
number. Consistently — the screens agree with each other, which is the property
that matters — and the scrubber is 300ms behind the film. Absorbing it would mean
trusting a client's own timestamp, which means confronting the skew that
`drive.ts` and `Picture.tsx` already disagree about.

## Deploying it

`WATCH_STARTED` is a new client→server action, so **the server goes first**. An
older client sends nothing and the deadline covers it, which is not a shim but
the design: the grace is permanent. A newer client against an older server has
its report refused by the allow-list and falls back to the same deadline. Neither
order breaks anything; the order is so that the feature works when the client
lands.
