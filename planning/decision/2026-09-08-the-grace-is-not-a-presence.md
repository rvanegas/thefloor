# 2026-09-08 — The grace is not a presence

**Somebody inside the disconnect grace now reads *Nearby* on the roster**,
where they read *Present · reconnecting…*. `DISCONNECT_GRACE_MS` is unchanged
at sixty seconds, and shortening it was tried and reverted.

## The complaint

Another app takes the audio, and the roster goes on calling that person
*Present* — or *Present · reconnecting…* — while nobody can hear them. It
looked like a latency problem and the first instinct was to make the sequence
faster.

Most of the observed delay was a different bug, fixed the same day:
`reconcilePresence` renewed the grace on every poll for as long as the SFU
listed the suspended process, so the state took minutes rather than a minute.
That is `2026-09-08-the-socket-is-what-holds-a-place.md`. What was left after it
is the ordinary sixty seconds — and the question of what the roster should say
during them.

## Why the number stays

**The grace is what makes a deploy invisible.** A phone sees a restart rounded
up to its next retry — 500ms × 2ⁿ, capped at ten seconds — so
planning/INFRASTRUCTURE.md's measurement is that a fifteen-second restart can
cost a phone twenty-five. Any window shorter than that steps every live
conversation out every time the box is deployed. Presence recovery works today
because sixty seconds is comfortably longer than a deploy.

Five seconds was implemented and reverted. Zero was considered and declined for
three reasons, each independent:

- **A deploy would eject everybody**, as above.
- **The client could never walk back in.** `socket.ts` gates re-entry on
  `gone <= DISCONNECT_GRACE_MS`, which at zero is false for every gap — so every
  drop, including every foreground after a suspension, would need a tap.
- **`settleEmpty` would become instant.** The grace expiring on the last present
  member ends a solo recording, pauses any watch party, and **revokes every
  guest link irreversibly**. A lone host's momentary blip would destroy a
  guest's access with no undo.

## What was actually wrong

**The word, not the window** — and the interface had already worked this out
without saying so. `callable = nearby || reconnecting` has offered a **ping** to
somebody inside the grace all along, and `server/__tests__/push.test.ts` carries
a test named *reaches somebody the grace period is still counting present*, on
the stated principle that **presence is not reachability**.

So the button said *out of reach, one notification away* while the line above it
said *present*. One of them was wrong, and it was not the button.

*Nearby* is exactly the rung being described: in the channel, not hearing
anything, reachable by ping. It is also what they become if they do not come
back, so the label no longer changes at the moment the grace expires — the row
simply gains a duration. A transition that used to be visible and meant nothing
to anybody watching is now invisible, which is the right amount of attention to
give it.

## The order between the two warnings

`failing` — the SFU reporting a remote connection `Lost` — still leads on its
own, because it lands while somebody is mid-sentence where the server's
heartbeat cannot. **It gives way the moment the socket corroborates it**: a lost
stream *and* a lost socket is a phone that has gone, and *not receiving you*
would assert the one thing that is not true of it. That case now reads *Nearby*
along with every other socket loss.

## No duration on it, unlike the nearby rows below

Those count from `lastPresentAt` and are minutes old by the time they render.
This one is at most the grace period, and a countdown of seconds under
somebody's name invites watching it rather than pinging them.

## What this does not do

**It does not touch the audio.** A phone whose claim was taken by another app
still gets it back only at the foreground, and why the engine stops on
backgrounding is a device reading that belongs to STEPPING-IN-WALK.md. What
changed is that the roster stops describing that phone as able to hear.
