# Nobody corrects drift

Until today a watch party's follower behaved one way for an account with
`debug` set and another for everybody else. `useFollow` took `byHand`, which
`Picture` set from `app.debug`, and it did three things:

- **Held drift corrections back**, lighting a *Correct drift* button on the
  readout (2026-09-28-under-debug-drift-is-corrected-by-hand.md).
- **Carried out a press on this device's player at once**, before the server's
  answer (2026-09-28-under-debug-the-player-follows-presses-only.md).
- And so made every walk on a `debug` account a measurement of a follower no
  user had. The walk had to tell people to judge three steps on a phone that
  was *not* `debug` and read its drift off one that was.

**Rodrigo's rule, from today: within the watch party, `debug` changes only how
much is displayed.** The film, the transport and the follower behave the same
for everybody. The rest of what `debug` does in the app (the audio panel and
its probes, *Forget this phone*, shipping the journal) is outside this rule.

So the two behaviours were made universal, and the button went:

**Nobody's player is corrected for drift.** A player that falls behind while
playing, or runs ahead after a pause banked a position it had not reached,
stays where it is. The readout reports the drift, and only a `debug` account
sees the readout. That is deliberate: Rodrigo wants to see the protocol stable
before anything corrects drift automatically, and a correction nobody can watch
is how the seek storms of September went unnoticed until the next day's
journal.

**Every press acts on the pressing device's own player at once.** The server is
still told, and still decides. The player that was pressed runs a round trip
ahead of the others, a cost accepted for the immediacy. `pressed` stops the
follower undoing the press while the snapshot is in flight, and a Play still
waits for the iOS audio handover (`startHolding`), since starting under a
moving session is build 312's wedge.

**The *Correct drift* button is gone**, along with `requestCorrection`,
`onCorrectionRequested` and `DriftReading.withheld`. With nothing held back it
had nothing to release. `SharedDrift.withheld` became optional. Builds from
before today still send it and the server still relays it, so their readouts
keep working. Nothing newer sends it.

## What is still seeked

A seek that is not a drift correction is still made:

- **A seek somebody asked for**: a scrub, ±15s, a replay. These move the room's
  position rather than letting it run.
- **A player that has never been placed**: a screen arriving at a party under
  way, or a rebuilt one.
- **A stall rescue.** A player buffering past `WATCH_STALL_MS` still gets the
  `seek+play` it always got. It is the one instruction recorded as moving a
  wedged player (builds 304 and 327), and the `debug` follower had been
  removing it along with the drift seeks. Making that follower universal as it
  stood would have brought the wedge back for everybody.
- **A player coming back from an advert**, which is new today. The room's
  clock runs through a pre-roll and the film resumes where it was, so a screen
  that sat through one comes back that far behind. That used to be corrected
  as drift. It is not drift but an interruption nobody in the room asked for,
  the same as a rebuild. So an advert now unplaces the player and the film's
  return gets one seek.

## A bug the `debug` follower had all along

Replaying a finished film never worked under `debug`, and would have stopped
working for everyone. The replay unplaces the player, since the room jumps from
the end back to nought. But `hasArrived` is true for an ended player whatever
it was asked, and the same tick read that as *seen in step* and placed it
again. The seek back to the start was then removed as a correction, and the
player was told only to play. That replays it from its end, where it ends
again. An ended player no longer counts as placed. The existing test *a film
that has run out › is started again by a press of Play* caught it the moment
the behaviour became universal.

## What this does not settle

When a follower may rest and when it must act are left as they were: the
obedience window, the stall window, the cold nudge, `urgent`. That is the next
change, 2026-10-03-the-follower-rests-only-on-agreement.md.
