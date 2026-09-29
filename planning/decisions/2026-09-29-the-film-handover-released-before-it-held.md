# The film handover released the session before it held it

Found in the diagnostic journal on 2026-09-29, while looking for why a resume
could take four seconds or more when the embed alone starts almost at once.

**Every Play from build 309 flipped this device's session three times.** The log
shows `released LISTENING`, then `capturing CALL`, then `released LISTENING`, the
first about one round trip after the press. Builds 307 and 308 show a single
`released`. Build 309 is where `useFilmHandover` arrived, in *The film chimes
wait for the session they are played into*.

The hook set its hold in an effect. So the render where `isScreening` turned
true still returned `false`, and `App.tsx` computed `micNeeded` from that render:
release. The effect then set the hold, which reopened the microphone, and the
timer released it again 180ms later. The existing test read the value only after
effects had run, so it never saw the render that released.

**Of the three changes, the retake did the damage.** Its capture completes
asynchronously and landed after the second release, so the engine restarted
with recording on and the session went back to `PlayAndRecord`/`VideoChat` under
a film that was starting. It did this several times over, with up to six
category changes in a second. Players were paused under it without being told
to (`player paused (was buffering)`), and the follower then had to tell them to
play again. Across the thirteen Play presses on builds 309–311, the picture
started in under 2 seconds three times, and after more than 5 seconds seven
times.

**The fix derives the hold at render time:** `screening && (holding || !seen)`,
where `seen` is the last edge an effect acted on. The first render after the
edge now holds, so a Play makes one session change, as it did before 309. It is
not React's set-state-during-render idiom: the discarded render still runs
`useSessionAudio` with the unheld value.

**Not yet measured on a phone.** Whether the 1.2-second takeover by the web
view is now the whole of a resume, and whether the silent film after a −15s
seek goes with the flip, are for the next run. Both of the 18:16 backward seeks
on build 311 played under a `PlayAndRecord`/`VideoChat` session that the design
says should have been `Playback`, which is what this flip left behind. That is
the link I suspect, not a proven one.
