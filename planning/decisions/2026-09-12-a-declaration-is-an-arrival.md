# A declaration is an arrival

2026-09-12.

Tapping *Be nearby* now counts as arriving, for two purposes: the people who
are not there are notified, and `lastPresentAt` — the stamp *Stepped out*
counts from — is written.

**The reasoning is an equivalence, and it is Rodrigo's.** Declaring yourself
nearby should be the same thing as stepping in and tapping *Be nearby*
immediately afterwards, because that is what it would take to produce the same
state by hand. Everything below follows from asking what that sequence does.

## What it reverses

Both halves were decided the other way, four days earlier, and both for the
same reason: that being reachable is not being in a room.

- `Exit`'s table in `core/channel.ts` left `lastPresentAt` alone for
  `exit: 'nearby'`, on the argument that stamping it would "claim the person
  was in the room until the moment they left it by not being in it".
- `DECLARE_NEARBY`'s other branch — the declaration made from outside the room
  — stamped nothing but its own clock, and there was no announcement anywhere
  near it.

That argument holds for the way into *Nearby* that nobody chose: a socket
running out of grace, where the last thing known is the last heartbeat and a
fresher stamp would invent a presence. It does not hold for a tap. A tap
happens at the moment somebody decides it does, which is the whole of why
`chosen` stamps it — and a declaration is a tap. Made from inside the room the
claim was true anyway, the heartbeat having stamped it seconds earlier; made
from outside it is the substance of the change.

**The case with no other answer** is somebody who has never been in the
channel. They had no stamp at all, so `idleMs` returned null, and when the wait
lapsed the roster rendered a bare *Stepped out* with no time under it — a
departure asserted about somebody who had been nowhere. Dating it from the tap
is the only honest number available.

## The notification

`announceActive` is the whole of it: it already computes who is absent per
recipient, suppresses per recipient inside `ANNOUNCE_INTERVAL_MS`, and clears
that window for anybody who acts on it. A declaration goes through it with two
adjustments.

**The arriver is excluded from `absent` by name.** `present` used to do that
job by itself, every arrival having been a step in. A declarer is an arrival
who stays absent, so without the exclusion the one person who already knew
would be the one notified.

**The body says *nearby*, not *stepped in*.** Same kind, so the same
notification level governs it and the same collapse key replaces it; two
bodies for one kind is the precedent `invited` already set. Saying *stepped in*
would be contradicted by the roster the recipient is one tap away from reading,
and *nearby* is the more useful fact in any case: it says a notification will
reach that person.

**Keyed on the `waiting` edge, not on the stamp.** `STILL_HERE` re-stamps
`declaredNearbyAt` on every heartbeat from a nearby phone, and `consume` clears
the suppression window on the way past — so a rule that watched the stamp would
push every few seconds for fifteen minutes from one tap. The declaration is the
transition onto the rung; everything after it is renewal.

**A declaration from inside the room announces nothing.** That is a step out to
the rung below. Their arrival was announced when they stepped in, and a second
notification would ring a phone to report a departure.

## What does not follow, deliberately

The equivalence is about notification and that one stamp. It is not a licence
to make a declaration into a presence, and four things it would otherwise reach
are left alone:

- **`everPresent`** is not written. It is the marker that separates a channel
  from an invitation — `invitesFor` reads it — and a declaration is not a
  visit.
- **`lastActiveAt`** is not stamped, for the reason it never was: it says when
  the room was last a room. Home's recency is `lastPresenceAt`, which folds
  both kinds of stamp together and takes the fresher, so a declaration reaches
  a list through `lastPresentAt` anyway.
- **Exclusivity** is untouched. Presence is one channel at a time; being nearby
  is not, and being nearby in three rooms is a thing worth being able to do.
- **A channel nobody has ever been present in announces nothing.** The
  notification for a first arrival is `announceStarted`, which sends an
  *invitation* — a month's lifetime, a membership collapse key, sent once in a
  channel's life because `everPresent` is written on the only route to it.
  Routing declarations through it would mean either calling a declaration a
  presence or repeating a month-long invitation on every tap, and *Alice
  stepped in* would be false about a room the recipient has never heard of.
  Reaching that state at all takes the non-default setting where opening a
  channel does not enter it.

## The two clocks are still two

`declaredNearbyAt` and `lastPresentAt` now start together on a declaration,
which is what made the second clock look redundant for a minute. It is not.
They part company in both of the places they were built to: a lost connection
stamps `lastPresentAt` at the last heartbeat and `declaredNearbyAt` not at all,
and a heartbeat from somebody nearby moves `declaredNearbyAt` while leaving
`lastPresentAt` where the declaration put it. `nearbyMs` still picks between
them; `idleMs` still answers the older question.

## Wire compatibility

None needed. `DECLARE_NEARBY` is unchanged on the wire, `lastPresentAt` is an
existing snapshot field, and the notification is an existing kind with an
existing collapse key — so an old build renders every part of this correctly.
Nothing goes in SHIMS.md.
