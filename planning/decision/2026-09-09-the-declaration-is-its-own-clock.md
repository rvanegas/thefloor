# 2026-09-09 — The declaration is its own clock

> **Superseded the same day by `2026-09-09-attention-is-one-clock.md`, as
> corrected by `2026-09-09-one-clock-ends-two-states-but-times-one.md`.**
> Attention is what ends both absent states, and what *nearby* counts from;
> *stepped out* went on counting `lastPresentAt`, for the reason this file
> gives below and briefly stopped being read for.
> `declaredNearbyAt` survives as the bit that tells a chosen nearby from one a
> lost connection produced, and `nearbyMs` survives as the fallback for builds
> that report no attention; neither is what any screen shows. This file is kept
> because the argument below is the one the replacement is built on: that two
> different questions must not share a stamp. It turned out there were three
> questions and one of them mattered more than the other two.

`waiting` holds two kinds of absence and they are timed from different moments.
A connection that ran out of grace is timed from the last thing anybody heard.
A declaration is timed from the declaration.

Both were read off `lastPresentAt` until now, which is what *Nearby* had always
been timed by — correctly, while the only way onto that rung was a phone
suspending. Declaring nearby shipped on 2026-09-08 and made it a rung you
choose, and a tap is the freshest sign of life there is.

## What that produced

Asked by Rodrigo from the interface: *if the roster says I am "Stepped out 4
minutes ago" and I press Nearby, shouldn't the clock reset?* It did not, and
the three cases are worse the further out they go.

- **"Nearby for 4 minutes" on a declaration one second old.** The card counted
  the silence before the tap.
- **Eleven minutes of nearby instead of fifteen.** `isWaiting` measures
  WAITING_WINDOW_MS from the same stamp, so stepping out and declaring four
  minutes later spent four of the fifteen before the declaration existed.
- **A declaration past the window that nobody could see.** Declare sixteen
  minutes after stepping out and `waiting` held you while `isWaiting` was false
  from the instant you pressed it: the footer lit *Nearby* — it reads `waiting`
  directly — and your own roster card read *Stepped out 16 minutes ago*. The
  two halves of the shared `core/` guards disagreed about the same person.
- **And somebody never present could not be nearby at all.** No `lastPresentAt`
  meant no clock, so the card said *Invited* indefinitely.

## The fix, and what it is not

`ChannelState.declaredNearbyAt`, stamped by `DECLARE_NEARBY` and by
`stepOut(exit: 'nearby')`, cleared by entering and by every departure that
clears `waiting`. `nearbyMs` reads it and falls back to `idleMs`; `isWaiting`
and the roster card read `nearbyMs`.

**Not a stamp on `lastPresentAt`**, which was the obvious one-line version and
is the lie the whole `Exit` distinction exists to avoid: it would claim you were
*in the room* until the moment you declared, so when the declaration lapsed the
card would say "Stepped out just now" about somebody who left an hour ago, and
Home would reorder on it. Two questions, two clocks. `idleMs` is untouched and
still answers *how long since we heard anything*, which is what a dropped
connection is timed by and what *Stepped out* counts.

**Renewable, and that was recorded backwards for a few hours.** This said the
window could not be extended by the person being waited for, on the grounds
that re-declaring while already nearby is a no-op. Rodrigo found the hole from
two screenshots of the same channel a moment apart: *Out* and *Nearby* are
adjacent slots in the footer, and stepping out clears the stamp while declaring
writes a fresh one, so the fifteen minutes restarts on two taps and goes on
restarting. Nothing enforced the rule anywhere — it described a control that
happens not to exist, the nearby slot being inert while you are on that rung.

**The behaviour is right and stays; the claim was wrong and went.** The window
is there to stop a *stale* claim outliving somebody who wandered off, and
somebody tapping their phone is the one person that cannot be true of: the tap
is the same evidence of attention that makes a declaration worth timing from
itself. Blocking the toggle would need a cooldown on re-declaring, which is
machinery to stop somebody asserting something true about themselves.

The lesson is narrower than the correction. **A rule that is not enforced
anywhere is a description, and this one described the absence of a button** —
two routes to the same act, one of them refused because nothing on that rung
can be tapped, written up as though the reducer had a policy.

