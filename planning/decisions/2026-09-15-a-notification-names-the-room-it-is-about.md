# A notification names the room it is about — 2026-09-15

Tapping a notification opens that channel's screen, and steps nobody into it.
All four kinds, the same way, whatever `tapToLook` is set to.

This reverses the notification half of *An address names a place and never an
id* (2026-09-04, in `archive/DECISIONS-2026-08-31-to-2026-09-04.md`), which had
the tap bring up the Channels tab with nothing open. It leaves the rest of that
entry standing, and the distinction is the point: **a notification is not an
address.** No URL in this application carries an id and none will; an id
reaches the app from a snapshot, from a handover in `sessionStorage`, or from a
tapped notification, and never from something typed or pasted.

## What the old reasoning was, and where it went wrong

> A tap is not an instruction about which room you meant — by the time a phone
> is picked up there may be several with somebody in them.

True of a badge on an icon. False of a tap on one notification of four, each of
which names a room it is genuinely about: a ping is a sentence somebody aimed
at one channel, an invitation is the channel you were added to. The person did
not open the app; they answered a particular thing that a particular room said.

The argument also bundled two separable things — **carrying an id** and
**entering a room** — and threw out both to be rid of the second. Only the id
has come back. Nothing on this path sends `ENTER`.

## Reasoned one kind at a time; the answer did not vary

- **pinged** — somebody chose this room and wrote a sentence to you about it.
  No ambiguity to resolve. Opening it also answers it: `watchChannel` calls
  `sweepChannel`, which dismisses that channel's pings.
- **arrived** — the weakest case and the one 2026-09-04 was really written
  against, since the room may have emptied in the meantime. Open it anyway.
  The channel screen draws the roster, so a room that emptied says so — which
  was already the argument for sweeping arrivals on foreground rather than on
  a timer. A destination that depends on state you cannot see before tapping
  would be worse than a stale one.
- **invited** — opening the thing you were added to is the response to being
  added to it. Invitations still survive `sweepChannel` deliberately: they are
  the only record anybody gets, and opening a channel is not evidence of
  having read one.
- **accepted** — not about a room, but it carries the pair's channel, which is
  created in the same breath as the contact. `server/src/push.ts` had already
  written the argument down: meeting this person now means stepping into
  exactly that room.

Four separate arguments, one destination. Worth stating as a property of the
set rather than a coincidence — nobody has to learn four behaviours, and
GLOSSARY.md § *Notification kinds* now says so where the kinds are defined.

## Stepping in is still told twice, and `tapToLook` does not govern this

Opening the channel screen is **looking**. Step In is a second deliberate tap
on the footer, exactly as it is for every other way into a channel. That rule
survives this change untouched — it was the entry the old comment was
defending, and only the id has returned.

`tapToLook` is deliberately not consulted. It disambiguates a tap on a **row in
a list**, where the gesture genuinely means two things; a notification tap does
not, and it resolves the conservative way for everybody. Somebody with the
setting off — the default, whose list steps them in — is not being overridden
so much as shown the distinction their list does not draw: the channel open in
front of them, nobody able to hear them yet, entry one tap away. The hope, and
it is a hope rather than a claim, is that meeting the separation here is what
makes somebody want it in their list too.

**Structural rather than careful**: `App.tsx` never reads `tapToLook`, and this
path sends no action at all, so there is no branch for a setting to choose
between. A test asserting "no step in with `tapToLook` off" was written and
deleted for saying less than it appeared to — it set a field nothing on that
path consults. `expect(mockApp.act).not.toHaveBeenCalled()` is the whole claim.

## A tap that names nothing still lands somewhere

`channelId` is read defensively, like everything else in that payload: a
missing field, a non-string, and the empty string all read as `null`, and
`null` means what a tap meant for the eleven days in between — the Channels
tab, live rooms first, the person chooses.

That case has to stay reachable rather than be treated as impossible. The
payload is written by a server that can be newer than the app reading it, and
the pre-2026-09-04 code *refused* such a tap outright, on the grounds that
navigating to `undefined` is a channel screen for no channel. That hazard was
never the missing id; it was treating one as present. So the state carrying
this up is an object and not the boolean it replaced — no tap, a tap naming a
channel, and a tap naming nothing are three things, and folding the last two
together would make an unreadable payload silently do nothing.

## No wire change, no shim, no floor move

The server has sent `channelId` in every notification since there have been
notifications, and has actually delivered it since the payload moved under
`body` on 2026-09-10 (*The payload the app never saw*). Nothing in
`server/` changes here; this is a client that starts reading a field already on
the wire. Every phone gets the new behaviour when it gets the build, and no
older build is made worse by it.
