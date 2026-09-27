# The transport says nothing while the film starts

A press of Play is answered by a second and a half of nothing. Measured on build
303, nineteen presses: a median of 1463ms released and 1662ms held, range 1271
to 1793 — and `Transport.tsx` holds no state across it at all. The button
records the press to the diagnostic log and then the screen waits for the room
to come back, so a press that went nowhere and a press that is working look
identical for as long as it takes.

**What spends that time is the round trip plus the `WKWebView` starting
playback**, and not the audio session — decisions/2026-09-27-the-teardown-was-never-on-the-critical-path.md
is the measurement that took the microphone out of suspicion. So nothing here can
be made faster by the audio work that was attempted three times; it can only be
made to *feel* like nothing, which is cheaper than any of it and was never tried.

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
