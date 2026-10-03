# A deferral is not a decision, and the card has a third case

A watch party survived a deploy, came back paused as it is meant to, took a
Play from the room — and then played for nobody. The transport ran, the
progress bar moved, and there was no picture and no sound on either device. The
space under the transport where *Watch on this device* would be was empty.

**The server was not the one refusing.** `revivedWatch` brings a party back
paused at the banked position, `canPlayWatch` asks presence and no run, and a
restart resets the recording state that would have blocked it — a test now
pins that end to end, party playing → restart → step back in → `WATCH_PLAY`,
and it passed on the first run. What was wrong was that no device held the
*screen* role and nothing left in the interface could give it one.

**Two defects, and the party needed both.**

The first is the mark in `ChannelView` that makes the film-arrives default
happen once per film. It was being spent on *another device has it* — a reading
taken from `screensElsewhere`, which is a push and can be retracted a round
trip later. A deploy retracts it: every instance reconnects inside the same
second, the one that was the screen restates `screens.showing` from `onopen`
before it has processed the step-out that ended its role, and the device
walking back into the room reads that declaration exactly once and stands
aside. A moment later the declaring instance gives the role up, the retraction
arrives, and nothing asks again — the mark is spent.

So the mark now records *what it was spent on*. A mark spent on deferring to
another device is cleared when that device stops being a screen; a mark spent
on this device taking the film is not. The distinction is the whole of the fix,
because the case that must **not** reopen is the handover — pressing *Watch on
another device* clears this device's role a moment before the server says where
the film went, and a rule that read that gap as *nobody is showing it* would
take the film straight back. That gap has the mark spent on this device's own
role, falls through the new clause untouched, and behaves exactly as it did.

The second is that the watch card had no branch for it. *Watch on another
device* moves a film this device has; *Watch on this device* fetches one
another device has; and when no device of the account had it, the card drew
nothing — no picture, no button, no sentence — with a running transport inches
above. That shape was deliberate on 2026-09-23, when *Watch on* stopped being a
switch with a permanently inert half, and the reasoning was right about the
case it was looking at. It did not cover a film loaded on nothing, because the
default was supposed to make that unreachable.

**It is drawn anyway.** Every way into that state is a bug somewhere else, and
one of them is fixed in the same commit; the offer exists because *the card
says what you can do about where the film is* has to hold in all three cases or
it is not a rule. A default that fails to fire is then something somebody can
press their way out of rather than a party that has to be stopped and started
again to be watched. **Stepping out still draws nothing**, and that is the one
omission being kept: a film must not start in front of somebody who has left
the room, which is `defaulted`'s `steppedIn` guard said in the render.

Both halves have a test that fails without the change. GLOSSARY.md's *Screen*
entry and its one-liner carry the third case.

**What this does not explain** is why both devices had given the role up at
once. The retraction race accounts for the device that was stepped in; a
*second device* never defaults at all, by design, since defaulting is
`steppedIn`-only. Whether a second device should be able to take a film back
when no device has one is a separate question and is not answered here — the
offer on the card reaches it, because a second device is only ever drawn while
it *is* the screen, which that state is not.
