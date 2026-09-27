# A hold can move the session, and for three days nobody wrote it

Reported 2026-09-26, twice: two people watching a party, one pauses, and
neither can hear the other afterwards. Stepping out and back in restores it.

**The first fix was wrong about the cause and is corrected here.**
2026-09-26-the-film-is-a-dependency.md added `screening` to the capture
effect's dependency array, on the reasoning that a run *ending* moves nothing
else and so nothing woke the effect. That reasoning does not survive the
implementation of a party mute: it is a server-side **unsubscription**
(`setSilenced` in `server/src/media.ts`, which acts on the receiving end), so a
pause brings every remote track back, which fires `TrackSubscribed`, which
moves `state.othersAudible` — already a dependency of that effect. Both
directions were masked, not one. Demonstrated by removing the line again and
modelling the pause as it actually arrives: `capturing CALL` is still reached.

The dependency was a real latent bug and stays. It was not this one.

## What it was

`muted` means two different things since 2026-09-23 and the code knew about
one of them. The intent branch in `useSessionAudio`'s capture effect read:

    : intent === 'muted'
      ? holdMicrophone(room)

with a comment saying a hold "moves nothing" and "does not re-state the
configuration at all". True of a self-mute, which is what it was written for
and is the 2026-08-20 fix — re-stating `CALL` across a self-mute is the
Bluetooth profile handover that `intentFor` exists to avoid. **Not true of a
screening run**, which holds the same device under `SCREENING` instead of
`CALL`. So entering a run decided on `SCREENING`, recorded it in `appliedRef`,
handed it to the native observer through `pushPolicy` — and never applied it.

One of the three writers in POSTMORTEM-echo.md was therefore the *only* writer,
and it is the one that acts at an engine transition rather than now.

## The log, which is the whole of the evidence

Build 295 on both phones, so the dependency fix was installed and firing:

    627057  watch tell play  ->  muted SCREENING
    628256  route ... PlayAndRecord/VideoChat why=categoryChange
    628274  engine stop play=T rec=T
    628795  watch playing after 1737ms
    634859  watch tell pause ->  capturing CALL
    634968  sub + acct_4Zaq47i5C-AT (1)
    635317  watch paused after 458ms

Three readings, and the second is the one that cost the room:

1. **`capturing CALL` and `sub +` both land at every pause, on both devices.**
   The device and the subscription are restored exactly as designed.
2. **`engine stop play=T rec=T` arrives 1.2 seconds after `muted SCREENING`,
   behind a `categoryChange` this app did not make.** That is the observer
   applying `SCREENING` on its own schedule. No `engine start` follows, through
   two complete play/pause cycles.
3. **No `categoryChange` follows any `capturing CALL` at a pause**, where
   re-entry's does. The `CALL` write had nothing to change back from, nothing
   having told the session it was ever anything else.

So both microphones unmuted and both subscriptions returned onto a stopped
engine. `setMicrophoneEnabled(true)` only unmutes a track — `holdMicrophone`
sets `stopOnMute = false`, so there was never a device stop for it to undo, and
nothing in that path restarts the audio unit. Re-entry cured it because it is
the one path that releases the session outright and reaches
`engine start play=T rec=T` from nothing.

## What was built

`applyFor(want)` in the `muted` branch, **guarded on the configuration having
moved** so a plain self-mute still writes nothing. `configMoved` is read off
the previous `appliedRef` before it is overwritten; absent counts as a move,
a device that has applied nothing having a session that says whatever the last
channel left it saying.

`app/src/audio/__tests__/screening.test.tsx` is rewritten around two rules that
the first version broke, and both are in its header:

- **Every case enters a run rather than starting inside one.** Mounting with
  `screening` already true applies `SCREENING` on the *connect* path, and the
  entire fault is in the transition. A fixture that begins mid-film cannot see
  it, and did not.
- **The pause carries the resubscribe beside it.** Toggling `screening` alone
  is not a state this app reaches. That fixture is what made a dependency look
  like the whole cause.

A third case plays twice, because the first run is the only one the old code
got any category change out of and every run after it moved nothing at all.

That file was rewritten once more the same day, when `SCREENING` was deleted and
the device went back to being released. The two fixture rules above are why it is
shaped as it is and both still hold; what changed is the subject. It pins the
release and the retake — `LISTENING` while the film runs, `CALL` at the pause —
where this version pinned a device held under a configuration that no longer
exists. See 2026-09-26-the-film-keeps-its-stereo.md.

## What was open, and what still is

**Answered the same day, and the answer was yes.** Build 296 landed the write
in 174ms rather than the observer's 1.2 seconds, `route` confirmed
`ModeDefault`, and `engine stop play=T rec=T` happened anyway — so `SCREENING`
stops the engine however it is applied, and with the engine stopped there is no
transition left for the pause's `CALL` to be applied at. `SCREENING` is
therefore deleted, and the film's stereo is bought back the expensive way — the
device is released again, as it was before 2026-09-23. See
2026-09-26-the-film-keeps-its-stereo.md, which is where this report
actually ends.

The fix in this entry stays: it was a real defect, it is why the reading above
could be taken at all, and the guard it added still states something true.

**`reconcileSilence` does not reconcile the restoring edge**, and that is a
separate defect found on the way past. `server/src/channels.ts` returns early
unless somebody is being withheld:

    if (holder === null && !muted) return;

So withholding is corrected every tick and *un*-withholding rests on the single
best-effort `assertSilence` shot fired in `commit` — while `assertSilence`'s own
comment delegates the pairs it cannot state to a reconciliation that has just
switched itself off. Nothing in the log above shows it biting; it will strand a
room independently of any of the above. Backlog entry, not fixed here.

## The shape that generalises

**A comment that says *this case moves nothing* is a claim about the meanings a
variable has, and it decays when one is added.** `muted` acquired a second
meaning on 2026-09-23 and the branch's reasoning was never re-read against it.
The tell was available in the same file: the effect wrote
`appliedRef.current = { intent, config }` with a `config` it had no path to
apply, which is a record of an action rather than of an intention and should
have looked wrong.

**And: the fixture proves the fix, so a fixture built from the diagnosis
inherits its error.** The first test passed, pinned both directions, and
described a state the app cannot be in. What caught it was the shipped log,
which is the instrument the 2026-09-23 entry says to reach for first.
