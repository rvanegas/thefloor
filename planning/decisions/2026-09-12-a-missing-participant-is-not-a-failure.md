# 2026-09-12: A missing participant is not a failure of the recorder

A run in *Philosophy* ended one second after it started, with
*Recording failed — twirp error unknown: participant does not exist* on the
card and a 0:01 row in the list. Twice, in fact: 02:18:58 and 03:57:07 UTC,
the same channel and the same account both times.

## What the message actually meant

`LiveKitMediaServer.startRecording` asks the room for the participant, to find
the sid of the audio track an egress is pointed at. LiveKit answers a
participant who is not in the room with a 404, which the SDK raises as a
`ServerError` reading `twirp error unknown: participant does not exist` — a
sentence that names neither the room, nor the identity, nor the cause.

The initial cohort of a run is `state.present`, started with `fatal: true`,
because a recording missing a speaker looks complete and is not. So the throw
ended the whole run, taking with it the one stem that had started. That was
the 0:01.

## Why somebody present was not in the room

`DISCONNECT_GRACE_MS` is sixty seconds. Presence deliberately outlives a
dropped connection by that much — a phone suspending is the ordinary case, not
a tunnel — so for up to a minute an account is present to the reducer and gone
from the media room. A channel that records itself starts its run when the room
refills, which is exactly the window in which somebody else's connection is
still coming back.

So this is not a rare race. It is two states this application maintains on
purpose, briefly disagreeing, which is what STATES.md exists to say they do.

## The fix, which is one line of meaning

`startRecording` already returns **null** for a participant who is in the room
with no track published — the microphone that has not opened, the permission
not granted, the connection re-establishing — and the caller retries them on a
tick. The comment above it says so at length, having been written after an
earlier version of this same bug cost an entire conversation to one silent
participant.

Not being in the room at all is the same fact one step further out: there is
nothing to point an egress at. It now returns null too, and only for a 404 —
`isNotFound` checks the status rather than the message, and anything else
still throws, because a broken recorder must still end the run. Somebody
inside the grace gets picked up by the retry when they come back, with a stem
from that moment, exactly as somebody who walked in then would.

## What was considered and not done

**Filtering the cohort by the room roster instead.** `Channels` could ask
`audioTracks` who is really there and start egress only for them. It is the
same information arriving by a longer route, it adds a round trip to the start
of every run, and it would still race — the roster can go stale between the
question and the egress request. The answer belongs where the 404 is raised.

**Leaving it fatal and shortening the grace.** The grace is load-bearing for
reasons that have nothing to do with recording: it is what makes a deploy
invisible, and shortening it was tried and reverted on 2026-09-08. See
`core/constants.ts`.

## The thing this leaves alone

`setSilenced` raises the same 404 from the same call, and it is still the
loudest line in the log — sixteen of them in the fifteen minutes either side of
this failure. It is already non-fatal there, so it costs noise rather than a
recording, and quieting it is a separate change.
