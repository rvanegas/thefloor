# Two transports, one run

The exclusivity between the watch party and the shared track is now between
the two **transports** rather than between the two things loaded. A film and a
track may both be loaded at once; what may not happen is both playing.

- `canControlPlayback` and `canLoadTrack` refuse while `watchIsPlaying` — the
  film's status is `'playing'` — where they refused while `watchPartyIsOn`.
- `canControlWatch` and `canStartWatch` refuse while `trackIsPlaying`, which
  they did not ask at all before, there being no state in which both could be
  loaded.
- `START_WATCH` no longer clears the loaded track.

Neither run can begin while the other is on, so both playing is unreachable
rather than merely discouraged, and either refusal is escaped by pausing —
not by stopping the party, and not by clearing the track.

## What was wrong with the mode

Nothing, as an account of what a film is. The rule adopted on 2026-09-18 made
a party a mode the channel is in: while one is loaded no floor may be claimed,
no recording begun and no track put on. Three refusals from one sentence, and
two of them still hold, because they are about the film being *on* rather than
about sound. A recording made beside a party is missing the thing everybody is
reacting to whether or not the film is between scenes; a claim is a demand
that the room be quiet, which the party's own mute already governs.

The third is not like them. What a track playing over a film is, is two sounds
at once — and a paused film makes no sound. So the refusal was firing on a
state that had none of the problem in it: somebody who had put a film on and
paused it found the whole audio card dead, Play, Clear and Load together, and
the only sentence the card had to offer them was one about the floor, which
was not the reason and did not name the way out.

The way out was there — stop the party — and it is the wrong one. Stopping
throws away the film, everybody's screens with it, in order to put a record on
between two halves of it.

## Why pausing rather than a priority

The alternative was letting the second transport start and pausing the first,
as a car radio ducks for the phone. Refused, on the rule this project keeps
for shared state: a tap that silently stops something other people are
attending to is the thing the floor exists to prevent. Here it would be worse
than a claim, because the people watching would see the picture stop with no
account of who did it or why.

Refusing and saying so keeps the act in one pair of hands: whoever wants the
other thing pauses this one, deliberately, and the room sees the pause it
would have seen anyway.

## What each card says now

Both cards lead with the other transport, above presence and above the floor,
because it is the condition that greys every control on them and the control
that lifts it is on a different tab. *The film is playing. Pause it to put
something on here.* and *Something is playing on Listen. Pause it to watch
together.*

The *Watch* card's sentence sits ahead of presence deliberately: since
`canControlWatch` refuses on this ground as well, a presence-first chain would
answer *step in* to somebody already standing in the room.

Both read the core predicates — `watchIsPlaying`, `trackIsPlaying` — rather
than the snapshot's `status` fields, so the sentence under a greyed control
and the rule that greyed it cannot drift.

## Shape of the change

`core/channel.ts`, `app/src/ui/ChannelView.tsx`, and the tests that encoded the
old rule in `core/__tests__/watch.test.ts`,
`core/__tests__/watchingHere.test.ts` and `server/__tests__/watch.test.ts`.
No wire change: the guards live in `core/`, which both ends import, and no
action, field or name moved.
