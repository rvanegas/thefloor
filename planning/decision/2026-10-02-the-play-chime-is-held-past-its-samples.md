# The play chime is held past its samples

Found on 2026-10-02 in the build 329 run of the room's-play fix
(`2026-10-01-the-room-s-play-waits-for-the-session-too.md`), two phones, both
debug: Rodrigo showing the film as A, Rtest1 pressing on B. The fix held: 22 plays
from B, each one `chiming (room played)`, `releasing`, `ready`, then `watch tell
play`, and no player in `buffering` for longer than about 0.6s. The chimes were
the problem, and the run found three things wrong with them.

## A's play chime was silent, and the log said it fired

**Reported as A swallowing the resume chime, with B's two and A's pause chime
heard.** B was muted to rule out B's identical chime masking A's, and A was
still silent. The journal shows A requesting the chime on every play, exactly as
B did, with nothing else on A playing or replacing the held player. What it
could not show is whether the sound left the speaker, because `chimePlay`
discarded its answer and nothing read the player afterwards.

**The one difference in the log is timing, and it is weak evidence.** The hold
was `spanMs('play')`, the samples' 180ms and nothing more. From the chime to the
release, A averaged 233ms and B 272ms; to the engine stopping, A 314ms and B
373ms. `play()` is not the sound reaching the speaker, so a release that lands
inside the samples plus the player's start-up cuts the chime off. But the two
ranges overlap (B's quickest stop was 323ms, A's slowest 363ms), so timing alone
should have cost B some chimes and given A some. It was never separated from the
phone either: in this run only B pressed, so A's phone never played a press
chime and B's never played a room one.

**So two things were done, and only one of them is a fix.** `CHIME_TAIL_MS`
(150ms) is added to `HANDOVER_MS`, on both the press path and the room's. It
costs a sixth of a second on every Play from a device showing the film, and is
the right size only if the theory is. **`chimePlayer`** in
`AudioRouteModule.swift` is the instrument that decides it: an
`AVAudioPlayerDelegate` notes whether the sound ran out, and `filmStart.ts` logs
the player's state at the release and again at `ready` as `watch chime at …`.
`finished after Nms` is a chime heard whole; `stopped at x/180ms without
finishing` is one cut off, and names the moment. That needs a native build;
older binaries log nothing new, and a refused `play()` is logged from
JavaScript on any build.

**If the next run still loses A's chime with the tail in place**, the reading
says which way to go: `finished` means the sound played, and the question is
the route or the phone rather than the session; `stopped` early means the tail
is not enough or something else ends it.

## A muted phone dropped every pause chime

Twenty times across the two phones. The pause chime waits for the engine to
restart **with recording on** (`engineRestart` in `useWatchChime.ts`), since
2026-09-29, because the category flips ahead of the session and chimes fired on
it were lost. A muted device takes its microphone without capturing, so its
engine restarts playout-only, about 730ms after the pause, and the recording
start the chime was waiting for never came.

**The wait now asks for recording only from a device that will capture.** It
does not accept any start from everybody: at 22:52:12 an unmuted pause started
the engine playout-only twice, stopped it, and restarted it with recording 450ms
later, and a chime fired on the first start would have landed under the second.
Muted is read through a ref, so toggling it during the wait does not re-run the
effect and lose the chime.

## A muted phone started the film two seconds late

Fifteen times, each one `no playback after 2000ms, playing anyway`. Muting does
not rewrite the session, so a phone muted through a run is still `Playback` at
the pause and at the next Play, and the start waited for a route notification
announcing a change that had already happened.

**The start reads the category at the chime and, if it is already `Playback`,
takes the engine stopping as the release landing.** In the log that is about
80ms after the release, and nothing else moves. The reading is taken at the
chime and not at the release on purpose: the category flips the moment the
release writes it, about 200ms ahead of the session, so a reading there would
make an unmuted phone look settled and send it into build 312's wedge. On a
capturing device the engine stopping is ignored, as it has to be, since it
comes about 190ms before `Playback`.

## Not done

**The quick press was not exercised.** B's fastest pause-then-play was about
1.1s, so whether a play inside the pause still wedges remains
`backlog/a-play-inside-the-pause-can-wedge-the-player.md`'s open question.

**Rejoining with the film already running was not tried either**, so the rule
that nothing chimes on arrival was not checked on a phone this time.
