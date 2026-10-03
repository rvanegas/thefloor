# The roster says who is watching

A member's card on the *Members* tab now carries a third suffix — `· watching`
— for anybody who has the party's film up on one of their devices. It is drawn
only while a party is loaded, and it is the account rather than the device.

**The question it answers is one nothing on the screen could.** Somebody starts
a film and wants to know whether the room came with them. Until now a
participant whose app is backgrounded, whose browser is on another tab, or who
simply never opened *Watch*, was drawn exactly like somebody sitting in front
of the picture — so the only ways to find out were to ask out loud or to send a
notification, both of which interrupt the thing everybody is there to do.

## Why it is not `watchingHere`

The obvious source was already on the wire and is the wrong one.
`ChannelState.watchingHere` exists to decide a microphone: `isScreening` reads
it, and a name lands on it only when the device holding the room is also the
one holding the picture — `ChannelView.tsx` sends `WATCH_HERE` under
`steppedIn` and nothing else, deliberately, that guard being what stopped two
instances of one account flipping the flag between them.

So the *second device* — the film on a television, the voice on a phone — is a
person plainly watching whom that list does not name, and it is not an edge
case: it is what the switch added on 2026-09-18 is *for*. A roster drawn from
`watchingHere` would say *nobody is watching* to a room full of people watching
on their laptops.

What can answer it is `Connection.screening`, which every instance already
declares and which the server holds per socket for the screen picker. Gathered
per channel and put on the snapshot as `ChannelView.watching`, it says the one
thing the room is owed: this person has it up on something. Which something is
never disclosed — that stays inside the account, where *Watch on* reads it.

**It is connection state and therefore cannot be reduced.** No reducer hears
about a screen; a declaration dies with its socket, which is the correct
lifetime and the reason this rides the snapshot beside `pingableAt` and
`attentiveAt` rather than joining `ChannelState`. The fanout had to be written
by hand at the three places `screening` moves — a declaration, the instances it
displaces, and a socket closing — since `channels.onChange` fires on the
reducer and the reducer is not involved.

## The retraction, without which the line would lie

A phone that has been pocketed keeps its socket: the app holds a background
audio mode for the conversation, so the declaration would stand while iOS
suspended the WebView and the film stopped. The roster would then say
*watching* about precisely the person the feature was added to find, which is
worse than saying nothing.

So the report is withdrawn when the app leaves the foreground and restated when
it returns. **The role is untouched** — `screenFor` survives the trip, the
picture stays mounted, and `followInstructions` seeks to the channel's clock on
the way back — so what changes is what the room is told and nothing about what
this device does. A device displaced while it was away comes back silent, the
`screen` message having already cleared the role: the report is made off the
role rather than off a memory of one, which is what stops a phone coming out of
a pocket from reclaiming a film from the television it was handed to.

**Native only, and the asymmetry is measured.** A hidden browser tab goes on
playing the film, picture and sound, which is why a playing film is already
evidence of attention on the web; retracting there would unsay something still
true.

## What it deliberately does not say

- **A guest.** `screens.showing` is a session message and a guest socket is a
  scope of its own, so a guest watching is one the roster cannot report. They
  are drawn on their own cards and those say nothing about a film.
- **Anybody, once the party stops.** `screening` is a device saying which
  channel it *would* show a film for, and it is set from the moment somebody
  opens a party's channel — so the app asks about the party as well as the
  list. Without that guard a stopped film leaves a room full of people
  reported as watching nothing until each device notices.
- **Whether they are looking at it.** Frontmost on a phone and a tab that
  exists on the web is the evidence available, and it is the same evidence the
  attention clock runs on. Somebody who has the film up on a second monitor
  they are not facing is counted, and that is the honest limit of what any of
  this can see.

## What was considered instead

A chime when a film starts, and a line on the lock screen card — both events,
aimed at the person who is missing it. They remain worth having and neither was
built: what was asked for is the standing fact, which is the more useful half.
A host reads the roster once and knows; an event has to be caught.

The backgrounded participant's other half is still open, and is the defect this
found on the way past: a device that is the screen while backgrounded holds
`watchingHere`, so `isScreening` withholds a microphone under a film nobody can
see. The retraction above does not reach it — `WATCH_HERE` is a separate report
on a separate guard — and it is written up in `planning/backlog/`.
