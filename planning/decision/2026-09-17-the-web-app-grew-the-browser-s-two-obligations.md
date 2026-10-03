# The web app grew the browser's two obligations, 2026-09-17

`/app` and `/beta` now offer a gesture when the browser refuses to play sound,
and listen to the microphone they were granted. Both were ports of
`server/web/guest.ts`, which had learnt each of them the expensive way and paid
for each in a defect, and both were named in
`backlog/the-browser-s-audio-hook-is-a-spike-and-two-of-its-gaps-are-named.md`,
which this retires.

**What the first one cost.** `room.startAudio()` was attempted on connect and
its rejection was caught and dropped, with a comment saying the spike offered
no button. A browser is entitled to refuse playback to a page nobody has
interacted with, and the refusal is lifted by a real gesture and by nothing
else — so the failure was silent in the worst way available: the person heard
nothing while the screen said the audio was connected, and there was no control
anywhere to press. `playbackBlocked` is now a state on `SessionAudio`, written
from `RoomEvent.AudioPlaybackStatusChanged` rather than from the one attempt,
because a tab restored from the background can become blocked long after a
connection that was fine. `allowPlayback` is the second chance, drawn on the
*Audio* card as the screen's only `primary` button.

**The second is the sharper one, and it is the half that is not a guess.** The
embedded-browser notice shipped for `/app` and `/beta` in the change that wrote
that backlog entry, and it is a warning at the door: it tests by exclusion
against a user agent, so it misses an unnamed Android WebView and accuses a
browser that works. Listening to the published track is a measurement.
`useSessionAudio.web.ts` now runs an `AnalyserNode` over whatever is published,
four samples a second, and says so after eight seconds below the floor.

**The counting rule went to `core/capture.ts`, and that is the part worth
recording.** It could have been copied out of `guest.ts` in twenty lines. The
same argument `isEmbeddedBrowser` settled two weeks earlier applies unchanged —
two browsers needing one answer, and a second copy drifting the first time
either threshold is tuned — and there is a second gain that only applies here:
nothing in this repository can run `guest.ts`, so the arithmetic deciding
whether somebody is told their microphone is dead had never been executed by
anything but a stranger's phone. It has eight tests now. `guest.ts` was moved
onto it in the same change rather than left as the second copy, which is the
whole point.

**What is *not* in `core/` is reading the samples**, which is an `AudioContext`
and cannot be pure. That seam — pure counting, impure reading — is the same one
`embedded.ts` cut, and both callers keep their own analyser.

**Three things that look like details and are decisions:**

- **A muted track and a suspended context are passed as no reading, not as
  quiet.** `PATIENCE` is eight seconds of samples that were actually taken.
  Counting them as silence is how somebody who mutes between sentences gets
  told their microphone is dead.
- **The meter is armed per track, not per intent.** The microphone effect runs
  again on every mute and unmute, and re-arming there would restart the count
  each time — a meter that can never reach a verdict. A mute is not a new
  microphone; a republish is.
- **It stops itself the moment the question is settled, either way.** One
  sample above the floor ends it for that microphone. An `AudioContext` is
  worth paying for an answer and is not worth paying to keep confirming one.

**The notice carries no control, deliberately.** `guest.html` offers *Try the
microphone again*, which it needs because a guest's microphone opens once; in
the app, stepping out and back in publishes a fresh track and takes the reading
again, so a button there would be a second way to do what the footer already
does. The cure is another browser in any case, and `AuthView`'s notice is the
one that can hand somebody the link for it — at the door, where a copied link
does not cost them the room.

**Both fields exist on the native `SessionAudio` as constants and must stay
constants.** Neither failure can happen to an installed app, which owns its own
`AVAudioSession` and is never inside somebody else's `WKWebView`. They are
declared rather than left off because Metro picks the file and TypeScript checks
the other one: a member on one side only is a control that compiles on web and
fails to on a phone.