**Volatile, like `waiting` itself.** Not persisted and not restored: a
declaration is a claim a live process made, and the process that heard it is
gone. Reviving one would tell a room somebody was standing by when nothing has
heard from them since the restart.

## What it cost on the wire

An additive field on `ChannelState`, which travels server → client only — the
client renders snapshots and never runs the reducer. So old installs need
nothing: they ignore it and keep timing declarations the old way, which is
degradation and not breakage. The one shim is the `?.` in `nearbyMs`, for a
snapshot from a server predating the field, and it is retired by a deploy
rather than by the floor. SHIMS.md carries it as the only entry in that table
with no build gate for that reason.

Deploy the server before the build ships, per AGENTS.md: an old box sends no
`declaredNearbyAt`, and a new client then falls back to exactly today's
behaviour rather than to anything worse.

## A footnote on what the toggle looks like from outside

Both screenshots are the ladder working: from *Nearby* the moves are Step in
and Step out, from *Stepped out* they are Step in and Be nearby, and in each the
lit slot and the card's offer agree.

What they show that is worth knowing is the line about yourself flipping between
two pasts — "Nearby for a few seconds" from the declaration, "Stepped out 4
minutes ago" from `lastPresentAt`. Both are right, and to another member
watching, a toggling person's history appears to rewrite itself. Left as it is:
the alternative is timing *Stepped out* from the declaration, which would claim
somebody was in the room until the moment they tapped, and that is the lie the
two clocks exist to avoid.

## The heartbeat keeps it true, added the same day

Asked from the screen it fails on: nearby, channel open, the card reading
"Nearby for 14m", and no way to reach the fifteenth minute except stepping in,
or stepping out and back. The toggle above is the only refresh there was, and
it is the thing the question excluded.

**The evidence was already arriving and being thrown away.** Every message a
watching socket sends makes the server call `channels.stillHere` for each
channel that socket holds — every two seconds — and `STILL_HERE`'s first line
refused anybody not in the room. So the phone was saying *I am awake and
holding this channel* several times a minute, and the rule discarded it because
the sender had stepped out of the room it was talking about.

`STILL_HERE` now refreshes a live declaration as well as a presence, and the
scoping is three conditions rather than one:

- **A declaration only, not any wait.** A connection that ran out of grace is
  timed from the last thing anybody heard, and that is the whole of what it
  means; refreshing it from a socket would say a pocketed phone had been heard
  from. What is refreshed is a claim somebody made, by the process that made
  it.
- **Only while it is still standing.** `isWaiting`, not membership of
  `waiting`, which outlives the window on purpose. A heartbeat arriving after
  the fifteen minutes would silently resurrect a nearby that had already
  lapsed, on a screen that had already said *Stepped out*, without anybody
  declaring anything.
- **`lastPresentAt` is not touched.** Nothing here says they were in the room.

## What it cost the server, which is the half that is not free

`stillHere` deliberately emits nothing: a present member's stamp is unreadable
— `idleMs` answers null for them — so pushing it would redraw an identical
screen. **A nearby member's stamp is readable**, and every other roster in the
channel computes the fifteen minutes from it, so a silent refresh would leave
everybody else lapsing a declaration the server considers live. That is exactly
the divergence between members' rosters that was asked about an hour earlier,
manufactured on purpose.

So a refreshed declaration is echoed, and `NEARBY_ECHO_MS` is a minute —
chosen against the window rather than against the cost. A roster can be at most
a minute stale about a declaration, which against fifteen cannot make the
difference between *Nearby* and *Stepped out* on anybody's screen, and the fan
-out is one snapshot a minute per nearby watcher rather than one every two
seconds. `ChannelRegistry.nearbyEchoedAt` holds the last echo per
`channelId:userId` and is cleared the moment a heartbeat stops refreshing
anything, so it holds one entry per person currently nearby with the app open.

**No client change and no wire change.** The heartbeat exists, the field
exists, and the cadence is the server's business — so this reaches every
install that can read `declaredNearbyAt` as soon as the box has it. Builds
below 172 are unaffected either way: they never read the field.
