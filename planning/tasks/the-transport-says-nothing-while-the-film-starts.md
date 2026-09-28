# The transport says nothing while the film starts

A press of Play is answered by a second and a half of nothing. Measured on build
303, nineteen presses: a median of 1463ms released and 1662ms held, range 1271
to 1793 — and `Transport.tsx` holds no state across it at all. The button
records the press to the diagnostic log and then the screen waits for the room
to come back, so a press that went nowhere and a press that is working look
identical for as long as it takes.

**What spends that time is the `WKWebView` starting playback**, and not the audio
session — decisions/2026-09-27-the-teardown-was-never-on-the-critical-path.md is
the measurement that took the microphone out of suspicion. So nothing here can be
made faster by the audio work that was attempted three times; it can only be made
to *feel* like nothing, which is cheaper than any of it and was never tried.

**The round trip is not inside the 1463ms**, corrected 2026-09-27: `drive.ts`
starts that clock at the instruction, which goes out after the snapshot has
already come back. So press-to-picture is the round trip *plus* the figure — and
the figure itself carries up to a `FOLLOW_TICK_MS` of this application noticing
rather than the film beginning, the arrival being observed on the interval.
decisions/2026-09-27-the-press-is-apportioned-in-the-harness.md is the table, and
the thing it settles for this note is that **the follower costs the picture
nothing**: the tick's window is in the knowing. Sharpening it would not shorten
the wait by a millisecond, so there is nothing to fix here and a spinner remains
the whole of the answer.

**And the label is already optimistic**, which decides the second option below.
`Transport.tsx` reads `watch.status` off the snapshot, so *Play* becomes *Pause*
at the round trip — about 200ms — and the dead time is entirely *after* the label
has changed. A pending state hung off the snapshot would therefore end a second
early and show nothing during the part somebody is actually waiting through: it
has to hang off the player's own reading. That also empties the optimistic
transport of its appeal, the transport being optimistic to the eye already.

Two ways, and the second is better if it works:

- **A spinner, or the label going quiet** — the ordinary thing, entirely local to
  `Transport.tsx`, and it needs no new state beyond the press's own.
- **An optimistic transport.** `watch tell play` goes out before anything moves,
  so the row could show *playing* the instant it is pressed and let the follow
  tick correct it. That is how the rest of this application behaves — the app
  renders server snapshots, so this would be the one place that does not, which
  is the argument against it and the reason to look at what the follower does on
  a refusal before choosing. `canPlayWatch` is the guard that makes a refusal
  possible at all.

**Read STYLE.md before drawing either.** The transport is drawn in three places
from one component — the card, a second device, and the expanded picture's scrim
— so whatever this becomes appears in all three, which is the property that
component exists to keep.


## The phone run was done, and it was not buffering

Run the same evening on build 304, eighteen presses of Play and nine of Pause.
**A resume is 1,304ms from press to picture, of which 80ms is buffering and about
1,150ms is the audio session renegotiating; a cold start is 705ms and is genuinely
a fetch.** So the premise of this note — *a press of Play is answered by
a second and a half of nothing* — is a fact about resumes.

**And it is not ours to make faster, which was measured rather than assumed.** The
film probe presses Play without releasing the microphone, and fourteen such presses
cost 1,271ms against 1,235ms for the shipped path: the renegotiation is `WKWebView`
taking the session and happens whoever holds it.
decisions/2026-09-28-the-film-waits-for-the-audio-session.md is both halves of that.

**One thing might still avoid it rather than shorten it**, and until it has been
run this note should not be built against. It is **probe B** in the audio panel —
the two probes are lettered because a run on 2026-09-28 used A believing it was
B, which is four minutes of pressing that answers the wrong question. The muted-start probe begins the film
silent, on the premise that iOS gates *audible* playback on a session and silent
playback may need none — in which case the picture starts at once and the sound
arrives a second later, and what wants drawing is completely different. Run that
before drawing anything.

**And there is a second thing to draw, which this note did not know about.** Four
of the ten resumes were seeked half a second after the picture started, being over
`WATCH_DRIFT_MS` by then — so what somebody sees is the wait *and then a jump*. The
jump is a defect rather than a drawing problem and has its own entry,
decisions/2026-09-28-a-correction-aims-where-the-room-will-be.md; but until it is fixed, a
spinner that ends when the picture starts hands attention straight to it. Worth
knowing which of the two is being covered before choosing where the pending state
ends.

## The phone run, and what to read out of it

Added 2026-09-27 with the instrument that makes it worth doing. `WatchPlayer.tsx`
now records every state its player passes through, so the seam between *told to
play* and *arrived* is no longer blank and one press answers what the nineteen
could not.

Press Play twenty times with the diagnostic panel on — half of them a first play
on a fresh party, half a resume from a pause, and say which is which, because they
are different costs that have only ever been averaged together. The lines to read,
in order, are `watch press play`, `watch tell play`, `watch player buffering`,
`watch player playing` and `watch playing after Nms`; every one carries a stamp.

- `tell` minus `press` is the round trip, which nothing had separated before.
- `player buffering` minus `tell` is the embed getting off the mark.
- `player playing` minus `player buffering` **is the buffering, and is the whole
  question** — a resume with no `buffering` line at all was never buffering, and
  then the time is the media stack or the audio session taking the frame.
- `after Nms` minus `player playing` is this application noticing, and should be
  under half a second.

They ship to the server's journal — `journalctl -u thefloor | grep 'audio
diagnostics'` — so the run can be read the next day rather than off a screen.
**Any press whose `player playing` is more than 1.5 seconds after its `tell` is on
the far side of the cliff** in
decisions/2026-09-28-a-correction-aims-where-the-room-will-be.md, and how many of the
twenty land there is the reading that entry is waiting for.
