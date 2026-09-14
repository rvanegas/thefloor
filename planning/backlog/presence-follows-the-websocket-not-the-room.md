# Presence follows the websocket, not the room

**Status:** not started. This is what survives the 2026-08 backgrounding
investigation, which is otherwise closed — see
decisions/archive/DECISIONS-2026-08-07-to-2026-08-13.md for what that settled and how
to instrument a phone if it ever needs doing again.

Presence is derived from the app's websocket; participation is what happens in
the LiveKit room. These can disagree for a long time in either direction, and
every symptom that has come of it — a ghost showing as Present, a channel
invisible to somebody who is in it, a run of empty-to-occupied flaps that are a
network artefact — has been patched at its own site rather than at the cause.

Presence probably ought to follow room membership, which is exactly "speaking
or hearing". The work is not small: the five-minute push quiet window, the
disconnect grace, and the eviction path all read from the socket today.

**`modules/keep-alive` is one more patch at its own site, added 2026-09-05
knowing that.** It stops iOS suspending a phone that is standing alone in a
silent channel, which is the largest single producer of the disagreement above:
the socket dies, the room is empty anyway, and a person who never moved is
reported as having left. Silence keeps the socket alive instead. It is the
right patch and it is still a patch — it buys fifteen minutes, it does not
survive an interruption, and a presence that followed room membership would
need none of it.
