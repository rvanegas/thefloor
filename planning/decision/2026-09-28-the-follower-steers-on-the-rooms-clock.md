# The follower steers on the room's clock

`drive.ts` derived the room's position from `Date.now()` while `watch.startedAt`
is stamped by the server. Two clocks compared with no conversion between them,
so the follower's idea of where the film had got to was wrong by exactly this
device's skew — which is unbounded, drifts, and can be set by hand.

Everything else that draws a position has always used `app.serverNow()`:
`Picture.tsx` for the expanded picture's readout, `ChannelView.tsx` for the
scrubber. So one device held two answers to one question, and the one the
*picture* was driven from was the wrong one.

**What it cost, at the skews it is reachable at.** Under `WATCH_DRIFT_MS` the
error is a constant offset nobody can see. Over it — a phone whose clock is off
by more than a second and a half, which is an ordinary phone with NTP off or one
somebody set by hand — a perfectly healthy player is judged adrift on every
fuse, for the length of the film, while the scrubber beside it reads correctly.
And since the skew is per device, the follower was actively driving two screens
*apart* by their clock difference, which is the one property the feature exists
to protect.

## Why it survived

**A test with one clock cannot see a disagreement between two.**
`transport.test.tsx` moved a single fake `Date.now()` for the channel and the
follower together, so the two agreed by construction in all twenty-two tests —
including the ones written specifically about the relationship between a
player's latency and the room's number. The harness now takes a `skew`, and two
tests assert that a device ten seconds out in either direction still follows the
room and is told nothing but the play.

## The shape of the fix

`useFollow` takes a fourth parameter, `clock`, defaulting to `Date.now`. It
rides in the `latest` ref beside `watch` and `port`, so the loop — keyed on
`active` alone — cannot close over a stale one.

**Passed as a prop rather than taken from the context**, because both
`WatchPlayer`s are deliberately props-only and `player.test.tsx` and
`playerDeath.test.tsx` mount them with no provider over them. `Picture.tsx` has
the context and hands down `app.serverNow`, which is the same function the
scrubber two hundred lines below it is drawn from — so the picture and the
readout can no longer answer differently.

The default is what keeps the harness honest rather than a concession: there the
channel is reduced off the same fake clock, so the two numbers are the same by
construction and `Date.now` is the truthful answer.

## What this does not do

`clockOffset` in `AppProvider.tsx` is `serverNow − Date.now()` taken on receipt,
with no round-trip compensation, so `serverNow()` over-reads by one inbound leg
— about 35ms at the ~70ms round trip the build-304 table implies. Bounded, small
and roughly common across devices, against the unbounded per-device error this
removes. The estimator wants the `ping` send stamped and the minimum-RTT sample
kept rather than the last, which `ping`/`pong` already carry and nothing yet
reads; it is a refinement and is not this.

It is also the thing standing in front of *the residue of one round trip* that
2026-09-28-the-rooms-clock-starts-when-a-player-does.md logged as unabsorbable —
"absorbing it would mean trusting a client's own timestamp, which means
confronting the skew that `drive.ts` and `Picture.tsx` already disagree about."
That sentence is this defect, named four days before it was fixed.
