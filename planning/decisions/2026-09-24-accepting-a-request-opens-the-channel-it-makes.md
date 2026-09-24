# Accepting a request opens the channel it makes

The last step of the invited arrival, and the one the waiting bar could not
reach.

Follows `2026-09-24-the-ladder-waits-its-turn.md` § *The third ask, which
turned out to be already built*, which found the gap and left the remedy open.

## The gap

Becoming contacts is what creates the place the two of you talk.
`POST /contacts/:id/accept` calls `channels.ensurePairChannel`, which writes a
channel holding exactly the two of them, and has done since Home became a list
of channels. There is no invitation and nothing to answer — the question *ought
the pair channel be accepted implicitly* was already answered *yes*, years of
sessions ago in feature time.

**What was missing is that nobody is told.** The channel appears in *Your
channels* with no mark, no bar and no line. The waiting bar added the day
before does not cover it either: that reads `home.invites`, and a pair channel
is `rejoinable`. So for somebody's *first* contact — the whole arrival this
work is about — the single most important thing the application has ever done
for them happened silently, in a list they were not looking at.

## What was built

The accept route now returns the channel, and the *Accept* button on a contact
request navigates there.

**The reply carries it**, rather than the app hunting for it. The id was
already in hand on the server and the alternative was matching participants
against the next snapshot — a search for something somebody already knew. The
field is additive: a client that predates it reads `ok` and ignores the rest,
which is the safe direction and needs no shim, nothing having been renamed or
removed. `null` where `ensurePairChannel` refused — a pair of one, unreachable
on this route — and the client reads absent as *nowhere to go* rather than as
an error, so a new app against an old server simply does not move anybody.

**It navigates and does not step in.** `enterChannel` in `App.tsx` is
`setDetail` and no action at all: no `ENTER`, no presence, no audio session.
Landing somebody in a room is showing them the door, and claiming the phone's
audio outright is a decision with its own control on the screen this opens.
Getting that wrong would be the worst version of this change — an acceptance
that silently opens a stranger's microphone.

**The snapshot is refreshed before the id is handed back**, so the channel the
caller opens is one the list already knows about rather than a screen racing
its own data.

## What was left alone

**`ProfileView`'s *Accept their request* does not land anybody**, and the
asymmetry is deliberate. Its handler is shared with *Add contact*, which has no
channel to go to, so making one branch navigate puts a fork in a handler that
does not have one. It is also a different act: the profile is a screen somebody
opened *about a person*, and being thrown out of it into a room is a worse
surprise than being moved on from a list row you have just cleared. The row is
the arrival path — it is where the waiting bar sends people — and that is the
path this is for.

**No line was added for a pair channel you have never opened**, the other
remedy considered. It was the weaker one: nothing is *waiting* on you, so it
stretches what the waiting bar means, and it answers the problem with a second
signpost where the direct move was available.

## The order this ships in

The server must go first, which is the ordinary rule and costs nothing here —
the field is additive, so deploying it changes nothing for any build in
anybody's hands. The app then reads it whenever it ships. An app that reaches a
phone before the server is deployed degrades to the old behaviour rather than
breaking, which is the whole reason `channelId` is optional in the client type
rather than asserted.
