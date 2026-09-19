# 2026-09-18 — A player that is refilling is told nothing

Reported from a live party of three: the picture stops for about a second,
resumes, and stops again a second or two later, on some devices and not
others. All four sessions in the room were on 244 or 228, so this is the
current follower rather than an old one.

## The first guess was the room, and the room is innocent

The reading at the prompt was that members were over-correcting each other,
which is the right shape and the wrong place. It is worth writing down why it
cannot be, because the answer has changed twice this month and will be guessed
at again.

**Nothing reads a player and tells the room.** `WATCH_PLAY`, `WATCH_PAUSE` and
`WATCH_SEEK` leave one place, which is the transport in `ChannelView`. A
follower is told things and says nothing back. That was untrue for seven
builds — `onIntent` and the press-reader lived in 229 through 235 — and
*2026-09-18-the-picture-is-not-a-control.md* took the surface away in 236. So
a party on 236 or later has exactly one writer per press and no path by which
one person's screen can move another's.

Which leaves a device fighting its own player, and that is what this was.

## Falling behind is not a fault

The transport is a wall clock: `watchPositionMs` is a banked position plus
elapsed time, and nothing slows it down for a player having a hard time. So a
player that stalls for a second **is** a second behind, permanently — it
cannot win the time back by playing, because the clock it is being measured
against runs at the same speed it does. The only repair in the building is a
forward seek.

**And a seek discards the buffer.** That is the whole of it. Correcting a
player that is still refilling does not help it along; it throws away what it
has collected and starts fetching somewhere else, which stalls it again. The
follower then waits `WATCH_OBEDIENCE_MS`, finds it still adrift and still
buffering, and does it once more. A phone on a poor connection never gets the
second it needs, and what somebody sees is a picture that stops and starts
every second or two — a cadence set by the fuse rather than by the network.

The rule was already in the file, applied to the other half of the same
instruction: *"A buffering player is already on its way to playing and needs
nothing said to it"*, which is why no `play` is issued to one. The `seek`
beside it was never covered, and the gap is the bug. It now says nothing at
all to a buffering player, and corrects the drift on the far side from a
player that is playing and can answer. **One seek per stall rather than one
per fuse**, which is the difference between a picture that recovers and one
that is never allowed to.

**`unstarted` and `ended` are deliberately not covered.** Neither is on its
way anywhere and neither leaves by itself — a `cued` player is how a screen
arrives, and waiting for it to settle would be waiting for ever. The exclusion
is `buffering` alone, for the same reason the wait in `drive.ts` is, and for
the same reason *2026-09-18-buffering-is-not-a-state-a-person-is-in.md* gave.

## What it costs

A device that stalls stays behind the room for as long as it is stalled, and
catches up in one jump when it can. That is worse than being in step and much
better than the alternative, which was being in step nowhere and stuttering
everywhere. Nothing in the party notices: a follower is the only reader of its
own drift.

## On the testing

The regression is in `app/src/watch/__tests__/transport.test.tsx` rather than
in core, and the harness gained a `stall` — the connection going away, the
player stopping where it is and reporting `buffering` while the wall clock
runs on without it. The rule is one clause in `followInstructions`, but what
made it a stutter was a fuse, a tick and a latency arranged so that the cure
kept re-arming the disease, and that is this file's subject.

Two assertions, and the second is the one that keeps the fix honest: nothing
is said while the player refills, **and** the seek that is genuinely owed
still happens the moment it is playing again. A guard that bought silence by
never correcting at all would pass the first alone.

The window in the first test stops short of the end of the stall on purpose.
Run to the end it catches the legitimate post-stall correction and reads as a
failure, which it did once on the way here.
