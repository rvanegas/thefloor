# The transport stays quiet while the film starts

Closes tasks/the-transport-says-nothing-while-the-film-starts.md, which asked
for a spinner, or an optimistic transport, to fill the wait between a press of
Play and the picture. **Neither was built, and that is the decision.**

The wait has not gone. On 2026-10-01, Rodrigo reported resumes landing between
1.0 and 1.5 seconds on a current build, against the task's baseline of 1,304ms
on build 304. That is the same cost the task was filed about, about 1.15s of it
`WKWebView` taking the audio session, which
2026-09-28-the-film-waits-for-the-audio-session.md measured as not ours to
shorten. **What changed is the tail.** Before
2026-09-29-the-film-handover-released-before-it-held.md and
2026-09-29-the-film-waits-for-its-session.md, seven of thirteen resumes took
more than five seconds, and a wait of that length really does read as a press
that went nowhere. With those fixed, a second or so with *Pause* already showing
was judged not bad enough to be worth drawing for.

**What was left unrun:** probe B, the muted start. It would have shown whether
silent playback needs a session at all, and so whether the picture could come
up at once with the sound a second behind. It is still the one thing that might
remove the wait rather than dress it, and still the first thing to run if the
wait comes back as a complaint.

**What a future indicator has to hang off**, so that this need not be found
again. The label already flips at the round trip, about 200ms in, because
`Transport.tsx` reads `watch.status` off the snapshot. A pending state taken
from the snapshot would end a second early, so it has to end on the player's
own `playing` reading. The transport is one component drawn in three places,
so whatever it becomes appears in all three; read STYLE.md first.
